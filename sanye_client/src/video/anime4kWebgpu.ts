import type { Anime4KProfile } from './anime4k'
import { anime4kWebgpuPlan, type Anime4kWebgpuPlan } from './anime4kWebgpuPlan'

/**
 * Anime4K 增强的 WebGPU 运行时（VQ-57）。
 *
 * 为什么要这条路径：WebGL1 版依赖 WEBGL_color_buffer_float 才能用浮点中间纹理，缺这个扩展的
 * 机型只能退回「性能」档，画质反而更差；WebGPU 的 rgba16float 是核心格式，没有这个悬崖。
 *
 * 与动画补帧的 WebGL 渲染器并存的方式是「纹理交接」：本运行时把增强结果渲染进自己的纹理，
 * 回读接口给验证用；真正的交接由调用方决定（见 anime4kWebgpuPlan 的职责边界）。
 */
export interface Anime4kWebgpuFrame {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

export interface Anime4kWebgpuRuntime {
  readonly plan: Anime4kWebgpuPlan
  readonly scale: number
  process(source: ImageBitmap | HTMLVideoElement | HTMLCanvasElement, width: number, height: number): void
  /** 验证用：把最终纹理按行去填充后回读成 RGBA 字节。 */
  readFrame(): Promise<Anime4kWebgpuFrame>
  /** 验证用：返回所有 WGSL 模块的编译错误（无错误即空数组）。 */
  validate(): Promise<string[]>
  /** 验证用：逐趟记录「本趟用了哪套管线格式、渲染到哪个附件」，附件格式不匹配时据此定位。 */
  readonly trace: readonly string[]
  destroy(): void
}

const UNIFORM_STRIDE = 256
const UNIFORM_BYTES = 48
// 与原链路对齐的三条格式事实：anime4k.js 的中间纹理是 32 位浮点（依赖 WEBGL_color_buffer_float），
// 采样器是 NEAREST，最终写入 8 位目标。这里照抄，否则每一趟都有肉眼可见的量化误差累积。
const INPUT_FORMAT = 'rgba32float'
const WORK_FORMAT = 'rgba32float'
const OUTPUT_FORMAT = 'rgba8unorm'
const READBACK_ALIGNMENT = 256

interface SizedTexture { readonly texture: GPUTexture; readonly width: number; readonly height: number; readonly format: string }

export function anime4kWebgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && navigator.gpu !== undefined
}

/** 建立运行时；返回 null 表示该档位没有 WebGPU 实现或设备不可用，调用方必须回退 WebGL。 */
export async function createAnime4kWebgpuRuntime(profile: Anime4KProfile,
  options: { device?: GPUDevice } = {}): Promise<Anime4kWebgpuRuntime | null> {
  const plan = anime4kWebgpuPlan(profile)
  if (!plan) return null
  try {
    let device = options.device
    if (!device) {
      if (!anime4kWebgpuAvailable()) return null
      const adapter = await navigator.gpu!.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) return null
      device = await adapter.requestDevice()
    }
    return new WebgpuAnime4kRuntime(device, plan)
  } catch {
    return null
  }
}

class WebgpuAnime4kRuntime implements Anime4kWebgpuRuntime {
  readonly scale: number
  readonly trace: string[] = []
  private readonly pipelines = new Map<string, GPURenderPipeline>()
  private readonly modules: GPUShaderModule[] = []
  private readonly pool = new Map<string, GPUTexture[]>()
  private readonly uniforms: GPUBuffer
  private readonly nearest: GPUSampler
  private readonly linear: GPUSampler
  private readonly bindGroupLayout: GPUBindGroupLayout
  private readonly pipelineLayout: GPUPipelineLayout
  /** 每趟输出被后面哪一趟最后读取：读到最后一趟即可回收，长链路不会堆满中间纹理。 */
  private readonly lastUse: readonly number[]
  private input: SizedTexture | null = null
  private output: SizedTexture | null = null
  private destroyed = false

  constructor(private readonly device: GPUDevice, readonly plan: Anime4kWebgpuPlan) {
    this.scale = plan.scale
    this.lastUse = plan.passes.map((_pass, index) => {
      let last = index
      plan.passes.forEach((other, otherIndex) => {
        if (other.primary === index || other.secondary === index) last = Math.max(last, otherIndex)
      })
      return last
    })
    this.uniforms = device.createBuffer({ size: UNIFORM_STRIDE * plan.passes.length, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.nearest = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' })
    // 原链路对中间纹理一律 NEAREST；浮点纹理本身也不可滤波，因此次输入同样用最近邻。
    this.linear = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' })
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
      ],
    })
    this.pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] })
  }

  process(source: ImageBitmap | HTMLVideoElement | HTMLCanvasElement, width: number, height: number) {
    if (this.destroyed) throw new Error('WebGPU 增强资源已释放')
    const device = this.device
    const input = this.ensureInput(width, height)
    device.queue.copyExternalImageToTexture({ source }, { texture: input.texture }, [width, height])
    const output = this.ensureOutput(width * this.scale, height * this.scale)
    const encoder = device.createCommandEncoder()
    const produced: SizedTexture[] = []
    const recycled = this.plan.passes.map(() => false)
    for (let index = 0; index < this.plan.passes.length; index += 1) {
      const pass = this.plan.passes[index]
      const isLast = index === this.plan.passes.length - 1
      const target = isLast ? output : this.acquire(width * pass.scale, height * pass.scale)
      const primary = pass.primary === 'input' ? input : produced[pass.primary]
      const secondary = pass.secondary === 'input' ? input : (pass.secondary === null ? primary : produced[pass.secondary])
      device.queue.writeBuffer(this.uniforms, index * UNIFORM_STRIDE, new Float32Array([
        target.width, target.height,
        1 / primary.width, 1 / primary.height,
        primary.width, primary.height,
        0, 0, 0, 0, 0, 0,
      ]))
      const bindGroup = device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: primary.texture.createView() },
          { binding: 1, resource: this.nearest },
          { binding: 2, resource: { buffer: this.uniforms, offset: index * UNIFORM_STRIDE, size: UNIFORM_BYTES } },
          { binding: 3, resource: secondary.texture.createView() },
          { binding: 4, resource: this.linear },
        ],
      })
      const renderPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: target.texture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      })
      const pipelineFormat = isLast ? OUTPUT_FORMAT : WORK_FORMAT
      this.trace.push(index + (isLast ? '（末趟）' : '') + ' 管线=' + pipelineFormat + ' 附件=' + target.format + ' 主输入=' + primary.width + 'x' + primary.height + ' 输出=' + target.width + 'x' + target.height)
      renderPass.setPipeline(this.pipelineFor(pass.code, pipelineFormat))
      renderPass.setBindGroup(0, bindGroup)
      renderPass.draw(3)
      renderPass.end()
      produced.push(target)
      for (let earlier = 0; earlier <= index; earlier += 1) {
        if (!recycled[earlier] && this.lastUse[earlier] === index) {
          recycled[earlier] = true
          this.recycle(produced[earlier])
        }
      }
    }
    device.queue.submit([encoder.finish()])
  }

  async readFrame(): Promise<Anime4kWebgpuFrame> {
    const output = this.output
    if (!output) throw new Error('还没有可回读的增强结果')
    const unpadded = output.width * 4
    const padded = Math.ceil(unpadded / READBACK_ALIGNMENT) * READBACK_ALIGNMENT
    const buffer = this.device.createBuffer({ size: padded * output.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    const encoder = this.device.createCommandEncoder()
    encoder.copyTextureToBuffer({ texture: output.texture },
      { buffer, bytesPerRow: padded, rowsPerImage: output.height },
      [output.width, output.height])
    this.device.queue.submit([encoder.finish()])
    await buffer.mapAsync(GPUMapMode.READ)
    const source = new Uint8Array(buffer.getMappedRange())
    const data = new Uint8ClampedArray(output.width * output.height * 4)
    for (let row = 0; row < output.height; row += 1) {
      data.set(source.subarray(row * padded, row * padded + unpadded), row * unpadded)
    }
    buffer.unmap()
    buffer.destroy()
    return { width: output.width, height: output.height, data }
  }

  async validate(): Promise<string[]> {
    const messages: string[] = []
    for (const module of this.modules) {
      const info = await module.getCompilationInfo?.()
      for (const message of info?.messages ?? []) {
          if (message.type === 'error') messages.push('第 ' + (message.lineNum ?? 0) + ' 行：' + message.message)
      }
    }
    return messages
  }

  destroy() {
    this.destroyed = true
    for (const textures of this.pool.values()) for (const texture of textures) texture.destroy()
    this.pool.clear()
    this.input?.texture.destroy()
    this.output?.texture.destroy()
    this.input = null
    this.output = null
    this.uniforms.destroy()
  }

  private pipelineFor(code: string, format: string): GPURenderPipeline {
    const key = format + '|' + code
    const cached = this.pipelines.get(key)
    if (cached) return cached
    const module = this.device.createShaderModule({ code })
    this.modules.push(module)
    const pipeline = this.device.createRenderPipeline({
      layout: this.pipelineLayout,
      vertex: { module, entryPoint: 'vs_main' },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    })
    this.pipelines.set(key, pipeline)
    return pipeline
  }

  private acquire(width: number, height: number): SizedTexture {
    const key = width + 'x' + height
    const texture = this.pool.get(key)?.pop()
    if (texture) return { texture, width, height, format: WORK_FORMAT }
    return {
      texture: this.device.createTexture({
        size: { width, height },
        format: WORK_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }),
      width,
      height,
      format: WORK_FORMAT,
    }
  }

  private recycle(target: SizedTexture) {
    const key = target.width + 'x' + target.height
    const free = this.pool.get(key)
    if (free) free.push(target.texture)
    else this.pool.set(key, [target.texture])
  }

  private ensureInput(width: number, height: number): SizedTexture {
    if (this.input && this.input.width === width && this.input.height === height) return this.input
    this.input?.texture.destroy()
    this.input = {
      texture: this.device.createTexture({
        size: { width, height },
        format: INPUT_FORMAT,
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }),
      width,
      height,
      format: INPUT_FORMAT,
    }
    return this.input
  }

  private ensureOutput(width: number, height: number): SizedTexture {
    if (this.output && this.output.width === width && this.output.height === height) return this.output
    this.output?.texture.destroy()
    this.output = {
      texture: this.device.createTexture({
        size: { width, height },
        format: OUTPUT_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
      }),
      width,
      height,
      format: OUTPUT_FORMAT,
    }
    return this.output
  }
}

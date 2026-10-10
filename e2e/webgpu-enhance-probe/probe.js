/**
 * 在真实 Electron 里验证 Anime4K 的 WebGPU 实现（VQ-57）。
 *
 * 判据只有一条：**同一条链路、同一张输入，WebGPU 与 WebGL 的输出必须一致**。
 * 因此这里不比较"看起来像不像"，而是逐像素算平均/最大差与超阈值比例；同时记录耗时，
 * 并检查 WGSL 的编译错误与未捕获的 WebGPU 错误——这类错误不会抛异常，只会静默出黑屏。
 */
const SIZE = 192
const PROFILES = ['balanced', 'upscale', 'sharp']

/** 探针是以 blob 模块加载的，blob 的源是不透明的，因此绝对路径必须按页面 origin 拼成完整 URL。 */
const moduleUrl = (path) => new URL(path, location.origin).href

/** 合成一张带渐变、平色块、硬边、细线与高光的输入图，覆盖 Anime4K 会作用的画面特征。 */
async function makeInput(size) {
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const context = canvas.getContext('2d')
  const gradient = context.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, '#0b1e3a'); gradient.addColorStop(0.5, '#c8dcf0'); gradient.addColorStop(1, '#f6d9a0')
  context.fillStyle = gradient; context.fillRect(0, 0, size, size)
  context.fillStyle = '#e8b23a'; context.fillRect(size * 0.12, size * 0.15, size * 0.3, size * 0.25)
  context.fillStyle = '#20304a'; context.fillRect(size * 0.55, size * 0.42, size * 0.32, size * 0.3)
  context.fillStyle = '#ffffff'; context.fillRect(size * 0.1, size * 0.7, size * 0.8, 2)
  context.fillStyle = '#000000'; context.fillRect(size * 0.1, size * 0.72, size * 0.8, 2)
  for (let i = 0; i < 12; i += 1) {
    context.fillStyle = i % 2 ? '#d24b3f' : '#1b6b4a'
    context.fillRect(size * 0.08 + i * 7, size * 0.82, 3, size * 0.12)
  }
  context.fillStyle = '#ffffff'
  context.beginPath(); context.arc(size * 0.78, size * 0.2, size * 0.09, 0, Math.PI * 2); context.fill()
  return createImageBitmap(canvas)
}

/** WebGL1 参考：与渲染 Worker 相同，用 anime4k.js 的原链路跑同一档位。 */
async function runWebgl(profile, bitmap, size) {
  const { FrameEnhancer, profileShaderChain } = await import(moduleUrl('/src/video/frameEnhancer.ts'))
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true })
  if (!gl) return { supported: false, reason: '没有可用的 WebGL1 上下文' }
  const configure = (texture, filter) => {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }
  const enhancer = new FrameEnhancer(gl, profileShaderChain(profile))
  const source = gl.createTexture()
  configure(source, gl.LINEAR)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
  const destination = gl.createTexture()
  configure(destination, gl.LINEAR)
  const start = performance.now()
  const result = enhancer.process(source, size, size, destination)
  const ms = performance.now() - start
  const framebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, destination, 0)
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return { supported: false, reason: '回读用的帧缓冲不完整' }
  const pixels = new Uint8Array(result.width * result.height * 4)
  gl.readPixels(0, 0, result.width, result.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  enhancer.stop()
  return { supported: true, ms, width: result.width, height: result.height, scale: enhancer.scale, pixels }
}

/** WebGPU 实现：同一档位的计划，跑在共享设备上。 */
async function runWebgpu(profile, bitmap, size, device) {
  const { createAnime4kWebgpuRuntime } = await import(moduleUrl('/src/video/anime4kWebgpu.ts'))
  const uncaptured = []
  const onError = (event) => uncaptured.push(String(event.error?.message ?? event.error))
  device.addEventListener?.('uncapturederror', onError)
  const runtime = await createAnime4kWebgpuRuntime(profile, { device })
  if (!runtime) return { supported: false, reason: '该档位没有 WebGPU 计划' }
  try {
    runtime.process(bitmap, size, size)
    await runtime.readFrame()
    const start = performance.now()
    runtime.process(bitmap, size, size)
    const frame = await runtime.readFrame()
    const ms = performance.now() - start
    const compilation = await runtime.validate()
    return { supported: true, ms, width: frame.width, height: frame.height, scale: runtime.scale, pixels: frame.data, compilation, uncaptured, trace: [...runtime.trace], passes: runtime.plan.passes.length }
  } finally {
    runtime.destroy()
    device.removeEventListener?.('uncapturederror', onError)
  }
}

/** 逐像素比较；同时给出"翻转行序"的结果，用于判断两边的行序是否一致。 */
function compare(first, second, width, height) {
  const measure = (flip) => {
    let sum = 0, max = 0, count = 0, mismatched = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const a = (y * width + x) * 4
        const b = ((flip ? height - 1 - y : y) * width + x) * 4
        for (let channel = 0; channel < 3; channel += 1) {
          const delta = Math.abs(first[a + channel] - second[b + channel])
          sum += delta; count += 1
          if (delta > max) max = delta
          if (delta > 16) mismatched += 1
        }
      }
    }
    return { meanAbs: sum / count, maxAbs: max, mismatchRatio: mismatched / count }
  }
  return { sameRowOrder: measure(false), flippedRowOrder: measure(true) }
}

export async function run() {
  const report = { size: SIZE, profiles: {}, webgpu: null }
  const gpu = navigator.gpu
  report.webgpu = { available: !!gpu }
  if (!gpu) return report
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' })
  report.webgpu.adapter = adapter?.info ?? null
  if (!adapter) { report.webgpu.reason = 'requestAdapter 返回 null'; return report }
  const device = await adapter.requestDevice()
  const bitmap = await makeInput(SIZE)
  for (const profile of PROFILES) {
    const entry = {}
    try {
      entry.webgpu = await runWebgpu(profile, bitmap, SIZE, device)
      const reference = await runWebgl(profile, bitmap, SIZE)
      entry.webgl = reference.supported
        ? { supported: true, ms: reference.ms, width: reference.width, height: reference.height, scale: reference.scale }
        : reference
      if (entry.webgpu.supported && reference.supported) {
        entry.difference = compare(entry.webgpu.pixels, reference.pixels, reference.width, reference.height)
      }
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error)
    }
    if (entry.webgpu) delete entry.webgpu.pixels
    if (entry.webgl) delete entry.webgl.pixels
    report.profiles[profile] = entry
  }
  return report
}

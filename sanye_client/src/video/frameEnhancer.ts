import { Anime4K_Clamp_Highlights, Anime4K_Deblur_DoG, Anime4K_Restore_CNN_M, Anime4K_Restore_CNN_S,
  Anime4K_Upscale_CNN_x2_S, type Anime4KShaderConstructor } from 'anime4k.js/shaders'
import type { Anime4KProfile } from './anime4k'

export type FrameEnhancement = 'restore' | 'upscale'
interface Texture { texture: WebGLTexture; width: number; height: number }

/**
 * 档位链路的唯一定义（VQ-28）：主线程 `anime4kRuntime.createAnime4KVideoUpscaler` 与渲染 Worker 的
 * 仅增强路径都调用它。只有两侧使用同一条着色器链路，把「只开画质、不开补帧」移入 Worker 才不改变
 * 像素输出；链路不同即视为质量退化，按 VQ-28 不采纳。
 */
export function profileShaderChain(profile: Anime4KProfile): Anime4KShaderConstructor[] {
  if (profile === 'upscale') return [Anime4K_Clamp_Highlights, Anime4K_Restore_CNN_S, Anime4K_Upscale_CNN_x2_S]
  if (profile === 'fast') return [Anime4K_Deblur_DoG]
  if (profile === 'sharp') return [Anime4K_Clamp_Highlights, Anime4K_Restore_CNN_M]
  return [Anime4K_Clamp_Highlights, Anime4K_Restore_CNN_S]
}

/** 补帧路径的增强链路：轻量档继续使用锐化着色器，只有重档启用 Anime4K 网络。 */
export function interpolationShaderChain(mode: FrameEnhancement): Anime4KShaderConstructor[] {
  return mode === 'upscale'
    ? [Anime4K_Clamp_Highlights, Anime4K_Restore_CNN_S, Anime4K_Upscale_CNN_x2_S]
    : [Anime4K_Clamp_Highlights, Anime4K_Restore_CNN_S]
}

/** Enhance each decoded frame once, then cache the result for all its intermediate frames. */
export class FrameEnhancer {
  private programs: InstanceType<Anime4KShaderConstructor>[] = []
  private framebuffer: WebGLFramebuffer
  private destinations = new WeakMap<WebGLTexture, { width: number; height: number }>()
  private stopped = false
  private scaleFactor = 1
  constructor(private gl: WebGLRenderingContext, chain: Anime4KShaderConstructor[]) {
    if (!gl.getExtension('WEBGL_color_buffer_float')) throw new Error('当前 GPU 不支持修复纹理，已回退性能档')
    this.framebuffer = gl.createFramebuffer()!
    try {
      for (const Shader of chain) this.programs.push(new Shader(gl))
      this.measureScale()
    } catch (error) { this.stop(); throw error }
  }
  /** 链路放大倍率（超分 2×，其余为 1），由链路自身声明，不按档位名硬编码。 */
  get scale() { return this.scaleFactor }
  private measureScale() {
    let scale = 1
    for (const program of this.programs) {
      const [x, y] = program.magnification()
      scale *= Math.max(1, x) * Math.max(1, y)
    }
    this.scaleFactor = scale
  }
  /** 释放链路最后一个阶段（超分→修复），复用同一增强程序完成有界降档。 */
  downgradeToRestore() {
    if (this.programs.length <= 1) return
    this.programs.pop()?.destroy()
    this.measureScale()
  }
  process(source: WebGLTexture, width: number, height: number, destination: WebGLTexture) {
    if (this.stopped) throw new Error('增强资源已释放')
    const gl = this.gl, scale = this.scaleFactor
    // Anime4K enables its two attributes only at construction; the interpolation pass uses one.
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1)
    const textures = new Map<string, Texture>([
      ['MAIN', { texture: source, width, height }], ['NATIVE', { texture: source, width, height }],
      ['OUTPUT', { texture: destination, width: width * scale, height: height * scale }],
    ])
    for (const program of this.programs) program.hook_MAIN(textures, this.framebuffer)
    textures.set('PREKERNEL', textures.get('MAIN')!)
    textures.delete('MAIN')
    for (const program of this.programs) program.hook_PREKERNEL(textures, this.framebuffer)
    const result = textures.get('PREKERNEL')!
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, result.texture, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('修复纹理不可用，已回退性能档')
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, destination)
    const previous = this.destinations.get(destination)
    const allocated = previous?.width !== result.width || previous?.height !== result.height
    if (allocated) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, result.width, result.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      this.destinations.set(destination, { width: result.width, height: result.height })
    }
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, result.width, result.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { width: result.width, height: result.height, allocated }
  }
  stop() {
    if (this.stopped) return
    this.stopped = true
    for (const program of this.programs) program.destroy()
    this.programs = []; this.destinations = new WeakMap()
    this.gl.deleteFramebuffer(this.framebuffer)
  }
}

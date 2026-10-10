import { VideoUpscaler } from 'anime4k.js/upscaler'
import type { Anime4KProfile } from './anime4k'
import { profileShaderChain } from './frameEnhancer'

export function isAnime4KSupported() {
  const gl = document.createElement('canvas').getContext('webgl')
  if (!gl) return false
  const supported = Boolean(gl.getExtension('OES_texture_float') && gl.getExtension('OES_texture_float_linear')
    && gl.getExtension('EXT_color_buffer_half_float'))
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return supported
}

export function createAnime4KVideoUpscaler(profile: Anime4KProfile) {
  // 主线程路径与渲染 Worker 的仅增强路径共用同一条档位链路（VQ-28），只改变执行位置。
  return new VideoUpscaler(profileShaderChain(profile))
}

import { startRealtimeInterpolation, type InterpolationStats } from './realtimeInterpolation'

export type Anime4KProfile = 'fast' | 'balanced' | 'sharp' | 'restore' | 'upscale'

export const ANIME4K_PROFILE_LABELS: Record<Anime4KProfile, string> = {
  fast: '性能',
  balanced: '均衡',
  sharp: '锐化',
  restore: '修复',
  upscale: '超分 2×',
}

export interface Anime4KSession {
  canvas: HTMLCanvasElement
  stop: () => void
}

export interface Anime4KEnhancementOptions {
  profile: Anime4KProfile
  /**
   * 仅增强路径的执行位置：默认 `worker`（渲染 Worker 内执行，VQ-28）。
   * `main` 一键回到原 `anime4k.js` 主线程路径，用于隔离对照与回退。
   */
  path?: 'worker' | 'main'
  onStats?: (stats: InterpolationStats) => void
  onError?: (message: string) => void
}

/**
 * 只开画质、不开补帧时的入口（VQ-28）。
 *
 * 画质档在渲染 Worker 内执行，页面主线程不再逐帧执行 Anime4K；档位链路与主线程
 * `anime4kRuntime.createAnime4KVideoUpscaler` 共用 `frameEnhancer.profileShaderChain`，
 * 因此只改变执行位置、不改变像素输出。
 * Worker 不可用或档位初始化失败时回退原主线程路径；显式指定 `path: 'main'` 即可一键回到原路径做隔离对照。
 */
export async function startAnime4KEnhancement(video: HTMLVideoElement,
  options: Anime4KEnhancementOptions): Promise<Anime4KSession> {
  if ((options.path ?? 'worker') === 'main') return startAnime4KVideo(video, options.profile, options.onError)
  try {
    const session = await startRealtimeInterpolation(video, {
      enhance: true,
      profile: options.profile,
      interpolation: false,
      onStats: options.onStats,
      onError: options.onError,
    })
    return { canvas: session.canvas, stop: session.stop }
  } catch {
    return startAnime4KVideo(video, options.profile, options.onError)
  }
}

export async function startAnime4KVideo(video: HTMLVideoElement, profile: Anime4KProfile,
  onError?: (message: string) => void): Promise<Anime4KSession> {
  const anime4K = await import('./anime4kRuntime')
  if (!anime4K.isAnime4KSupported()) {
    throw new Error('当前浏览器不支持 Anime4K 所需的 WebGL 扩展。')
  }

  const player = video.closest('.art-video-player')
  if (!player) {
    throw new Error('未找到可挂载 Anime4K 的播放器容器。')
  }

  const canvas = document.createElement('canvas')
  canvas.className = 'anime4k-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  video.insertAdjacentElement('afterend', canvas)

  const upscaler = anime4K.createAnime4KVideoUpscaler(profile)
  let stopped = false
  const pause = () => {
    upscaler.stop()
    player.classList.remove('sanye-anime4k-active')
  }
  const resume = () => {
    if (!stopped && !video.paused && !video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && !document.hidden && document.pictureInPictureElement !== video) {
      upscaler.stop()
      upscaler.start()
      player.classList.add('sanye-anime4k-active')
    }
  }
  const visibility = () => { if (document.hidden) pause(); else resume() }
  const stop = () => {
    if (stopped) return
    stopped = true
    video.removeEventListener('pause', pause)
    video.removeEventListener('playing', resume)
    video.removeEventListener('seeking', pause)
    video.removeEventListener('seeked', resume)
    video.removeEventListener('waiting', pause)
    video.removeEventListener('enterpictureinpicture', pause)
    video.removeEventListener('leavepictureinpicture', resume)
    document.removeEventListener('visibilitychange', visibility)
    canvas.removeEventListener('webglcontextlost', contextLost)
    player.classList.remove('sanye-anime4k-active')
    upscaler.detachVideo()
    canvas.remove()
  }
  const contextLost = (event: Event) => {
    event.preventDefault()
    stop()
    onError?.('画质增强不可用，已恢复原始播放')
  }
  try {
    upscaler.attachVideo(video, canvas)
    resume()
    video.addEventListener('pause', pause)
    video.addEventListener('playing', resume)
    video.addEventListener('seeking', pause)
    video.addEventListener('seeked', resume)
    video.addEventListener('waiting', pause)
    video.addEventListener('enterpictureinpicture', pause)
    video.addEventListener('leavepictureinpicture', resume)
    canvas.addEventListener('webglcontextlost', contextLost)
    document.addEventListener('visibilitychange', visibility)
  } catch (error) {
    stop()
    throw error
  }

  return {
    canvas,
    stop,
  }
}

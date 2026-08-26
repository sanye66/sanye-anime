export type Anime4KProfile = 'fast' | 'balanced' | 'sharp'

export const ANIME4K_PROFILE_LABELS: Record<Anime4KProfile, string> = {
  fast: '性能',
  balanced: '均衡',
  sharp: '锐化',
}

export interface Anime4KSession {
  canvas: HTMLCanvasElement
  stop: () => void
}

export async function startAnime4KVideo(video: HTMLVideoElement, profile: Anime4KProfile): Promise<Anime4KSession> {
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
  try {
    upscaler.attachVideo(video, canvas)
    upscaler.start()
    player.classList.add('sanye-anime4k-active')
  } catch (error) {
    canvas.remove()
    upscaler.detachVideo()
    throw error
  }

  return {
    canvas,
    stop() {
      player.classList.remove('sanye-anime4k-active')
      upscaler.detachVideo()
      canvas.remove()
    },
  }
}

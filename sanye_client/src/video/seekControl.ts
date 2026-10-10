import type Artplayer from 'artplayer'
import type Hls from 'hls.js'

/** Prioritize unbuffered seeks over unrelated downloads, keys and retry delays in either direction. */
export function installHlsSeekControl(video: HTMLVideoElement, hls: Hls) {
  const seeking = () => {
    const target = video.currentTime
    for (let index = 0; index < video.buffered.length; index++) {
      if (target >= video.buffered.start(index) && target < video.buffered.end(index)) return
    }
    const pending = Object.values(hls.inFlightFragments).some(item => item?.frag
      && (item.state === 'FRAG_LOADING' || item.state === 'FRAG_LOADING_WAITING_RETRY' || item.state === 'KEY_LOADING')
      && (target < item.frag.start - hls.config.maxFragLookUpTolerance
        || target > item.frag.start + item.frag.duration + hls.config.maxFragLookUpTolerance))
    if (!pending) return
    hls.stopLoad()
    hls.startLoad(target)
  }
  video.addEventListener('seeking', seeking)
  hls.on((hls.constructor as typeof Hls).Events.DESTROYING, () => video.removeEventListener('seeking', seeking))
}

/**
 * 拖动预览的定位间隔。
 *
 * 命中缓冲时按接近渲染节奏刷新，用户能看到画面跟着指针走；未命中缓冲时先拉开间隔，
 * 因为每一次预览定位都会中止在途分片、让解码重新起跳，间隔太短只会堆积无效请求。
 * 实际间隔再按上一段定位的实测耗时放宽，避免关键帧稀疏或网络较慢时把定位堆在松手之后。
 */
const PREVIEW_SEEK_BUFFERED_INTERVAL_MS = 90
const PREVIEW_SEEK_UNBUFFERED_INTERVAL_MS = 220
const PREVIEW_SEEK_COST_FACTOR = 1.2
/** 目标与当前位置的差值不超过该值时，不再为预览或最终提交额外发起定位。 */
const SEEK_ALIGN_TOLERANCE_SECONDS = 0.2

/**
 * 拖动期间持续预览画面，松手只补一次必要定位。
 *
 * 「只预览、松手提交一次」在缓存命中的拖动里最省请求，但用户在拖动过程中看不到任何画面变化，
 * 松手后还要等完整定位与补帧恢复，整体被感知为响应慢。现在改为：暂停后按节流把媒体元素推进到
 * 当前目标，画面随指针更新；松手时若已经在目标附近就直接恢复播放，不重复定位。
 */
export function installSeekControl(player: Artplayer) {
  const bar = player.template.$progress
  const previousTouchAction = bar.style.touchAction
  bar.style.touchAction = 'none'
  let pointer: number | null = null
  let target = 0
  let origin = 0
  let wasPlaying = false
  let suppressClickUntil = 0
  let lastPreviewSeekAt = 0
  let seekStartedAt = 0
  let lastSeekCostMs = 0
  const markSeeking = () => { seekStartedAt = performance.now() }
  const measureSeek = () => {
    if (seekStartedAt) lastSeekCostMs = performance.now() - seekStartedAt
    seekStartedAt = 0
  }
  const isBuffered = (time: number) => {
    const ranges = player.video.buffered
    for (let index = 0; index < ranges.length; index += 1) {
      if (time >= ranges.start(index) && time < ranges.end(index)) return true
    }
    return false
  }
  /** 点播才有可靠时长；直播或未就绪时不做预览定位。 */
  const seekable = () => Number.isFinite(player.duration) && player.duration > 0
  const preview = () => {
    if (pointer !== null && player.duration > 0) player.emit('setBar', 'played', target / player.duration)
  }
  /**
   * 预览定位：暂停状态下把画面推进到当前目标。一次只允许一个定位在途，
   * 间隔按目标是否已在缓冲区间分别取值，未命中缓冲的长间隔用来限制重复分片请求。
   */
  const previewSeek = (now: number) => {
    const video = player.video
    if (!seekable()) return
    if (video.seeking) return
    if (Math.abs(target - video.currentTime) <= SEEK_ALIGN_TOLERANCE_SECONDS) return
    const base = isBuffered(target) ? PREVIEW_SEEK_BUFFERED_INTERVAL_MS : PREVIEW_SEEK_UNBUFFERED_INTERVAL_MS
    const interval = Math.max(base, lastSeekCostMs * PREVIEW_SEEK_COST_FACTOR)
    if (now - lastPreviewSeekAt < interval) return
    lastPreviewSeekAt = now
    video.currentTime = target
  }
  const position = (event: PointerEvent) => {
    const rect = bar.getBoundingClientRect()
    const fraction = player.isRotate ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width
    target = Math.max(0, Math.min(1, fraction)) * player.duration
    preview()
    previewSeek(performance.now())
  }
  const down = (event: PointerEvent) => {
    if (pointer !== null || !event.isPrimary || event.button !== 0 || !player.duration) return
    event.preventDefault(); event.stopImmediatePropagation()
    pointer = event.pointerId
    wasPlaying = !player.video.paused
    origin = player.video.currentTime
    player.video.pause()
    lastPreviewSeekAt = 0
    position(event)
  }
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return
    event.preventDefault(); event.stopImmediatePropagation(); position(event)
  }
  /**
   * 松手：画面已经在目标附近（含正在进行的预览定位）时直接恢复播放状态，不再重复定位；
   * 取消（指针中断或窗口失焦）时把位置还原到拖动之前，避免预览改动被当成用户选择。
   */
  const finish = (commit: boolean) => {
    if (pointer === null) return
    pointer = null
    suppressClickUntil = performance.now() + 400
    if (commit) {
      if (Math.abs(player.video.currentTime - target) > SEEK_ALIGN_TOLERANCE_SECONDS) player.seek = target
    } else if (Math.abs(player.video.currentTime - origin) > SEEK_ALIGN_TOLERANCE_SECONDS) {
      player.video.currentTime = origin
    }
    if (player.duration > 0) player.emit('setBar', 'played', (commit ? target : player.video.currentTime) / player.duration)
    if (wasPlaying) void player.video.play().catch(() => {})
  }
  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return
    event.preventDefault(); event.stopImmediatePropagation(); position(event); finish(true)
  }
  const cancel = () => finish(false)
  const cancelPointer = (event: PointerEvent) => { if (event.pointerId === pointer) cancel() }
  const blockCompatibility = (event: Event) => {
    if (pointer !== null || performance.now() < suppressClickUntil) {
      event.preventDefault(); event.stopImmediatePropagation()
    }
  }
  bar.addEventListener('pointerdown', down, true)
  document.addEventListener('pointermove', move, { capture: true, passive: false })
  document.addEventListener('pointerup', up, true)
  document.addEventListener('pointercancel', cancelPointer, true)
  for (const event of ['click', 'mousedown', 'touchstart', 'touchmove', 'touchend']) bar.addEventListener(event, blockCompatibility, { capture: true, passive: false })
  window.addEventListener('blur', cancel)
  player.video.addEventListener('seeking', markSeeking)
  player.video.addEventListener('seeked', measureSeek)
  player.on('video:timeupdate', preview)
  player.on('destroy', () => {
    pointer = null
    bar.style.touchAction = previousTouchAction
    bar.removeEventListener('pointerdown', down, true)
    document.removeEventListener('pointermove', move, true)
    document.removeEventListener('pointerup', up, true)
    document.removeEventListener('pointercancel', cancelPointer, true)
    for (const event of ['click', 'mousedown', 'touchstart', 'touchmove', 'touchend']) bar.removeEventListener(event, blockCompatibility, true)
    window.removeEventListener('blur', cancel)
    player.video.removeEventListener('seeking', markSeeking)
    player.video.removeEventListener('seeked', measureSeek)
    player.off('video:timeupdate', preview)
  })
}

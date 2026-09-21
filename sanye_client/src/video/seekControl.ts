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

/** Preview while scrubbing; submit one seek so downloads and decoding are not repeatedly cancelled. */
export function installSeekControl(player: Artplayer) {
  const bar = player.template.$progress
  const previousTouchAction = bar.style.touchAction
  bar.style.touchAction = 'none'
  let pointer: number | null = null
  let target = 0
  let wasPlaying = false
  let suppressClickUntil = 0
  const preview = () => {
    if (pointer !== null && player.duration > 0) player.emit('setBar', 'played', target / player.duration)
  }
  const position = (event: PointerEvent) => {
    const rect = bar.getBoundingClientRect()
    const fraction = player.isRotate ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width
    target = Math.max(0, Math.min(1, fraction)) * player.duration
    preview()
  }
  const down = (event: PointerEvent) => {
    if (pointer !== null || !event.isPrimary || event.button !== 0 || !player.duration) return
    event.preventDefault(); event.stopImmediatePropagation()
    pointer = event.pointerId
    wasPlaying = !player.video.paused
    player.video.pause()
    position(event)
  }
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return
    event.preventDefault(); event.stopImmediatePropagation(); position(event)
  }
  const finish = (commit: boolean) => {
    if (pointer === null) return
    pointer = null
    suppressClickUntil = performance.now() + 400
    if (commit) player.seek = target
    else player.emit('setBar', 'played', player.currentTime / player.duration)
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
    player.off('video:timeupdate', preview)
  })
}

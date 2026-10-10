import type Artplayer from 'artplayer'

/**
 * 进度条改为播放期动画帧更新：Artplayer 在构造播放器和挂载控件时读取该静态开关，
 * 必须早于 `new Artplayer(...)`，否则本次实例仍会退回媒体 timeupdate（约 4Hz）的更新节奏。
 */
export function useSmoothProgress(constructor: typeof Artplayer) {
  constructor.USE_RAF = true
}

/**
 * 用播放器自己的渲染节奏同步已播放进度。
 *
 * ArtPlayer 的静态开关只影响它内部的事件转发；在不同构建或媒体源下，
 * 仍可能退回浏览器低频 `timeupdate`。这里直接读取媒体时钟并写入控制栏，
 * 确保播放、变速和 HLS 都能在每个动画帧反映当前位置。
 */
export function installRealtimeProgress(player: Artplayer) {
  let frame = 0
  const update = () => {
    const video = player.video
    const duration = player.duration
    if (duration > 0 && Number.isFinite(video.currentTime)) {
      player.emit('setBar', 'played', Math.max(0, Math.min(1, video.currentTime / duration)))
    }
    frame = window.requestAnimationFrame(update)
  }
  frame = window.requestAnimationFrame(update)
  player.once('destroy', () => window.cancelAnimationFrame(frame))
}

/** Keep Artplayer's built-in video click handling consistent across pointer types. */
export function installPlaybackControl(player: Artplayer) {
  const constructor = player.constructor as typeof Artplayer
  const previousSingle = constructor.MOBILE_CLICK_PLAY
  const previousDouble = constructor.MOBILE_DBCLICK_PLAY
  constructor.MOBILE_CLICK_PLAY = true
  constructor.MOBILE_DBCLICK_PLAY = false
  player.once('destroy', () => {
    constructor.MOBILE_CLICK_PLAY = previousSingle
    constructor.MOBILE_DBCLICK_PLAY = previousDouble
  })
}

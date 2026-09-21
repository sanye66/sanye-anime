import type Artplayer from 'artplayer'

/**
 * 进度条改为播放期动画帧更新：Artplayer 在构造播放器和挂载控件时读取该静态开关，
 * 必须早于 `new Artplayer(...)`，否则本次实例仍会退回媒体 timeupdate（约 4Hz）的更新节奏。
 */
export function useSmoothProgress(constructor: typeof Artplayer) {
  constructor.USE_RAF = true
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

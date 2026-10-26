import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface SystemPlaybackMetadata {
  title: string
  episode?: string
}

interface SystemPlaybackAction {
  id: string
  action: 'play' | 'pause' | 'seek'
  position?: number
}

interface SystemPlaybackState extends SystemPlaybackMetadata {
  id: string
  position: number
  duration: number
  playing: boolean
  explicitPlay: boolean
  buffering: boolean
  ended: boolean
  rate: number
  initialize: boolean
}

interface SystemPlaybackBridge {
  getSystemPlaybackCapabilities(): Promise<{ supported: boolean }>
  updateSystemPlayback(state: SystemPlaybackState): Promise<{ accepted: boolean }>
  requestSystemPlaybackFocus(options: { id: string }): Promise<{ accepted: boolean }>
  releaseSystemPlayback(options: { id: string }): Promise<void>
  addListener(event: 'systemPlaybackAction', listener: (action: SystemPlaybackAction) => void): Promise<PluginListenerHandle>
}

const bridge = registerPlugin<SystemPlaybackBridge>('SanyePlayer')
let disposeCurrent: (() => void) | undefined
let sequence = 0

function bounded<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('系统播放桥接超时')), 1500)
    operation.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}

function finiteTime(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function attachSystemPlayback(
  video: HTMLVideoElement,
  metadata: SystemPlaybackMetadata | (() => SystemPlaybackMetadata),
): () => void {
  disposeCurrent?.()
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('SanyePlayer')) return () => {}
  const id = `${Date.now()}-${++sequence}`
  let disposed = false
  let ready = false
  let listener: PluginListenerHandle | undefined
  let busy = false
  let pending = false
  let explicitPlay = false
  let buffering = false
  let initialized = false
  let unavailable = false
  let lastPositionSync = 0
  let playEpoch = 0
  const playDescriptor = Object.getOwnPropertyDescriptor(video, 'play')
  const pauseDescriptor = Object.getOwnPropertyDescriptor(video, 'pause')
  const originalPlay = video.play
  const originalPause = video.pause
  const wrappedPlay = async () => {
    const epoch = ++playEpoch
    await startup
    if ((disposed && !unavailable) || epoch !== playEpoch) throw new Error('播放请求已取消')
    if (ready) {
      let expired = false
      const request = bridge.requestSystemPlaybackFocus({ id })
      request.then(() => {
        if (disposed) release()
        else if (expired || epoch !== playEpoch) void sync()
      }, () => {})
      let permission: { accepted: boolean }
      try {
        permission = await bounded(request)
      } catch (failure) {
        expired = true
        if (!disposed) void sync()
        throw failure
      }
      if (disposed || epoch !== playEpoch) {
        if (!disposed) void sync()
        throw new Error('播放请求已取消')
      }
      if (!permission.accepted) throw new Error('系统播放状态不允许播放')
    }
    try {
      explicitPlay = true
      return await originalPlay.call(video)
    } catch (failure) {
      if (!disposed) void sync()
      throw failure
    }
  }
  const wrappedPause = () => {
    playEpoch++
    originalPause.call(video)
  }

  const events = ['play', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'seeked', 'ratechange', 'waiting', 'playing', 'error', 'emptied', 'timeupdate']
  const removeListener = (handle: PluginListenerHandle) => {
    void bounded(Promise.resolve(handle.remove())).catch(() => {})
  }
  const release = () => {
    void bounded(bridge.releaseSystemPlayback({ id })).catch(() => {})
  }
  const cleanup = (cancelPending: boolean) => {
    if (cancelPending) playEpoch++
    if (disposed) return
    disposed = true
    if (video.play === wrappedPlay) {
      if (playDescriptor) Object.defineProperty(video, 'play', playDescriptor)
      else Reflect.deleteProperty(video, 'play')
    }
    if (video.pause === wrappedPause) {
      if (pauseDescriptor) Object.defineProperty(video, 'pause', pauseDescriptor)
      else Reflect.deleteProperty(video, 'pause')
    }
    events.forEach(event => video.removeEventListener(event, onVideoEvent))
    if (listener) removeListener(listener)
    if (ready) release()
    if (disposeCurrent === dispose) disposeCurrent = undefined
  }
  const dispose = () => cleanup(true)
  disposeCurrent = dispose

  async function sync() {
    if (!ready || disposed) return
    pending = true
    if (busy) return
    busy = true
    try {
      while (pending && !disposed) {
        pending = false
        const details = typeof metadata === 'function' ? metadata() : metadata
        const state: SystemPlaybackState = {
          id, title: details.title, episode: details.episode ?? '',
          position: finiteTime(video.currentTime), duration: finiteTime(video.duration),
          playing: !video.paused && !video.ended && !video.error,
          explicitPlay, buffering, ended: video.ended, rate: video.playbackRate, initialize: !initialized,
        }
        explicitPlay = false
        initialized = true
        const result = await bounded(bridge.updateSystemPlayback(state))
        if (!disposed && !result.accepted && !video.paused) video.pause()
      }
    } catch {
      // 媒体通知桥接超时或失败时，WebView 已在解码的视频继续播放；
      // 系统明确返回 accepted=false 才属于焦点拒绝，仍由上方分支暂停。
      if (!disposed) {
        unavailable = true
        cleanup(false)
      }
    } finally {
      busy = false
      if (disposed) release()
    }
  }

  function onVideoEvent(event: Event) {
    if (event.type === 'timeupdate') {
      if (Date.now() - lastPositionSync < 1000) return
      lastPositionSync = Date.now()
    }
    if (event.type === 'waiting') buffering = true
    if (['playing', 'pause', 'ended', 'error', 'emptied'].includes(event.type)) buffering = false
    void sync()
  }

  async function start() {
    try {
      const capability = await bounded(bridge.getSystemPlaybackCapabilities())
      if (disposed) return
      if (!capability.supported) {
        unavailable = true
        cleanup(false)
        return
      }
      const subscription = bridge.addListener('systemPlaybackAction', action => {
        if (disposed || action.id !== id) return
        if (action.action === 'pause') video.pause()
        else if (action.action === 'play') void video.play().catch(() => { void sync() })
        else if (action.action === 'seek' && Number.isFinite(action.position) && Number.isFinite(video.duration)) {
          video.currentTime = Math.min(finiteTime(action.position!), finiteTime(video.duration))
          void sync()
        }
      })
      subscription.then(handle => { if (disposed) removeListener(handle) }, () => {})
      listener = await bounded(subscription)
      if (disposed) return
      ready = true
      events.forEach(event => video.addEventListener(event, onVideoEvent))
      explicitPlay = !video.paused
      await sync()
    } catch {
      if (!disposed) {
        unavailable = true
        cleanup(false)
      }
    }
  }
  const startup = start()
  video.play = wrappedPlay
  video.pause = wrappedPause
  return dispose
}

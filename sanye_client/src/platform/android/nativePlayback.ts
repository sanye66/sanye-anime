import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { recordExperience, recordNativePerformance } from './experience'

export interface NativePlaybackRequest {
  sessionId: string
  url: string
  mimeType: string
  requestHeaders?: import('./source').SourcePlaybackHeaders
  title: string
  episodeTitle: string
  positionSeconds: number
  rate: number
  volume: number
  autoPlay: boolean
  nextChoiceId?: string
  previousChoiceId?: string
  firstFrameTimeoutMs: number
  choices?: Array<{ id: string; label: string; selected: boolean; group?: string }>
  lightTheme?: boolean
  replaceId?: string
  autoNext?: boolean
}
export interface NativePlaybackProgress {
  sessionId: string
  positionSeconds: number
  durationSeconds: number
  playing: boolean
  buffering: boolean
  completed: boolean
  rate: number
  volume?: number
}
export interface NativePlaybackResult extends NativePlaybackProgress {
  action: 'close' | 'choice' | 'episodes' | 'retry' | 'switch' | 'error'
  choiceId?: string
  error?: string
  started?: boolean
  firstFrameMs?: number
  watchedSeconds?: number
  stallSeconds?: number
  retained?: boolean
}
interface NativeState {
  id: string; position: number; duration: number; playing: boolean; buffering: boolean
  ended: boolean; firstFrame: boolean; closed: boolean; reason?: string; action?: string; error?: string
  rate?: number; volume?: number; firstFrameMs?: number; watchedSeconds?: number; stallSeconds?: number
  errorCode?: string; pictureInPicture?: boolean
  videoWidth?: number; videoHeight?: number; videoFps?: number; videoBitrate?: number; droppedFrames?: number; seekLatencyMs?: number; bufferedMs?: number; decoder?: string
}
export interface NativePlaybackCapabilities {
  supported: boolean; inPlaceSwitch?: boolean; pictureInPicture?: boolean; appVersion?: string; appBuild?: number
  androidSdk?: number; manufacturer?: string; model?: string; engine?: string
}
interface NativePlaybackPlugin {
  capabilities(): Promise<NativePlaybackCapabilities>
  open(options: Record<string, unknown>): Promise<{ accepted: boolean }>
  close(options: { id: string }): Promise<void>
  transitionFailed(options: { id: string; message: string }): Promise<void>
  addListener(event: 'playbackState', callback: (event: NativeState) => void): Promise<PluginListenerHandle>
}
const bridge = registerPlugin<NativePlaybackPlugin>('SanyeMedia3')
export function nativePlaybackAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SanyeMedia3')
}
export async function closeRetainedNativePlayback(id: string) { await bounded(bridge.close({ id })) }
export async function failRetainedNativePlayback(id: string) {
  try { await bounded(bridge.transitionFailed({ id, message: '这条线路暂不可用，请重试或选择其他线路' })) }
  catch { await closeRetainedNativePlayback(id) }
}
export async function nativePlaybackDiagnostics(): Promise<NativePlaybackCapabilities | undefined> {
  if (!nativePlaybackAvailable()) return undefined
  try {
    const value = await bounded(bridge.capabilities())
    const text = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) : undefined
    return { supported: value.supported === true, pictureInPicture: value.pictureInPicture === true,
      appVersion: text(value.appVersion), appBuild: Number.isSafeInteger(value.appBuild) && value.appBuild! >= 0 ? value.appBuild : undefined,
      androidSdk: Number.isSafeInteger(value.androidSdk) && value.androidSdk! > 0 ? value.androidSdk : undefined,
      manufacturer: text(value.manufacturer), model: text(value.model), engine: text(value.engine) }
  } catch { return undefined }
}
function bounded<T>(operation: Promise<T>, milliseconds = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('原生播放器暂时无响应，请重试。')), milliseconds)
    operation.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}
export interface NativePlaybackSession { result: Promise<NativePlaybackResult>; close(): void }
let sequence = 0
export function nextNativeSessionId() { return `media3-${Date.now()}-${++sequence}` }
export async function openNativePlayback(request: NativePlaybackRequest, progress: (event: NativePlaybackProgress) => void, signal?: AbortSignal): Promise<NativePlaybackSession> {
  if (!nativePlaybackAvailable()) throw new Error('原生播放器不可用。')
  const capabilities = await bounded(bridge.capabilities())
  if (signal?.aborted) throw new Error('播放请求已取消。')
  if (!capabilities.supported) throw new Error('此安装包不支持原生播放器。')
  let closed = false, closing = false, recordedFirstFrame = false
  let lastSeekLatency = -1
  let handle: PluginListenerHandle | undefined
  let resolveResult!: (value: NativePlaybackResult) => void
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let latest: NativePlaybackProgress = { sessionId: request.sessionId, positionSeconds: request.positionSeconds, durationSeconds: 0, playing: false, buffering: false, completed: false, rate: request.rate }
  const result = new Promise<NativePlaybackResult>(resolve => { resolveResult = resolve })
  const clean = () => { closed = true; clearTimeout(closeTimer); void handle?.remove().catch(() => {}); handle = undefined }
  const registration = bridge.addListener('playbackState', event => {
    if (closed || event.id !== request.sessionId) return
    if (!Number.isFinite(event.position) || event.position < 0 || !Number.isFinite(event.duration) || event.duration < 0) return
    recordNativePerformance({ width: event.videoWidth, height: event.videoHeight, fps: event.videoFps, bitrate: event.videoBitrate, droppedFrames: event.droppedFrames, decoder: event.decoder, seekLatencyMs: event.seekLatencyMs, bufferedMs: event.bufferedMs })
    if (typeof event.seekLatencyMs === 'number' && Number.isFinite(event.seekLatencyMs) && event.seekLatencyMs >= 0 && event.seekLatencyMs <= 300000 && event.seekLatencyMs !== lastSeekLatency) recordExperience('seek', 'success', event.seekLatencyMs, request.url, undefined, { engine: 'media3' })
    lastSeekLatency = event.seekLatencyMs ?? -1
    if (!recordedFirstFrame && event.firstFrame && Number.isFinite(event.firstFrameMs) && event.firstFrameMs! >= 0) {
      recordedFirstFrame = true
      recordExperience('firstFrame', 'success', event.firstFrameMs!, request.url, undefined, { engine: 'media3' })
    }
    latest = { sessionId: event.id, positionSeconds: event.position, durationSeconds: event.duration, playing: event.playing === true,
      buffering: event.buffering === true, completed: event.ended === true, rate: Number.isFinite(event.rate) ? event.rate! : request.rate,
      volume: Number.isFinite(event.volume) && event.volume! >= 0 && event.volume! <= 1 ? event.volume : undefined }
    if (!closing) progress(latest)
    const transition = capabilities.inPlaceSwitch === true && event.reason === 'transition' && !event.closed
    const retained = transition && (event.action === 'retry' || event.action === 'switch'
      || event.action === 'next' && !!request.nextChoiceId || event.action === 'previous' && !!request.previousChoiceId
      || request.choices?.some(choice => choice.id === event.action) === true)
    if (event.closed || event.reason === 'error' || transition) {
      const failed = event.reason === 'error' || transition && !!event.error && !!event.errorCode
      if (Number.isFinite(event.stallSeconds) && event.stallSeconds! > 0) recordExperience('stall', 'partial', event.stallSeconds! * 1000, request.url, undefined, { engine: 'media3' })
      recordExperience('playback', failed ? 'failed' : !event.firstFrame ? 'cancelled' : (event.watchedSeconds ?? 0) >= 10 ? 'success' : 'partial',
        Math.max(0, (event.watchedSeconds ?? 0) * 1000), request.url, undefined, { engine: 'media3', code: event.errorCode })
      const choiceId = (event.reason === 'choice' || retained) && request.choices?.some(choice => choice.id === event.action) ? event.action : event.action === 'next' ? request.nextChoiceId : event.action === 'previous' ? request.previousChoiceId : undefined
      const action = failed ? 'error' : choiceId ? 'choice' : event.action === 'episodes' || event.action === 'retry' || event.action === 'switch' ? event.action : 'close'
      const outcome: NativePlaybackResult = { ...latest, action,
        choiceId, retained, error: event.error, started: event.firstFrame, firstFrameMs: event.firstFrameMs, watchedSeconds: event.watchedSeconds, stallSeconds: event.stallSeconds }
      if (!event.closed && !retained) void bounded(bridge.close({ id: request.sessionId })).catch(() => {})
      clean(); resolveResult(outcome)
    }
  })
  registration.then(value => { if (closed) void value.remove().catch(() => {}); else handle = value }, () => {})
  try { await bounded(registration) } catch (failure) { closed = true; throw failure }
  if (signal?.aborted) { clean(); throw new Error('播放请求已取消。') }
  try {
    const opened = await bounded(bridge.open({ id: request.sessionId, url: request.url, mimeType: request.mimeType, requestHeaders: request.requestHeaders, title: request.title,
      episode: request.episodeTitle, position: request.positionSeconds, rate: request.rate, volume: request.volume, autoPlay: request.autoPlay,
      firstFrameTimeoutMs: request.firstFrameTimeoutMs, choices: request.choices, lightTheme: request.lightTheme === true,
      replaceId: request.replaceId, autoNext: request.autoNext === true,
      hasNext: Boolean(request.nextChoiceId), hasPrevious: Boolean(request.previousChoiceId) }))
    if (!opened.accepted) throw new Error('原生播放器启动失败，请重试。')
  } catch (failure) { clean(); void bounded(bridge.close({ id: request.sessionId })).catch(() => {}); throw failure }
  return {
    result,
    close() {
      if (closed || closing) return
      closing = true
      closeTimer = setTimeout(() => { clean(); resolveResult({ ...latest, playing: false, buffering: false, action: 'close' }) }, 2500)
      void bounded(bridge.close({ id: request.sessionId })).catch(() => {})
    },
  }
}

import type { Anime4KProfile } from './anime4k'
import type { FrameRateTarget } from './frameCadence'
import type { InterpolationDelaySnapshot } from './interpolationDelayPolicy'
import { foldPresentationLayers, type PresentationLayers } from './presentationLayers'

export const INTERPOLATION_TARGET_FPS = 120
export const INTERPOLATION_DELAY_SECONDS = 0.15
/**
 * 自适应延迟变化时音频延迟的跟随斜坡。斜坡足够短以避免可听音高变化，同时把音频与视频延迟的
 * 瞬时偏差限制在单步收缩幅度内（40ms 门禁以内）。
 */
const INTERPOLATION_DELAY_RAMP_MS = 40
export interface InterpolationDelayStats extends InterpolationDelaySnapshot {
  /** 本窗口实测需要的最小延迟：最新源帧老化时间加 1.5 个源帧间隔。 */
  neededMs: number
  /** 本窗口实测需要的最大延迟（窗口内最坏情况）；收缩判定以该值为准。 */
  neededMaxMs: number
  /** 本窗口实测需要的 P90 延迟；停顿恢复与收缩判定使用该值。 */
  neededP90Ms: number
  /** 本播放段从首帧到补间层就绪的时长；0 表示本段尚未就绪。 */
  awaitingMs: number
  /** 本窗口画面整体回跳次数与最大回跳时长；稳定播放期应为 0。 */
  rewinds: number
  /** 停顿期间恢复余量造成的回退次数；只出现在已经停顿的窗口里。 */
  resumeRewinds: number
  rewindMaxMs: number
}
export interface InterpolationStats {
  targetFps: number; outputFps: number; sourceFps: number; interpolatedFrames: number
  computeMs: number; missedPairs: number; audioDelayMs: number; displayFps: number
  analysisWidth: number; enhancementMs: number; effectiveProfile: Anime4KProfile | 'off'; fallbackReason: string
  enhancementQueueDepth: number
  outputWidth: number; outputHeight: number
  requestedFps: FrameRateTarget; nextTargetFps: number; cadenceReason: string; gpuMs: number; frameIntervalP95Ms: number
  frameIntervalP99Ms: number; frameIntervalMaxMs: number; longFrameIntervals: number
  cadenceBottleneck: import('./frameCadence').CadenceBottleneck; droppedSourceFrames: number; scheduleLateP95Ms: number
  scheduleLateP99Ms: number; scheduleLateMaxMs: number; presentationClock: import('./presentationScheduler').PresentationMode
  longFrameRatio: number
  stallFrames: number
  refreshHz: number; refreshConfirmed: boolean; refreshTicks: number; timerWakeups: number; earlyWakeups: number
  /** 呈现对齐口径（VQ-31）：`refresh` 表示目标高于刷新能力时按刷新边界提交。 */
  presentationAlignment?: 'deadline' | 'refresh'
  /** 本窗口由刷新边界驱动的提交次数。 */
  boundaryTicks?: number
  renderSlots: number; skippedSlots: number; schedulerStarvation: number
  renderTickP95Ms: number; renderTickP99Ms: number; renderTickMaxMs: number; longRenderTicks: number
  requestedProfile: Anime4KProfile | 'off'
  /** 本次会话允许恢复到的最高档位，可能低于请求档位（240 FPS 平衡或结构性降档）。 */
  recoveryCeiling?: Anime4KProfile | 'off'
  /** 本统计窗口内是否发生了档位变化，用于区分降档与有界恢复。 */
  qualityChange?: 'downgrade' | 'recovery' | ''
  /** 增强预算压力段汇总：样本数、覆盖时长与恢复冷却/退避状态。 */
  enhancementBudget?: { samples: number; spanMs: number; cooldownMs: number; failures: number
    armed: boolean; lastEnhancementMs: number; lastQueueDepth: number }
  /** VQ-27 补帧需求：`none` 表示源帧率已达标，本窗口跳过了光流分析与运动场上传。 */
  interpolationNeed?: 'flow' | 'none'
  interpolationReason?: string
  flowSkippedFrames?: number
  flowSkippedTotal?: number
  /** 仅增强路径（VQ-28）：本会话只把画质档放进渲染 Worker，不执行补帧。 */
  enhancementOnly?: boolean
  interpolationDemand?: { mode: 'flow' | 'none'; forced: boolean; sourceFps: number; targetFps: number
    ratio: number; samples: number; transitions: number; reason: string }
  /** 延迟预算（VQ-29）：自适应模式的起播/加宽/收缩与回跳计数，或固定延迟对照的等价字段。 */
  interpolationDelay?: InterpolationDelayStats
  qualityFallbacks?: { from: Anime4KProfile | 'off'; to: Anime4KProfile | 'off'; reason: string; atMs: number }[]
  resources?: { textures: number; pooledFrames: number; ownedTextureBytes: number; textureAllocations: number; textureUpdates: number }
  /**
   * 呈现分层（VQ-31）：源帧、生成帧、合成器提交与可观察呈现分开记录，并标注物理呈现未验证。
   * 由渲染 Worker 的生成帧/提交计数与页面的源帧/可观察呈现计数合并而成。
   */
  presentation?: PresentationLayers
  measurement?: { clock: 'performance.now'; unit: 'ms'; captureP95Ms: number | null; uploadP95Ms: number | null;
    resizeP95Ms: number | null; analysisP95Ms: number | null; flowQueueP95Ms: number | null;
    flowRoundTripP95Ms: number | null; interpolationSubmitP95Ms: number | null; frameQueueP95Ms: number | null;
    counts: Record<string, number>; captureSkipped: number; decodedFrames: number | null; droppedDecodedFrames: number | null;
    decodeProcessingDurationP95Ms: number | null }
}
export interface RealtimeInterpolationSession { stop: () => void; canvas: HTMLCanvasElement }
interface Options { profile?: Anime4KProfile; enhance?: boolean; targetFps?: FrameRateTarget; measureStages?: boolean; interpolationDemand?: 'auto' | 'always'; interpolation?: boolean; interpolationDelay?: 'adaptive' | 'fixed'; presentationAlignment?: 'deadline' | 'refresh'; onStats?: (stats: InterpolationStats) => void; onError?: (message: string) => void }
interface AudioRoute { context: AudioContext; source: MediaElementAudioSourceNode; delay: DelayNode; owner?: symbol }
const audioRoutes = new WeakMap<HTMLVideoElement, AudioRoute>()

/** A media element may have only one MediaElementAudioSourceNode during its lifetime. */
export function releaseInterpolationAudio(video: HTMLVideoElement) {
  const route = audioRoutes.get(video)
  if (!route) return
  route.source.disconnect(); route.delay.disconnect()
  void route.context.close(); audioRoutes.delete(video)
}

export async function startRealtimeInterpolation(video: HTMLVideoElement, options: Options = {}): Promise<RealtimeInterpolationSession> {
  // `interpolation: false` 只把画质档移入渲染 Worker（VQ-28）：不补帧、不引入插值延迟、不建立音频路由。
  const interpolation = options.interpolation !== false
  const player = video.closest('.art-video-player')
  if (!player) throw new Error('未找到播放器容器')
  // 闭包里沿用非空引用：构建模式的类型收窄不会跨闭包保留。
  const playerRoot = player
  if (!video.requestVideoFrameCallback || !HTMLCanvasElement.prototype.transferControlToOffscreen) {
    throw new Error(interpolation ? '当前浏览器不支持后台运动补帧' : '当前浏览器不支持后台画质增强')
  }
  const canvas = document.createElement('canvas')
  canvas.className = 'realtime-interpolation-canvas'; canvas.setAttribute('aria-hidden', 'true')
  let audio: AudioRoute | null = null
  if (interpolation) {
    let route = audioRoutes.get(video)
    if (!route) {
      const context = new AudioContext()
      try {
        const source = context.createMediaElementSource(video), delay = context.createDelay(0.5)
        source.connect(delay); delay.connect(context.destination)
        route = { context, source, delay }; audioRoutes.set(video, route)
      } catch (error) { void context.close(); throw error }
    }
    audio = route
    await audio.context.resume()
    if (audio.context.state !== 'running') throw new Error('请点击播放后再开启质量，以启用同步音频')
  }
  const owner = Symbol('interpolation')
  if (audio) audio.owner = owner
  // 起播与定位时延迟被重新定档，按目标值直接写入；播放期自适应变化用短斜坡跟随，避免爆音。
  const setDelay = (seconds: number, rampMs = 0) => {
    if (!audio || audio.owner !== owner) return
    const now = audio.context.currentTime
    const current = audio.delay.delayTime.value
    const target = Math.max(0, seconds)
    audio.delay.delayTime.cancelScheduledValues(now)
    if (!rampMs || Math.abs(target - current) < 0.001) { audio.delay.delayTime.setValueAtTime(target, now); return }
    audio.delay.delayTime.setValueAtTime(current, now)
    audio.delay.delayTime.linearRampToValueAtTime(target, now + rampMs / 1000)
  }
  const reportedDelay = (delayMs?: number) => delayMs === undefined ? INTERPOLATION_DELAY_SECONDS : delayMs / 1000
  const worker = new Worker(new URL('./interpolationRenderer.worker.ts', import.meta.url), { type: 'module' })
  const offscreen = canvas.transferControlToOffscreen()
  worker.postMessage({ type: 'init', canvas: offscreen, delay: interpolation ? INTERPOLATION_DELAY_SECONDS : 0,
    profile: options.enhance ? options.profile ?? 'fast' : 'off', targetFps: options.targetFps ?? 'auto',
    measureStages: options.measureStages === true, interpolationDemand: options.interpolationDemand ?? 'auto',
    interpolationDelay: options.interpolationDelay ?? 'adaptive',
    presentationAlignment: options.presentationAlignment ?? 'refresh', interpolation }, [offscreen])
  video.insertAdjacentElement('afterend', canvas)
  let stopped = false, busy = false, generation = 0, captureHandle = 0, displayHandle = 0
  let sampledAt = performance.now(), displayFrames = 0
  // 呈现分层（VQ-31）：源帧取媒体元素实际被合成的画面数，可观察呈现取画布作为可见层时的动画帧数。
  let sourceFrames = 0, observedFrames = 0, lastPresentedFrames = -1
  let previousDisplayAt = 0, displayIntervals: number[] = []
  let captureTimes: number[] = [], decodeTimes: number[] = [], captureSkipped = 0
  let lastMediaTime = -1
  let lastDecodedFrames: number | null = null, lastDroppedDecodedFrames: number | null = null
  const suspendEvents = ['pause', 'seeking', 'waiting', 'ended', 'emptied', 'ratechange', 'enterpictureinpicture']
  const resumeEvents = ['playing', 'seeked', 'canplay', 'ratechange', 'leavepictureinpicture']
  const usable = () => !stopped && !video.paused && !video.ended && !video.seeking && !document.hidden
    && document.pictureInPictureElement !== video
  const suspend = (event?: Event) => {
    generation++
    busy = false
    captureTimes = []; decodeTimes = []; captureSkipped = 0
    sourceFrames = 0; observedFrames = 0; lastPresentedFrames = -1
    lastMediaTime = -1
    lastDecodedFrames = lastDroppedDecodedFrames = null
    if (captureHandle) video.cancelVideoFrameCallback(captureHandle)
    if (displayHandle) cancelAnimationFrame(displayHandle)
    captureHandle = displayHandle = 0
    player.classList.remove('sanye-realtime-interpolation-active'); setDelay(0)
    worker.postMessage({ type: 'reset', generation, resetAnalysis: event?.type === 'emptied' || event?.type === 'ratechange' })
  }
  const stop = () => {
    if (stopped) return
    stopped = true; suspend(); worker.terminate(); canvas.remove()
    for (const event of suspendEvents) video.removeEventListener(event, suspend)
    for (const event of resumeEvents) video.removeEventListener(event, resume)
    document.removeEventListener('visibilitychange', visibility)
    canvas.removeEventListener('webglcontextlost', contextLost)
  }
  const fail = (message: string) => { if (stopped) return; stop(); options.onError?.(message) }
  const contextLost = () => fail('GPU 上下文丢失，已恢复原始播放')
  // 初始化握手：Worker 明确回报可用性或画质档初始化失败，页面据此决定是否回退原主线程路径。
  let settleReady: ((result: { failure?: string; enhancementError?: string }) => void) | null = null
  const settled = new Promise<{ failure?: string; enhancementError?: string }>(resolve => { settleReady = resolve })
  const settle = (result: { failure?: string; enhancementError?: string }) => {
    const pending = settleReady; settleReady = null; pending?.(result)
  }
  const readyTimer = window.setTimeout(() => { stop(); settle({ failure: '后台渲染线程初始化超时' }) }, 5000)
  const capture: VideoFrameRequestCallback = (_now, metadata) => {
    captureHandle = 0
    if (!usable()) return
    captureHandle = video.requestVideoFrameCallback(capture)
    // 相邻画面间隔按媒体时间测量：本线程繁忙时跳过的发送不影响源帧率估计。
    const previousMediaTime = lastMediaTime
    lastMediaTime = metadata.mediaTime
    // `presentedFrames` 是媒体元素被合成器实际提交的累计画面数；它才是「源帧」的呈现口径。
    const presented = (metadata as { presentedFrames?: number }).presentedFrames
    if (typeof presented === 'number') {
      if (lastPresentedFrames >= 0 && presented > lastPresentedFrames) sourceFrames += presented - lastPresentedFrames
      lastPresentedFrames = presented
    }
    if (busy) { if (options.measureStages) captureSkipped++; return }
    if (options.measureStages && 'processingDuration' in metadata && typeof metadata.processingDuration === 'number')
      decodeTimes.push(metadata.processingDuration * 1000)
    busy = true
    const captureStarted = options.measureStages ? performance.now() : 0
    const currentGeneration = generation
    void createImageBitmap(video).then(bitmap => {
      if (stopped || currentGeneration !== generation) { bitmap.close(); return }
      busy = false
      if (options.measureStages) captureTimes.push(performance.now() - captureStarted)
      // Transfer the GPU image once; rendering and flow estimation never run on the page thread.
      worker.postMessage({ type: 'frame', bitmap, time: metadata.mediaTime,
        sourceInterval: previousMediaTime >= 0 ? metadata.mediaTime - previousMediaTime : 0,
        displayTime: performance.timeOrigin + metadata.expectedDisplayTime,
        rate: video.playbackRate, generation, capturedAt: options.measureStages ? performance.timeOrigin + performance.now() : 0 }, [bitmap])
    }).catch(() => {
      if (stopped || currentGeneration !== generation) return
      busy = false; fail('视频源不允许读取画面，已恢复原始播放')
    })
  }
  worker.onmessage = (event: MessageEvent<{ type: string; generation: number; active?: boolean; delayMs?: number; message?: string; enhancementError?: string; stats: InterpolationStats }>) => {
    if (stopped) return
    const data = event.data
    if (data.type === 'ready') { window.clearTimeout(readyTimer); settle({ enhancementError: data.enhancementError }); return }
    if (data.type === 'error') {
      if (settleReady) { window.clearTimeout(readyTimer); stop(); settle({ failure: data.message || '后台画质增强不可用' }); return }
      fail(data.message || '后台补帧失败'); return
    }
    if (data.generation !== generation) return
    if (data.type === 'active') {
      player.classList.toggle('sanye-realtime-interpolation-active', Boolean(data.active))
      setDelay(data.active ? reportedDelay(data.delayMs) : 0)
    }
    if (data.type === 'delay') setDelay(reportedDelay(data.delayMs), INTERPOLATION_DELAY_RAMP_MS)
    if (data.type === 'stats') {
      const now = performance.now()
      // 呈现分层（VQ-31）：Worker 给生成帧与提交，页面补源帧与可观察呈现，随后同一份口径出结论。
      if (data.stats.presentation) {
        data.stats.presentation = foldPresentationLayers({ ...data.stats.presentation,
          sourceFrames, observedFrames, windowMs: now - sampledAt })
      }
      if (data.stats.measurement) {
        captureTimes.sort((a, b) => a - b)
        data.stats.measurement.captureP95Ms = captureTimes.length ? captureTimes[Math.ceil(captureTimes.length * 0.95) - 1] : null
        data.stats.measurement.counts.capture = captureTimes.length
        decodeTimes.sort((a, b) => a - b)
        data.stats.measurement.decodeProcessingDurationP95Ms = decodeTimes.length ? decodeTimes[Math.ceil(decodeTimes.length * 0.95) - 1] : null
        data.stats.measurement.counts.decodeProcessingDuration = decodeTimes.length
        const quality = video.getVideoPlaybackQuality?.()
        data.stats.measurement.decodedFrames = quality && lastDecodedFrames !== null ? quality.totalVideoFrames - lastDecodedFrames : null
        data.stats.measurement.droppedDecodedFrames = quality && lastDroppedDecodedFrames !== null ? quality.droppedVideoFrames - lastDroppedDecodedFrames : null
        lastDecodedFrames = quality?.totalVideoFrames ?? null
        lastDroppedDecodedFrames = quality?.droppedVideoFrames ?? null
        data.stats.measurement.captureSkipped = captureSkipped
        captureTimes = []
        decodeTimes = []; captureSkipped = 0
      }
      if (displayIntervals.length >= 20) {
        displayIntervals.sort((a, b) => a - b)
        worker.postMessage({ type: 'display', hz: 1000 / displayIntervals[Math.floor(displayIntervals.length / 2)], generation })
      }
      options.onStats?.({ ...data.stats, audioDelayMs: audio ? audio.delay.delayTime.value * 1000 : 0,
        displayFps: Math.round(displayFrames * 1000 / (now - sampledAt)) })
      sampledAt = now; displayFrames = 0; displayIntervals = []
      sourceFrames = 0; observedFrames = 0
    }
  }
  worker.onerror = () => {
    if (settleReady) { window.clearTimeout(readyTimer); stop(); settle({ failure: '后台渲染线程不可用' }); return }
    fail('后台补帧线程不可用，已恢复原始播放')
  }
  function resume() {
    if (!usable()) return
    if (!captureHandle) captureHandle = video.requestVideoFrameCallback(capture)
    if (!displayHandle) {
      sampledAt = performance.now(); displayFrames = 0; previousDisplayAt = 0; displayIntervals = []
      const observe = (now: number) => {
        if (!usable()) { displayHandle = 0; return }
        if (previousDisplayAt) displayIntervals.push(now - previousDisplayAt)
        previousDisplayAt = now; displayFrames++
        // 画布是可见层时的动画帧才算可观察呈现；隐藏、暂停与缓冲期间不计入。
        if (playerRoot.classList.contains('sanye-realtime-interpolation-active')) observedFrames++
        displayHandle = requestAnimationFrame(observe)
      }
      displayHandle = requestAnimationFrame(observe)
    }
  }
  function visibility() { if (document.hidden) suspend(); else resume() }
  for (const event of suspendEvents) video.addEventListener(event, suspend)
  for (const event of resumeEvents) video.addEventListener(event, resume)
  document.addEventListener('visibilitychange', visibility)
  canvas.addEventListener('webglcontextlost', contextLost)
  resume()
  const initialized = await settled
  if (initialized.failure) throw new Error(initialized.failure)
  // 仅增强路径不能用“静默降档”代替用户选的档位：初始化失败直接交回页面切回原路径。
  if (initialized.enhancementError && !interpolation) {
    stop(); throw new Error(initialized.enhancementError)
  }
  return { canvas, stop }
}

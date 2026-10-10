import type { Anime4KProfile } from './anime4k'
import type { FrameRateTarget } from './frameCadence'
import type { InterpolationDelaySnapshot } from './interpolationDelayPolicy'
import type { EnhancementLimits } from './enhancementLimits'
import { foldPresentationLayers, type PresentationLayers } from './presentationLayers'
import { presentationStale } from './presentationWatchdog'

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
  /** 本窗口被等待位推迟处理（而不是丢弃）的源帧数（VQ-41）。 */
  deferredSourceFrames?: number
  /** 运动估计后端（VQ-42）：`webgpu` 为 GPU 常驻管线，`jsfeat` 为 CPU 回退。 */
  flowBackend?: 'webgpu' | 'jsfeat' | ''
  flowFallbackReason?: string
  /** 稳定模式（VQ-55）：护栏判定 GPU 光流迟到拖累呈现后收紧分析网格，让运动场更早到达。 */
  flowConservative?: boolean
  /** 运动场迟到（本窗口内相位因场未到达而受影响的次数）与其中借用上一帧场的次数（VQ-55）。 */
  flowStarvedFrames?: number
  flowBorrowedFrames?: number
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
  /**
   * 画面推进均匀度（用户可见的「波动」）：统计相邻两次提交所呈现内容在媒体时间轴上前进的毫秒数。
   * 流畅补帧应恒等于 `1000 / 目标帧率`；`contentHolds` 是重复同一内容（画面卡住）的次数（均为本报告窗口内），
   * `contentJumps` 是一次跨过多个输出周期的次数，`contentBacksteps` 是画面倒退次数。
   */
  contentSteps?: number
  contentStepP95Ms?: number
  contentStepMaxMs?: number
  contentStepMinMs?: number
  contentHolds?: number
  contentJumps?: number
  contentBacksteps?: number
  /** 卡断口径：连续两次以上未前进的提交段数、最长段长度（输出帧）与未前进的提交总数。 */
  contentFreezeRuns?: number
  contentFreezeMaxFrames?: number
  contentFreezeFrames?: number
  requestedProfile: Anime4KProfile | 'off'
  /** 本统计窗口内是否发生了档位变化；稳定优先（VQ-32）下档位只降不升，因此只有降档。 */
  qualityChange?: 'downgrade' | ''
  /** 增强预算压力段汇总：样本数、覆盖时长与最近一次耗时/队列读数。 */
  enhancementBudget?: { samples: number; spanMs: number; lastEnhancementMs: number; lastQueueDepth: number }
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
export interface RealtimeInterpolationSession {
  stop: () => void
  canvas: HTMLCanvasElement
  /** 原地换档（VQ-59）：只下发新档位，不重建 Worker、不换画布、不动音频延迟。 */
  configure: (next: { profile: Anime4KProfile | 'off'; targetFps: FrameRateTarget }) => void
  /** 定位预览（VQ-59）：拖动进度条期间只出原帧，并且此期间不再抢回画面层。 */
  setPreview: (enabled: boolean) => void
  /** 请求一段判定静默窗口（VQ-51/VQ-53）：呈现表面重建期间不判定降档；rearm 时把帧率恢复成请求档。 */
  deferJudgement: (ms: number, rearm?: boolean) => void
}
interface Options { profile?: Anime4KProfile; enhance?: boolean; targetFps?: FrameRateTarget; measureStages?: boolean; interpolationDemand?: 'auto' | 'always'; interpolation?: boolean; interpolationDelay?: 'adaptive' | 'fixed'; presentationAlignment?: 'deadline' | 'refresh'; limits?: EnhancementLimits;
  /**
   * 运动估计后端（VQ-42/VQ-47）：不传时沿用构建期 `VITE_FLOW_BACKEND`（默认 CPU）；
   * 传 `webgpu` 让设备优先用常驻 GPU 管线，没有硬件适配器时自动回退 CPU，不需要回退分支。
   */
  flowBackend?: 'webgpu' | 'cpu'; flowConservative?: boolean; onStats?: (stats: InterpolationStats) => void; onError?: (message: string) => void }
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
  const player = video.closest('.art-video-player, .android-player-stage')
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
  /**
   * 呈现层看门狗（VQ-53）：画布接管后原视频会被隐藏，因此「画布是否真的在推进」必须由页面兜底。
   * Worker 的停滞回退只覆盖内容冻结；画布被清空（重建后备存储）、线程被挂起或回报中断时，
   * 页面这一层要在数百毫秒内把画面交回原视频，避免用户看到黑屏或定格。
   */
  let workerActive = false
/** 定位预览（VQ-59）：为 true 时画面交给原视频，且不再被 resume 抢回画布层。 */
  let previewing = false
  let drawnTime: number | null = null
  let staleStreak = 0
  let presentationStaleNow = false
  let lastStaleCheck = 0
  let presentationDelaySeconds = interpolation ? INTERPOLATION_DELAY_SECONDS : 0
  const refreshPresentationLayer = () => {
    player.classList.toggle('sanye-realtime-interpolation-active', workerActive && !presentationStaleNow)
  }
  // 起播与定位时延迟被重新定档，按目标值直接写入；播放期自适应变化用短斜坡跟随，避免爆音。
  const setDelay = (seconds: number, rampMs = 0) => {
    presentationDelaySeconds = Math.max(0, seconds)
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
    presentationAlignment: options.presentationAlignment ?? 'refresh', limits: options.limits,
    flowBackend: options.flowBackend ?? 'cpu', flowConservative: options.flowConservative === true, interpolation }, [offscreen])
  video.insertAdjacentElement('afterend', canvas)
  let stopped = false, busy = false, generation = 0, captureHandle = 0, displayHandle = 0
  let sampledAt = performance.now(), displayFrames = 0
  // 呈现分层（VQ-31）：源帧取媒体元素实际被合成的画面数，可观察呈现取画布作为可见层时的动画帧数。
  let sourceFrames = 0, observedFrames = 0, lastPresentedFrames = -1
  let previousDisplayAt = 0, displayIntervals: number[] = []
  let captureTimes: number[] = [], decodeTimes: number[] = [], captureSkipped = 0
  let lastMediaTime = -1
  let lastDecodedFrames: number | null = null, lastDroppedDecodedFrames: number | null = null
  /**
   * `waiting` 不在立即挂起之列：补间画布比媒体元素晚一个插值延迟呈现（默认约 150ms），
   * 一旦在缓冲时立刻拆掉补间层露出原视频，画面就会先向前跳一个延迟、恢复后再向后跳回来，
   * 每次缓冲都产生一次可见的前后跳变。短时抖动由渲染 Worker 维持最后一帧（VQ-24/VQ-32），
   * 只有内容真正停止推进超过其回退阈值时才由 Worker 主动收层，页面不再抢先拆层。
   */
  const suspendEvents = ['pause', 'seeking', 'ended', 'emptied', 'ratechange', 'enterpictureinpicture']
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
    workerActive = false; drawnTime = null; staleStreak = 0; presentationStaleNow = false
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
  worker.onmessage = (event: MessageEvent<{ type: string; generation: number; active?: boolean; delayMs?: number; time?: number; message?: string; enhancementError?: string; stats: InterpolationStats }>) => {
    if (stopped) return
    const data = event.data
    if (data.type === 'ready') { window.clearTimeout(readyTimer); settle({ enhancementError: data.enhancementError }); return }
    if (data.type === 'error') {
      if (settleReady) { window.clearTimeout(readyTimer); stop(); settle({ failure: data.message || '后台画质增强不可用' }); return }
      fail(data.message || '后台补帧失败'); return
    }
    if (data.generation !== generation) return
    if (data.type === 'active') {
      workerActive = Boolean(data.active)
      if (!workerActive) { drawnTime = null; staleStreak = 0; presentationStaleNow = false }
      refreshPresentationLayer()
      setDelay(data.active ? reportedDelay(data.delayMs) : 0)
    }
    if (data.type === 'drawn') drawnTime = typeof data.time === 'number' ? data.time : drawnTime
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
    // 定位预览期间不抢回画面层：拖动中每走一步都重建一次层，用户看到的就是又慢又抖。
    if (previewing) return
    if (!usable()) return
    if (!captureHandle) captureHandle = video.requestVideoFrameCallback(capture)
    if (!displayHandle) {
      sampledAt = performance.now(); displayFrames = 0; previousDisplayAt = 0; displayIntervals = []
      const observe = (now: number) => {
        if (!usable()) { displayHandle = 0; return }
        if (now - lastStaleCheck > 250) {
          lastStaleCheck = now
          const stale = presentationStale({ currentTime: video.currentTime, drawnTime,
            playing: !video.paused && !video.ended, delayMs: presentationDelaySeconds * 1000 })
          // 迟滞：连续两次判定落后才交回原视频，恢复一次就立刻交还画布，避免两层反复切换。
          staleStreak = stale ? Math.min(3, staleStreak + 1) : 0
          const nextStale = staleStreak >= 2
          if (nextStale !== presentationStaleNow) {
            presentationStaleNow = nextStale
            refreshPresentationLayer()
            // 画面卡住往往伴随采集回调停止：补一次采集请求，让管线有机会自己恢复。
            if (presentationStaleNow) {
              if (captureHandle) video.cancelVideoFrameCallback(captureHandle)
              captureHandle = 0
              resume()
            }
          }
        }
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
  /**
   * 请求一段判定静默窗口（VQ-51）：放大/退出放大、旋转、窗口尺寸变化后呈现表面会重建，
   * 这段时间的丢帧不代表持续不足，交给 Worker 清计数而不降档。
   */
  const deferJudgement = (ms: number, rearm = false) => { if (!stopped) worker.postMessage({ type: 'grace', ms, rearm }) }
  /**
   * 原地换档（VQ-59）：切档与降级不再走「停会话再重建」。重建会把画布移除又插回、把音频延迟
   * 清零再抬回，用户看到画面跳一下、听到声音抖一下；重配置只换渲染器里的档位链路。
   */
  const configure = (next: { profile: Anime4KProfile | 'off'; targetFps: FrameRateTarget }) => {
    if (!stopped) worker.postMessage({ type: 'config', profile: next.profile, targetFps: next.targetFps })
  }
  /**
   * 定位预览（VQ-59）：拖动进度条时画面交给原视频并暂停重活，松手后恢复用户档位。
   * 期间一律不 resume，避免画布与原视频来回抢层。
   */
  const setPreview = (enabled: boolean) => {
    if (stopped) return
    previewing = enabled
    worker.postMessage({ type: 'preview', enabled })
    if (enabled) suspend()
    else resume()
  }
  return { canvas, stop, deferJudgement, configure, setPreview }
}

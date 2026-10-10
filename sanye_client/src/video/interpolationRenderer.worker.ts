import { MotionRenderer, type MotionFrame } from './motionRenderer'
import type { MotionField } from './motionFlow'
import type { Anime4KProfile } from './anime4k'
import { FrameCadence, type FrameRateTarget } from './frameCadence'
import { FlowAnalysisPolicy } from './flowAnalysisPolicy'
import { PresentationScheduler } from './presentationScheduler'
import { PresentationLedger } from './presentationLayers'
import { EnhancementBudgetPolicy } from './enhancementBudgetPolicy'
import { JudgementGrace } from './judgementGrace'
import { InterpolationDemandPolicy } from './interpolationDemandPolicy'
import { InterpolationDelayPolicy } from './interpolationDelayPolicy'
import { nextLowerProfile as lowerProfileFor, type EnhancementLimits } from './enhancementLimits'

type Command = { type: 'init'; canvas: OffscreenCanvas; profile: Anime4KProfile | 'off'; delay: number; targetFps: FrameRateTarget; measureStages?: boolean; interpolationDemand?: 'auto' | 'always'; interpolation?: boolean; interpolationDelay?: 'adaptive' | 'fixed'; presentationAlignment?: 'deadline' | 'refresh'; flowBackend?: 'webgpu' | 'cpu'; flowConservative?: boolean; limits?: EnhancementLimits }
  | { type: 'display'; hz: number; generation: number }
  | { type: 'reset'; generation: number; resetAnalysis?: boolean }
  // 页面侧请求的判定静默窗口（VQ-51）：放大/退出放大、旋转、尺寸变化后呈现表面重建。
  | { type: 'grace'; ms: number; rearm?: boolean }
  // 原地换档（VQ-59）：不重建 Worker、不换画布、不碰媒体元素与音频延迟，切档与降级不再音画各跳一次。
  | { type: 'config'; profile: Anime4KProfile | 'off'; targetFps: FrameRateTarget }
  // 定位预览（VQ-59）：拖动进度条期间只出原帧；跑完整 CNN/超分链路会把拖动拖成「拉不动」。
  | { type: 'preview'; enabled: boolean }
  | { type: 'frame'; bitmap: ImageBitmap; time: number; displayTime: number; rate: number; generation: number; capturedAt?: number; sourceInterval?: number }

let renderer: MotionRenderer | null = null
let flowWorker: Worker | null = null
/** 运动估计后端（VQ-47）：默认沿用构建期配置，页面显式请求时才启用 GPU 常驻管线。 */
let requestedFlowBackend: 'webgpu' | 'cpu' = 'cpu'
let generation = 0, version = 0, busy = false, active = false
/** 定位预览（VQ-59）：为 true 时跳过增强与光流，只出原帧。 */
let previewMode = false
/**
 * 展示时钟：刷新对齐时用动画帧回调，高于刷新能力或回调不交付时用截止时间计时器。
 * VQ-31 的 `refresh` 对齐在计时器时钟下仍按刷新边界提交，并把边界内到期时隙按各自理想时刻补齐。
 */
const scheduler = new PresentationScheduler()
/** 呈现分层（VQ-31）：只累计计数，窗口边界交给页面与源帧、可观察呈现合并。 */
const presentationLedger = new PresentationLedger()
/** 最近一次提交的内容时刻（该帧对应的展示时刻），用于计算刷新边界上的内容陈旧度。 */
let lastContentAt = 0
let frameHandle = 0, boundaryHandle = 0, probeHandle = 0, timerHandle = 0, guardHandle = 0
/** 边界交付确认：连续三个边界回调到达后不再逐次挂确认计时器，与展示时钟的交付确认同义。 */
let boundaryConfirmed = false
let boundaryPendingTicks = 0
/** 会话上限（页面传入的固定延迟口径）；自适应模式在此之下按实测需要收缩。 */
let nominalDelay = 0.15
let delay = 0.15, rate = 1
/**
 * 延迟自适应（VQ-29）：固定延迟口径下为 `null`，行为与优化前逐字节一致；自适应模式按实测需要
 * 起播、加宽与收缩，判定语义集中在 `InterpolationDelayPolicy`。
 */
let delayPolicy: InterpolationDelayPolicy | null = null
let awaitingEpoch = false
const sourceIntervals: number[] = []
let windowNeededMs = 0, windowNeededMaxMs = 0, epochFirstFrameAt = 0, epochAwaitingMs = 0
let rewinds = 0, rewindMaxMs = 0, resumeRewinds = 0
/**
 * 播放期内加宽延迟时用于「暂停前进」的媒体时间量（秒）。
 *
 * 直接把延迟加起来会把目标时刻向后拉，画面随之倒退——用户看到的就是一次回跳。这里改为把
 * 加宽量记成目标时刻的临时前移量并随时间线性消化：目标先短暂停住不动，加宽量消化完后继续
 * 前进，因此画面只是短暂冻结而不会倒退。
 */
let holdMediaSeconds = 0
/** 延迟恢复标记：目标越过最新源帧时画面正在重复，这一刻恢复余量不算推进中的画面回跳。 */
let growUntil = 0
/** 本窗口每次绘制实测需要的延迟样本；窗口边界取 P90，避免用单次尖峰放大延迟。 */
const windowNeeds: number[] = []
let windowNeededP90Ms = 0
/**
 * 仅增强路径（VQ-28）：只把「用户选的画质档」放进渲染 Worker，不执行补帧、不引入插值延迟，
 * 也不做静默降档；初始化失败时由页面回退原来的 `anime4k.js` 主线程路径。
 */
let enhancementOnly = false
let initializationFailure = ''
let mediaTime = 0, displayTime = 0, previousTime = -1, sourceFps = 0, computeMs = 0
let sampledAt = 0, missedPairs = 0, droppedSourceFrames = 0
let pending: MotionFrame | null = null
/**
 * 源帧等待位（VQ-41）。
 *
 * 旧口径在 `busy` 期间直接丢弃新到的源帧：运动分析的一次尖峰就少一个源帧，帧窗口出现空洞，
 * 表现为画面停一下。改为最多保留 1 个源帧：当前帧处理完立即按到达顺序补上；只有等待位已被占用
 * （持续超预算）才是真正的丢帧。暂存与丢帧分开计数，便于区分「延迟吸收」与「真的少了画面」。
 */
let queuedFrame: Extract<Command, { type: 'frame' }> | null = null
let deferredSourceFrames = 0
const frames: MotionFrame[] = []
let effectiveProfile: Anime4KProfile | 'off' = 'off', fallbackReason = ''
let requestedProfile: Anime4KProfile | 'off' = 'off'
/** 最近一次档位变化的类型，按窗口上报给页面用于抑制重复提示（文案口径见 VQ-30）。 */
let qualityChange: 'downgrade' | '' = ''
/**
 * 增强预算判定：会话开始时按平台上限（`EnhancementLimits.budget`）重建，
 * 手机端用更严的阈值，让承载不住的档位尽快把画面让给流畅度。
 */
let enhancementPolicy = new EnhancementBudgetPolicy()

/**
 * 判定静默窗口（VQ-51）：进入/退出放大、旋转屏幕、缩放窗口时呈现表面会重建，
 * 紧跟的几帧必然超预算。窗口内只清计数、不判定，避免把一次性的重建开销当成
 * 「持续不足」而直接降档——降档在一个播放段内不回升，用户看到的就是
 * 「全屏之后画质帧率下降很多」。窗口结束后判定照旧，真不够仍会降档。
 */
const judgementGrace = new JudgementGrace()
function deferJudgement(ms: number, rearm = false) {
  judgementGrace.defer(performance.now(), ms)
  // 呈现表面变化（放大/退出放大、旋转、改窗口）是一次新的呈现条件：把帧率目标交还用户请求档，
  // 否则一次重建造成的降档会跟着整段播放不回升，用户看到的就是「全屏之后画质帧率降低」（VQ-53）。
  cadence.reset(rearm)
  enhancementPolicy.reset()
}
function judging() { return !judgementGrace.active(performance.now()) }
/** 是否允许「均衡」「锐化」在持续超预算时回退到「性能」（安卓端默认开启）。 */
let allowMidTierFallback = false
/** 源帧率是否已经达到目标帧率的判定（VQ-27）：已达标时跳过光流分析与运动场上传。 */
let demand = new InterpolationDemandPolicy()
let flowSkippedFrames = 0, flowSkippedTotal = 0
/** 运动估计实际使用的后端与其回退原因（VQ-42）：用于验证 GPU 路径真的生效，而不是静默退回 CPU。 */
let flowBackend = ''
/** 运动估计网格上限（VQ-49）：`flowWidthCapOnGpu` 只在 GPU 后端被确认后才生效。 */
let flowWidthCap: number | undefined
let flowWidthCapOnGpu: number | undefined
let flowFallbackReason = ''
/**
 * 运动场迟到统计（VQ-55）。
 *
 * GPU 常驻光流是异步的：运动场往返期间 after.flowUploaded 为假。旧实现此时退回「按相位输出
 * 最近一张原帧」，内容时间就不再前进（hold），运动场到达后又一次跨过多个输出周期（jump）——
 * 这两个信号被 VQ-49 护栏读成「GPU 光流不稳」，于是整会话永久切回 CPU（实测中位 14–20ms 对
 * GPU 4.4ms），用户的观感是「帧率画质都很差」。把迟到单独计数，护栏才能区分「迟到」与「错」。
 */
let flowStarvedFrames = 0, flowBorrowedFrames = 0
/** 稳定模式（VQ-55）：护栏判定 GPU 光流迟到拖累呈现时收紧分析网格，让运动场更早到达。 */
let flowConservative = false
const qualityFallbacks: { from: Anime4KProfile | 'off'; to: Anime4KProfile | 'off'; reason: string; atMs: number }[] = []
let sourceWidth = 0, sourceHeight = 0
let cadence = new FrameCadence()
let flowAnalysis = new FlowAnalysisPolicy()
let lastRender = 0, frameIntervals: number[] = [], scheduleLate: number[] = []
/** 画面内容停止推进超过该时长才整层回到原画；短暂落后改用最近可用帧维持增强与补间层。 */
const STALL_FALLBACK_MS = 800
let lastDrawnTime = -1, frozenSince = 0, stallDraws = 0
/**
 * 画面波动观测：连续两次提交所呈现的内容在媒体时间轴上前进了多少。
 *
 * 流畅补帧要求每个提交都恰好前进一个输出帧周期（1000 / 目标帧率）。重复提交同一内容
 * （推进 0）表现为画面卡住，一次跨越多个周期表现为跳帧；两者都是用户看到的「波动」，
 * 而现有的 `frameIntervals` 只测提交间隔、`outputFps` 只测数量，都反映不了这一点。
 */
let lastSubmittedContentTime = -1
const contentSteps: number[] = []
let contentHolds = 0, contentJumps = 0, contentBacksteps = 0
/**
 * 冻结段统计：连续两次以上「内容没有前进」的提交就是一次可见卡断。
 *
 * 单次 hold 可能只是一个输出周期内的取整抖动；连续多次说明画面真的停住了。记录段数与最长段，
 * 才能把「卡了一下」与「持续流畅」区分开——这正是用户反馈的「短暂卡断」。
 */
let contentFreezeRuns = 0, contentFreezeMaxFrames = 0, contentFreezeFrames = 0
let holdRun = 0
/**
 * 上一段实测需要（P90，毫秒）：作为下一个播放段起点的定档依据（VQ-39）。
 * 0 表示尚未测到，此时首个播放段采用会话上限。
 */
let measuredNeedMs = 0
let renderTicks: number[] = [], renderTickMaxMs = 0, longRenderTicks = 0
let measureStages = false
const stageSamples: Record<string, number[]> = Object.fromEntries(['upload', 'resize', 'analysis', 'flowQueue', 'flowRoundTrip', 'interpolationSubmit', 'frameQueue'].map(name => [name, []]))
const sample = (name: string, ms: number | null) => { if (measureStages && ms !== null && Number.isFinite(ms)) stageSamples[name].push(Math.max(0, ms)) }
const p95 = (name: string) => {
  const values = stageSamples[name].sort((a, b) => a - b)
  const result = values.length ? values[Math.ceil(values.length * 0.95) - 1] : null
  stageSamples[name] = []
  return result
}

/** 记录一次提交所呈现的内容时刻，用于统计画面推进是否均匀（见 `contentSteps` 说明）。 */
function noteContentStep(contentTime: number) {
  if (lastSubmittedContentTime >= 0) {
    const stepMs = (contentTime - lastSubmittedContentTime) * 1000
    contentSteps.push(stepMs)
    const idealMs = 1000 / Math.max(cadence.target, 1)
    if (stepMs < idealMs * 0.25) {
      contentHolds++
      holdRun++
      contentFreezeFrames++
      if (holdRun > contentFreezeMaxFrames) contentFreezeMaxFrames = holdRun
    } else {
      // 只有「连续两次以上」才算一次卡断：单次未前进仍属一个输出周期内的取整抖动。
      if (holdRun >= 2) contentFreezeRuns++
      holdRun = 0
      if (stepMs > idealMs * 1.75) contentJumps++
    }
    if (stepMs < -1e-3) contentBacksteps++
  }
  lastSubmittedContentTime = contentTime
}

function createRenderer(canvas: OffscreenCanvas) {
  if (enhancementOnly) {
    const result = new MotionRenderer(canvas, 0, true)
    if (effectiveProfile !== 'off') result.setEnhancementProfile(effectiveProfile, 0)
    if (result.enhancementFailure) initializationFailure = result.enhancementFailure
    return result
  }
  const heavy = effectiveProfile === 'restore' || effectiveProfile === 'upscale' ? effectiveProfile : undefined
  const sharpness = effectiveProfile === 'fast' ? 0.05 : effectiveProfile === 'balanced' ? 0.12 : effectiveProfile === 'sharp' ? 0.22 : 0
  const result = new MotionRenderer(canvas, sharpness, true, heavy)
  if (result.enhancementFailure) {
    fallbackReason = result.enhancementFailure
    qualityFallbacks.push({ from: effectiveProfile, to: 'fast', reason: fallbackReason, atMs: performance.now() })
    effectiveProfile = 'fast'
  }
  return result
}

/**
 * 档位降一阶：超分 2× → 修复 → 性能；开启 `allowMidTierFallback` 时「均衡」「锐化」→「性能」。
 * 其余档位返回 `null`（没有更省的处理链可让，或该档本身不是重档位）。
 */
function nextLowerProfile(profile: Anime4KProfile | 'off'): Anime4KProfile | null {
  return lowerProfileFor(profile, allowMidTierFallback)
}

/**
 * 降档：稳定优先（VQ-32）下档位在一次会话内只降不升，因此这里没有对应的升档路径。
 * 需要更高档位时由用户在画质菜单里重新选择，那会重建会话并重新评估预算。
 *
 * 返回值表示是否真的换成了更省的处理链：已经在地板档（没有更省档位可让）时返回 false，
 * 调用方必须据此改为正常交付当前帧，不能按“已降档”处理——那条路径依赖 reset() 释放帧。
 */
function downgradeEnhancement(reason: string): boolean {
  const next = nextLowerProfile(effectiveProfile)
  if (!renderer || !next) return false
  const canvas = renderer.canvas as OffscreenCanvas
  const previousProfile = effectiveProfile
  reset()
  effectiveProfile = next
  fallbackReason = reason
  // 仅增强路径按档位链路执行（性能档 = Deblur_DoG）；带补帧的路径用「重链路 + 锐化量」表达同一档位。
  if (enhancementOnly) renderer.setEnhancementProfile(effectiveProfile === 'restore' ? 'restore' : 'fast', 0)
  else renderer.setEnhancement(effectiveProfile === 'restore' ? 'restore' : undefined, effectiveProfile === 'fast' ? 0.05 : 0)
  if (renderer.enhancementFailure) { fallbackReason += '；' + renderer.enhancementFailure; effectiveProfile = 'fast' }
  qualityFallbacks.push({ from: previousProfile, to: effectiveProfile, reason: fallbackReason, atMs: performance.now() })
  if (qualityFallbacks.length > 8) qualityFallbacks.shift()
  // 改画布尺寸会清空后备存储：此时画布是空的，必须立刻退回原画，
  // 否则隐藏原画后用户看到的就是一块黑屏（VQ-53）。
  setActive(false)
  canvas.width = sourceWidth; canvas.height = sourceHeight
  qualityChange = 'downgrade'
  enhancementPolicy.noteDowngrade()
  return true
}

/** 超分输出扩大四倍，超出纹理或分辨率预算时不能继续使用该档位。 */
function overTextureBudget() {
  // 纹理预算按会话上限而不是当前生效延迟计算：延迟变化不得放宽纹理预算。
  const requiredFrames = Math.max(6, Math.ceil(nominalDelay * Math.max(sourceFps * rate, 30)) + 3)
  return sourceWidth > 1920 || sourceHeight > 1080
    || sourceWidth * sourceHeight * (16 * (requiredFrames + 1) + 4) > 256 * 1024 * 1024
}

/** 接管退避（VQ-53）：一旦从画布退回原画，短期内不再接管，避免两层反复切换造成画面波动。 */
const REACTIVATE_DELAY_MS = 600
let reactivateAt = 0

/**
 * 画布推进回报（VQ-53）：页面用它判断画布是否真的在跟着媒体时间前进。
 * 只有真正绘制了新内容才回报，且限流到约 7 次/秒；画布停住时页面收不到新回报，
 * 看门狗据此把画面交回原视频，而不是让用户对着定格或黑屏。
 */
let drawnReportAt = 0
function reportDrawn(now: number) {
  if (now - drawnReportAt < 150) return
  drawnReportAt = now
  self.postMessage({ type: 'drawn', time: lastDrawnTime, generation })
}

function setActive(value: boolean) {
  if (active === value) return
  // 重新接管必须等退避窗口结束；退回原画永远立即生效（黑屏与定格都等不起）。
  if (value && performance.now() < reactivateAt) return
  if (!value) reactivateAt = performance.now() + REACTIVATE_DELAY_MS
  active = value
  // 刚接管时重置推进量的基准：接管前的提交不可见，不能与接管后的画面直接相减。
  if (value) lastSubmittedContentTime = -1
  if (value && epochFirstFrameAt) epochAwaitingMs = Math.round((performance.now() - epochFirstFrameAt) * 10) / 10
  self.postMessage({ type: 'active', active: value, delayMs: Math.round(delay * 1000 * 10) / 10, generation })
}
/** 生效延迟变化后同步页面：音频延迟节点必须跟随生效的视频延迟，否则会出现音画偏差。 */
function broadcastDelay() {
  if (active) self.postMessage({ type: 'delay', delayMs: Math.round(delay * 1000 * 10) / 10, generation })
}
function reset(resetAnalysis = false, epoch = false) {
  version++
  clearSchedule()
  boundaryConfirmed = false; boundaryPendingTicks = 0
  scheduler.reset(performance.now())
  busy = false
  while (frames.length) renderer?.release(frames.shift()!)
  if (pending) renderer?.release(pending)
  pending = null; previousTime = -1; displayTime = 0
  renderer?.resetMeasurements()
  // 只有新的播放段才把目标帧率恢复到请求档位；画质档内部重建保留已经稳定下来的帧率（VQ-32）。
  cadence.reset(epoch); flowAnalysis.reset(!resetAnalysis); sourceFps = 0; computeMs = 0
  enhancementPolicy.reset()
  demand.reset()
  lastRender = 0; frameIntervals = []; scheduleLate = []
  lastDrawnTime = -1; frozenSince = 0; stallDraws = 0
  renderTicks = []; renderTickMaxMs = 0; longRenderTicks = 0
  droppedSourceFrames = 0; flowSkippedFrames = 0
  clearQueuedFrame(); deferredSourceFrames = 0
  presentationLedger.reset()
  rewinds = 0; rewindMaxMs = 0; resumeRewinds = 0
  holdMediaSeconds = 0
  windowNeededMs = 0; windowNeededMaxMs = 0; windowNeeds.length = 0; growUntil = 0
  // 播放段边界（起播、定位、暂停恢复、换源与时间轴跳变）才重开延迟预算；画质档切换保持当前延迟。
  if (epoch) { awaitingEpoch = true; epochFirstFrameAt = 0; epochAwaitingMs = 0 }
  for (const key of Object.keys(stageSamples)) stageSamples[key] = []
  setActive(false)
}

/** 释放等待位并关闭其位图；播放段边界与失败清理都必须调用，避免跨段处理旧帧或泄漏位图。 */
function clearQueuedFrame() {
  const queued = queuedFrame
  queuedFrame = null
  queued?.bitmap.close()
}

/**
 * 让出 `busy` 并立刻补上等待位里的源帧（见 `queuedFrame`）。
 *
 * 只能在当前帧的结果已经处理完之后调用：`receiveFrame` 会覆盖 `pending`，提前补帧会把还没挂上运动场
 * 的那一帧丢掉。等待位为空时等同于原来的 `busy = false`。
 */
function releaseBusy() {
  busy = false
  const next = queuedFrame
  queuedFrame = null
  if (next) void receiveFrame(next)
}
/** 最近源帧间隔的中位数（毫秒）；媒体时间的相邻间隔与倍速无关，没有样本时按 30 FPS 估计。 */
function sourceIntervalMs() {
  if (!sourceIntervals.length) return 1000 / 30
  const sorted = [...sourceIntervals].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
/**
 * 播放段起点：按上次证明可用的延迟起步，需要恢复时在此加宽一步。
 * 固定延迟对照同样记录首帧时刻，使两种口径的原画窗口可以直接比较。
 */
function beginDelayEpoch(now: number) {
  awaitingEpoch = false
  epochFirstFrameAt = now
  epochAwaitingMs = 0
  if (!delayPolicy) return
  const interval = sourceIntervalMs()
  // 先走既有起点（保留「上一段出现停顿则恢复一步余量」的语义与计数）。
  const restoring = delayPolicy.pendingRestore
  const restored = delayPolicy.beginEpoch(now, interval)
  // VQ-39：首次播放段还没有实测需要，采用会话上限；之后按上一段实测需要定档。
  // 起点过低会在接管呈现之后被迫加宽，而接管后的加宽就是一次可见冻结。
  // 上一段出现过停顿或回跳时，实测需要不足以覆盖，仍采用恢复后的余量。
  const target = measuredNeedMs > 0
    ? (restoring ? Math.max(measuredNeedMs, restored) : measuredNeedMs)
    : delayPolicy.nominalMs
  delay = delayPolicy.beginEpochAt(now, target, interval,
    measuredNeedMs > 0 ? '按上一段实测需要起播' : '首个播放段采用会话上限，避免接管后加宽') / 1000
}
function fail(message: string) {
  reset(); flowWorker?.terminate(); renderer?.stop(); renderer = null
  self.postMessage({ type: 'error', message, generation })
}
function clearSchedule() {
  if (frameHandle) { self.cancelAnimationFrame(frameHandle); frameHandle = 0 }
  if (boundaryHandle) { self.cancelAnimationFrame(boundaryHandle); boundaryHandle = 0 }
  if (probeHandle) { self.cancelAnimationFrame(probeHandle); probeHandle = 0 }
  if (timerHandle) { clearTimeout(timerHandle); timerHandle = 0 }
  if (guardHandle) { clearTimeout(guardHandle); guardHandle = 0 }
}
/** 按当前展示时钟挂一次唤醒：刷新对齐用动画帧回调，否则只保留一个截止时间计时器。 */
function armSchedule() {
  clearSchedule()
  if (!renderer) return
  const now = performance.now()
  scheduler.setTarget(cadence.target, cadence.displayHz, now)
  if (scheduler.mode === 'display' && typeof self.requestAnimationFrame === 'function') {
    frameHandle = self.requestAnimationFrame(refreshTick)
    if (!scheduler.refreshConfirmed) guardHandle = self.setTimeout(deliveryGuard, scheduler.guardDelayMs)
    return
  }
  if (scheduler.mode !== 'timer') scheduler.fallBackToTimer(now)
  // 目标高于刷新能力时，只要还能拿到刷新边界就在边界上提交（VQ-31）：生成帧率按各自理想时刻补齐，
  // 被呈现的那一帧落在刷新边界上。拿不到边界或未启用对齐时保留既有截止时刻计时器。
  if (scheduler.alignment === 'refresh' && typeof self.requestAnimationFrame === 'function') {
    boundaryPendingTicks = 0
    boundaryHandle = self.requestAnimationFrame(boundaryTick)
    // 边界回调没有实际到达时必须能退回计时器，否则暂停恢复、隐藏标签页等场景会让画布停住。
    if (!boundaryConfirmed) guardHandle = self.setTimeout(boundaryGuard, scheduler.guardDelayMs)
    return
  }
  // 未对齐的计时器节拍仍需要一个只读的刷新边界探针：只有知道边界，才能记录边界上呈现的是多旧的画面。
  if (scheduler.refreshHz > 0 && typeof self.requestAnimationFrame === 'function') {
    probeHandle = self.requestAnimationFrame(probeTick)
  }
  armDeadline(now)
}
function armDeadline(now: number) {
  if (scheduler.mode !== 'timer') return
  const wait = scheduler.wait(now)
  if (wait > 0) { timerHandle = self.setTimeout(deadlineTick, wait); return }
  drawTimerSlot(now)
  armDeadline(performance.now())
}
function deadlineTick() {
  timerHandle = 0
  scheduler.noteTimerWake()
  const now = performance.now()
  const wait = scheduler.wait(now)
  if (wait > 0) { scheduler.noteEarlyWake(); timerHandle = self.setTimeout(deadlineTick, wait); return }
  drawTimerSlot(now)
  armDeadline(performance.now())
}
/** 计时器时隙：先推进到当前时隙（跳过过期时隙），再绘制一帧。 */
function drawTimerSlot(now: number) {
  const late = scheduler.advanceTimer(now)
  drawDue(now, now - late)
}
/**
 * 刷新边界时隙（VQ-31 对齐口径）：把边界前已到期的时隙各自按理想时刻提交，超过上界的按跳过计入统计。
 * 提交与生成仍在目标帧率上，差别只是这些提交相对刷新边界的位置，因此可观察呈现不再随计时器抖动。
 */
function boundaryTick() {
  boundaryHandle = 0
  if (++boundaryPendingTicks >= 3) boundaryConfirmed = true
  const now = performance.now()
  const changed = scheduler.setTarget(cadence.target, cadence.displayHz, now)
  if (scheduler.mode !== 'timer' || scheduler.alignment !== 'refresh' || changed) { armSchedule(); return }
  scheduler.noteBoundaryWake()
  const batch = scheduler.takeDueSlots(now)
  for (const slot of batch.slots) drawDue(slot, now)
  notePresentedPhase(now)
  reportWindow(now)
  if (scheduler.mode === 'timer' && scheduler.alignment === 'refresh') boundaryHandle = self.requestAnimationFrame(boundaryTick)
  else armSchedule()
}
/** 刷新边界交付确认：确认期内没有边界回调就把提交退回截止时刻计时器，并保留只读边界探针。 */
function boundaryGuard() {
  guardHandle = 0
  if (boundaryPendingTicks > 0) {
    boundaryPendingTicks = 0
    if (!boundaryConfirmed) guardHandle = self.setTimeout(boundaryGuard, scheduler.guardDelayMs)
    return
  }
  boundaryConfirmed = false
  clearSchedule()
  if (scheduler.refreshHz > 0) probeHandle = self.requestAnimationFrame(probeTick)
  armDeadline(performance.now())
}
/** 只读刷新边界探针：不提交、不改变时隙，只记录边界时刻与最近提交内容之间的陈旧度。 */
function probeTick() {
  probeHandle = 0
  if (!renderer) return
  const now = performance.now()
  const changed = scheduler.setTarget(cadence.target, cadence.displayHz, now)
  if (scheduler.mode !== 'timer' || changed) { armSchedule(); return }
  notePresentedPhase(now)
  reportWindow(now)
  if (scheduler.alignment !== 'refresh') probeHandle = self.requestAnimationFrame(probeTick)
  else armSchedule()
}
/** 边界采样：本刷新周期内将被呈现的是最近一次提交，其内容时刻与边界之差即呈现陈旧度。 */
function notePresentedPhase(boundaryAt: number) {
  if (!lastContentAt) return
  presentationLedger.notePresentedPhase(boundaryAt - lastContentAt)
}
function refreshTick(timestamp: number) {
  frameHandle = 0
  const now = performance.now()
  const changed = scheduler.setTarget(cadence.target, cadence.displayHz, now)
  if (scheduler.mode !== 'display' || changed) {
    armSchedule()
    return
  }
  const drew = scheduler.onRefresh(now)
  if (drew) {
    // 刷新回调延迟反映工作线程被长任务占用的程度，正常应接近 0。
    drawDue(now, timestamp)
    notePresentedPhase(timestamp)
  } else reportWindow(now)
  if (scheduler.mode === 'display') frameHandle = self.requestAnimationFrame(refreshTick)
  else armSchedule()
}
function deliveryGuard() {
  guardHandle = 0
  if (scheduler.confirmDelivery(performance.now())) { armSchedule(); return }
  if (!scheduler.refreshConfirmed) guardHandle = self.setTimeout(deliveryGuard, scheduler.guardDelayMs)
}
/**
 * 提交一帧。`now` 是该帧对应的理想展示时刻（决定插值相位），`intendedAt` 是它本应提交的时刻。
 * 两者之差就是这一帧相对刷新边界的陈旧度，进入呈现分层统计供 VQ-31 判读。
 */
function drawDue(now: number, intendedAt = now) {
  const started = performance.now()
  const submitted = drawFrame(now)
  const elapsed = performance.now() - started
  renderTicks.push(elapsed)
  if (elapsed > renderTickMaxMs) renderTickMaxMs = elapsed
  if (elapsed > 1000 / cadence.target * 0.5) longRenderTicks++
  scheduleLate.push(Math.max(0, intendedAt - now))
  if (submitted) { presentationLedger.addSubmission(); lastContentAt = now }
}
function drawFrame(now: number): boolean {
  if (!renderer) return false
  if (enhancementOnly) return drawEnhancementOnly(now)
  let submitted = false
  // 本次绘制的「当前帧视图」：运动场迟到时借用上一帧的场纹理，其余字段仍是 after。
  let afterView: MotionFrame | null = null
  // 先消化上一步登记的暂停量，再判断是否需要新的加宽：按真实经过时间（含未提交的时隙）递减，
  // 速率与播放倍速一致。放在加宽判断之前，避免刚登记的量在同一时隙被立即扣掉。
  if (holdMediaSeconds > 0 && lastRender) holdMediaSeconds = Math.max(0, holdMediaSeconds - (now - lastRender) / 1000 * rate)
  // VQ-29：未接管呈现前按实测需要把窗口加宽到覆盖目标时刻。此时画布未生效，加宽不会产生画面回跳。
  if (delayPolicy && frames.length >= 2) {
    const intervalMs = sourceIntervalMs()
    const newest = frames[frames.length - 1]
    windowNeededMs = Math.max(0, ((mediaTime - newest.time) * 1000 + intervalMs * 1.5) / Math.max(rate, 0.01))
    windowNeededMaxMs = Math.max(windowNeededMaxMs, windowNeededMs)
    windowNeeds.push(windowNeededMs)
    if (newest.time < mediaTime + (now - displayTime) / 1000 * rate - delay * rate) {
      if (!active) {
        // 尚未接管呈现：直接按实测需要加宽，不会被观察到画面回跳。
        delay = delayPolicy.widenTo(now, windowNeededMs, intervalMs) / 1000
      } else {
        // 目标已经越过最新源帧：画面正在重复同一帧。按最近窗口的实测需要恢复一步，受冷却与步长约束。
        const widened = delayPolicy.widenInEpoch(now, Math.max(windowNeededMs, windowNeededP90Ms), intervalMs) / 1000
        if (widened > delay + 1e-6) {
          // 把加宽量转成目标时刻的临时前移量，让目标先停住再继续，而不是向后拉回。
          holdMediaSeconds += (widened - delay) * rate
          delay = widened; growUntil = now + 250; resumeRewinds++; broadcastDelay()
        }
      }
    }
  }
  const target = mediaTime + (now - displayTime) / 1000 * rate - delay * rate + holdMediaSeconds
  if (frames.length >= 2) {
    const index = frames.findIndex(frame => frame.time >= target)
    const before = index > 0 ? frames[index - 1] : frames[frames.length - 2]
    const after = index > 0 ? frames[index] : frames[frames.length - 1]
    const gap = after.time - before.time
    const pairing = index > 0 && gap > 0 && gap < 0.2
    // 源帧率已达标（VQ-27）时帧队列里没有运动场：只输出最近的原帧，着色器在相位 0/1 直接给原帧。
    // 运动场迟到（VQ-55）：允许借用 before 自己的运动场继续插值。before 与 after 相邻，
    // 且 before 仍在帧队列里（不会被回收），借用它的场纹理安全；画面继续按相位推进，
    // 不再重复原帧，因此延迟抖动不会被护栏当成 GPU 光流不稳。
    const borrowField = pairing && !after.flowUploaded && gap < 0.25 && !after.cut && !before.cut
      && before.flowUploaded && before.time > 0
    const interpolatable = pairing && (after.flowUploaded || borrowField)
    const frameOnly = pairing && !after.flowUploaded && !borrowField
    if (pairing && !after.flowUploaded) {
      flowStarvedFrames++
      if (borrowField) {
        flowBorrowedFrames++
        // 只替换运动场纹理：原帧纹理与时间仍是 after，着色器取 after 的画面 + before 的场。
        afterView = { ...after, flow: before.flow, backward: before.backward, cut: false }
      }
    }
    if (interpolatable || frameOnly || active) {
      // 目标时刻落在帧窗口外时用最近可用帧（phase 0 或 1）继续绘制：着色器在该相位直接输出
      // 对应原帧并保留锐化，因此不会混合过期运动，也不会让增强与补间层整层消失。
      const phase = interpolatable ? (target - before.time) / gap
        : frameOnly ? (target - before.time >= gap / 2 ? 1 : 0)
          : index < 0 ? 1 : 0
      const submitStarted = measureStages ? performance.now() : 0
      renderer.render(before, afterView ?? after, phase, frameOnly)
      afterView = null
      if (measureStages) sample('interpolationSubmit', performance.now() - submitStarted)
      submitted = true
      if (lastRender) frameIntervals.push(now - lastRender)
      lastRender = now
      // 记录本次绘制内容在媒体时间轴上的位置：内容持续前进时绝不切换展示层。
      const drawnTime = interpolatable ? target
        : frameOnly ? (phase < 0.5 ? before.time : after.time)
          : index < 0 ? after.time : before.time
      if (drawnTime > lastDrawnTime + 1e-3) { lastDrawnTime = drawnTime; frozenSince = 0 }
      // 延迟只在未接管呈现时加宽，正常播放期画面整体回跳应恒为 0；此处计数用于证明该性质。
      else if (drawnTime < lastDrawnTime - 1e-3) {
        // 恢复余量造成的回退已在恢复时计入 `resumeRewinds`：那段画面本来就在重复，不属于推进中的画面回跳。
        if (now > growUntil) rewinds++
        rewindMaxMs = Math.max(rewindMaxMs, (lastDrawnTime - drawnTime) * 1000)
        lastDrawnTime = drawnTime
      }
      else if (!frozenSince) frozenSince = now
      if (interpolatable || frameOnly) {
        // 延迟已在播放段起点按上一段实测需要定档，因此这里可以立即接管，不需要等待证据。
        setActive(true)
      } else {
        // 管线短暂落后或超出窗口：计入统计但不切换展示层，避免画质反复波动。
        missedPairs++
        stallDraws++
      }
      // 内容推进量只统计用户看得见的画面（补间层已接管），否则会把接管前的不可见提交算成卡断。
      if (active) noteContentStep(drawnTime)
      // 队列保留深度按会话上限而不是当前生效延迟计算：自适应收缩只改变展示时刻，不减少可回退的缓冲，
      // 否则媒体时间轴修正或持续抖动会把目标时刻推到队首之前，重新出现 VQ-24 修过的整层波动。
      const releaseBefore = Math.min(target, mediaTime - nominalDelay * 0.9 * rate) - 0.04 * rate
      while (frames.length > 3 && frames[2].time < releaseBefore) renderer.release(frames.shift()!)
    } else {
      missedPairs++
    }
  }
  // 只有画面内容停止推进（输入或处理真正中断）才回到原画；短暂抖动不再开关补间层。
  if (active && frozenSince && now - frozenSince > STALL_FALLBACK_MS) {
    setActive(false); frozenSince = 0; lastDrawnTime = -1
  }
  if (submitted) reportDrawn(now)
  reportWindow(now)
  return submitted
}

/**
 * 仅增强路径（VQ-28）的呈现：不生成新画面，只把「包含目标媒体时刻的最近原帧」画上去。
 *
 * 补帧路径靠固定延迟保证目标时刻落在帧窗口内；仅增强路径没有延迟，目标时刻常常已经越过最新原帧，
 * 那属于正常推进而不是停顿，因此这里不做窗口配对，也不计 `missedPairs` / `stallFrames`。
 * 同一张增强纹理只在对应原帧首次轮到呈现时提交一次，重复绘制不产生新画面、只增加 GPU 占用。
 */
function drawEnhancementOnly(now: number): boolean {
  const activeRenderer = renderer
  if (!activeRenderer) return false
  let submitted = false
  if (frames.length) {
    const target = mediaTime + (now - displayTime) / 1000 * rate
    // 队列按媒体时间升序：取最后一个不晚于目标的原帧；目标早于队首（管线落后）时取队首。
    const later = frames.findIndex(frame => frame.time > target)
    const selected = later < 0 ? frames[frames.length - 1] : frames[Math.max(0, later - 1)]
    if (selected.time > lastDrawnTime + 1e-3) {
      const submitStarted = measureStages ? performance.now() : 0
      activeRenderer.render(selected, selected, 1, true)
      if (measureStages) sample('interpolationSubmit', performance.now() - submitStarted)
      submitted = true
      if (lastRender) frameIntervals.push(now - lastRender)
      lastRender = now
      lastDrawnTime = selected.time
      noteContentStep(selected.time)
      frozenSince = 0
      setActive(true)
    }
    while (frames.length > 3) activeRenderer.release(frames.shift()!)
  }
  if (submitted) reportDrawn(now)
  reportWindow(now)
  return submitted
}

function reportWindow(now: number) {
  if (!renderer || now - sampledAt < 1000) return
  const windowMs = now - sampledAt
  // 延迟预算在每个报告窗口上判定一次：稳定优先口径下播放期不再收缩，只登记压力与说明。
  windowNeededP90Ms = p90Of(windowNeeds)
  // 记录本段实测需要，供下一个播放段定档使用；样本太少时不采信。
  if (delayPolicy && windowNeeds.length >= 8 && Number.isFinite(windowNeededP90Ms)) measuredNeedMs = windowNeededP90Ms
  if (delayPolicy && active)
    delayPolicy.observeWindow({ nowMs: now, neededMs: windowNeededMaxMs, missedPairs, stallFrames: stallDraws, rewinds })
  const completed = renderer.takeCompletedFrames()
  // 呈现分层（VQ-31）：本 Worker 只提供「生成帧 / 合成器提交」两层，源帧与可观察呈现由页面补齐。
  presentationLedger.addGenerated(completed.frames, completed.interpolated)
  const outputFps = Math.round(completed.frames * 1000 / (now - sampledAt))
  const measuredTarget = cadence.target
  frameIntervals.sort((a, b) => a - b)
  scheduleLate.sort((a, b) => a - b)
  const frameIntervalP95Ms = frameIntervals[Math.ceil(frameIntervals.length * 0.95) - 1] ?? 0
  const frameIntervalP99Ms = frameIntervals[Math.ceil(frameIntervals.length * 0.99) - 1] ?? 0
  const frameIntervalMaxMs = frameIntervals.at(-1) ?? 0
  const longFrameIntervals = frameIntervals.filter(value => value > 1000 / measuredTarget * 1.5).length
  const longFrameRatio = frameIntervals.length ? longFrameIntervals / frameIntervals.length : 0
  const scheduleLateP95Ms = scheduleLate[Math.ceil(scheduleLate.length * 0.95) - 1] ?? 0
  const scheduleLateP99Ms = scheduleLate[Math.ceil(scheduleLate.length * 0.99) - 1] ?? 0
  const scheduleLateMaxMs = scheduleLate.at(-1) ?? 0
  const renderTickP95Ms = renderTicks[Math.ceil(renderTicks.length * 0.95) - 1] ?? 0
  const renderTickP99Ms = renderTicks[Math.ceil(renderTicks.length * 0.99) - 1] ?? 0
  // 静默窗口内不喂判定样本：只把累计的连续压力清掉，呈现表面重建的几帧不计入。
  if (judging()) {
    cadence.observe({ outputFps, gpuMs: completed.gpuMs, computeMs, enhancementMs: renderer.enhancementMs,
      enhancementQueueDepth: renderer.enhancementQueueDepth, sourceFps: sourceFps * rate, missedPairs, droppedSourceFrames,
      frameIntervalP95Ms, scheduleLateP95Ms, renderTickP95Ms, longFrameRatio })
  } else {
    cadence.reset(false)
    enhancementPolicy.reset()
  }
  const counts = measureStages ? Object.fromEntries(Object.entries(stageSamples).map(([key, values]) => [key, values.length])) : null
  const scheduleWindow = scheduler.takeWindow()
  const presentation = presentationLedger.takeWindow({ refreshHz: scheduleWindow.refreshHz,
    targetFps: measuredTarget, clock: scheduleWindow.mode, windowMs })
  self.postMessage({ type: 'stats', generation, stats: { targetFps: measuredTarget, requestedFps: cadence.requested,
    nextTargetFps: cadence.target, cadenceReason: cadence.reason, cadenceBottleneck: cadence.bottleneck,
    gpuMs: completed.gpuMs, frameIntervalP95Ms, frameIntervalP99Ms, frameIntervalMaxMs, longFrameIntervals,
    longFrameRatio, scheduleLateP95Ms, scheduleLateP99Ms, scheduleLateMaxMs, presentationClock: scheduleWindow.mode,
    stallFrames: stallDraws,
    refreshHz: scheduleWindow.refreshHz, refreshConfirmed: scheduleWindow.refreshConfirmed,
    refreshTicks: scheduleWindow.refreshTicks, timerWakeups: scheduleWindow.timerWakeups,
    boundaryTicks: scheduleWindow.boundaryTicks, presentationAlignment: scheduleWindow.alignment,
    earlyWakeups: scheduleWindow.earlyWakeups, renderSlots: scheduleWindow.renderSlots,
    skippedSlots: scheduleWindow.skippedSlots, schedulerStarvation: scheduleWindow.starvation,
      renderTickP95Ms, renderTickP99Ms, renderTickMaxMs, longRenderTicks,
    outputFps, sourceFps: Math.round(sourceFps),
    interpolatedFrames: completed.interpolated, computeMs, missedPairs, droppedSourceFrames, deferredSourceFrames,
    // 运动估计后端（VQ-42）：`webgpu` 表示 GPU 常驻管线生效，`jsfeat` 表示回退到 CPU 路径。
    flowBackend, flowFallbackReason, flowConservative, flowStarvedFrames, flowBorrowedFrames,
    analysisWidth: flowAnalysis.widthFor(sourceWidth), enhancementMs: renderer.enhancementMs,
    // 画面推进均匀度（用户可见的「波动」）：重复提交同一内容计为 hold，一次跨多个输出周期计为 jump。
    contentSteps: contentSteps.length,
    contentStepP95Ms: percentileOf(contentSteps, 0.95),
    contentStepMaxMs: contentSteps.length ? Math.max(...contentSteps) : 0,
    contentStepMinMs: contentSteps.length ? Math.min(...contentSteps) : 0,
    contentHolds, contentJumps, contentBacksteps,
    // 卡断口径：连续两次以上未前进的提交段数、最长段与未前进的提交总数。
    contentFreezeRuns, contentFreezeMaxFrames, contentFreezeFrames,
    // 定档诊断（VQ-39）：下一个播放段起点采用的实测需要（0 表示尚未测到、首个播放段用会话上限）。
    adoptedNeedMs: Math.round(measuredNeedMs * 10) / 10,
    enhancementQueueDepth: renderer.enhancementQueueDepth, requestedProfile, effectiveProfile, fallbackReason, qualityFallbacks,
    qualityChange,
    interpolationNeed: demand.mode, interpolationReason: demand.reason, flowSkippedFrames, flowSkippedTotal,
    interpolationDemand: demand.snapshot(cadence.target),
    enhancementOnly,
    interpolationDelay: delayStats(),
    enhancementBudget: { ...enhancementPolicy.snapshot(now),
      lastEnhancementMs: renderer.enhancementMs, lastQueueDepth: renderer.enhancementQueueDepth },
    outputWidth: renderer.canvas.width, outputHeight: renderer.canvas.height,
    resources: renderer.resourceStats,
    presentation,
    ...(measureStages ? { measurement: { clock: 'performance.now', unit: 'ms', captureP95Ms: null,
      uploadP95Ms: p95('upload'), resizeP95Ms: p95('resize'), analysisP95Ms: p95('analysis'),
      flowQueueP95Ms: p95('flowQueue'), flowRoundTripP95Ms: p95('flowRoundTrip'),
      interpolationSubmitP95Ms: p95('interpolationSubmit'), frameQueueP95Ms: p95('frameQueue'),
      counts, captureSkipped: 0, decodedFrames: null, droppedDecodedFrames: null, decodeProcessingDurationP95Ms: null } } : {}) } })
  sampledAt = now; missedPairs = droppedSourceFrames = deferredSourceFrames = 0; frameIntervals = []; scheduleLate = []
  // 画面推进计数按报告窗口清零（VQ-55）：护栏读的是「本窗口是否抖动」，累积计数会让一次抖动
  // 之后每个窗口都被判成脏窗口，「干净窗口清空连击」的边界永远无法出现，GPU 光流必然被收回。
  contentHolds = 0; contentJumps = 0; contentBacksteps = 0
  flowStarvedFrames = 0; flowBorrowedFrames = 0
  stallDraws = 0; flowSkippedFrames = 0
  rewinds = 0; rewindMaxMs = 0; resumeRewinds = 0; windowNeededMaxMs = 0; windowNeeds.length = 0
  renderTicks = []; renderTickMaxMs = 0; longRenderTicks = 0
  contentSteps.length = 0; contentHolds = 0; contentJumps = 0; contentBacksteps = 0
  flowStarvedFrames = 0; flowBorrowedFrames = 0
  contentFreezeRuns = 0; contentFreezeMaxFrames = 0; contentFreezeFrames = 0; holdRun = 0
  qualityChange = ''
}

/** 延迟统计：自适应模式给判定模块快照，固定延迟给出等价字段，便于同一入口对照。 */
function delayStats() {
  if (delayPolicy)
    return { ...delayPolicy.snapshot(active), neededMs: windowNeededMs, neededMaxMs: windowNeededMaxMs,
      neededP90Ms: windowNeededP90Ms, awaitingMs: epochAwaitingMs, rewinds, rewindMaxMs, resumeRewinds }
  return { adaptive: false, active, nominalMs: Math.round(nominalDelay * 1000), effectiveMs: Math.round(delay * 1000),
    startMs: Math.round(delay * 1000), floorMs: Math.round(delay * 1000), neededMs: windowNeededMs,
    neededMaxMs: windowNeededMaxMs, neededP90Ms: windowNeededP90Ms, learnedMs: Math.round(delay * 1000),
    pendingRestore: false, widens: 0, restores: 0, inEpochRestores: 0, changes: 0,
    reason: '固定延迟隔离对照', awaitingMs: epochAwaitingMs, rewinds, rewindMaxMs, resumeRewinds }
}

/** 窗口内实测需要的 P90；样本不足时取最大值。 */
function p90Of(values: number[]) {
  if (!values.length) return windowNeededMs
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)]
}

/** 画面推进量分位数。用于观察连续提交是否均匀前进，不做任何降档或回退动作。 */
function percentileOf(values: number[], quantile: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))]
}

/**
 * 原地换档（VQ-59）。
 *
 * 以前切档是页面停掉会话再重建：画布被移除又插回、音频延迟被清零再抬回，用户看到画面跳一下、
 * 听到声音抖一下。这里把换档做成 Worker 内部的一次重配置，画布、帧队列、呈现时钟都不动。
 */
function reconfigure(message: Extract<Command, { type: 'config' }>) {
  requestedProfile = message.profile
  // 与 init 同一口径：240 极致帧率让出增强预算；用户显式换档时重置「只降不升」的会话状态。
  const extremeRate = !enhancementOnly && message.targetFps === 240
  effectiveProfile = extremeRate && message.profile !== 'off' && message.profile !== 'fast' ? 'fast' : message.profile
  fallbackReason = effectiveProfile !== requestedProfile ? '240 FPS 极致帧率，画质已平衡到性能档' : ''
  cadence = new FrameCadence(message.targetFps)
  qualityChange = ''
  // 刻意不调 reset()：那会把画面层交回原视频一帧，用户看到的就是「切档闪一下」。
  // 换档不改变画布尺寸，下一帧直接用新链路绘制即可。
  applyEnhancementProfile()
  noticeUserChange()
  self.postMessage({ type: 'ready', generation, enhancementOnly, effectiveProfile })
}

/** 把当前档位写到渲染器上：init、降档与原地换档共用同一口径。 */
function applyEnhancementProfile() {
  if (!renderer) return
  if (effectiveProfile === 'off') { renderer.setEnhancement(undefined, 0); return }
  if (enhancementOnly) renderer.setEnhancementProfile(effectiveProfile === 'restore' ? 'restore' : 'fast', 0)
  else renderer.setEnhancement(effectiveProfile === 'restore' ? 'restore' : undefined, sharpnessOf(effectiveProfile))
  if (renderer.enhancementFailure) { fallbackReason = renderer.enhancementFailure; effectiveProfile = 'fast' }
}

/** 档位对应的锐化量：带补帧的路径用「重链路 + 锐化量」表达同一档位。 */
function sharpnessOf(profile: Anime4KProfile | 'off') {
  return profile === 'fast' ? 0.05 : profile === 'balanced' ? 0.12 : profile === 'sharp' ? 0.22 : 0
}

/** 用户主动换档本身会造成一次内容时刻不连续，属于操作而非抖动，不能计进抖动口径。 */
function noticeUserChange() {
  contentSteps.length = 0; contentHolds = 0; contentJumps = 0; contentBacksteps = 0
  contentFreezeRuns = 0; contentFreezeMaxFrames = 0; contentFreezeFrames = 0; holdRun = 0
}

/** 定位预览：拖动期间关掉增强与光流，松手后切回用户档位。 */
function setPreviewMode(enabled: boolean) {
  if (previewMode === enabled) return
  previewMode = enabled
  if (!renderer) return
  reset()
  if (enabled) renderer.setEnhancement(undefined, 0)
  else applyEnhancementProfile()
  noticeUserChange()
}
async function receiveFrame(message: Extract<Command, { type: 'frame' }>) {
  const bitmap = message.bitmap
  if (!renderer || message.generation !== generation) { bitmap.close(); return }
  if (measureStages && message.capturedAt) sample('frameQueue', performance.now() - (message.capturedAt - performance.timeOrigin))
  const delta = message.time - previousTime
  if (sourceWidth !== bitmap.width || sourceHeight !== bitmap.height) {
    // 清晰度自适应只会改变像素尺寸，不会改变时间轴。整条重置并收起补间层的话，页面会露出比
    // 画布晚一个插值延迟的原视频，于是每次码率切换都产生一次前后跳变（用户看到的「波动」）。
    // 这里只跟随新尺寸并重新评估分析精度：保留帧队列与生效延迟，下一次绘制立刻用旧尺寸的帧补上
    // 画面，新尺寸的帧随后接管，画面不会跳到另一个时刻。
    const firstSize = !sourceWidth && !sourceHeight
    sourceWidth = bitmap.width; sourceHeight = bitmap.height
    // 改后备存储尺寸会清空画布内容：先交回原视频，等新尺寸的第一帧画上再接管（VQ-53）。
    setActive(false)
    renderer.canvas.width = bitmap.width; renderer.canvas.height = bitmap.height
    // 只回收已释放的纹理（尺寸已不匹配），队列里正在显示的画面不受影响。
    renderer.clearFramePool()
    // 分析网格要按新分辨率重新评估均值与预热，但保持已经验证过的精度档位。
    flowAnalysis.reset(true)
    // 首次确定尺寸（会话刚开始）没有可保留的画面，仍按播放段起点重建。
    if (firstSize) reset(true, true)
    else previousTime = -1
  }
  // 仅增强路径不改变用户请求的档位：结构性限制由页面回退原主线程路径，不在 Worker 内静默降档。
  if (!enhancementOnly && effectiveProfile === 'upscale' && overTextureBudget()) {
    downgradeEnhancement('超分超过纹理预算，已回退修复档')
  }
  const expected = message.displayTime - performance.timeOrigin
  const predicted = mediaTime + (expected - displayTime) / 1000 * rate
  // 媒体时间相对播放时钟真正跳变（定位、循环、换源）时才重建管线；采集或处理短暂停顿造成的
  // 帧间隔不是时间轴跳变，按旧口径会把它升级成整层回退，表现为画质反复波动。
  if (displayTime && (message.time < previousTime - 0.05 || Math.abs(message.time - predicted) >= 0.5)) reset(false, true)
  mediaTime = displayTime && Math.abs(message.time - predicted) < 0.1 ? predicted + (message.time - predicted) * 0.1 : message.time
  displayTime = expected; rate = message.rate
  // 任一时钟句柄都在时说明本播放段已经挂过唤醒：对齐模式用的是刷新边界回调，不能只看计时器句柄。
  if (!frameHandle && !timerHandle && !boundaryHandle && !probeHandle) {
    sampledAt = performance.now(); missedPairs = droppedSourceFrames = 0; armSchedule()
  }
  if (busy) {
    // 等待位只保留一个：已占用说明上一帧还没处理完又来一帧，才是真正的丢帧；
    // 否则把这帧暂存下来，当前帧处理完立即补上，避免一次分析尖峰就丢掉一个源帧。
    if (queuedFrame) { droppedSourceFrames++; bitmap.close() }
    else { deferredSourceFrames++; queuedFrame = message }
    return
  }
  if (delta > 0 && delta < 0.2) sourceFps = 1 / delta
  // 源帧率优先取主线程按媒体时间测得的相邻画面间隔：被本线程丢弃的帧不会把源帧率低估成一半。
  const deliveredSourceFps = message.sourceInterval && message.sourceInterval > 0
    ? rate / message.sourceInterval
    : sourceFps * rate
  // 源帧间隔按媒体时间采样，用于延迟下限与加宽余量；滚动 16 个样本取中位数抵抗偶发丢帧。
  if (message.sourceInterval && message.sourceInterval > 0 && message.sourceInterval < 0.5) {
    sourceIntervals.push(message.sourceInterval * 1000)
    if (sourceIntervals.length > 16) sourceIntervals.shift()
  }
  if (awaitingEpoch) beginDelayEpoch(performance.now())
  // 定位预览期不跑光流：没有新运动场，渲染自然落到「只出原帧」的廉价位（VQ-59）。
  const needFlow = !previewMode
    && demand.observe({ nowMs: performance.now(), sourceFps: deliveredSourceFps, targetFps: cadence.target }) === 'flow'
  previousTime = message.time
  busy = true
  const currentVersion = version
  try {
    try {
      const uploadStarted = measureStages ? performance.now() : 0
      pending = renderer.upload(bitmap, message.time, { width: 1, height: 1, data: new Float32Array(4), sceneCut: true }, true)
      if (measureStages) sample('upload', performance.now() - uploadStarted)
    } catch (error) {
      if (effectiveProfile !== 'restore' && effectiveProfile !== 'upscale') throw error
      downgradeEnhancement('增强处理失败，已降低质量档位')
      releaseBusy()
      return
    }
    if (!enhancementOnly) {
      // 降档按持续压力窗口判定：瞬时抖动不会降档，档位在一次会话内只降不升（VQ-32 稳定优先）。
      const action = enhancementPolicy.observe({ nowMs: performance.now(), enhancementMs: renderer.enhancementMs,
        budgetMs: 1000 / Math.max(sourceFps * rate, 30), queueDepth: renderer.enhancementQueueDepth })
      if (action === 'downgrade') {
        if (downgradeEnhancement('增强超出处理预算，已降低质量档位')) { releaseBusy(); return }
        // 已在地板档：没有更省的处理链可让。这里不能像降档那样直接返回——降档分支依赖
        // downgradeEnhancement→reset() 释放 pending，而地板档不执行 reset；直接返回会让
        // 下面 receiveFrame 里对 pending 的覆盖变成真正的丢弃：被覆盖的帧既不呈现也不
        // release，它已经上传的 3 张纹理就永久留在 renderer.textures 里（1080p RGBA 单帧
        // 可达数十 MB），同时每累积一个压力窗口就少输出一帧。
        // 因此改为：重开预算窗口，然后按当前档位正常交付这一帧。
        enhancementPolicy.noteDowngrade()
      }
    }
    // 源帧率已达标：跳过缩放、光流分析与运动场上传，只保留增强与原帧呈现。
    if (!needFlow) {
      flowSkippedFrames++; flowSkippedTotal++
      computeMs = 0
      frames.push(pending)
      pending = null
      while (frames.length > 24) renderer.release(frames.shift()!)
      releaseBusy()
      return
    }
    const analysisWidth = flowAnalysis.widthFor(bitmap.width)
    const resizeStarted = measureStages ? performance.now() : 0
    const analysis = await createImageBitmap(bitmap, { resizeWidth: analysisWidth,
      resizeHeight: Math.max(32, Math.round(analysisWidth * bitmap.height / bitmap.width)) })
    if (currentVersion !== version) { analysis.close(); return }
    if (measureStages) sample('resize', performance.now() - resizeStarted)
    flowWorker!.postMessage({ bitmap: analysis, mediaTime: message.time, generation: currentVersion,
      sentAt: measureStages ? performance.timeOrigin + performance.now() : 0 }, [analysis])
  } catch { if (currentVersion === version) { busy = false; fail('视频画面读取失败，已恢复原始播放') } }
  finally { bitmap.close() }
}

self.onmessage = (event: MessageEvent<Command>) => {
  const message = event.data
  if (message.type === 'display') {
    if (message.generation === generation) {
      const previousTarget = cadence.target
      const previousHz = cadence.displayHz
      cadence.observeDisplay(message.hz)
      // 统计窗口定期上报刷新率；没有实质变化时保留已排好的时隙，避免每秒取消并重挂一次唤醒。
      const refreshChanged = Math.abs(cadence.displayHz - previousHz) > Math.max(0.5, previousHz * 0.02)
      if (cadence.target !== previousTarget || refreshChanged
        || (!frameHandle && !timerHandle && !boundaryHandle && !probeHandle)) armSchedule()
    }
    return
  }
  // 页面驱动的 reset 来自暂停、定位、缓冲、隐藏与换源：这是播放段边界，延迟预算在此重新定档。
  if (message.type === 'reset') { generation = message.generation; reset(message.resetAnalysis, true); return }
  // 页面侧在放大/退出放大/旋转/缩放后请求一个静默窗口（VQ-51）。
  if (message.type === 'grace') { deferJudgement(Number(message.ms) || 0, message.rearm === true); return }
  if (message.type === 'config') { reconfigure(message); return }
  if (message.type === 'preview') { setPreviewMode(message.enabled === true); return }
  if (message.type === 'frame') { void receiveFrame(message); return }
  try {
    enhancementOnly = message.interpolation === false
    // 呈现对齐口径（VQ-31）：`refresh` 在目标高于刷新能力时按刷新边界提交；`deadline` 回到既有计时器节拍。
    scheduler.setAlignment(message.presentationAlignment === 'deadline' ? 'deadline' : 'refresh')
    // 仅增强路径不引入插值延迟：原帧增强后就按到达时序呈现，不需要音画同步缓冲。
    nominalDelay = enhancementOnly ? 0 : message.delay
    delay = nominalDelay
    // 延迟预算（VQ-29，VQ-32 稳定优先）：默认在播放段内单向加宽，播放期不再收缩；
    // `interpolationDelay: 'fixed'` 保留固定 150ms 隔离对照。
    delayPolicy = !enhancementOnly && message.interpolationDelay !== 'fixed'
      ? new InterpolationDelayPolicy({ nominalMs: Math.round(nominalDelay * 1000) })
      : null
    // 固定延迟对照也记录首帧时刻，使两种口径的原画窗口可以直接比较。
    awaitingEpoch = true
    epochFirstFrameAt = 0; epochAwaitingMs = 0; sourceIntervals.length = 0
    windowNeededMs = 0; rewinds = 0; rewindMaxMs = 0
    initializationFailure = ''
    measureStages = message.measureStages === true
    requestedProfile = message.profile
    requestedFlowBackend = message.flowBackend === 'webgpu' ? 'webgpu' : 'cpu'
    // 稳定模式（VQ-55）：只收紧分析网格上限，不改变档位与补帧目标。
    flowConservative = message.flowConservative === true
    // 平台上限（VQ-45）：手机端收窄运动分析网格、收紧超预算阈值，并允许「均衡」降档；
    // 不传上限时保持桌面既有行为（四档分析宽度、默认阈值、只回退超分/修复）。
    const limits = message.limits ?? {}
    enhancementPolicy = new EnhancementBudgetPolicy(limits.budget)
    allowMidTierFallback = limits.allowMidTierFallback === true
    // 240 FPS 是极致帧率档：让出增强预算给插帧与渲染，其他档位保留用户画质选择。
    const extremeRate = !enhancementOnly && message.targetFps === 240
    effectiveProfile = extremeRate && message.profile !== 'off' && message.profile !== 'fast' ? 'fast' : message.profile
    if (effectiveProfile !== requestedProfile) {
      fallbackReason = '240 FPS 极致帧率，画质已平衡到性能档'
      qualityFallbacks.push({ from: requestedProfile, to: effectiveProfile, reason: fallbackReason, atMs: performance.now() })
    }
    cadence = new FrameCadence(message.targetFps)
    flowWidthCap = limits.analysisWidthCap
    // 稳定模式（VQ-55）不享受 GPU 专属的更细网格：网格越小、运动场越快到达，优先保证相位不停顿。
    flowWidthCapOnGpu = flowConservative
      ? limits.analysisWidthCap
      : (limits.analysisWidthCapOnGpu ?? limits.analysisWidthCap)
    // 后端未知时先按 CPU 上限起跑：升到更细的网格必须等 GPU 被实测确认（VQ-49）。
    flowAnalysis = new FlowAnalysisPolicy({ maxWidth: flowWidthCap })
    demand = new InterpolationDemandPolicy({ forceFlow: !enhancementOnly && message.interpolationDemand === 'always',
      forceBypass: enhancementOnly })
    renderer = createRenderer(message.canvas)
    // 240 FPS 平衡与增强初始化失败的降级在此固化：档位在一次会话内只降不升（VQ-32）。
    message.canvas.addEventListener('webglcontextlost', () => fail('GPU 上下文丢失，已恢复原始播放'))
    // 仅增强路径不执行光流分析，也就不需要运动估计线程。
    if (!enhancementOnly) attachFlowWorker()
    self.postMessage({ type: 'ready', generation, enhancementOnly, effectiveProfile,
      enhancementError: initializationFailure || undefined })
  } catch { fail(enhancementOnly ? '当前设备不支持后台画质增强' : '当前设备不支持 GPU 运动补帧') }
}

function attachFlowWorker() {
  flowWorker = new Worker(new URL('./motionFlow.worker.ts', import.meta.url), { type: 'module' })
  // 页面请求 GPU 运动估计时只发一条运行期指令：线程仍按构建期默认值启动，
  // 设备不可用或运行期设备丢失都会在 worker 内部回退 jsfeat，无需页面分支。
  if (requestedFlowBackend === 'webgpu') flowWorker.postMessage({ type: 'backend', backend: 'webgpu' })
  flowWorker.onerror = () => fail('光流线程不可用，已恢复原始播放')
  flowWorker.onmessage = (event: MessageEvent<{ generation: number; field: MotionField; computeMs: number; analysisMs?: number; flowQueueMs?: number | null; sentAt?: number; error?: string; backend?: string; fallbackReason?: string }>) => {
    const data = event.data
    if (data.generation !== version || !renderer) return
    if (data.backend) {
      const backend = data.backend === 'webgpu' ? 'webgpu' : 'jsfeat'
      if (backend !== flowBackend) {
        flowBackend = backend
        // 后端变化只调整网格上限：GPU 被确认后允许更细的网格，回到 CPU 立即收回上限；
        // 实际档位仍由 FlowAnalysisPolicy 的实测余量门控决定，不会直接抬高处理成本（VQ-49）。
        flowAnalysis.setMaxWidth(backend === 'webgpu' ? flowWidthCapOnGpu : flowWidthCap)
      }
    }
    if (data.fallbackReason) flowFallbackReason = data.fallbackReason
    if (measureStages) {
      sample('analysis', data.analysisMs ?? null)
      sample('flowQueue', data.flowQueueMs ?? null)
      if (data.sentAt) sample('flowRoundTrip', performance.now() - (data.sentAt - performance.timeOrigin))
    }
    if (data.error || !pending) { clearQueuedFrame(); busy = false; fail('运动估计失败，已恢复原始播放'); return }
    renderer.updateFlow(pending, data.field); frames.push(pending); pending = null
    computeMs = data.computeMs
    flowAnalysis.observe(computeMs, sourceFps * rate)
    while (frames.length > 24) renderer.release(frames.shift()!)
    // 当前帧已经带运动场进入帧队列，此时才让出 busy 并补上等待位里的源帧。
    releaseBusy()
  }
}

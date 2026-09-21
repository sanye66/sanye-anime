import { MotionRenderer, type MotionFrame } from './motionRenderer'
import type { MotionField } from './motionFlow'
import type { Anime4KProfile } from './anime4k'
import { FrameCadence, type FrameRateTarget } from './frameCadence'
import { FlowAnalysisPolicy } from './flowAnalysisPolicy'
import { PresentationScheduler } from './presentationScheduler'
import { PresentationLedger } from './presentationLayers'
import { EnhancementBudgetPolicy } from './enhancementBudgetPolicy'
import { InterpolationDemandPolicy } from './interpolationDemandPolicy'
import { InterpolationDelayPolicy } from './interpolationDelayPolicy'

type Command = { type: 'init'; canvas: OffscreenCanvas; profile: Anime4KProfile | 'off'; delay: number; targetFps: FrameRateTarget; measureStages?: boolean; interpolationDemand?: 'auto' | 'always'; interpolation?: boolean; interpolationDelay?: 'adaptive' | 'fixed'; presentationAlignment?: 'deadline' | 'refresh' }
  | { type: 'display'; hz: number; generation: number }
  | { type: 'reset'; generation: number; resetAnalysis?: boolean }
  | { type: 'frame'; bitmap: ImageBitmap; time: number; displayTime: number; rate: number; generation: number; capturedAt?: number; sourceInterval?: number }

let renderer: MotionRenderer | null = null
let flowWorker: Worker | null = null
let generation = 0, version = 0, busy = false, active = false
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
const frames: MotionFrame[] = []
let effectiveProfile: Anime4KProfile | 'off' = 'off', fallbackReason = ''
let requestedProfile: Anime4KProfile | 'off' = 'off'
/** 本次会话允许恢复到的最高档位：请求档位，或被结构性降档锁定的档位。 */
let recoveryCeiling: Anime4KProfile | 'off' = 'off'
let sessionCeiling: Anime4KProfile | 'off' = 'off'
/** 最近一次档位变化的类型，按窗口上报给页面用于抑制恢复提示（文案口径见 VQ-30）。 */
let qualityChange: 'downgrade' | 'recovery' | '' = ''
const enhancementPolicy = new EnhancementBudgetPolicy()
/** 源帧率是否已经达到目标帧率的判定（VQ-27）：已达标时跳过光流分析与运动场上传。 */
let demand = new InterpolationDemandPolicy()
let flowSkippedFrames = 0, flowSkippedTotal = 0
/** 增强档位的降档阶梯；不在阶梯上的档位既不降档也不恢复。 */
const ENHANCEMENT_LADDER: (Anime4KProfile | 'off')[] = ['fast', 'restore', 'upscale']
const qualityFallbacks: { from: Anime4KProfile | 'off'; to: Anime4KProfile | 'off'; reason: string; atMs: number }[] = []
let sourceWidth = 0, sourceHeight = 0
let cadence = new FrameCadence()
let flowAnalysis = new FlowAnalysisPolicy()
let lastRender = 0, frameIntervals: number[] = [], scheduleLate: number[] = []
/** 画面内容停止推进超过该时长才整层回到原画；短暂落后改用最近可用帧维持增强与补间层。 */
const STALL_FALLBACK_MS = 800
let lastDrawnTime = -1, frozenSince = 0, stallDraws = 0
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
 * 降档。`recoverable` 表示这次降档来自持续预算压力，可以由 `upgradeEnhancement` 有界恢复；
 * 纹理预算或增强失败属于结构性限制，直接把可恢复上限锁定到实际档位。
 */
function downgradeEnhancement(reason: string, recoverable = false) {
  if (!renderer || (effectiveProfile !== 'upscale' && effectiveProfile !== 'restore')) return
  const canvas = renderer.canvas as OffscreenCanvas
  const previousProfile = effectiveProfile
  reset()
  effectiveProfile = effectiveProfile === 'upscale' ? 'restore' : 'fast'
  fallbackReason = reason
  renderer.setEnhancement(effectiveProfile === 'restore' ? 'restore' : undefined, effectiveProfile === 'fast' ? 0.05 : 0)
  if (renderer.enhancementFailure) { fallbackReason += '；' + renderer.enhancementFailure; effectiveProfile = 'fast' }
  qualityFallbacks.push({ from: previousProfile, to: effectiveProfile, reason: fallbackReason, atMs: performance.now() })
  if (qualityFallbacks.length > 8) qualityFallbacks.shift()
  canvas.width = sourceWidth; canvas.height = sourceHeight
  qualityChange = 'downgrade'
  if (!recoverable || renderer.enhancementFailure) recoveryCeiling = effectiveProfile
  enhancementPolicy.noteDowngrade(performance.now())
}

const ladderIndex = (profile: Anime4KProfile | 'off') => ENHANCEMENT_LADDER.indexOf(profile)
/** 下一档恢复目标：每次只升一档，且不超过请求档位或已锁定的可恢复上限。 */
function nextRecoverableProfile() {
  const from = ladderIndex(effectiveProfile), ceiling = ladderIndex(recoveryCeiling)
  if (from < 0 || ceiling < 0 || from >= ceiling) return null
  return ENHANCEMENT_LADDER[from + 1]
}
/** 超分输出扩大四倍，超出纹理或分辨率预算时不能在本次内容上恢复。 */
function overTextureBudget() {
  // 纹理预算按会话上限而不是当前生效延迟计算：自适应收缩不得放宽 VQ-26 的可恢复上限。
  const requiredFrames = Math.max(6, Math.ceil(nominalDelay * Math.max(sourceFps * rate, 30)) + 3)
  return sourceWidth > 1920 || sourceHeight > 1080
    || sourceWidth * sourceHeight * (16 * (requiredFrames + 1) + 4) > 256 * 1024 * 1024
}
/** 有界恢复：冷却窗口与稳定样本门槛都由 `EnhancementBudgetPolicy` 判定，失败则锁定该档位。 */
function upgradeEnhancement() {
  if (!renderer) return
  const target = nextRecoverableProfile()
  if (!target) return
  if (target === 'upscale' && overTextureBudget()) { recoveryCeiling = effectiveProfile; return }
  const canvas = renderer.canvas as OffscreenCanvas
  const previousProfile = effectiveProfile
  reset()
  effectiveProfile = target
  renderer.setEnhancement(target === 'restore' ? 'restore' : 'upscale', 0)
  if (renderer.enhancementFailure) {
    const failure = renderer.enhancementFailure
    reset()
    effectiveProfile = previousProfile
    renderer.setEnhancement(previousProfile === 'restore' ? 'restore' : undefined, previousProfile === 'fast' ? 0.05 : 0)
    recoveryCeiling = previousProfile
    fallbackReason = failure
    qualityFallbacks.push({ from: target, to: previousProfile, reason: failure, atMs: performance.now() })
    if (qualityFallbacks.length > 8) qualityFallbacks.shift()
    qualityChange = 'downgrade'
    enhancementPolicy.noteDowngrade(performance.now())
    return
  }
  qualityFallbacks.push({ from: previousProfile, to: effectiveProfile, reason: '增强持续有余量，已恢复质量档位', atMs: performance.now() })
  if (qualityFallbacks.length > 8) qualityFallbacks.shift()
  if (effectiveProfile === requestedProfile) fallbackReason = ''
  // 超分档位由增强链路在下一帧按输出尺寸重设画布，其余档位立即回到源尺寸。
  if (effectiveProfile !== 'upscale') { canvas.width = sourceWidth; canvas.height = sourceHeight }
  qualityChange = 'recovery'
  enhancementPolicy.noteRecovery(performance.now())
}

function setActive(value: boolean) {
  if (active === value) return
  active = value
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
  cadence.reset(); flowAnalysis.reset(!resetAnalysis); sourceFps = 0; computeMs = 0
  enhancementPolicy.reset()
  demand.reset()
  lastRender = 0; frameIntervals = []; scheduleLate = []
  lastDrawnTime = -1; frozenSince = 0; stallDraws = 0
  renderTicks = []; renderTickMaxMs = 0; longRenderTicks = 0
  droppedSourceFrames = 0; flowSkippedFrames = 0
  presentationLedger.reset()
  rewinds = 0; rewindMaxMs = 0; resumeRewinds = 0
  windowNeededMs = 0; windowNeededMaxMs = 0; windowNeeds.length = 0; growUntil = 0
  // 播放段边界（起播、定位、暂停恢复、换源与时间轴跳变）才重开延迟预算；画质档切换保持当前延迟。
  if (epoch) { awaitingEpoch = true; epochFirstFrameAt = 0; epochAwaitingMs = 0 }
  for (const key of Object.keys(stageSamples)) stageSamples[key] = []
  setActive(false)
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
  if (delayPolicy) delay = delayPolicy.beginEpoch(now, sourceIntervalMs()) / 1000
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
          // 这次恢复会把目标时刻拉回已经缓存的区间，产生的回退计在本窗口（本窗口同时记录了停顿）。
          delay = widened; growUntil = now + 250; resumeRewinds++; broadcastDelay()
        }
      }
    }
  }
  const target = mediaTime + (now - displayTime) / 1000 * rate - delay * rate
  if (frames.length >= 2) {
    const index = frames.findIndex(frame => frame.time >= target)
    const before = index > 0 ? frames[index - 1] : frames[frames.length - 2]
    const after = index > 0 ? frames[index] : frames[frames.length - 1]
    const gap = after.time - before.time
    const pairing = index > 0 && gap > 0 && gap < 0.2
    // 源帧率已达标（VQ-27）时帧队列里没有运动场：只输出最近的原帧，着色器在相位 0/1 直接给原帧。
    const interpolatable = pairing && after.flowUploaded
    const frameOnly = pairing && !after.flowUploaded
    if (interpolatable || frameOnly || active) {
      // 目标时刻落在帧窗口外时用最近可用帧（phase 0 或 1）继续绘制：着色器在该相位直接输出
      // 对应原帧并保留锐化，因此不会混合过期运动，也不会让增强与补间层整层消失。
      const phase = interpolatable ? (target - before.time) / gap
        : frameOnly ? (target - before.time >= gap / 2 ? 1 : 0)
          : index < 0 ? 1 : 0
      const submitStarted = measureStages ? performance.now() : 0
      renderer.render(before, after, phase, frameOnly)
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
        setActive(true)
      } else {
        // 管线短暂落后或超出窗口：计入统计但不切换展示层，避免画质反复波动。
        missedPairs++
        stallDraws++
      }
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
      frozenSince = 0
      setActive(true)
    }
    while (frames.length > 3) activeRenderer.release(frames.shift()!)
  }
  reportWindow(now)
  return submitted
}

function reportWindow(now: number) {
  if (!renderer || now - sampledAt < 1000) return
  const windowMs = now - sampledAt
  // 延迟预算在每个报告窗口上判定一次：只有连续干净窗口有余量时才收缩，停顿或回跳只登记恢复。
  windowNeededP90Ms = p90Of(windowNeeds)
  if (delayPolicy && active
    // 收缩依据用窗口内最坏需要：P90 偏乐观时会过早收缩，随后又因停顿恢复余量，来回振荡。
    && delayPolicy.observeWindow({ nowMs: now, neededMs: windowNeededMaxMs, missedPairs, stallFrames: stallDraws,
      rewinds }) === 'shrink') {
    delay = delayPolicy.effectiveMs / 1000
    broadcastDelay()
  }
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
  cadence.observe({ outputFps, gpuMs: completed.gpuMs, computeMs, enhancementMs: renderer.enhancementMs,
    enhancementQueueDepth: renderer.enhancementQueueDepth, sourceFps: sourceFps * rate, missedPairs, droppedSourceFrames,
    frameIntervalP95Ms, scheduleLateP95Ms, renderTickP95Ms, longFrameRatio })
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
    interpolatedFrames: completed.interpolated, computeMs, missedPairs, droppedSourceFrames,
    analysisWidth: flowAnalysis.widthFor(sourceWidth), enhancementMs: renderer.enhancementMs,
    enhancementQueueDepth: renderer.enhancementQueueDepth, requestedProfile, effectiveProfile, fallbackReason, qualityFallbacks,
    recoveryCeiling, qualityChange,
    interpolationNeed: demand.mode, interpolationReason: demand.reason, flowSkippedFrames, flowSkippedTotal,
    interpolationDemand: demand.snapshot(cadence.target),
    enhancementOnly,
    interpolationDelay: delayStats(),
    enhancementBudget: { ...enhancementPolicy.snapshot(now), armed: effectiveProfile !== recoveryCeiling,
      lastEnhancementMs: renderer.enhancementMs, lastQueueDepth: renderer.enhancementQueueDepth },
    outputWidth: renderer.canvas.width, outputHeight: renderer.canvas.height,
    resources: renderer.resourceStats,
    presentation,
    ...(measureStages ? { measurement: { clock: 'performance.now', unit: 'ms', captureP95Ms: null,
      uploadP95Ms: p95('upload'), resizeP95Ms: p95('resize'), analysisP95Ms: p95('analysis'),
      flowQueueP95Ms: p95('flowQueue'), flowRoundTripP95Ms: p95('flowRoundTrip'),
      interpolationSubmitP95Ms: p95('interpolationSubmit'), frameQueueP95Ms: p95('frameQueue'),
      counts, captureSkipped: 0, decodedFrames: null, droppedDecodedFrames: null, decodeProcessingDurationP95Ms: null } } : {}) } })
  sampledAt = now; missedPairs = droppedSourceFrames = 0; frameIntervals = []; scheduleLate = []
  stallDraws = 0; flowSkippedFrames = 0
  rewinds = 0; rewindMaxMs = 0; resumeRewinds = 0; windowNeededMaxMs = 0; windowNeeds.length = 0
  renderTicks = []; renderTickMaxMs = 0; longRenderTicks = 0
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
    pendingRestore: false, widens: 0, shrinks: 0, restores: 0, inEpochRestores: 0, changes: 0,
    reason: '固定延迟隔离对照', awaitingMs: epochAwaitingMs, rewinds, rewindMaxMs, resumeRewinds }
}

/** 窗口内实测需要的 P90；样本不足时取最大值。 */
function p90Of(values: number[]) {
  if (!values.length) return windowNeededMs
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)]
}

async function receiveFrame(message: Extract<Command, { type: 'frame' }>) {
  const bitmap = message.bitmap
  if (!renderer || message.generation !== generation) { bitmap.close(); return }
  if (measureStages && message.capturedAt) sample('frameQueue', performance.now() - (message.capturedAt - performance.timeOrigin))
  const delta = message.time - previousTime
  if (sourceWidth !== bitmap.width || sourceHeight !== bitmap.height) {
    reset(true, true); renderer.clearFramePool(); sourceWidth = bitmap.width; sourceHeight = bitmap.height
    renderer.canvas.width = bitmap.width; renderer.canvas.height = bitmap.height
    // 换源或换分辨率属于新内容：重新按会话上限评估恢复，纹理预算与增强失败会在下一次降档时再次锁定。
    recoveryCeiling = sessionCeiling
  }
  // 仅增强路径不改变用户请求的档位：结构性限制由页面回退原主线程路径，不在 Worker 内静默降档。
  if (!enhancementOnly && effectiveProfile === 'upscale' && overTextureBudget()) {
    downgradeEnhancement('超分超过纹理预算，已回退修复档', false)
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
  if (busy) { droppedSourceFrames++; bitmap.close(); return }
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
  const needFlow = demand.observe({ nowMs: performance.now(), sourceFps: deliveredSourceFps, targetFps: cadence.target }) === 'flow'
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
      busy = false
      return
    }
    if (!enhancementOnly) {
      // 降档与恢复都按持续窗口判定：瞬时抖动不会降档，恢复只在冷却窗口与稳定样本门槛之后发生。
      const action = enhancementPolicy.observe({ nowMs: performance.now(), enhancementMs: renderer.enhancementMs,
        budgetMs: 1000 / Math.max(sourceFps * rate, 30), queueDepth: renderer.enhancementQueueDepth,
        recoveryArmed: effectiveProfile !== recoveryCeiling })
      if (action === 'downgrade') {
        downgradeEnhancement('增强超出处理预算，已降低质量档位', true)
        busy = false
        return
      }
      if (action === 'recover') {
        upgradeEnhancement()
        busy = false
        return
      }
    }
    // 源帧率已达标：跳过缩放、光流分析与运动场上传，只保留增强与原帧呈现。
    if (!needFlow) {
      flowSkippedFrames++; flowSkippedTotal++
      computeMs = 0
      frames.push(pending)
      pending = null
      while (frames.length > 24) renderer.release(frames.shift()!)
      busy = false
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
    if (message.generation === generation) { cadence.observeDisplay(message.hz); armSchedule() }
    return
  }
  // 页面驱动的 reset 来自暂停、定位、缓冲、隐藏与换源：这是播放段边界，延迟预算在此重新定档。
  if (message.type === 'reset') { generation = message.generation; reset(message.resetAnalysis, true); return }
  if (message.type === 'frame') { void receiveFrame(message); return }
  try {
    enhancementOnly = message.interpolation === false
    // 呈现对齐口径（VQ-31）：`refresh` 在目标高于刷新能力时按刷新边界提交；`deadline` 回到既有计时器节拍。
    scheduler.setAlignment(message.presentationAlignment === 'deadline' ? 'deadline' : 'refresh')
    // 仅增强路径不引入插值延迟：原帧增强后就按到达时序呈现，不需要音画同步缓冲。
    nominalDelay = enhancementOnly ? 0 : message.delay
    delay = nominalDelay
    // VQ-29：默认自适应收缩；`interpolationDelay: 'fixed'` 保留固定 150ms 隔离对照。
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
    // 240 FPS 是极致帧率档：让出增强预算给插帧与渲染，其他档位保留用户画质选择。
    const extremeRate = !enhancementOnly && message.targetFps === 240
    effectiveProfile = extremeRate && message.profile !== 'off' && message.profile !== 'fast' ? 'fast' : message.profile
    if (effectiveProfile !== requestedProfile) {
      fallbackReason = '240 FPS 极致帧率，画质已平衡到性能档'
      qualityFallbacks.push({ from: requestedProfile, to: effectiveProfile, reason: fallbackReason, atMs: performance.now() })
    }
    cadence = new FrameCadence(message.targetFps)
    flowAnalysis = new FlowAnalysisPolicy()
    demand = new InterpolationDemandPolicy({ forceFlow: !enhancementOnly && message.interpolationDemand === 'always',
      forceBypass: enhancementOnly })
    renderer = createRenderer(message.canvas)
    // 240 FPS 平衡与增强初始化失败的降级在此固化：恢复不得越过会话起点档位。
    sessionCeiling = recoveryCeiling = effectiveProfile
    message.canvas.addEventListener('webglcontextlost', () => fail('GPU 上下文丢失，已恢复原始播放'))
    // 仅增强路径不执行光流分析，也就不需要运动估计线程。
    if (!enhancementOnly) attachFlowWorker()
    self.postMessage({ type: 'ready', generation, enhancementOnly, effectiveProfile,
      enhancementError: initializationFailure || undefined })
  } catch { fail(enhancementOnly ? '当前设备不支持后台画质增强' : '当前设备不支持 GPU 运动补帧') }
}

function attachFlowWorker() {
  flowWorker = new Worker(new URL('./motionFlow.worker.ts', import.meta.url), { type: 'module' })
  flowWorker.onerror = () => fail('光流线程不可用，已恢复原始播放')
  flowWorker.onmessage = (event: MessageEvent<{ generation: number; field: MotionField; computeMs: number; analysisMs?: number; flowQueueMs?: number | null; sentAt?: number; error?: string }>) => {
    const data = event.data
    if (data.generation !== version || !renderer) return
    busy = false
    if (measureStages) {
      sample('analysis', data.analysisMs ?? null)
      sample('flowQueue', data.flowQueueMs ?? null)
      if (data.sentAt) sample('flowRoundTrip', performance.now() - (data.sentAt - performance.timeOrigin))
    }
    if (data.error || !pending) { fail('运动估计失败，已恢复原始播放'); return }
    renderer.updateFlow(pending, data.field); frames.push(pending); pending = null
    computeMs = data.computeMs
    flowAnalysis.observe(computeMs, sourceFps * rate)
    while (frames.length > 24) renderer.release(frames.shift()!)
  }
}

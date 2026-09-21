import type { PresentationMode } from './presentationScheduler'

/**
 * 呈现分层（VQ-31）。
 *
 * 高刷验收要求把「源帧、生成帧、合成器提交与可观察呈现」分开记录：只看 GPU 完成计数会把
 * 「生成了多少帧」当成「屏幕显示了什么」，而只动画帧估计又会把浏览器回调当成物理刷新率。
 * 本模块只做汇总与口径判读，不改变排程、提交时机或画质档位。
 */
export type PresentationKind = 'aligned' | 'refresh-bound' | 'deadline-paced' | 'unconfirmed'

export interface PresentationLayerSample {
  /** 源帧：本窗口内媒体元素解码并交付的画面数（`presentedFrames` 增量）。 */
  sourceFrames: number
  /** 生成帧：经 GPU 完成查询确认的生成帧数，含原帧直出与补间帧。 */
  generatedFrames: number
  /** 补间帧：生成帧中相位处于开区间的合成帧数。 */
  interpolatedFrames: number
  /** 合成器提交：渲染 Worker 实际提交绘制的次数。 */
  submittedFrames: number
  /** 可观察呈现：画布作为可见层时主线程观察到的动画帧数（不是物理扫描证据）。 */
  observedFrames: number
  /**
   * 刷新边界上被呈现的那一帧的内容陈旧度 P95（毫秒）：边界时刻减去最近一次提交的内容时刻。
   * 显示时钟下应接近 0，刷新对齐下不超过一个目标帧间隔，未对齐的计时器节拍会接近一个刷新周期。
   */
  presentedPhaseP95Ms: number | null
  refreshHz: number
  targetFps: number
  clock: PresentationMode
  windowMs: number
}

export interface PresentationLayers extends PresentationLayerSample {
  /** 口径判读：刷新对齐、受刷新上限约束、计时器节拍或未确认。 */
  kind: PresentationKind
  /** 生成帧是否达到目标的 96%。 */
  generationOnTarget: boolean
  /** 提交多于可观察呈现的差额：这些提交无法被当前显示节奏消费。 */
  presentationGap: number
  /** 源帧到生成帧的倍率（补间倍率），源帧为 0 时为 0。 */
  generationRatio: number
  summary: string
  /**
   * 浏览器内无法证明「合成器提交已经上屏」这一物理事实：没有高速拍摄或呈现工具时，
   * 该字段保持 `unverified`，验收不得用本窗口数据替代物理呈现证据。
   */
  physical: 'unverified'
}

const GENERATION_TOLERANCE = 0.96

function round(value: number) {
  return Math.round(value * 100) / 100
}

function nonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * 展示时钟判读。
 *
 * - `aligned`：目标不高于刷新能力，提交落在刷新时隙上（`display` 时钟）。
 * - `refresh-bound`：目标高于刷新能力，生成帧率可以达成目标，但可观察呈现只能到刷新上限。
 * - `deadline-paced`：刷新能力未知或回退到计时器，但仍有可观察呈现样本。
 * - `unconfirmed`：窗口内没有可观察呈现样本或刷新率未知，不能判断呈现口径。
 */
export function classifyPresentation(sample: PresentationLayerSample): PresentationKind {
  if (!(sample.refreshHz > 0) || sample.observedFrames <= 0) return 'unconfirmed'
  if (sample.clock === 'display') return 'aligned'
  if (sample.targetFps > sample.refreshHz * 1.04) return 'refresh-bound'
  return 'deadline-paced'
}

function summaryOf(sample: PresentationLayerSample, kind: PresentationKind, gap: number) {
  const layers = `源帧 ${sample.sourceFrames} · 生成帧 ${sample.generatedFrames}（补间 ${sample.interpolatedFrames}）`
    + ` · 提交 ${sample.submittedFrames} · 呈现 ${sample.observedFrames}`
  const refresh = sample.refreshHz > 0 ? `${round(sample.refreshHz)}Hz` : '刷新未知'
  if (kind === 'refresh-bound') return `${layers}（${refresh} 上限，提交超出呈现 ${gap}）`
  if (kind === 'aligned') return `${layers}（${refresh} 刷新对齐）`
  if (kind === 'deadline-paced') return `${layers}（${refresh} 计时器节拍）`
  return `${layers}（呈现未确认）`
}

/** 把四层计数折算成可判读的窗口结论；输入计数不做累积，每个窗口单独给出。 */
export function foldPresentationLayers(sample: PresentationLayerSample): PresentationLayers {
  const normalized: PresentationLayerSample = {
    sourceFrames: nonNegative(sample.sourceFrames),
    generatedFrames: nonNegative(sample.generatedFrames),
    interpolatedFrames: nonNegative(sample.interpolatedFrames),
    submittedFrames: nonNegative(sample.submittedFrames),
    observedFrames: nonNegative(sample.observedFrames),
    presentedPhaseP95Ms: sample.presentedPhaseP95Ms === null || !Number.isFinite(sample.presentedPhaseP95Ms)
      ? null : Math.max(0, sample.presentedPhaseP95Ms),
    refreshHz: nonNegative(sample.refreshHz),
    targetFps: nonNegative(sample.targetFps),
    clock: sample.clock,
    windowMs: nonNegative(sample.windowMs),
  }
  const kind = classifyPresentation(normalized)
  const presentationGap = Math.max(0, normalized.submittedFrames - normalized.observedFrames)
  const expected = normalized.targetFps * normalized.windowMs / 1000
  const generationOnTarget = normalized.targetFps > 0 && expected > 0
    ? normalized.generatedFrames >= expected * GENERATION_TOLERANCE : false
  const generationRatio = normalized.sourceFrames > 0
    ? round(normalized.generatedFrames / normalized.sourceFrames) : 0
  return { ...normalized, kind, generationOnTarget, presentationGap, generationRatio,
    summary: summaryOf(normalized, kind, presentationGap), physical: 'unverified' }
}

/**
 * 窗口记账：Worker 与页面分别累计自己那一层的计数，窗口边界一次取走。
 * 只累计整数计数，不做时间平均，避免把「生成了多少帧」和「显示了多久」混成一个比率。
 */
export class PresentationLedger {
  sourceFrames = 0
  generatedFrames = 0
  interpolatedFrames = 0
  submittedFrames = 0
  observedFrames = 0
  presentedPhase: number[] = []

  addSource(frames = 1) { this.sourceFrames += Math.max(0, frames) }
  addGenerated(frames: number, interpolated: number) {
    this.generatedFrames += Math.max(0, frames)
    this.interpolatedFrames += Math.max(0, Math.min(frames, interpolated))
  }
  addSubmission() { this.submittedFrames++ }
  addObserved(frames = 1) { this.observedFrames += Math.max(0, frames) }

  /** 刷新边界采样：记录边界上将被呈现的那一帧有多旧；每个刷新边界只记一次。 */
  notePresentedPhase(phaseMs: number) {
    if (!Number.isFinite(phaseMs)) return
    if (this.presentedPhase.length < 256) this.presentedPhase.push(Math.max(0, phaseMs))
  }

  /** 会话或播放段边界：丢弃未取走的半窗口计数，避免跨段合并到下一个窗口。 */
  reset() {
    this.sourceFrames = this.generatedFrames = this.interpolatedFrames = 0
    this.submittedFrames = this.observedFrames = 0
    this.presentedPhase = []
  }

  /** 取走本窗口计数；调用方在窗口边界调用，随后累计从零开始。 */
  takeWindow(context: { refreshHz: number; targetFps: number; clock: PresentationMode; windowMs: number }): PresentationLayers {
    const presentedPhaseP95Ms = this.presentedPhase.length
      ? [...this.presentedPhase].sort((a, b) => a - b)[Math.ceil(this.presentedPhase.length * 0.95) - 1] : null
    const layers = foldPresentationLayers({ sourceFrames: this.sourceFrames, generatedFrames: this.generatedFrames,
      interpolatedFrames: this.interpolatedFrames, submittedFrames: this.submittedFrames,
      observedFrames: this.observedFrames, presentedPhaseP95Ms, refreshHz: context.refreshHz,
      targetFps: context.targetFps, clock: context.clock, windowMs: context.windowMs })
    this.reset()
    return layers
  }

}

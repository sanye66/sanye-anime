/**
 * 源帧率是否已经达到目标帧率的判定（VQ-27）。
 *
 * 补帧只在「源帧率低于目标帧率」时产生新画面：60 FPS 源在 60 FPS 目标下，每个展示时隙本来
 * 就能拿到一张原帧，光流分析与运动场上传只增加成本。这里把该判断独立成可验证的策略类：
 *
 * - 源帧率取最近若干个画面间隔的中位数：偶发丢帧、合成器少一次呈现只改变少数样本，
 *   中位数仍指向源本身的名义帧率，而真实换档（例如 60→24）会在一窗口内被识别；
 * - 进入「无需补帧」：源帧率估计持续达到目标的 `skipRatio`（400ms、6 个样本）；
 * - 回到补帧：源帧率估计持续低于目标的 `resumeRatio`（700ms、8 个样本）；
 * - 两个阈值之间是滞回带：既不进入也不退出，源帧率在边界附近抖动时不会开关式切换；
 * - 目标帧率变化（自适应升档、用户改档）只清空连续证据并保留当前模式，按新目标重新评估。
 * - 仅增强路径（VQ-28）用 `forceBypass` 直接固定在「不执行补帧」，不参与源帧率判定。
 *
 * 判定只决定是否执行光流补帧，不改变增强档位、输出尺寸与展示时钟。
 */
export type InterpolationDemandMode = 'flow' | 'none'

export interface InterpolationDemandSample {
  /** 采样时刻，与各保持窗口使用同一时钟（毫秒）。 */
  nowMs: number
  /** 当前源帧率（已按倍速折算为每秒交付的画面数）。 */
  sourceFps: number
  /** 当前目标呈现帧率。 */
  targetFps: number
}

export interface InterpolationDemandOptions {
  /** 源帧率达到目标该比例即视为“无需补帧”。 */
  skipRatio?: number
  /** 重新启用补帧所需的源帧率比例，必须明显低于 `skipRatio` 才能形成滞回。 */
  resumeRatio?: number
  /** 源帧率估计使用的中位数窗口大小。 */
  sampleWindow?: number
  /** 进入“无需补帧”所需的连续时长。 */
  skipHoldMs?: number
  /** 进入“无需补帧”所需的连续样本数。 */
  skipSamples?: number
  /** 重新启用补帧所需的连续时长。 */
  resumeHoldMs?: number
  /** 重新启用补帧所需的连续样本数。 */
  resumeSamples?: number
  /** 隔离对照：强制保留补帧，用于与优化前路径做同源比较。 */
  forceFlow?: boolean
  /** 仅增强路径（VQ-28）：强制不执行补帧，只呈现增强后的原帧。 */
  forceBypass?: boolean
}

const DEFAULTS: Required<InterpolationDemandOptions> = {
  skipRatio: 0.92,
  resumeRatio: 0.8,
  sampleWindow: 16,
  skipHoldMs: 400,
  skipSamples: 6,
  resumeHoldMs: 700,
  resumeSamples: 8,
  forceFlow: false,
  forceBypass: false,
}

export class InterpolationDemandPolicy {
  private readonly options: Required<InterpolationDemandOptions>
  private currentMode: InterpolationDemandMode = 'flow'
  private recent: number[] = []
  private estimate = 0
  private samples = 0
  private transitions = 0
  private measuredTarget = 0
  private skipSince = 0
  private skipSamples = 0
  private resumeSince = 0
  private resumeSamples = 0

  constructor(options: InterpolationDemandOptions = {}) { this.options = { ...DEFAULTS, ...options } }

  /** 当前模式：`flow` 表示需要执行光流补帧。 */
  get mode() { return this.currentMode }
  /** 源帧率估计（最近样本中位数）；尚未取得样本时为 0。 */
  get sourceFps() { return this.estimate }
  /** 最近一次判定的原因，用于统计与说明「为什么补帧或没有补帧」。 */
  get reason() {
    if (this.options.forceFlow) return '隔离对照：强制保留补帧'
    if (this.options.forceBypass) return '仅增强路径：不执行补帧'
    if (this.estimate <= 0) return '等待源帧率样本，暂按需要补帧处理'
    return this.currentMode === 'none' ? '源帧率已达目标，无需补帧' : '源帧率低于目标，保留补帧'
  }

  observe(sample: InterpolationDemandSample): InterpolationDemandMode {
    const targetFps = Number.isFinite(sample.targetFps) && sample.targetFps > 0 ? sample.targetFps : 0
    if (targetFps !== this.measuredTarget) { this.measuredTarget = targetFps; this.clearEvidence() }
    const sourceFps = Number.isFinite(sample.sourceFps) && sample.sourceFps > 0 ? sample.sourceFps : 0
    if (sourceFps > 0) {
      this.recent.push(sourceFps)
      if (this.recent.length > this.options.sampleWindow) this.recent.shift()
      this.estimate = this.median()
      this.samples++
    }
    if (this.options.forceFlow) {
      this.clearEvidence()
      this.currentMode = 'flow'
      return this.currentMode
    }
    if (this.options.forceBypass) {
      this.clearEvidence()
      this.currentMode = 'none'
      return this.currentMode
    }
    // 目标未知或还没有源帧率样本时保持当前模式：默认与优化前一致地执行补帧。
    if (!targetFps || this.estimate <= 0) { this.clearEvidence(); return this.currentMode }
    const ratio = this.estimate / targetFps
    if (this.currentMode === 'flow') {
      if (ratio >= this.options.skipRatio) {
        if (!this.skipSince) { this.skipSince = sample.nowMs; this.skipSamples = 1 }
        else this.skipSamples++
        if (this.skipSamples >= this.options.skipSamples && sample.nowMs - this.skipSince >= this.options.skipHoldMs) {
          this.switchTo('none')
        }
      } else this.clearSkip()
    } else if (ratio <= this.options.resumeRatio) {
      if (!this.resumeSince) { this.resumeSince = sample.nowMs; this.resumeSamples = 1 }
      else this.resumeSamples++
      if (this.resumeSamples >= this.options.resumeSamples && sample.nowMs - this.resumeSince >= this.options.resumeHoldMs) {
        this.switchTo('flow')
      }
    } else this.clearResume()
    return this.currentMode
  }

  /** 时间轴重置（定位、循环、换源、尺寸变化）只丢弃连续证据，模式与已收集样本继续有效。 */
  reset() { this.clearEvidence() }

  /** 当前判定汇总，用于统计窗口上报。 */
  snapshot(targetFps: number) {
    const ratio = targetFps > 0 && this.estimate > 0 ? this.estimate / targetFps : 0
    return { mode: this.currentMode, forced: this.options.forceFlow, sourceFps: Math.round(this.estimate * 100) / 100,
      targetFps, ratio: Math.round(ratio * 1000) / 1000, samples: this.samples, transitions: this.transitions,
      reason: this.reason }
  }

  private switchTo(mode: InterpolationDemandMode) {
    if (mode !== this.currentMode) this.transitions++
    this.currentMode = mode
    this.clearEvidence()
  }
  private median() {
    const sorted = [...this.recent].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  }
  private clearEvidence() { this.clearSkip(); this.clearResume() }
  private clearSkip() { this.skipSince = 0; this.skipSamples = 0 }
  private clearResume() { this.resumeSince = 0; this.resumeSamples = 0 }
}

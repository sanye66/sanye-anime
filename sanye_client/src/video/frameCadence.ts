export const FRAME_RATE_OPTIONS = [60, 90, 120, 144, 165, 240] as const
export type FrameRateTarget = 'auto' | typeof FRAME_RATE_OPTIONS[number]
export type CadenceBottleneck = 'none' | 'delivery' | 'flow' | 'enhancement' | 'render'

/**
 * 显式帧率档只列出设备屏幕能显示的档位（安卓端菜单用）。
 *
 * 高于刷新能力的档位生成出来的帧看不到，只会白占 GPU 与电量；自动档本来就按刷新能力定档
 * （`FrameCadence.ceiling`），所以显式档位里删掉这些值不会丢掉高刷能力。
 * 刷新能力未知时保守地只保留 60，由自动档在运行时按实测刷新率定档。
 */
export function frameRateTargetsForDisplay(displayHz: number): FrameRateTarget[] {
  const refresh = Number.isFinite(displayHz) && displayHz > 0 ? displayHz : 60
  return FRAME_RATE_OPTIONS.filter((fps) => fps <= refresh * 1.04 + 0.5)
}

export interface CadenceSample {
  outputFps: number
  gpuMs: number
  computeMs?: number
  enhancementMs?: number
  enhancementQueueDepth?: number
  sourceFps?: number
  missedPairs?: number
  droppedSourceFrames?: number
  frameIntervalP95Ms?: number
  scheduleLateP95Ms?: number
  renderTickP95Ms?: number
  longFrameRatio?: number
}

export class FrameCadence {
  target: number
  reason = ''
  bottleneck: CadenceBottleneck = 'none'
  private displayRefreshHz = 0
  private pendingLowerHz = 0
  private pendingLowerSamples = 0
  private slow = 0
  /** 本播放段是否已经因压力降过档；降档后不再回升，直到下一个播放段（VQ-32）。 */
  private downgraded = false
  private warmup = 2
  /** 请求档位。刻意不用参数属性：类型擦除模式下 node 可以直接导入本模块做纯逻辑单测。 */
  readonly requested: FrameRateTarget
  constructor(requested: FrameRateTarget = 'auto') {
    this.requested = requested
    this.target = requested === 'auto' ? 120 : requested
  }
  get displayHz() { return this.displayRefreshHz }
  /**
   * 目标帧率上限：自动档取刷新能力与 165 档中的较小者，显式档位沿用用户请求。
   *
   * 显式档位高于刷新能力时（VQ-31）按刷新边界提交，可观察呈现仍受刷新上限约束，生成帧率只作为
   * 处理能力口径报告；自动档不主动越过刷新能力，避免在用户没有指定目标时白做无效生成。
   */
  get ceiling() {
    if (this.requested !== 'auto') return this.requested
    if (!this.displayRefreshHz) return 120
    return [...FRAME_RATE_OPTIONS].reverse().find(fps => fps <= 165 && fps <= this.displayRefreshHz * 1.04) ?? 60
  }
  observeDisplay(hz: number) {
    if (!Number.isFinite(hz) || hz < 24 || hz > 500) return
    // 首次采样立即生效；后续低估需要重复确认，避免一次掉帧把高刷屏误判为低刷屏。
    if (this.requested === 'auto' && this.displayRefreshHz && hz < this.displayRefreshHz * 0.9) {
      if (this.pendingLowerHz && Math.abs(hz - this.pendingLowerHz) < this.pendingLowerHz * 0.1) {
        if (++this.pendingLowerSamples < 2) return
      } else {
        this.pendingLowerHz = hz
        this.pendingLowerSamples = 1
        return
      }
    }
    this.pendingLowerHz = 0
    this.pendingLowerSamples = 0
    this.displayRefreshHz = hz
    // 自动档跟随刷新能力：还没因压力降档时直接把目标对齐到能力上限，用户不需要为此改档；
    // 已经降档的会话只保留当时可用档位，避免呈现节奏随刷新上报来回变化（VQ-32 稳定优先）。
    if (this.requested === 'auto' && !this.downgraded) { this.target = this.ceiling; this.slow = 0; return }
    if (this.target > this.ceiling) { this.target = this.ceiling; this.slow = 0; this.downgraded = true }
  }
  observe(sampleOrOutputFps: CadenceSample | number, legacyGpuMs = 0) {
    const sample: CadenceSample = typeof sampleOrOutputFps === 'number'
      ? { outputFps: sampleOrOutputFps, gpuMs: legacyGpuMs }
      : sampleOrOutputFps
    if (this.warmup-- > 0) return
    const renderBudget = 1000 / this.target
    const sourceBudget = 1000 / Math.max(sample.sourceFps || 30, 24)
    const deliveryEvidence = (sample.missedPairs || 0) > Math.max(3, this.target * 0.12)
    const outputPressure = sample.outputFps < this.target * 0.9
    // 展示对齐后中间间隔会按刷新周期交替，长帧比例比 P95 间隔更能反映真实退化。
    const frameIntervalP95Ms = sample.frameIntervalP95Ms || 0
    const jittered = sample.longFrameRatio === undefined
      ? frameIntervalP95Ms > renderBudget * 1.2
      : sample.longFrameRatio > 0.05
    const intervalPressure = sample.longFrameRatio === undefined
      ? frameIntervalP95Ms > renderBudget * 1.35
      : sample.longFrameRatio > 0.1
    const renderPressure = sample.gpuMs > renderBudget * 0.82
      || (sample.renderTickP95Ms || 0) > renderBudget * 0.5
      || (outputPressure && ((sample.scheduleLateP95Ms || 0) > renderBudget * 0.5
        || (!deliveryEvidence && intervalPressure)))
    const flowPressure = (sample.computeMs || 0) > sourceBudget * 0.58
      || (sample.droppedSourceFrames || 0) >= 2
    const enhancementPressure = (sample.enhancementMs || 0) > sourceBudget * 0.62
      || (sample.enhancementQueueDepth || 0) >= 6
    const deliveryPressure = deliveryEvidence
      && !renderPressure && !flowPressure && !enhancementPressure
    this.bottleneck = renderPressure ? 'render'
      : enhancementPressure ? 'enhancement'
        : flowPressure ? 'flow'
          : deliveryPressure ? 'delivery' : 'none'
    const overloaded = renderPressure || (outputPressure && !deliveryPressure && !flowPressure && !enhancementPressure)
    this.slow = overloaded ? this.slow + 1 : 0
    if (this.slow >= 2) {
      // 降档只由「渲染或呈现持续不足」触发；可持续帧率按实测输出与单帧耗时估计。
      const sustainable = Math.min(sample.outputFps / 0.96, sample.gpuMs > 0 ? 820 / sample.gpuMs : Infinity,
        jittered && frameIntervalP95Ms ? 1200 / frameIntervalP95Ms : Infinity)
      const lower = [...FRAME_RATE_OPTIONS].reverse().find(fps => fps < this.target && fps <= sustainable) ?? 60
      if (lower !== this.target) {
        this.target = lower
        this.downgraded = true
        this.reason = this.bottleneck === 'render' ? '渲染帧预算不足，已稳定目标帧率' : '处理预算不足，已稳定目标帧率'
      }
      this.slow = 0
    } else if (deliveryPressure) {
      this.reason = '输入帧供给波动，保持目标帧率'
    } else if (flowPressure) {
      this.reason = '运动分析耗时较高'
    } else if (enhancementPressure) {
      this.reason = '画质增强占用较高，正在稳定输出'
    } else if (!this.reason.includes('已稳定')) {
      this.reason = ''
    }
  }
  /**
   * 重置统计。`restore` 为真表示这是新的播放段（起播、定位、换源、尺寸变化），回到请求档位与
   * 刷新能力允许的目标；为假表示内部重建（例如画质档位降档），保留已经稳定下来的目标帧率，
   * 否则每次降画质都会把帧率目标顶回上限，形成“降画质→帧率回档→再超载”的循环（VQ-32）。
   */
  reset(restore = true) {
    if (restore) {
      this.target = this.requested === 'auto' ? this.ceiling : Math.min(this.requested, this.ceiling)
      this.downgraded = false
    }
    this.warmup = 2; this.slow = 0
    this.bottleneck = 'none'; this.reason = ''
  }
}

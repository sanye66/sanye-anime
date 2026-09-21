export const FRAME_RATE_OPTIONS = [60, 90, 120, 144, 165, 240] as const
export type FrameRateTarget = 'auto' | typeof FRAME_RATE_OPTIONS[number]
export type CadenceBottleneck = 'none' | 'delivery' | 'flow' | 'enhancement' | 'render'

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
  private slow = 0
  private stable = 0
  private warmup = 2
  constructor(readonly requested: FrameRateTarget = 'auto') { this.target = requested === 'auto' ? 120 : requested }
  get displayHz() { return this.displayRefreshHz }
  get ceiling() {
    if (this.requested !== 'auto') return this.requested
    if (!this.displayRefreshHz) return 120
    return [...FRAME_RATE_OPTIONS].reverse().find(fps => fps <= 165 && fps <= this.displayRefreshHz * 1.04) ?? 60
  }
  observeDisplay(hz: number) {
    if (!Number.isFinite(hz) || hz < 24 || hz > 500) return
    this.displayRefreshHz = hz
    if (this.target > this.ceiling) { this.target = this.ceiling; this.slow = this.stable = 0 }
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
    const paced = !deliveryPressure && !flowPressure && !enhancementPressure && !renderPressure
      && sample.outputFps >= this.target * 0.96 && !jittered
    this.stable = paced ? this.stable + 1 : 0
    if (this.slow >= 2) {
      const sustainable = Math.min(sample.outputFps / 0.96, sample.gpuMs > 0 ? 820 / sample.gpuMs : Infinity,
        jittered && frameIntervalP95Ms ? 1200 / frameIntervalP95Ms : Infinity)
      const lower = [...FRAME_RATE_OPTIONS].reverse().find(fps => fps < this.target && fps <= sustainable) ?? 60
      if (lower !== this.target) {
        this.target = lower
        this.reason = this.bottleneck === 'render' ? '渲染帧预算不足，已稳定目标帧率' : '处理预算不足，已稳定目标帧率'
      }
      this.slow = this.stable = 0
    } else if (this.stable >= 20 && this.target < this.ceiling) {
      const higher = FRAME_RATE_OPTIONS.find(fps => fps > this.target && fps <= this.ceiling)
      if (higher && sample.gpuMs < 1000 / higher * 0.65) { this.target = higher; this.reason = '' }
      this.stable = 0
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
  reset() {
    this.target = Math.min(this.requested === 'auto' ? 120 : this.requested, this.ceiling)
    this.warmup = 2; this.slow = this.stable = 0
    this.bottleneck = 'none'; this.reason = ''
  }
}

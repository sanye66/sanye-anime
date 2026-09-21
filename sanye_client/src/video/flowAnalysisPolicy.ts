export const FLOW_ANALYSIS_WIDTHS = [128, 192, 256, 384] as const

const DEMOTION_UTILIZATION = 0.58
const DEMOTION_SAMPLES = 8
const PROMOTION_PROJECTED_UTILIZATION = 0.48
const PROMOTION_SAMPLES = 120
const PROMOTION_COOLDOWN_SAMPLES = 240
const RETRY_IMPROVEMENT = 0.8
const COMPUTE_AVERAGE_WEIGHT = 0.15

export class FlowAnalysisPolicy {
  private level = 0
  private slow = 0
  private fast = 0
  private warmup = 4
  private promotionCooldown = 0
  private averageComputeMs = 0
  private promotionBaselines = new Map<number, number>()
  private retryCeilings = new Map<number, number>()

  get targetWidth() { return FLOW_ANALYSIS_WIDTHS[this.level] }

  widthFor(sourceWidth: number) {
    return Math.max(1, Math.min(sourceWidth, this.targetWidth))
  }

  observe(computeMs: number, sourceFps: number) {
    if (!Number.isFinite(computeMs) || computeMs <= 0) return this.targetWidth
    const sourceBudget = 1000 / Math.max(Number.isFinite(sourceFps) ? sourceFps : 30, 30)
    if (this.warmup > 0) { this.warmup--; return this.targetWidth }
    this.averageComputeMs = this.averageComputeMs === 0
      ? computeMs
      : this.averageComputeMs * (1 - COMPUTE_AVERAGE_WEIGHT) + computeMs * COMPUTE_AVERAGE_WEIGHT
    const utilization = this.averageComputeMs / sourceBudget
    const currentUtilization = computeMs / sourceBudget
    this.slow = currentUtilization > DEMOTION_UTILIZATION ? this.slow + 1 : Math.max(0, this.slow - 1)
    if (this.promotionCooldown > 0) this.promotionCooldown--

    const nextLevel = this.level + 1
    const scale = nextLevel < FLOW_ANALYSIS_WIDTHS.length
      ? FLOW_ANALYSIS_WIDTHS[nextLevel] / FLOW_ANALYSIS_WIDTHS[this.level]
      : Number.POSITIVE_INFINITY
    const retryCeiling = this.retryCeilings.get(nextLevel) ?? Number.POSITIVE_INFINITY
    const hasPromotionHeadroom = utilization * scale * scale < PROMOTION_PROJECTED_UTILIZATION
      && this.averageComputeMs <= retryCeiling
    this.fast = this.promotionCooldown === 0 && hasPromotionHeadroom
      ? this.fast + 1
      : Math.max(0, this.fast - 1)

    if (this.slow >= DEMOTION_SAMPLES && this.level > 0) {
      const rejectedLevel = this.level
      const promotionBaseline = this.promotionBaselines.get(rejectedLevel)
      if (promotionBaseline !== undefined) this.retryCeilings.set(rejectedLevel, promotionBaseline * RETRY_IMPROVEMENT)
      this.level--
      this.slow = this.fast = 0
      this.promotionCooldown = PROMOTION_COOLDOWN_SAMPLES
    } else if (this.fast >= PROMOTION_SAMPLES && nextLevel < FLOW_ANALYSIS_WIDTHS.length) {
      this.promotionBaselines.set(nextLevel, this.averageComputeMs)
      this.retryCeilings.delete(nextLevel)
      this.level++
      this.slow = this.fast = 0
    }
    return this.targetWidth
  }

  reset(preserveLevel = true) {
    if (!preserveLevel) {
      this.level = 0
      this.promotionCooldown = 0
      this.promotionBaselines.clear()
      this.retryCeilings.clear()
    }
    this.slow = this.fast = 0
    this.warmup = 4
    this.averageComputeMs = 0
  }
}

export const FLOW_ANALYSIS_WIDTHS = [128, 192, 256, 384] as const

export interface FlowAnalysisOptions {
  /**
   * 运动分析网格宽度上限。手机端在同等片源下比桌面更容易超预算，收窄上限可以避免
   * 白升到 256/384 后再被降回来；不传则沿用全部四档的默认行为。
   *
   * 上限在运行期可调（VQ-49）：运动估计换成 GPU 常驻管线后逐帧成本远低于 CPU，允许在实测
   * 有余量时升到更细的网格；升降都只改上限，实际档位仍由余量门控与降档判据决定。
   */
  maxWidth?: number
}

const DEMOTION_UTILIZATION = 0.58
const DEMOTION_SAMPLES = 8
const PROMOTION_PROJECTED_UTILIZATION = 0.48
const PROMOTION_SAMPLES = 120
const PROMOTION_COOLDOWN_SAMPLES = 240
const RETRY_IMPROVEMENT = 0.8
const COMPUTE_AVERAGE_WEIGHT = 0.15
// 升档样本数按余量分级：投影利用率离升档线越远，需要的样本越少。
// 1080p 源在 128 宽度下整个画面只有约 60 个运动向量（间距 12）；有余量的机器
// 却要等满 120 个样本才升档，起播前几秒因此停在最粗网格。
// 余量接近升档线时仍要求长样本，避免升到立刻超预算的档位后又被降回来。
const PROMOTION_SAMPLES_MIN = 12
const PROMOTION_HEADROOM_CURVE = 3

export class FlowAnalysisPolicy {
  private level = 0
  private slow = 0
  private fast = 0
  private warmup = 4
  private promotionCooldown = 0
  private averageComputeMs = 0
  private promotionBaselines = new Map<number, number>()
  private retryCeilings = new Map<number, number>()
  private maxWidth: number

  constructor(options: FlowAnalysisOptions = {}) {
    this.maxWidth = normalizeMaxWidth(options.maxWidth)
  }

  get targetWidth() { return Math.min(FLOW_ANALYSIS_WIDTHS[this.level], this.maxWidth) }

  /** 后端或平台上限变化时重设上限：降上限立即让 `targetWidth` 回落到界内，升上限仍受余量门控。 */
  setMaxWidth(maxWidth?: number) {
    const next = normalizeMaxWidth(maxWidth)
    if (next === this.maxWidth) return
    this.maxWidth = next
    this.slow = this.fast = 0
  }

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
    const promotable = nextLevel < FLOW_ANALYSIS_WIDTHS.length && FLOW_ANALYSIS_WIDTHS[nextLevel] <= this.maxWidth
    const scale = promotable
      ? FLOW_ANALYSIS_WIDTHS[nextLevel] / FLOW_ANALYSIS_WIDTHS[this.level]
      : Number.POSITIVE_INFINITY
    const retryCeiling = this.retryCeilings.get(nextLevel) ?? Number.POSITIVE_INFINITY
    // 投影按「当前样本」与「平滑值」的较大者计算：平滑值滞后会把刚测到的昂贵档位
    // 掩盖掉，先升档再被降回来。降档判据同样使用当前样本，两者口径一致。
    const projected = Math.max(currentUtilization, utilization) * scale * scale
    const hasPromotionHeadroom = projected < PROMOTION_PROJECTED_UTILIZATION
      && this.averageComputeMs <= retryCeiling
    this.fast = this.promotionCooldown === 0 && hasPromotionHeadroom
      ? this.fast + 1
      : Math.max(0, this.fast - 1)
    const marginRatio = Number.isFinite(projected)
      ? Math.min(1, Math.max(0, projected / PROMOTION_PROJECTED_UTILIZATION))
      : 1
    const requiredSamples = Math.max(PROMOTION_SAMPLES_MIN,
      Math.round(PROMOTION_SAMPLES * marginRatio ** PROMOTION_HEADROOM_CURVE))

    if (this.slow >= DEMOTION_SAMPLES && this.level > 0) {
      const rejectedLevel = this.level
      const promotionBaseline = this.promotionBaselines.get(rejectedLevel)
      if (promotionBaseline !== undefined) this.retryCeilings.set(rejectedLevel, promotionBaseline * RETRY_IMPROVEMENT)
      this.level--
      this.slow = this.fast = 0
      this.promotionCooldown = PROMOTION_COOLDOWN_SAMPLES
    } else if (this.fast >= requiredSamples && promotable) {
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

function normalizeMaxWidth(maxWidth?: number) {
  return Number.isFinite(maxWidth) && (maxWidth ?? 0) > 0 ? maxWidth as number : Number.POSITIVE_INFINITY
}

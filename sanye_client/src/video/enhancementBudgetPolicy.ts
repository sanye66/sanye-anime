/**
 * 增强档位的降档与恢复判定（VQ-26）。
 *
 * 旧口径按“连续 3 个慢帧”（30 FPS 下约 100ms）直接降档且不再回到请求档位：一次瞬时抖动
 * 会永久留在低档。这里把降档改成**按墙钟时间的持续预算压力**，并给恢复加上冷却窗口与稳定
 * 样本门槛：
 *
 * - 持续压力段从第一个超预算样本开始累计，只有连续两个有余量样本才判定“已经恢复”，因此
 *   增强队列的周期性排空不会中断计数，而过载管线本身被节流（每秒只剩数个样本）也不会漏判。
 * - 压力段必须同时覆盖 `pressureMs` 的墙钟时长且包含 `minPressureSamples` 个样本才降档；
 *   健康管线里的瞬时尖峰在几十毫秒后就会被有余量样本结束，达不到时长门槛。
 * - 恢复需要先经过冷却窗口（`cooldownMs`），再连续积累 `stableMs` 的有余量样本；恢复到
 *   请求档位后很快再次降档记为一次恢复失败，冷却按次翻倍直到 `maxCooldownMs`，保证恢复过程
 *   有界且不出现档位往返振荡。
 *
 * 档位本身（请求档位、实际档位、可恢复上限）由调用方维护，本类只输出 `hold` / `downgrade`
 * / `recover` 动作，便于在无 GPU 环境下直接验证判定语义。
 */
export type EnhancementBudgetAction = 'hold' | 'downgrade' | 'recover'

export interface EnhancementPressureSample {
  /** 采样时刻，与 `pressureMs`、`cooldownMs`、`stableMs` 使用同一时钟（毫秒）。 */
  nowMs: number
  /** 最近一次测得的增强耗时；未启用重档位或平台不可测时为 0。 */
  enhancementMs: number
  /** 当前源帧率与倍速下的单帧预算。 */
  budgetMs: number
  /** 待完成增强查询数量，用于在没有耗时读数的平台上判断积压。 */
  queueDepth: number
  /** 当前实际档位低于可恢复上限时为真；否则不会返回 `recover`。 */
  recoveryArmed: boolean
}

export interface EnhancementBudgetOptions {
  /** 判定持续压力所需的墙钟时长。 */
  pressureMs?: number
  /** 压力段内至少需要的样本数，避免长时间没有样本时仅凭间隔降档。 */
  minPressureSamples?: number
  /** 结束压力段所需的连续有余量样本数。 */
  resumeSamples?: number
  /** 单样本增强耗时相对单帧预算的降档阈值。 */
  enhancementRatio?: number
  /** 增强队列积压的降档阈值。 */
  queueDepthLimit?: number
  /** 单样本增强耗时相对单帧预算的恢复上限，必须明显低于 `enhancementRatio`。 */
  headroomRatio?: number
  /** 降档后的最短冷却时间。 */
  cooldownMs?: number
  /** 恢复失败退避后的冷却上限。 */
  maxCooldownMs?: number
  /** 恢复所需的连续有余量时长。 */
  stableMs?: number
  /** 恢复所需的连续有余量样本数。 */
  minStableSamples?: number
  /** 恢复后多久内再次降档视为该次恢复失败。 */
  failureGraceMs?: number
}

const DEFAULTS: Required<EnhancementBudgetOptions> = {
  pressureMs: 800,
  minPressureSamples: 3,
  resumeSamples: 2,
  enhancementRatio: 0.62,
  queueDepthLimit: 6,
  headroomRatio: 0.45,
  cooldownMs: 5000,
  maxCooldownMs: 60000,
  stableMs: 3000,
  minStableSamples: 20,
  failureGraceMs: 20000,
}

export class EnhancementBudgetPolicy {
  private readonly options: Required<EnhancementBudgetOptions>
  private pressureSince = 0
  private pressureSamples = 0
  private resumedSamples = 0
  private stableSince = 0
  private stableSamples = 0
  private lastChangeAtMs = -Infinity
  private lastRecoveryAtMs = -Infinity
  private failures = 0

  constructor(options: EnhancementBudgetOptions = {}) { this.options = { ...DEFAULTS, ...options } }

  /** 相邻两次恢复所需的最小间隔；恢复失败一次翻倍，直到上限。 */
  get cooldownMs() { return Math.min(this.options.cooldownMs * 2 ** this.failures, this.options.maxCooldownMs) }
  /** 连续恢复失败次数，用于报告与验收。 */
  get consecutiveFailures() { return this.failures }

  observe(sample: EnhancementPressureSample): EnhancementBudgetAction {
    const now = sample.nowMs
    const over = this.overBudget(sample)
    if (over) {
      if (!this.pressureSince) this.pressureSince = now
      this.pressureSamples++
      this.resumedSamples = 0
    } else if (this.pressureSince && ++this.resumedSamples >= this.options.resumeSamples) this.endPressure()

    const canRecover = sample.recoveryArmed && now - this.lastChangeAtMs >= this.cooldownMs
    if (over || !canRecover) {
      this.clearStable()
      if (over && this.pressureSince && now - this.pressureSince >= this.options.pressureMs
        && this.pressureSamples >= this.options.minPressureSamples) {
        // 一次持续压力段只降一档；调用方执行降档后仍需重新累积下一段。
        this.endPressure()
        return 'downgrade'
      }
      return 'hold'
    }
    if (!this.hasHeadroom(sample)) { this.clearStable(); return 'hold' }
    if (!this.stableSince) { this.stableSince = now; this.stableSamples = 1 }
    else this.stableSamples++
    if (now - this.stableSince >= this.options.stableMs && this.stableSamples >= this.options.minStableSamples) {
      // 一次稳定窗口只提出一次恢复；调用方执行恢复后仍需重新累积下一次窗口。
      this.clearStable()
      return 'recover'
    }
    return 'hold'
  }

  /** 实际档位下调后调用；恢复后短时间内再次降档记为一次恢复失败并延长冷却。 */
  noteDowngrade(nowMs: number) {
    this.failures = nowMs - this.lastRecoveryAtMs <= this.options.failureGraceMs ? this.failures + 1 : 0
    this.lastChangeAtMs = nowMs
    this.endPressure()
    this.clearStable()
  }

  /** 实际档位上调后调用；下一次恢复仍要重新走冷却与稳定窗口。 */
  noteRecovery(nowMs: number) {
    this.lastRecoveryAtMs = this.lastChangeAtMs = nowMs
    this.endPressure()
    this.clearStable()
  }

  /** 时间轴重置（定位、循环、换源、尺寸变化）只丢弃连续采样，冷却与退避继续有效。 */
  reset() {
    this.endPressure()
    this.clearStable()
  }

  /** 当前压力段汇总，用于说明“为什么降档或没有降档”，不改变判定状态。 */
  snapshot(nowMs: number) {
    return { samples: this.pressureSamples, spanMs: this.pressureSince ? Math.max(0, nowMs - this.pressureSince) : 0,
      cooldownMs: Math.round(this.cooldownMs), failures: this.failures }
  }

  private endPressure() { this.pressureSince = 0; this.pressureSamples = 0; this.resumedSamples = 0 }
  private clearStable() { this.stableSince = 0; this.stableSamples = 0 }
  private overBudget(sample: EnhancementPressureSample) {
    return (sample.enhancementMs > 0 && sample.enhancementMs > sample.budgetMs * this.options.enhancementRatio)
      || sample.queueDepth >= this.options.queueDepthLimit
  }
  private hasHeadroom(sample: EnhancementPressureSample) {
    return sample.queueDepth <= 1
      && (sample.enhancementMs <= 0 || sample.enhancementMs <= sample.budgetMs * this.options.headroomRatio)
  }
}

/**
 * 增强档位的降档判定（VQ-26 建立，VQ-32 收敛为单向）。
 *
 * 旧口径按“连续 3 个慢帧”（30 FPS 下约 100ms）直接降档且不再回到请求档位：一次瞬时抖动
 * 会永久留在低档。这里把降档改成**按墙钟时间的持续预算压力**：
 *
 * - 持续压力段从第一个超预算样本开始累计，只有连续两个有余量样本才判定“已经恢复”，因此
 *   增强队列的周期性排空不会中断计数，而过载管线本身被节流（每秒只剩数个样本）也不会漏判。
 * - 压力段必须同时覆盖 `pressureMs` 的墙钟时长且包含 `minPressureSamples` 个样本才降档；
 *   健康管线里的瞬时尖峰在几十毫秒后就会被有余量样本结束，达不到时长门槛。
 *
 * 稳定优先（VQ-32）把“有界恢复”整体去掉：档位在一次会话内**只降不升**。播放中升档会让画面
 * 清晰度反复变化，而且恢复到刚刚证明承载不住的档位后又会再次降档，正是用户反馈的“画面波动”。
 * 需要更高档位时由用户在菜单中选择，那会重建会话并重新评估预算。
 *
 * 档位本身（请求档位、实际档位）由调用方维护，本类只输出 `hold` / `downgrade` 动作，
 * 便于在无 GPU 环境下直接验证判定语义。
 */
export type EnhancementBudgetAction = 'hold' | 'downgrade'

export interface EnhancementPressureSample {
  /** 采样时刻，与 `pressureMs` 使用同一时钟（毫秒）。 */
  nowMs: number
  /** 最近一次测得的增强耗时；未启用重档位或平台不可测时为 0。 */
  enhancementMs: number
  /** 当前源帧率与倍速下的单帧预算。 */
  budgetMs: number
  /** 待完成增强查询数量，用于在没有耗时读数的平台上判断积压。 */
  queueDepth: number
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
}

const DEFAULTS: Required<EnhancementBudgetOptions> = {
  pressureMs: 800,
  minPressureSamples: 3,
  resumeSamples: 2,
  enhancementRatio: 0.62,
  queueDepthLimit: 6,
}

export class EnhancementBudgetPolicy {
  private readonly options: Required<EnhancementBudgetOptions>
  /** 压力段起点；`null` 表示当前没有压力段。不能用 0 当哨兵：0 是合法的 nowMs。 */
  private pressureSince: number | null = null
  private pressureSamples = 0
  private resumedSamples = 0

  constructor(options: EnhancementBudgetOptions = {}) { this.options = { ...DEFAULTS, ...options } }

  observe(sample: EnhancementPressureSample): EnhancementBudgetAction {
    const now = sample.nowMs
    const over = this.overBudget(sample)
    if (over) {
      if (this.pressureSince === null) this.pressureSince = now
      this.pressureSamples++
      this.resumedSamples = 0
    } else if (this.pressureSince !== null && ++this.resumedSamples >= this.options.resumeSamples) this.endPressure()

    if (!over) return 'hold'
    if (this.pressureSince !== null && now - this.pressureSince >= this.options.pressureMs
      && this.pressureSamples >= this.options.minPressureSamples) {
      // 一次持续压力段只降一档；调用方执行降档后仍需重新累积下一段。
      this.endPressure()
      return 'downgrade'
    }
    return 'hold'
  }

  /** 实际档位下调后调用；下一次降档仍需重新累积完整压力段。 */
  noteDowngrade() {
    this.endPressure()
  }

  /** 时间轴重置（定位、循环、换源、尺寸变化）只丢弃连续采样。 */
  reset() {
    this.endPressure()
  }

  /** 当前压力段汇总，用于说明“为什么降档或没有降档”，不改变判定状态。 */
  snapshot(nowMs: number) {
    return { samples: this.pressureSamples, spanMs: this.pressureSince === null ? 0 : Math.max(0, nowMs - this.pressureSince) }
  }

  private endPressure() { this.pressureSince = null; this.pressureSamples = 0; this.resumedSamples = 0 }
  private overBudget(sample: EnhancementPressureSample) {
    return (sample.enhancementMs > 0 && sample.enhancementMs > sample.budgetMs * this.options.enhancementRatio)
      || sample.queueDepth >= this.options.queueDepthLimit
  }
}

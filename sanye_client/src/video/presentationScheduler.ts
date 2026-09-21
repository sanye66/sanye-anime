export type PresentationMode = 'display' | 'timer'
/**
 * 计时器时钟的对齐口径（VQ-31）。
 *
 * `deadline`：只按理想截止时刻唤醒，脚本计时器何时交付就在何时提交（既有行为）。
 * `refresh`：目标高于刷新能力但仍能拿到刷新边界时，改在刷新边界提交，并把边界前已到期的
 *   时隙按各自理想时刻补齐（有上界）。生成帧率仍按目标帧率，被呈现的那一帧则恰好落在边界上。
 */
export type PresentationAlignment = 'deadline' | 'refresh'

export interface PresentationWindow {
  mode: PresentationMode
  alignment: PresentationAlignment
  refreshHz: number
  refreshTicks: number
  boundaryTicks: number
  timerWakeups: number
  earlyWakeups: number
  renderSlots: number
  skippedSlots: number
  starvation: number
  refreshConfirmed: boolean
}

const usableRefresh = (hz: number) => Number.isFinite(hz) && hz >= 24 && hz <= 500

/**
 * 展示时钟口径。
 *
 * display：以 Worker 动画帧回调作为屏幕刷新时隙，按 目标帧率 / 刷新率 的比例决定哪些刷新绘制。
 *   比例不是整数倍时，每个绘制仍落在刷新边界上，只是呈现间隔按刷新周期交替；不再用高频计时器
 *   或消息脉冲抢截止时间，也不再让计时器抖动决定提交时刻。
 * timer：目标帧率高于刷新能力，或刷新回调没有实际交付时，用单个自校正计时器按截止时间相位推进。
 *   错过的时隙只向前跳跃，不做批量追赶，避免同一帧周期内连续提交近似重复的画面。
 */
export class PresentationScheduler {
  mode: PresentationMode = 'timer'
  alignment: PresentationAlignment = 'deadline'
  refreshHz = 0
  refreshTicks = 0
  /** 对齐模式下由刷新边界驱动的唤醒次数。 */
  boundaryTicks = 0
  timerWakeups = 0
  earlyWakeups = 0
  renderSlots = 0
  skippedSlots = 0
  starvation = 0
  refreshConfirmed = false

  private target = 120
  private observedHz = 0
  private refreshMs = 0
  private ratio = 1
  private interval = 1000 / 120
  private refreshIndex = 0
  private renderedIndex = 0
  private ticksSinceAnchor = 0
  private deadline = 0
  private previousRefreshAt = 0
  private refreshSamples: number[] = []
  /**
   * 对齐模式下允许在同一个刷新边界内补齐的时隙数；超过的部分按跳过计入统计。
   * 默认 4 覆盖 60Hz 屏幕上的全部目标档位（240 目标 = 每个刷新周期 4 个时隙）：
   * 目标更高或机器跟不上时仍按跳过处理，继续由既有帧率稳定逻辑降档。
   */
  private readonly alignmentBatchLimit: number

  constructor(alignment: PresentationAlignment = 'deadline', alignmentBatchLimit = 4) {
    this.alignment = alignment
    this.alignmentBatchLimit = Math.max(1, alignmentBatchLimit)
  }

  setAlignment(alignment: PresentationAlignment) {
    if (alignment === this.alignment) return
    this.alignment = alignment
    this.refreshIndex = 0
    this.renderedIndex = 0
    // 相位未定：下一次取时隙时按当时时刻锚定，避免把 0 当成早已过期的截止时刻而在启动时突发补齐。
    this.deadline = Number.NaN
  }

  /** 目标帧率或刷新估计变化后重新决定展示时钟；返回需要重排唤醒方式。 */
  setTarget(targetFps: number, displayHz: number, now: number): boolean {
    const refreshChanged = Math.abs(displayHz - this.observedHz) > Math.max(0.5, this.observedHz * 0.02)
    if (targetFps === this.target && !refreshChanged) return false
    const previousMode = this.mode
    this.target = targetFps
    if (usableRefresh(displayHz)) {
      this.observedHz = displayHz
      this.refreshMs = 1000 / displayHz
    }
    this.interval = 1000 / targetFps
    this.applyMode(now)
    return this.mode !== previousMode
  }

  /** 刷新回调不可交付时锁定计时器时钟；会话重置后重新评估。 */
  confirmDelivery(now: number): boolean {
    if (this.mode !== 'display' || this.refreshConfirmed) return false
    if (this.ticksSinceAnchor >= 3) { this.refreshConfirmed = true; return false }
    this.starvation++
    if (this.starvation < 2) return false
    this.applyMode(now)
    return true
  }

  get guardDelayMs() { return this.refreshMs > 0 ? Math.max(120, this.refreshMs * 8) : 120 }

  /** 运行环境没有刷新回调能力时锁定计时器时钟，不把时隙算成 0 等待。 */
  fallBackToTimer(now: number) {
    this.starvation = Math.max(1, this.starvation)
    this.applyMode(now)
  }

  /** 动画帧回调：返回本次刷新是否需要绘制一帧。 */
  onRefresh(now: number): boolean {
    if (this.mode !== 'display') return false
    this.refreshTicks++
    this.ticksSinceAnchor++
    if (this.previousRefreshAt) {
      const delta = now - this.previousRefreshAt
      // 长任务或停顿不作为样本；中位数抗抖动，时隙比例不随单次回调抖动变化。
      if (delta > this.refreshMs * 0.5 && delta < this.refreshMs * 1.5) {
        this.refreshSamples.push(delta)
        if (this.refreshSamples.length > 32) this.refreshSamples.shift()
        const sorted = [...this.refreshSamples].sort((a, b) => a - b)
        this.refreshMs = sorted[this.refreshSamples.length >> 1]
        this.refreshHz = Math.round(1000 / this.refreshMs * 10) / 10
        // 上报刷新率与实际回调速率相差明显时以实测为准，避免长期按错误比例占用刷新。
        if (this.observedHz > 0 && Math.abs(1000 / this.refreshMs - this.observedHz) > this.observedHz * 0.05) {
          this.observedHz = 1000 / this.refreshMs
          this.applyMode(now)
        }
      }
    }
    this.previousRefreshAt = now
    this.refreshIndex++
    // 1e-6 的吸收量抵消浮点噪声，避免整数比率偶发少画一帧。
    const due = Math.floor(this.refreshIndex * this.ratio + 1e-6)
    if (due <= this.renderedIndex) return false
    this.renderSlots++
    this.renderedIndex = due
    return true
  }

  /** 计时器唤醒：返回下一次唤醒的等待毫秒数，0 表示现在可以绘制。 */
  wait(now: number) {
    if (this.mode !== 'timer') return 0
    if (!Number.isFinite(this.deadline)) return 0
    return Math.max(0, this.deadline - now)
  }

  noteTimerWake() { this.timerWakeups++ }

  noteEarlyWake() { this.earlyWakeups++ }

  /** 刷新边界唤醒（对齐模式）：边界本身就是提交时刻，单独计数以便与计时器唤醒区分。 */
  noteBoundaryWake() { this.boundaryTicks++ }

  /** 绘制前推进到当前时隙，返回相对刚过期时隙的迟到毫秒数。 */
  advanceTimer(now: number) {
    return this.takeDueSlots(now, 1).lateMs
  }

  /**
   * 取走到期时隙：返回每个时隙的理想提交时刻，最多 `maxSlots` 个。
   * 超过上界的到期时隙只推进截止时刻并计入 `skippedSlots`，不做无界追赶。
   */
  takeDueSlots(now: number, maxSlots = this.alignmentBatchLimit) {
    if (!Number.isFinite(this.deadline)) this.deadline = now
    const slots: number[] = []
    const limit = Math.max(1, maxSlots)
    while (slots.length < limit && this.deadline <= now + 1e-6) {
      slots.push(this.deadline)
      this.deadline += this.interval
    }
    let missed = 0
    if (this.deadline <= now + 1e-6) {
      missed = Math.max(0, Math.floor((now - this.deadline) / this.interval)) + 1
      this.deadline += missed * this.interval
    }
    this.skippedSlots += missed
    this.renderSlots += slots.length
    const last = slots.at(-1)
    // 迟到量按最晚一个到期时隙计算：它才是本批里最接近当前时刻、将被提交的内容。
    return { slots, lateMs: last === undefined ? 0 : Math.max(0, now - last) }
  }

  takeWindow(): PresentationWindow {
    const window: PresentationWindow = { mode: this.mode, alignment: this.alignment, refreshHz: this.refreshHz,
      boundaryTicks: this.boundaryTicks,
      refreshTicks: this.refreshTicks, timerWakeups: this.timerWakeups, earlyWakeups: this.earlyWakeups,
      renderSlots: this.renderSlots, skippedSlots: this.skippedSlots, starvation: this.starvation,
      refreshConfirmed: this.refreshConfirmed }
    this.refreshTicks = this.boundaryTicks = this.timerWakeups = this.earlyWakeups = 0
    this.renderSlots = this.skippedSlots = 0
    return window
  }

  reset(now: number) {
    this.takeWindow()
    this.starvation = 0
    this.refreshConfirmed = false
    this.refreshSamples = []
    this.applyMode(now)
  }

  private applyMode(now: number) {
    this.refreshHz = this.refreshMs > 0 ? Math.round(1000 / this.refreshMs * 10) / 10 : 0
    const displayCapable = this.observedHz > 0 && this.refreshMs > 0 && this.target <= this.observedHz * 1.04
    this.mode = displayCapable && this.starvation === 0 ? 'display' : 'timer'
    this.refreshIndex = 0
    this.renderedIndex = 0
    this.ticksSinceAnchor = 0
    this.previousRefreshAt = 0
    this.deadline = now
    // 时隙比例只用稳定的上报刷新率，避免实测抖动让比例在 1 附近来回跳动。
    this.ratio = this.observedHz > 0 ? this.target / this.observedHz : 1
  }

}

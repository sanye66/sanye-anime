/**
 * 判定静默窗口（VQ-51）。
 *
 * 放大/退出放大、旋转屏幕、窗口尺寸变化都会重建呈现表面，紧跟的几帧必然超预算。
 * 帧率目标与画质档的降档在一个播放段内不回升，所以这段一次性的重建开销必须排除在
 * 「持续不足」的判定之外，否则用户看到的就是「全屏之后画质帧率下降很多」。
 *
 * 只做时间窗口判定，不持有任何策略状态：窗口一过，判定照旧，真的撑不住仍会降档。
 */
export class JudgementGrace {
  /** 窗口上限：防止调用方误传超大时长把护栏整体关掉。 */
  static readonly maxMs = 10_000
  private until = 0

  /** 从 nowMs 起静默 ms 毫秒；负数与非法值按 0 处理，超长按上限截断。 */
  defer(nowMs: number, ms: number) {
    const span = Number.isFinite(ms) ? Math.min(Math.max(0, ms), JudgementGrace.maxMs) : 0
    this.until = nowMs + span
  }

  /** 仍在静默窗口内（含边界）：这段时间不喂判定样本。 */
  active(nowMs: number) { return nowMs < this.until }

  /** 窗口结束时刻，便于统计与断言。 */
  get resumeAt() { return this.until }
}

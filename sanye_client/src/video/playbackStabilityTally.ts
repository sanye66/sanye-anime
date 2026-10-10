/**
 * 播放稳定性累计（VQ-58）。
 *
 * 渲染 Worker 的统计窗口每次上报都会把 `contentHolds`／`contentJumps`／`contentBacksteps` 等
 * 计数清零，单次读取只代表一个窗口。用户要求「不出现任何画面抖动」，要回答这个问题就必须把窗口
 * 累加成会话总量。这里只做**只读累计**：不参与任何播放、画质或帧率决策，也不渲染任何 UI。
 *
 * 口径说明（都以「相邻两次提交所呈现的内容时刻」为准）：
 * - `contentHolds`：内容没有前进，画面停在同一时刻；
 * - `contentJumps`：一次跨过多个输出周期，画面跳格；
 * - `contentBacksteps`：内容时间倒退，画面回退；
 * - `contentFreezeRuns`：连续两帧以上未前进的段数，即用户真正能看到的卡断。
 */
import type { InterpolationStats } from './realtimeInterpolation'

export interface PlaybackStabilityTally {
  windows: number
  contentHolds: number
  contentJumps: number
  contentBacksteps: number
  contentFreezeRuns: number
  contentFreezeMaxFrames: number
  contentFreezeFrames: number
  schedulerStarvation: number
  skippedSlots: number
  longRenderTicks: number
  renderTickMaxMs: number
  frameIntervalMaxMs: number
  stallFrames: number
  flowStarvedFrames: number
  flowBorrowedFrames: number
  /** 运动估计后端在窗口之间变化的次数：换后端会改变画面观感，稳定播放期间应为 0。 */
  backendSwitches: number
  /** 画质档降档次数。 */
  qualityDowngrades: number
  lastBackend: string
  lastProfile: string
}

export function createPlaybackStabilityTally(): PlaybackStabilityTally {
  return {
    windows: 0, contentHolds: 0, contentJumps: 0, contentBacksteps: 0,
    contentFreezeRuns: 0, contentFreezeMaxFrames: 0, contentFreezeFrames: 0,
    schedulerStarvation: 0, skippedSlots: 0, longRenderTicks: 0, renderTickMaxMs: 0,
    frameIntervalMaxMs: 0, stallFrames: 0, flowStarvedFrames: 0, flowBorrowedFrames: 0,
    backendSwitches: 0, qualityDowngrades: 0, lastBackend: '', lastProfile: '',
  }
}

const number = (value: number | undefined) => (Number.isFinite(value) ? Math.max(0, value as number) : 0)

export function accumulatePlaybackStabilityTally(
  tally: PlaybackStabilityTally,
  stats: InterpolationStats,
): PlaybackStabilityTally {
  const backend = stats.flowBackend ?? ''
  // 只在两侧都非空时比较：窗口内没有交付运动场时后端为空，那不代表换了后端。
  if (backend && tally.lastBackend && backend !== tally.lastBackend) tally.backendSwitches += 1
  if (backend) tally.lastBackend = backend
  if (stats.effectiveProfile) tally.lastProfile = stats.effectiveProfile
  tally.windows += 1
  tally.contentHolds += number(stats.contentHolds)
  tally.contentJumps += number(stats.contentJumps)
  tally.contentBacksteps += number(stats.contentBacksteps)
  tally.contentFreezeRuns += number(stats.contentFreezeRuns)
  tally.contentFreezeFrames += number(stats.contentFreezeFrames)
  tally.contentFreezeMaxFrames = Math.max(tally.contentFreezeMaxFrames, number(stats.contentFreezeMaxFrames))
  tally.schedulerStarvation += number(stats.schedulerStarvation)
  tally.skippedSlots += number(stats.skippedSlots)
  tally.longRenderTicks += number(stats.longRenderTicks)
  tally.renderTickMaxMs = Math.max(tally.renderTickMaxMs, number(stats.renderTickMaxMs))
  tally.frameIntervalMaxMs = Math.max(tally.frameIntervalMaxMs, number(stats.frameIntervalMaxMs))
  tally.stallFrames += number(stats.stallFrames)
  tally.flowStarvedFrames += number(stats.flowStarvedFrames)
  tally.flowBorrowedFrames += number(stats.flowBorrowedFrames)
  if (stats.qualityChange === 'downgrade') tally.qualityDowngrades += 1
  return tally
}

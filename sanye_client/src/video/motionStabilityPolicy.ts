/**
 * 运动估计后端稳定性护栏（VQ-49，VQ-55 起区分「迟到」与「错」）。
 *
 * 背景：GPU 常驻运动估计在平坦与渐变区域曾出现「按相位硬切换原帧」的可见波动，VQ-45 已按
 * 全局平移 + 置信度修正，真实片源与跨设备观感仍缺证据。安卓端默认先试 GPU，这里给它一个
 * 可复核的自愈边界。
 *
 * VQ-55 修正的误判：GPU 光流是异步的，运动场往返期间渲染器会短暂拿不到场。旧实现此时退回
 * 「按相位输出最近一张原帧」，于是内容时间先停住（hold）再跳一格（jump）——护栏把这种**迟到**
 * 造成的抖动读成 GPU 光流**不稳**，一旦连续两个脏窗口就整会话切回 CPU（实测中位 14–20ms 对
 * GPU 4.4ms），用户的观感是「帧率画质都很差」。现在按证据分流：
 *   - 脏窗口且本窗口有运动场迟到 → 判为**延迟**：先回一次「稳定模式」（收紧分析网格让场更早到达），
 *     稳定模式下仍然迟到才交回 CPU；
 *   - 脏窗口且完全没有迟到 → 判为**场本身不对**：按原口径连续两个脏窗口交回 CPU。
 */

export type MotionBackendVerdict = null | 'retry' | 'cpu'

export interface MotionArtifactSample {
  /** 本窗口的运动估计后端；`''` 表示窗口内没有交付过运动场。 */
  backend: 'webgpu' | 'jsfeat' | ''
  /** 本窗口内相邻提交在媒体时间轴上倒退的次数。 */
  contentBacksteps?: number
  /** 本窗口内一次跨过多个输出周期的提交次数。 */
  contentJumps?: number
  /** 本窗口内运动场迟到（相位受场未到达影响）的次数（VQ-55）。 */
  flowStarvedFrames?: number
}

export interface MotionStabilityOptions {
  /** 连续多少个脏窗口后判定放弃 GPU；默认 2。 */
  strikesToFallback?: number
  /** 单个窗口允许的跨周期跳变次数；达到即算脏窗口，默认 2。 */
  jumpLimit?: number
  /** 是否允许「先回稳定模式再回 CPU」的两段处置；默认允许。 */
  allowConservativeRetry?: boolean
}

export class MotionStabilityPolicy {
  private strikes = 0
  private latencyStrikes = 0
  private retried = false
  private readonly strikesToFallback: number
  private readonly jumpLimit: number
  private readonly allowRetry: boolean

  constructor(options: MotionStabilityOptions = {}) {
    this.strikesToFallback = Math.max(1, Math.floor(options.strikesToFallback ?? 2))
    this.jumpLimit = Math.max(1, Math.floor(options.jumpLimit ?? 2))
    this.allowRetry = options.allowConservativeRetry !== false
  }

  get consecutiveArtifacts() {
    return this.strikes
  }

  /** 因运动场迟到而累积的连续脏窗口数（VQ-55）。 */
  get consecutiveLatencyArtifacts() {
    return this.latencyStrikes
  }

  /** 是否已经用过一次稳定模式重试。 */
  get conservativeRetried() {
    return this.retried
  }

  /**
   * 判定本窗口是否要给后端换一种处置：
   * `null` 继续观察、`'retry'` 切稳定模式重试一次、`'cpu'` 本会话放弃 GPU 交回 CPU 光流。
   */
  observe(sample: MotionArtifactSample): MotionBackendVerdict {
    // 只有 GPU 窗口参与判定：CPU 路径的波动属于另一条链路，交回 CPU 也无从改善。
    if (sample.backend !== 'webgpu') {
      this.strikes = 0
      this.latencyStrikes = 0
      return null
    }
    const backsteps = Math.max(0, Math.floor(sample.contentBacksteps ?? 0))
    const jumps = Math.max(0, Math.floor(sample.contentJumps ?? 0))
    const starved = Math.max(0, Math.floor(sample.flowStarvedFrames ?? 0))
    const dirty = backsteps >= 1 || jumps >= this.jumpLimit
    if (!dirty) {
      // 干净窗口清空连续计数，避免把定位、切镜这类一次性事件误判成后端问题。
      this.strikes = 0
      this.latencyStrikes = 0
      return null
    }
    if (starved > 0) {
      this.strikes = 0
      this.latencyStrikes++
      if (this.allowRetry && !this.retried) {
        // 迟到优先用稳定模式解决（让场更早到达），而不是直接换成慢 3–4 倍的 CPU 光流。
        this.retried = true
        this.latencyStrikes = 0
        return 'retry'
      }
      return this.latencyStrikes >= this.strikesToFallback ? 'cpu' : null
    }
    this.latencyStrikes = 0
    this.strikes++
    return this.strikes >= this.strikesToFallback ? 'cpu' : null
  }

  reset() {
    this.strikes = 0
    this.latencyStrikes = 0
  }
}

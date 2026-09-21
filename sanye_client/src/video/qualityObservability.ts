import type { Anime4KProfile } from './anime4k'

/**
 * VQ-30 画质可观测性。
 *
 * 该模块把两类信息按同一个时间窗口汇总：
 * 1. 页面侧的清晰度档位（HLS 阶梯、生效档位、档位来源与限制条件）；
 * 2. 渲染 Worker 上报的成本证据（`stallFrames`、`analysisWidth`、`qualityFallbacks` 与生效增强档位）。
 *
 * 汇总结果用于解释「当前为什么不是最高档」：档位变化时给瞬时提示，用户需要时通过
 * 播放器清晰度菜单里的说明项再查一次。两者都不新增常驻面板，也不改变任何档位决策。
 */

/** 清晰度档位采样：生效档位、阶梯上限与限制条件。 */
export interface ClarityObservation {
  /** 生效档位序号；`null` 表示当前档位未知。 */
  levelIndex: number | null
  height: number
  bitrate: number
  /** 阶梯中的最高档（可播放的最高清晰度）。 */
  highestHeight: number
  highestBitrate: number
  /** 比当前档高一级的档位与自适应升档所需带宽；没有更高档时为 0。 */
  nextHeight: number
  nextRequiredBps: number
  /** `manual` 表示用户显式选择；`auto` 表示带宽自适应或起播记忆定档。 */
  mode: 'auto' | 'manual'
  /** 播放窗口尺寸上限对应的高度；-1 表示未受限。 */
  capHeight: number
  /** hls.js 的带宽估计（bit/s）；<= 0 表示未知。 */
  bandwidthBps: number
  /** VQ-25 起播记忆回落说明；空字符串表示本窗口没有回落。 */
  startupFallback: string
}

export interface QualityFallback {
  from: Anime4KProfile | 'off'
  to: Anime4KProfile | 'off'
  reason: string
  atMs: number
}

/** 同一窗口内渲染 Worker 报告的成本证据（VQ-26～VQ-29 既有字段）与播放停顿次数。 */
export interface QualityEvidence {
  /** 窗口内落后帧数；没有渲染 Worker 时为 `null`。 */
  stallFrames: number | null
  /** 窗口内运动分析宽度；没有渲染 Worker 时为 `null`。 */
  analysisWidth: number | null
  /** 窗口内媒体等待（缓冲）次数。 */
  awaited: number | null
  effectiveProfile: Anime4KProfile | 'off'
  requestedProfile: Anime4KProfile | 'off'
  qualityFallbacks: QualityFallback[]
}

/** 按窗口汇总的画质记录：实际清晰度档位、非最高档原因与同窗口成本证据。 */
export interface QualityWindow extends ClarityObservation, QualityEvidence {
  atMs: number
  /** 生效清晰度低于阶梯最高档。 */
  belowHighest: boolean
  /** 当前非最高档的原因；已是最高档时为空字符串。 */
  reason: string
  /** 面向用户的说明文案。 */
  summary: string
}

export const QUALITY_WINDOW_MS = 1_000
/** 相邻两次档位提示的最小间隔，避免降档与恢复来回振荡时连续播报。 */
export const QUALITY_NOTICE_COOLDOWN_MS = 5_000
/** 诊断窗口历史长度；只服务自证与测试，不进入界面。 */
export const QUALITY_WINDOW_HISTORY = 30

const PROFILE_LABELS: Record<Anime4KProfile | 'off', string> = {
  off: '关闭', fast: '性能', balanced: '均衡', sharp: '锐化', restore: '修复', upscale: '超分',
}

/** 带宽估计按一位小数展示 Mb/s，避免提示里出现长数字。 */
export function formatBitrate(bps: number) {
  return `${Math.round(bps / 100_000) / 10}Mb/s`
}

/**
 * 非最高档原因：按「用户选择 → 起播记忆回落 → 播放窗口上限 → 带宽 → 播放停顿 → 自适应」的顺序，
 * 取第一个能在同一窗口数据里被证实的原因。
 */
export function describeClarityReason(window: QualityWindow): string {
  if (!window.belowHighest) return ''
  if (window.mode === 'manual') return '手动选择'
  if (window.startupFallback) return window.startupFallback
  if (window.capHeight > 0 && window.capHeight < window.highestHeight) {
    return `播放窗口尺寸上限 ${window.capHeight}P`
  }
  if (window.bandwidthBps > 0 && window.nextRequiredBps > 0 && window.bandwidthBps < window.nextRequiredBps) {
    return `带宽不足：估算 ${formatBitrate(window.bandwidthBps)}，${window.nextHeight}P 档需 ${formatBitrate(window.nextRequiredBps)}`
  }
  if (window.awaited !== null && window.awaited > 0) return `播放中停顿 ${window.awaited} 次`
  if (window.bandwidthBps > 0) return `带宽自适应：估算 ${formatBitrate(window.bandwidthBps)}`
  return '带宽自适应'
}

/** 窗口说明：当前档位、阶梯最高档与非最高档原因。 */
export function describeQualityWindow(window: QualityWindow): string {
  if (window.height <= 0) return '当前清晰度待确认'
  if (!window.belowHighest) return `当前已是最高清晰度 ${window.height}P`
  return `当前 ${window.height}P（最高 ${window.highestHeight}P）：${window.reason}`
}

/** 同窗口成本证据：只有确实出现回退、停顿或分析降规模时才追加，不做常驻罗列。 */
export function describeQualityEvidence(window: QualityWindow): string {
  const parts: string[] = []
  const last = window.qualityFallbacks.at(-1)
  if (last && window.requestedProfile !== window.effectiveProfile) {
    parts.push(`画质当前为${PROFILE_LABELS[window.effectiveProfile]}档（请求${PROFILE_LABELS[window.requestedProfile]}档）：${last.reason}`)
  }
  if (window.stallFrames !== null && window.stallFrames > 0) parts.push(`本窗口落后 ${window.stallFrames} 帧`)
  if (window.analysisWidth !== null && window.analysisWidth > 0) parts.push(`本窗口运动分析宽度 ${window.analysisWidth}`)
  return parts.length ? `；${parts.join('；')}` : ''
}

function emptyEvidence(): QualityEvidence {
  return { stallFrames: null, analysisWidth: null, awaited: null, effectiveProfile: 'off', requestedProfile: 'off',
    qualityFallbacks: [] }
}

export class QualityObservability {
  private observation: ClarityObservation | null = null
  private evidence = emptyEvidence()
  private windowStartedAt = -Infinity
  private windows: QualityWindow[] = []
  private seenNotices = new Set<number>()
  /** 被最小间隔拦下的档位：档位不变时在下一个窗口补齐说明，避免真实降档被静默吞掉。 */
  private pendingNotice: number | null = null
  private lastNoticeAt = -Infinity

  /** 已汇总的画质窗口；页面把它挂到播放器实例上作为诊断通道。 */
  get history(): readonly QualityWindow[] {
    return this.windows
  }

  get latest(): QualityWindow | null {
    return this.windows.at(-1) ?? null
  }

  /**
   * 采样清晰度档位。跨过窗口边界时汇总一个画质窗口，并返回需要展示的瞬时提示；
   * 其余采样只更新当前窗口的状态。
   */
  observeClarity(observation: ClarityObservation, nowMs: number): string {
    this.observation = observation
    if (nowMs - this.windowStartedAt < QUALITY_WINDOW_MS) return ''
    this.windowStartedAt = nowMs
    // 清单解析前还不知道有效档位：不把未知档位写成窗口，避免提示与统计里出现空档位。
    if (observation.height <= 0) {
      this.evidence = emptyEvidence()
      return ''
    }
    const window = this.summarizeWindow(nowMs)
    this.evidence = emptyEvidence()
    if (!window) return ''
    this.windows.push(window)
    while (this.windows.length > QUALITY_WINDOW_HISTORY) this.windows.shift()
    return this.notice(window, nowMs)
  }

  /** 合并渲染 Worker 的统计窗口证据，供下一次窗口汇总使用。 */
  observeStats(stats: Partial<QualityEvidence>) {
    if (typeof stats.stallFrames === 'number') {
      this.evidence.stallFrames = (this.evidence.stallFrames ?? 0) + stats.stallFrames
    }
    if (typeof stats.analysisWidth === 'number' && stats.analysisWidth > 0) this.evidence.analysisWidth = stats.analysisWidth
    if (stats.effectiveProfile) this.evidence.effectiveProfile = stats.effectiveProfile
    if (stats.requestedProfile) this.evidence.requestedProfile = stats.requestedProfile
    if (stats.qualityFallbacks?.length) this.evidence.qualityFallbacks = stats.qualityFallbacks.slice(-3)
  }

  /** 记录一次媒体等待：播放停顿是清晰度回落到较低档的直接证据之一。 */
  noteWaiting() {
    this.evidence.awaited = (this.evidence.awaited ?? 0) + 1
  }

  /**
   * 可查询说明：当前清晰度档位、最高档、非最高档原因，以及同窗口的成本证据。
   * 没有采样到窗口时返回空字符串，由页面决定回退文案。
   */
  explain(): string {
    const latest = this.latest
    if (!latest) return ''
    return `${latest.summary}${describeQualityEvidence(latest)}`
  }

  reset() {
    this.observation = null
    this.evidence = emptyEvidence()
    this.windowStartedAt = -Infinity
    this.windows = []
    this.seenNotices = new Set()
    this.pendingNotice = null
    this.lastNoticeAt = -Infinity
  }

  private summarizeWindow(nowMs: number): QualityWindow | null {
    const observation = this.observation
    if (!observation) return null
    const belowHighest = observation.height > 0 && observation.highestHeight > 0
      && observation.height < observation.highestHeight
    const window: QualityWindow = { ...observation, ...this.evidence, atMs: nowMs, belowHighest, reason: '', summary: '' }
    window.reason = describeClarityReason(window)
    window.summary = describeQualityWindow(window)
    return window
  }

  /**
   * 瞬时提示只在「自动档位确实变了、且结果低于阶梯最高档」时出现：
   * 手动选择由清晰度菜单自己的切换提示说明；同一个高度在回到最高档前只播报一次；
   * 相邻两次播报保留最小间隔，避免恢复与降档振荡时连续弹提示。
   */
  private notice(window: QualityWindow, nowMs: number): string {
    if (!window.belowHighest) {
      this.seenNotices.clear()
      this.pendingNotice = null
      return ''
    }
    const previous = this.windows.at(-2)
    if (window.mode === 'manual') return ''
    if (this.seenNotices.has(window.height)) return ''
    const changed = Boolean(previous && previous.levelIndex !== null && previous.levelIndex !== window.levelIndex)
    // 上一个窗口还不知道有效档位时，本次是首个可比较窗口，不作为档位变化播报。
    if (!changed && this.pendingNotice !== window.height) return ''
    if (nowMs - this.lastNoticeAt < QUALITY_NOTICE_COOLDOWN_MS) {
      this.pendingNotice = window.height
      return ''
    }
    this.pendingNotice = null
    this.seenNotices.add(window.height)
    this.lastNoticeAt = nowMs
    return `清晰度已调整：${window.summary}`
  }
}

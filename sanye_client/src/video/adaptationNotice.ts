import type { InterpolationStats } from './realtimeInterpolation'

export class AdaptationNotice {
  private seen = new Set<string>()
  private lastAt = -Infinity

  next(previous: InterpolationStats | null, current: InterpolationStats, now: number) {
    const qualityChanged = previous
      ? previous.effectiveProfile !== current.effectiveProfile
      : current.effectiveProfile !== current.requestedProfile
    const rateChanged = previous
      ? previous.nextTargetFps !== current.nextTargetFps
      : typeof current.requestedFps === 'number' && current.nextTargetFps !== current.requestedFps
    if (!qualityChanged && !rateChanged) return ''
    const key = `${current.nextTargetFps}:${current.effectiveProfile}`
    if (this.seen.has(key) || now - this.lastAt < 15000) return ''
    // 档位只降不升（VQ-32 稳定优先）：画质变化沿用 Worker 的降档原因，帧率变化沿用帧率策略原因；
    // 清晰度档位与播放窗口证据由 VQ-30 的画质窗口单独归因。
    const message = qualityChanged && current.fallbackReason
      ? '为减少卡顿，已调低增强效果'
      : rateChanged && current.cadenceReason
        ? `为保持流畅，已调整为 ${current.nextTargetFps} 帧/秒` : ''
    if (message) { this.seen.add(key); this.lastAt = now }
    return message
  }
}

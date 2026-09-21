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
    // 有界恢复（VQ-26）不新增提示文案：恢复到请求档位时清空原因，仍低于请求档位时沿用 Worker 的降档原因；
    // 清晰度档位与播放窗口证据由 VQ-30 的画质窗口单独归因。
    const message = qualityChanged && current.qualityChange === 'recovery' ? ''
      : qualityChanged && current.fallbackReason
        ? current.fallbackReason
        : rateChanged && current.cadenceReason
          ? `已平衡播放负载，当前 ${current.nextTargetFps} FPS` : ''
    if (message) { this.seen.add(key); this.lastAt = now }
    return message
  }
}

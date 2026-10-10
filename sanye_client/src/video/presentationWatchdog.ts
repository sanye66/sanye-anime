/**
 * 呈现层看门狗（VQ-53）。
 *
 * 补间画布接管呈现后原画会被隐藏（\`.sanye-realtime-interpolation-active video { opacity: 0 }\`），
 * 于是任何一次「画布被清空或停止推进」都会直接变成用户看到的黑屏／定格：
 * - 重建画布（改 profile、尺寸变化、上下文重建）会清空后备存储；
 * - 线程被系统挂起或丢帧时画布停在上一帧。
 *
 * 判定只用媒体时钟：\`currentTime\` 与「最近真正画上去的媒体时刻」都在同一条时间轴上，
 * 渲染快慢与显示器刷新都不影响结论。容忍量必须覆盖补帧本身的呈现延迟，
 * 否则正常的同步缓冲会被误判成卡住。
 */
export interface PresentationSample {
  /** 媒体元素的当前播放位置（秒）。 */
  currentTime: number
  /** 画布最近一次真正绘制的媒体时刻（秒）；没有绘制过时为 null。 */
  drawnTime: number | null
  /** 是否正在播放；暂停、缓冲与结束都不属于「画布落后」。 */
  playing: boolean
  /** 生效的补帧呈现延迟（毫秒），看门狗要把它算进容忍量。 */
  delayMs: number
}

/** 除补间延迟外额外允许的落后量（毫秒）：一次缓冲、一次尺寸重建都在这个量级内。 */
export const PRESENTATION_LAG_TOLERANCE_MS = 700

export function presentationStale(sample: PresentationSample, toleranceMs = PRESENTATION_LAG_TOLERANCE_MS): boolean {
  if (!sample.playing || sample.drawnTime === null) return false
  const lagMs = (sample.currentTime - sample.drawnTime) * 1000
  return lagMs > Math.max(0, toleranceMs) + Math.max(0, sample.delayMs)
}

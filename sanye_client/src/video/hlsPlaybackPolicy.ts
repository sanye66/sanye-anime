import type { HlsConfig } from 'hls.js'

/** hls.js 的自适应带宽策略；手机控制内存，升清晰度时保留带宽余量。 */
export function hlsPlaybackConfig(mobile: boolean): Partial<HlsConfig> {
  return {
    enableWorker: true,
    lowLatencyMode: false,
    startLevel: -1,
    // 安卓竖屏播放器较小，但用户常会放大到横屏；自动档优先依据带宽选择片源画质。
    capLevelToPlayerSize: !mobile,
    // 高码率档让设备持续掉帧时再收紧上限，避免只追求分辨率而损失流畅度。
    capLevelOnFPSDrop: mobile,
    maxBufferLength: mobile ? 45 : 60,
    maxMaxBufferLength: mobile ? 90 : 120,
    backBufferLength: mobile ? 30 : 60,
    maxBufferSize: (mobile ? 32 : 60) * 1024 * 1024,
    abrBandWidthFactor: 0.9,
    abrBandWidthUpFactor: 0.7,
    abrEwmaFastVoD: 3,
    abrEwmaSlowVoD: 15,
    abrEwmaFastLive: 3,
    abrEwmaSlowLive: 9,
    maxStarvationDelay: 4,
    maxLoadingDelay: 4,
    manifestLoadPolicy: { default: {
      maxTimeToFirstByteMs: 8_000, maxLoadTimeMs: 12_000,
      timeoutRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 2_000 },
      errorRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2_000 },
    } },
    playlistLoadPolicy: { default: {
      maxTimeToFirstByteMs: 8_000, maxLoadTimeMs: 12_000,
      timeoutRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 2_000 },
      errorRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2_000 },
    } },
    fragLoadPolicy: { default: {
      maxTimeToFirstByteMs: 10_000, maxLoadTimeMs: 20_000,
      timeoutRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 2_000 },
      errorRetry: { maxNumRetry: 3, retryDelayMs: 500, maxRetryDelayMs: 4_000 },
    } },
    startFragPrefetch: true,
  }
}

/** 每段播放只有一次解码恢复；持续错误交给既有换线流程。 */
export class HlsMediaRecovery {
  private attempted = false
  attempt(): boolean {
    if (this.attempted) return false
    this.attempted = true
    return true
  }
}

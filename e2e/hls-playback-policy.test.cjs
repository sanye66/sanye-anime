const { test } = require('node:test')
const assert = require('node:assert/strict')

test('手机缓冲占用更低，升清晰度保留带宽余量，加载重试有上限', async () => {
  const { hlsPlaybackConfig } = await import('../sanye_client/src/video/hlsPlaybackPolicy.ts')
  const mobile = hlsPlaybackConfig(true)
  const desktop = hlsPlaybackConfig(false)
  assert.ok(mobile.maxBufferSize < desktop.maxBufferSize)
  assert.ok(mobile.backBufferLength < desktop.backBufferLength)
  assert.ok(mobile.maxMaxBufferLength >= mobile.maxBufferLength)
  assert.ok(mobile.abrBandWidthUpFactor < mobile.abrBandWidthFactor)
  assert.equal(mobile.capLevelToPlayerSize, false, '安卓小窗不应限制自动档可选的清晰度')
  assert.equal(mobile.capLevelOnFPSDrop, true, '高档位造成持续掉帧时允许回退')
  assert.equal(desktop.capLevelToPlayerSize, true, '桌面端保持原有尺寸策略')
  assert.equal(mobile.lowLatencyMode, false)
  for (const key of ['manifestLoadPolicy', 'playlistLoadPolicy', 'fragLoadPolicy']) {
    assert.ok(mobile[key].default.timeoutRetry.maxNumRetry <= 1)
    assert.ok(mobile[key].default.errorRetry.maxNumRetry <= 3)
  }
  mobile.fragLoadPolicy.default.errorRetry.maxNumRetry = 100
  assert.equal(hlsPlaybackConfig(true).fragLoadPolicy.default.errorRetry.maxNumRetry, 3)
})

test('解码故障只恢复一次，新播放会话拥有独立额度', async () => {
  const { HlsMediaRecovery } = await import('../sanye_client/src/video/hlsPlaybackPolicy.ts')
  const recovery = new HlsMediaRecovery()
  assert.equal(recovery.attempt(), true)
  assert.equal(recovery.attempt(), false)
  assert.equal(new HlsMediaRecovery().attempt(), true)
})

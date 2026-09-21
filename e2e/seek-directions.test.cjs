const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const output = path.resolve(__dirname, '../sanye_deploy/.local/seek-performance')
const maximumSeekMs = 1500
const retryDelayMs = 4000

async function prepare(page, startPosition, routeFragment) {
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
  await page.route('**/direction-seek/*', async route => {
    const name = path.basename(new URL(route.request().url()).pathname)
    if (name.endsWith('.ts')) await routeFragment(name, route)
    if (route.request().isNavigationRequest()) throw new Error('Unexpected media navigation')
    await route.fulfill({ path: path.join(output, name), contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl' }).catch(() => {})
  })
  await page.goto(origin)
  await page.evaluate(async ({ startPosition, retryDelayMs }) => {
    const { default: Hls } = await import('/node_modules/.vite/deps/hls__js.js')
    const { installHlsSeekControl } = await import('/src/video/seekControl.ts')
    const video = document.createElement('video')
    video.muted = true
    document.body.replaceChildren(video)
    const hls = new Hls({ startPosition, maxBufferLength: 60, fragLoadPolicy: {
      default: { maxTimeToFirstByteMs: 1000, maxLoadTimeMs: 10000, timeoutRetry: { maxNumRetry: 0, retryDelayMs: 0, maxRetryDelayMs: 0 },
        errorRetry: { maxNumRetry: 2, retryDelayMs, maxRetryDelayMs: retryDelayMs } },
    } })
    window.seekHarness = { video, hls, Hls, events: [] }
    hls.on(Hls.Events.ERROR, (_event, data) => seekHarness.events.push({ detail: data.details, fatal: data.fatal }))
    installHlsSeekControl(video, hls)
    hls.loadSource('/direction-seek/stream.m3u8')
    hls.attachMedia(video)
    await video.play()
  }, { startPosition, retryDelayMs })
}

async function seekAndDecode(page, target) {
  await page.evaluate(target => {
    const { video } = seekHarness
    seekHarness.seek = { target, started: performance.now(), seekedMs: null, decodedMs: null, mediaTime: null }
    video.addEventListener('seeked', () => {
      const result = seekHarness.seek
      if (result.target !== target) return
      result.seekedMs = performance.now() - result.started
      const frame = (_now, metadata) => {
        if (Math.abs(metadata.mediaTime - target) < 0.6) {
          result.decodedMs = performance.now() - result.started
          result.mediaTime = metadata.mediaTime
        } else video.requestVideoFrameCallback(frame)
      }
      video.requestVideoFrameCallback(frame)
    }, { once: true })
    video.currentTime = target
  }, target)
  try {
    await page.waitForFunction(() => seekHarness.seek.decodedMs !== null, null, { timeout: 3500 })
  } catch (error) {
    const state = await page.evaluate(() => ({ seek: seekHarness.seek, time: seekHarness.video.currentTime,
      readyState: seekHarness.video.readyState, seeking: seekHarness.video.seeking, buffered: Array.from({ length: seekHarness.video.buffered.length }, (_, index) =>
        [seekHarness.video.buffered.start(index), seekHarness.video.buffered.end(index)]),
      pending: Object.values(seekHarness.hls.inFlightFragments).map(item => ({ state: item?.state, start: item?.frag?.start })),
      events: seekHarness.events }))
    throw new Error(`${error.message}: ${JSON.stringify(state)}`)
  }
  return page.evaluate(() => ({ ...seekHarness.seek, currentTime: seekHarness.video.currentTime,
    readyState: seekHarness.video.readyState, width: seekHarness.video.videoWidth }))
}

test('forward and backward seeks preempt unrelated slow fragment downloads and decode promptly', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  const results = []
  try {
    for (const scenario of [
      { direction: 'forward', start: 2, slow: 'stream2.ts', target: 8.5 },
      { direction: 'backward', start: 8, slow: 'stream5.ts', target: 2.5 },
    ]) {
      const page = await browser.newPage()
      let releaseSlow
      const slowGate = new Promise(resolve => { releaseSlow = resolve })
      let signalSlow
      const slowRequested = new Promise(resolve => { signalSlow = resolve })
      try {
        await prepare(page, scenario.start, async name => {
          if (name === scenario.slow) { signalSlow(); await slowGate }
        })
        await slowRequested
        await page.waitForFunction(start => seekHarness.video.readyState >= 2 && seekHarness.video.currentTime >= start,
          scenario.start)
        const result = await seekAndDecode(page, scenario.target)
        assert.ok(result.seekedMs < maximumSeekMs && result.decodedMs < maximumSeekMs, JSON.stringify(result))
        assert.ok(result.readyState >= 2 && result.width === 640 && Math.abs(result.currentTime - scenario.target) < 0.6,
          JSON.stringify(result))
        results.push({ direction: scenario.direction, slow: scenario.slow, ...result })
      } finally {
        releaseSlow()
        await page.evaluate(() => seekHarness?.hls.destroy()).catch(() => {})
        await page.close()
      }
    }
    await fs.writeFile(path.join(output, 'seek-directions-download.json'), JSON.stringify(results, null, 2))
    console.log('SEEK_DIRECTIONS_DOWNLOAD', results)
  } finally { await browser.close() }
})

test('forward and backward seeks bypass unrelated fragment retry backoff', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  const results = []
  try {
    for (const scenario of [
      { direction: 'forward', start: 2, failed: 'stream2.ts', target: 8.5 },
      { direction: 'backward', start: 8, failed: 'stream5.ts', target: 2.5 },
    ]) {
      const page = await browser.newPage()
      let failures = 0
      try {
        await prepare(page, scenario.start, async (name, route) => {
          if (name === scenario.failed) { failures++; await route.fulfill({ status: 503, body: 'retry' }) }
        })
        await page.waitForFunction(start => seekHarness.video.readyState >= 2 && seekHarness.video.currentTime >= start,
          scenario.start)
        await page.waitForFunction(() => Object.values(seekHarness.hls.inFlightFragments).some(item =>
          item?.state === 'FRAG_LOADING_WAITING_RETRY'), null, { timeout: 3000 })
        assert.equal(failures, 1, 'initial fragment failure must be waiting for retry before seeking')
        const result = await seekAndDecode(page, scenario.target)
        assert.ok(result.seekedMs < maximumSeekMs && result.decodedMs < maximumSeekMs, JSON.stringify(result))
        assert.ok(result.readyState >= 2 && result.width === 640 && Math.abs(result.currentTime - scenario.target) < 0.6,
          JSON.stringify(result))
        results.push({ direction: scenario.direction, failed: scenario.failed, failures, ...result })
      } finally {
        await page.evaluate(() => seekHarness?.hls.destroy()).catch(() => {})
        await page.close()
      }
    }
    await fs.writeFile(path.join(output, 'seek-directions-retry.json'), JSON.stringify(results, null, 2))
    console.log('SEEK_DIRECTIONS_RETRY', results)
  } finally { await browser.close() }
})

test('reverse of a pending seek decodes the final target first', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  let releaseSlow
  const slowGate = new Promise(resolve => { releaseSlow = resolve })
  let signalSlow
  const slowRequested = new Promise(resolve => { signalSlow = resolve })
  try {
    await prepare(page, 2, async name => {
      if (name === 'stream4.ts') { signalSlow(); await slowGate }
    })
    await page.waitForFunction(() => seekHarness.video.readyState >= 2 && seekHarness.video.currentTime >= 2)
    await page.evaluate(() => { seekHarness.video.currentTime = 8.5 })
    await slowRequested
    const result = await seekAndDecode(page, 0.5)
    assert.ok(result.seekedMs < maximumSeekMs && result.decodedMs < maximumSeekMs, JSON.stringify(result))
    assert.ok(result.readyState >= 2 && result.width === 640 && Math.abs(result.currentTime - 0.5) < 0.6,
      JSON.stringify(result))
    await fs.writeFile(path.join(output, 'seek-directions-reverse.json'), JSON.stringify(result, null, 2))
    console.log('SEEK_DIRECTIONS_REVERSE', result)
  } finally {
    releaseSlow()
    await page.evaluate(() => seekHarness?.hls.destroy()).catch(() => {})
    await page.close()
    await browser.close()
  }
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

test('playback re-probes after stale capture, visibility, rate, source and loop changes without storage', { timeout: 45000 }, async () => {
  const { fulfillLocalMedia } = await import('./local-media-range.mjs')
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/p1-source*.mp4', route => fulfillLocalMedia(route, path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4')))
    await page.goto(process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188')
    const report = await page.evaluate(async () => {
      const { startRealtimeInterpolation, releaseInterpolationAudio } = await import('/src/video/realtimeInterpolation.ts')
      for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, {
        configurable: true, get() { throw new DOMException('Storage is blocked', 'SecurityError') },
      })
      const nativeCapture = window.createImageBitmap.bind(window)
      let rejectOld, captureCalls = 0
      window.createImageBitmap = (...args) => {
        captureCalls++
        if (captureCalls === 1) return new Promise((_, reject) => { rejectOld = reject })
        return nativeCapture(...args)
      }
      const host = document.createElement('div'); host.className = 'art-video-player'
      const video = document.createElement('video'); video.muted = true; video.loop = true
      video.src = '/p1-source.mp4'; host.append(video); document.body.replaceChildren(host)
      const stats = [], errors = [], states = {}
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
      const active = () => host.classList.contains('sanye-realtime-interpolation-active')
      const until = async (predicate, label) => {
        const end = performance.now() + 4000
        while (!predicate() && performance.now() < end) await sleep(30)
        if (!predicate()) throw new Error(label)
      }
      let session, hidden = false
      try {
        await video.play()
        session = await startRealtimeInterpolation(video, { enhance: true, profile: 'sharp', targetFps: 120,
          measureStages: true, onStats: value => stats.push(value), onError: value => errors.push(value) })
        await until(() => rejectOld, 'first capture did not start')
        video.dispatchEvent(new Event('seeking')); video.dispatchEvent(new Event('seeked'))
        await until(active, 'new generation is blocked by old pending capture')
        rejectOld(new Error('late failure from old source'))
        await sleep(200); states.staleCaptureIgnored = active() && errors.length === 0
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
        hidden = true; document.dispatchEvent(new Event('visibilitychange'))
        const capturesAtHide = captureCalls; await sleep(250)
        states.hidden = !active() && captureCalls === capturesAtHide
        hidden = false; document.dispatchEvent(new Event('visibilitychange'))
        await until(active, 'visible playback did not recover'); states.visible = active()
        video.playbackRate = 2
        await sleep(50); await until(active, '2x playback did not recover'); states.doubleSpeed = active()
        video.currentTime = 9.8
        await until(() => video.currentTime < 2, 'media did not loop')
        await until(active, 'loop did not recover'); states.loop = active()
        video.src = '/p1-source-next.mp4'; video.load(); await video.play()
        await until(active, 'source switch did not recover'); states.source = active()
        await sleep(1300)
        session.stop(); states.stopped = !active() && host.querySelectorAll('canvas').length === 0
        return { states, stats, errors, captureCalls, dimensions: [video.videoWidth, video.videoHeight] }
      } finally {
        session?.stop(); releaseInterpolationAudio(video); video.pause(); video.removeAttribute('src'); video.load()
        window.createImageBitmap = nativeCapture
      }
    })
    const output = path.resolve(__dirname, '../sanye_deploy/.local/player-quality/p1-lifecycle')
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.dimensions, [1920, 1080])
    for (const [name, value] of Object.entries(report.states)) assert.equal(value, true, name)
    assert.ok(report.stats.length > 0)
    assert.ok(report.stats.every(item => item.outputWidth === 1920 && item.outputHeight === 1080))
  } finally { await browser.close() }
})

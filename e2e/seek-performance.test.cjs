const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const output = path.resolve(__dirname, '../sanye_deploy/.local/seek-performance')
const fixture = path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4')

test.before(async () => {
  await fs.mkdir(output, { recursive: true })
  let needMp4 = false, needHls = false
  try { await fs.access(fixture) } catch { needMp4 = true }
  try { await fs.access(path.join(output, 'stream.m3u8')) } catch { needHls = true }
  if (!needMp4 && !needHls) return
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    await page.exposeFunction('saveMedia', async (name, bytes) => {
      const target = name === 'source.mp4' ? fixture : path.join(output, path.basename(name))
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, Buffer.from(bytes))
    })
    await page.evaluate(async ({ needMp4, needHls }) => {
      const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js')
      const { interpolationAssets } = await import('/src/video/interpolation.ts')
      const engine = new FFmpeg()
      try {
        await engine.load(interpolationAssets)
        if (needMp4) {
          const status = await engine.exec(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25', '-pix_fmt', 'yuv420p', 'source.mp4'], 180000)
          if (status !== 0) throw new Error('MP4 fixture generation failed')
          await window.saveMedia('source.mp4', Array.from(await engine.readFile('source.mp4')))
        }
        if (needHls) {
          const status = await engine.exec(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', 'stream.m3u8'], 180000)
          if (status !== 0) throw new Error('HLS fixture generation failed')
          for (const file of await engine.listDir('/')) if (/^stream.*\.(ts|m3u8)$/.test(file.name)) await window.saveMedia(file.name, Array.from(await engine.readFile(file.name)))
        }
      } finally { engine.terminate() }
    }, { needMp4, needHls })
  } finally { await browser.close() }
}, { timeout: 240000 })

test('real ArtPlayer mouse and touch scrubs commit one seek and retain paused state', { timeout: 60000 }, async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile, isMobile: mobile })
      await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
      await page.route('**/seek-fixture.mp4', route => route.fulfill({ path: fixture, contentType: 'video/mp4' }))
      await page.goto(origin)
      await page.evaluate(async () => {
        const { default: Artplayer } = await import('/node_modules/.vite/deps/artplayer.js')
        document.body.innerHTML = '<div id="seek-test" style="width:100%;max-width:960px;aspect-ratio:16/9"></div>'
        const url = URL.createObjectURL(await (await fetch('/seek-fixture.mp4')).blob())
        window.player = new Artplayer({ container: '#seek-test', url, muted: true, autoSize: false })
        await new Promise(resolve => player.video.addEventListener('loadeddata', resolve, { once: true }))
        window.seeks = []
        player.on('seek', (_actual, requested) => seeks.push(requested))
      })
      const bar = page.locator('.art-control-progress')
      const box = await bar.boundingBox()
      if (!mobile) {
        await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 30 })
        await page.mouse.up()
      }
      const baseline = await page.evaluate(() => seeks.length)
      await page.evaluate(async () => {
        const { installSeekControl } = await import('/src/video/seekControl.ts')
        installSeekControl(player); seeks.length = 0
        window.started = 0; window.seekMs = null
        player.video.addEventListener('seeking', () => { started = performance.now() })
        player.video.addEventListener('seeked', () => { seekMs = performance.now() - started })
      })
      if (mobile) {
        const session = await page.context().newCDPSession(page)
        const y = box.y + box.height / 2
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.1, y }] })
        for (let i = 1; i <= 30; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (0.1 + 0.6 * i / 30), y }] })
        assert.equal(await page.evaluate(() => seeks.length), 0)
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 30 })
        assert.equal(await page.evaluate(() => seeks.length), 0)
        await page.mouse.up()
      }
      await page.waitForFunction(() => !player.video.seeking && seeks.length > 0 && seekMs !== null)
      const result = await page.evaluate(() => ({ seeks: seeks.length, target: seeks[0], currentTime: player.currentTime, duration: player.duration, paused: player.video.paused, seekMs, width: player.video.videoWidth }))
      assert.equal(result.seeks, 1)
      assert.ok(Math.abs(result.target / result.duration - 0.7) < 0.02)
      assert.equal(result.paused, true)
      assert.equal(result.width, 1920)
      assert.ok(Math.abs(result.currentTime - result.target) < 0.1, JSON.stringify(result))
      if (!mobile) assert.ok(baseline >= 25)
      await page.screenshot({ path: path.join(output, mobile ? 'mobile.png' : 'desktop.png') })
      await fs.writeFile(path.join(output, mobile ? 'mobile.json' : 'desktop.json'), JSON.stringify({ baseline, ...result }, null, 2))
      if (!mobile) {
        await page.evaluate(async () => { seeks.length = 0; await player.video.play() })
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 10 })
        await page.evaluate(() => window.dispatchEvent(new Event('blur')))
        await page.mouse.up()
        assert.deepEqual(await page.evaluate(() => ({ count: seeks.length, paused: player.video.paused })), { count: 0, paused: false })
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 10 })
        await page.mouse.up()
        await page.waitForFunction(() => !player.video.seeking && !player.video.paused && player.currentTime >= 4 && player.currentTime < 5)
        assert.equal(await page.evaluate(() => seeks.length), 1)
      }
      await page.evaluate(() => player.destroy())
      await page.close()
    }
  } finally { await browser.close() }
})

test('enhanced video surface toggles playback without swallowing controls on mouse or touch', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile, isMobile: mobile,
        ...(mobile ? { userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' } : {}) })
      await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
      await page.route('**/seek-fixture.mp4', route => route.fulfill({ path: fixture, contentType: 'video/mp4' }))
      await page.goto(origin)
      await page.evaluate(async () => {
        const { default: Artplayer } = await import('/node_modules/.vite/deps/artplayer.js')
        const { installPlaybackControl } = await import('/src/video/playbackControl.ts')
        document.body.innerHTML = '<div class="anime-player-frame" style="width:100%;max-width:960px;aspect-ratio:16/9"><div id="click-test" class="artplayer-container"></div></div>'
        const url = URL.createObjectURL(await (await fetch('/seek-fixture.mp4')).blob())
        window.player = new Artplayer({ container: '#click-test', url, muted: true, autoSize: false })
        installPlaybackControl(player)
        await new Promise(resolve => player.video.addEventListener('loadeddata', resolve, { once: true }))
        player.video.closest('.art-video-player').classList.add('sanye-realtime-interpolation-active')
        const canvas = document.createElement('canvas')
        canvas.className = 'realtime-interpolation-canvas'
        player.video.parentElement.append(canvas)
        window.videoClicks = 0
        window.doubleClicks = 0
        player.video.addEventListener('click', () => videoClicks++)
        player.on('dblclick', () => doubleClicks++)
      })
      const surface = page.locator('.art-video')
      const box = await surface.boundingBox()
      assert.equal(await page.evaluate(() => getComputedStyle(player.video).visibility), 'visible')
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      if (mobile) await page.touchscreen.tap(center.x, center.y)
      else await page.mouse.click(center.x, center.y)
      await page.waitForFunction(() => !player.video.paused && videoClicks === 1)
      await page.waitForTimeout(450)
      if (mobile) await page.touchscreen.tap(center.x, center.y)
      else await page.mouse.click(center.x, center.y)
      await page.waitForFunction(() => player.video.paused && videoClicks === 2)
      if (!mobile) {
        const controls = page.locator('.art-control-playAndPause')
        await controls.click()
        await page.waitForFunction(() => !player.video.paused)
        assert.equal(await page.evaluate(() => videoClicks), 2, 'control click must not bubble into video playback')
        await page.waitForTimeout(450)
        await page.mouse.dblclick(center.x, center.y, { delay: 50 })
        assert.equal(await page.evaluate(() => doubleClicks), 1)
      }
      await page.screenshot({ path: path.join(output, mobile ? 'mobile-click.png' : 'desktop-click.png') })
      await page.evaluate(() => player.destroy())
      await page.close()
    }
  } finally { await browser.close() }
})

test('backward unbuffered seek preempts an unrelated slow fragment', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    const timings = []
    for (const fixed of [false, true]) {
      const page = await browser.newPage()
      let releaseSlow
      const slow = new Promise(resolve => { releaseSlow = resolve })
      let startedSlow
      const requested = new Promise(resolve => { startedSlow = resolve })
      await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
      await page.route('**/slow-seek/*', async route => {
        const name = path.basename(new URL(route.request().url()).pathname)
        if (name === 'stream5.ts') { startedSlow(); await slow }
        await route.fulfill({ path: path.join(output, name), contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl' }).catch(() => {})
      })
      await page.goto(origin)
      await page.evaluate(async fixed => {
        const { default: Hls } = await import('/node_modules/.vite/deps/hls__js.js')
        const video = document.createElement('video'); video.muted = true
        document.body.replaceChildren(video)
        window.slowVideo = video
        window.slowHls = new Hls({ startPosition: 8, maxBufferLength: 60 })
        slowHls.loadSource('/slow-seek/stream.m3u8'); slowHls.attachMedia(video)
        if (fixed) {
          const { installHlsSeekControl } = await import('/src/video/seekControl.ts')
          installHlsSeekControl(video, slowHls)
        }
      }, fixed)
      await requested
      await page.waitForFunction(() => slowVideo.readyState >= 2 && slowVideo.currentTime >= 8)
      await page.evaluate(() => {
        window.backwardStarted = performance.now(); window.backwardMs = null
        slowVideo.addEventListener('seeked', () => { backwardMs = performance.now() - backwardStarted }, { once: true })
        slowVideo.currentTime = 2.5
      })
      if (!fixed) {
        await page.waitForTimeout(1500)
        assert.equal(await page.evaluate(() => backwardMs), null, 'baseline waits for the unrelated download')
        releaseSlow()
      }
      await page.waitForFunction(() => backwardMs !== null, { }, { timeout: 3000 })
      const ms = await page.evaluate(() => backwardMs)
      timings.push({ fixed, ms })
      if (fixed) assert.ok(ms < 1500, `backward seek waited ${ms} ms`)
      releaseSlow()
      await page.evaluate(() => slowHls.destroy())
      await page.close()
    }
    await fs.writeFile(path.join(output, 'backward-seek.json'), JSON.stringify(timings, null, 2))
    console.log('BACKWARD_SEEK', timings)
  } finally { await browser.close() }
})

test('fragment cache avoids repeat network requests and handles ranges, eviction, abort, live and no-store', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    let requests = 0
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/cache-fragment/**', async route => {
      requests++
      await new Promise(resolve => setTimeout(resolve, 150))
      await route.fulfill({ body: Buffer.alloc(32, 7), contentType: 'application/octet-stream', headers: { 'Cache-Control': route.request().url().includes('private') ? 'no-store' : 'max-age=600' } })
    })
    await page.goto(origin)
    const result = await page.evaluate(async () => {
      const { default: Hls } = await import('/node_modules/.vite/deps/hls__js.js')
      const { createFragmentCache } = await import('/src/video/hlsFragmentCache.ts')
      let vod = true
      const cache = createFragmentCache(Hls, () => vod, 64)
      const config = { loadPolicy: Hls.DefaultConfig.fragLoadPolicy.default, timeout: 5000, maxRetry: 0, retryDelay: 0, maxRetryDelay: 0 }
      const load = (name, extra = {}, abort = false) => new Promise((resolve, reject) => {
        const loader = new cache.Loader(Hls.DefaultConfig)
        const start = performance.now()
        loader.load({ url: `${location.origin}/cache-fragment/${name}`, responseType: 'arraybuffer', ...extra }, config, {
          onSuccess: response => { const data = response.data; loader.destroy(); resolve({ ms: performance.now() - start, data: [...new Uint8Array(data)] }); structuredClone(data, { transfer: [data] }) },
          onError: reject, onTimeout: reject,
          onAbort: () => { loader.destroy(); resolve({ aborted: true }) },
        })
        if (abort) loader.abort()
      })
      const cold = await load('a'), hot = await load('a')
      const abort = await load('a', {}, true)
      await load('a', { rangeStart: 32, rangeEnd: 64 })
      await load('b')
      const evicted = await load('a')
      await load('private'); await load('private')
      vod = false; await load('a'); await load('a')
      vod = true; cache.clear(); await load('a')
      return { cold, hot, abort, evicted }
    })
    assert.equal(requests, 9)
    assert.deepEqual(result.cold.data, result.hot.data)
    assert.ok(result.cold.ms >= 140)
    assert.ok(result.hot.ms < result.cold.ms / 2)
    assert.ok(result.evicted.ms >= 140)
    assert.deepEqual(result.abort, { aborted: true })
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'fragment-cache.json'), JSON.stringify({ requests, ...result }, null, 2))
  } finally { await browser.close() }
})

test('detail page HLS decodes and resumes interpolation after cached seek with no repeat fragment request', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const requests = []
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/api/v1/anime/external-preview?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
      title: '拖动定位测试', originalTitle: '', type: '电影', tags: [], episodes: [{ id: 901, episodeNo: 1, title: '测试片段', playbackUrl: `${origin}/seek-hls/stream.m3u8`, mimeType: 'application/vnd.apple.mpegurl' }],
    } } }))
    await page.route('**/seek-hls/*', async route => {
      const name = path.basename(new URL(route.request().url()).pathname)
      if (name.endsWith('.ts')) { requests.push(name); await new Promise(resolve => setTimeout(resolve, 150)) }
      await route.fulfill({ path: path.join(output, name), contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl', headers: { 'Cache-Control': 'max-age=600' } })
    })
    await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(origin + '/seek-hls/stream.m3u8')}`)
    await page.waitForFunction(() => { const video = document.querySelector('video'); return video && video.currentTime > 0.5 && video.buffered.length && video.buffered.end(video.buffered.length - 1) > 11.5 })
    await page.waitForSelector('.sanye-realtime-interpolation-active', { timeout: 15000 })
    await page.evaluate(async () => {
      const artModule = performance.getEntriesByType('resource').find(entry => entry.name.includes('/artplayer.js?'))
      const { default: Artplayer } = await import(artModule.name)
      window.player = Artplayer.instances[0]
      window.detailSeeks = 0
      window.hlsStartLoads = 0
      const startLoad = player.hls.startLoad.bind(player.hls)
      player.hls.startLoad = (...args) => { hlsStartLoads++; return startLoad(...args) }
      player.on('seek', () => detailSeeks++)
    })
    const progress = page.locator('.art-control-progress')
    const progressBox = await progress.boundingBox()
    await page.mouse.move(progressBox.x + progressBox.width * 0.2, progressBox.y + progressBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(progressBox.x + progressBox.width * 0.35, progressBox.y + progressBox.height / 2, { steps: 20 })
    await page.evaluate(() => { window.scrubReleasedAt = performance.now() })
    await page.mouse.up()
    await page.waitForFunction(() => !player.video.seeking && detailSeeks === 1)
    await page.waitForFunction(() => !document.querySelector('.art-video-player')?.classList.contains('sanye-media-pending'))
    const scrubRecoveryMs = await page.evaluate(() => performance.now() - scrubReleasedAt)
    assert.deepEqual(await page.evaluate(() => ({ seeks: detailSeeks, startLoads: hlsStartLoads })),
      { seeks: 1, startLoads: 0 }, 'a scrub must commit once without restarting HLS loading')
    const bufferedDirections = []
    for (const [direction, fraction, count] of [['backward', 0.15, 2], ['forward', 0.55, 3]]) {
      const requestCount = requests.length
      await page.mouse.move(progressBox.x + progressBox.width * 0.35, progressBox.y + progressBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(progressBox.x + progressBox.width * fraction, progressBox.y + progressBox.height / 2, { steps: 12 })
      await page.evaluate(() => { window.scrubReleasedAt = performance.now() })
      await page.mouse.up()
      await page.waitForFunction(count => !player.video.seeking && detailSeeks === count
        && player.video.readyState >= 2 && !player.video.closest('.art-video-player').classList.contains('sanye-media-pending'), count)
      const measured = await page.evaluate(() => ({ ms: performance.now() - scrubReleasedAt,
        time: player.currentTime, duration: player.duration, startLoads: hlsStartLoads }))
      assert.equal(measured.startLoads, 0, 'buffered seeks must not restart HLS in either direction')
      assert.equal(requests.length, requestCount, 'buffered seeks must not repeat downloads')
      assert.ok(measured.ms < 1000 && Math.abs(measured.time - measured.duration * fraction) < 1, JSON.stringify(measured))
      bufferedDirections.push({ direction, ...measured })
    }
    const before = requests.length
    await page.evaluate(async () => {
      const { default: Hls } = await import('/node_modules/.vite/deps/hls__js.js')
      const hls = player.hls
      player.video.pause(); hls.stopLoad()
      await new Promise(resolve => { hls.once(Hls.Events.BUFFER_FLUSHED, resolve); hls.trigger(Hls.Events.BUFFER_FLUSHING, { startOffset: 0, endOffset: Infinity }) })
      window.seekStart = performance.now()
      player.video.currentTime = 6.5
      hls.startLoad(6.5)
      await player.video.play()
    })
    await page.waitForFunction(() => player.currentTime >= 6.7 && !player.video.seeking && player.video.videoWidth === 640)
    await page.waitForSelector('.sanye-realtime-interpolation-active')
    const result = await page.evaluate(() => ({ recoveryMs: performance.now() - seekStart, time: player.currentTime, readyState: player.video.readyState }))
    assert.equal(requests.length, before, 'warm fragments must be reused even after MediaSource buffer eviction')
    assert.ok(before >= 6)
    await page.screenshot({ path: path.join(output, 'detail-hls.png') })
    await fs.writeFile(path.join(output, 'detail-hls.json'), JSON.stringify({ scrubRecoveryMs, bufferedDirections, before, after: requests.length, ...result }, null, 2))
    const detailBox = await page.locator('.anime-player-frame .art-video').boundingBox()
    const detailCenter = { x: detailBox.x + detailBox.width / 2, y: detailBox.y + detailBox.height / 2 }
    await page.mouse.click(detailCenter.x, detailCenter.y)
    await page.waitForFunction(() => player.video.paused)
    await page.waitForTimeout(450)
    await page.mouse.click(detailCenter.x, detailCenter.y)
    await page.waitForFunction(() => !player.video.paused)
    await page.evaluate(() => player.destroy())
  } finally { await browser.close() }
})

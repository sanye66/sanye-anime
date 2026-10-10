const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5187'
const output = path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation')
const fixturePath = path.join(output, 'source-1080p.mp4')

before(async () => {
  try { await fs.access(fixturePath); return } catch {}
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    await page.exposeFunction('saveFixture', bytes => fs.writeFile(fixturePath, Buffer.from(bytes)))
    await page.evaluate(async () => {
      const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js')
      const { interpolationAssets } = await import('/src/video/interpolation.ts')
      const engine = new FFmpeg()
      try {
        await engine.load(interpolationAssets)
        const status = await engine.exec(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=10',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:v', 'libx264', '-preset', 'ultrafast',
          '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'fixture.mp4'], 180000)
        if (status !== 0) throw new Error('1080p fixture generation failed')
        await window.saveFixture(Array.from(await engine.readFile('fixture.mp4')))
      } finally { engine.terminate() }
    })
  } finally { await browser.close() }
}, { timeout: 240000 })

test('native-resolution enhancement profiles render valid pixels and report synchronous readback cost', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const results = []
      let gpu
      for (const [width, height] of [[854, 480], [1280, 720], [1920, 1080]]) {
        const source = document.createElement('canvas'); source.width = width; source.height = height
        const ctx = source.getContext('2d'); ctx.fillStyle = '#58c090'; ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#e05880'; ctx.fillRect(width / 4, height / 4, width / 2, height / 2)
        for (const [profile, sharpness] of [['off', 0], ['fast', 0.05], ['balanced', 0.12], ['sharp', 0.22]]) {
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
          const renderer = new MotionRenderer(canvas, sharpness)
          const gl = renderer.gl, extension = gl.getExtension('WEBGL_debug_renderer_info')
          gpu = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unknown'
          const field = { width: 1, height: 1, data: new Float32Array([0.01, 0, 1, 0]), sceneCut: false }
          const a = renderer.upload(source, 0, field), b = renderer.upload(source, 1 / 30, field)
          const pixel = new Uint8Array(4)
          const complete = () => {
            gl.readPixels(width / 2, height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
            if (gl.getError() !== gl.NO_ERROR || pixel[0] < 100) throw new Error('GPU benchmark frame is blank or invalid')
          }
          for (let frame = 0; frame < 10; frame++) { renderer.render(a, b, frame / 10); complete() }
          const durations = []
          const started = performance.now()
          for (let frame = 0; frame < 120; frame++) {
            const start = performance.now(); renderer.render(a, b, (frame % 4) / 4); complete()
            durations.push(performance.now() - start)
          }
          const elapsed = performance.now() - started
          durations.sort((a, b) => a - b)
          results.push({ width, height, profile, throughputFps: 120000 / elapsed, p95Ms: durations[114] })
          renderer.stop()
        }
      }
      return { gpu, results, note: 'Includes synchronous pixel readback; live GPU-completion test is the 120fps acceptance gate' }
    })
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'gpu-budget.json'), JSON.stringify(report, null, 2))
    console.log('GPU_BUDGET', JSON.stringify(report))
    assert.equal(report.results.length, 12)
  } finally { await browser.close() }
})

test('optical flow synthesizes moved intermediate pixels, distinct 120fps samples and safe scene cuts', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 840 } })
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const { MotionEstimator } = await import('/src/video/motionFlow.ts')
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const width = 256, height = 144
      const image = (offset) => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#203840'; ctx.fillRect(0, 0, width, height)
        for (let y = 8; y < height; y += 12) for (let x = -16; x < width; x += 12) {
          ctx.fillStyle = `rgb(${80 + ((x + 256) * 17 + y * 13) % 170},${80 + ((x + 256) * 31 + y * 7) % 170},180)`
          ctx.fillRect(x + offset, y, 6, 6)
        }
        return { canvas, pixels: ctx.getImageData(0, 0, width, height).data }
      }
      const estimator = new MotionEstimator()
      const a = image(0), b = image(4), middle = image(2)
      const fa = estimator.estimate(a.pixels, width, height), fb = estimator.estimate(b.pixels, width, height)
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      canvas.style.cssText = 'width:min(100%,768px);height:auto;display:block'
      document.body.replaceChildren(canvas)
      const renderer = new MotionRenderer(canvas, 0)
      const previous = renderer.upload(a.canvas, 0, fa), current = renderer.upload(b.canvas, 1 / 24, fb)
      const read = () => { const pixels = new Uint8Array(width * height * 4); renderer.gl.readPixels(0, 0, width, height, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels); return pixels }
      renderer.render(previous, current, 0.5)
      const pixels = read()
      let error = 0, blendError = 0, count = 0, valid = 0, displacement = 0
      for (let i = 0; i < fb.data.length; i += 4) if (fb.data[i + 2]) { valid++; displacement += fb.data[i] / fb.data[i + 2] * width }
      for (let y = 24; y < height - 24; y++) for (let x = 32; x < width - 32; x++) for (let c = 0; c < 3; c++) {
        const expected = (y * width + x) * 4 + c, actual = ((height - 1 - y) * width + x) * 4 + c
        error += Math.abs(pixels[actual] - middle.pixels[expected])
        blendError += Math.abs((a.pixels[expected] + b.pixels[expected]) / 2 - middle.pixels[expected]); count++
      }
      const hashes = new Set()
      const started = performance.now()
      for (let i = 0; i < 120; i++) {
        renderer.render(previous, current, i / 120)
        const pixels = read()
        let hash = 2166136261
        for (const value of pixels) hash = Math.imul(hash ^ value, 16777619)
        hashes.add(hash)
      }
      const render120Ms = performance.now() - started
      const white = new Uint8ClampedArray(width * height * 4).fill(255)
      const cut = estimator.estimate(white, width, height)
      renderer.render(previous, current, 0.5)
      // Snapshot the GPU frame before the default framebuffer is discarded by the compositor.
      const snapshot = document.createElement('canvas'); snapshot.width = width; snapshot.height = height
      snapshot.getContext('2d').drawImage(canvas, 0, 0)
      snapshot.style.cssText = canvas.style.cssText; document.body.replaceChildren(snapshot)
      window.releaseMotionTest = () => renderer.stop()
      return { valid, displacement: displacement / valid, error: error / count, blendError: blendError / count,
        distinct: hashes.size, render120Ms, sceneCut: cut.sceneCut }
    })
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'motion.json'), JSON.stringify(report, null, 2))
    await page.screenshot({ path: path.join(output, 'motion-desktop.png'), animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(output, 'motion-mobile.png'), animations: 'disabled' })
    await page.evaluate(() => window.releaseMotionTest())
    console.log('MOTION_PROOF', JSON.stringify(report))
    assert.ok(report.valid > 50)
    assert.ok(Math.abs(report.displacement - 4) < 0.6)
    assert.ok(report.error < report.blendError * 0.65, 'motion-compensated midpoint must outperform crossfade')
    assert.ok(report.distinct >= 110, '120 temporal samples must not be duplicate source frames')
    assert.equal(report.sceneCut, true)
  } finally { await browser.close() }
})

test('live worker interpolation reports actual cadence, pauses, resets and releases video/audio resources', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage()
    await page.route('**/realtime-source.mp4', route => route.fulfill({ path: fixturePath, contentType: 'video/mp4' }))
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const { startRealtimeInterpolation, releaseInterpolationAudio } = await import('/src/video/realtimeInterpolation.ts')
      const player = document.createElement('div'); player.className = 'art-video-player'
      const video = document.createElement('video'); video.muted = true
      video.src = location.origin + '/realtime-source.mp4'
      player.append(video); document.body.replaceChildren(player)
      const stats = [], errors = []
      let session
      try {
        await video.play()
        session = await startRealtimeInterpolation(video, { enhance: true, profile: 'sharp', targetFps: 120, onStats: value => stats.push(value), onError: value => errors.push(value) })
        await new Promise(resolve => setTimeout(resolve, 4500))
        const active = player.classList.contains('sanye-realtime-interpolation-active')
        video.pause()
        await new Promise(resolve => setTimeout(resolve, 50))
        const paused = !player.classList.contains('sanye-realtime-interpolation-active')
        await video.play(); await new Promise(resolve => setTimeout(resolve, 700))
        const resumed = player.classList.contains('sanye-realtime-interpolation-active')
        video.dispatchEvent(new Event('seeking'))
        const seeking = !player.classList.contains('sanye-realtime-interpolation-active')
        video.dispatchEvent(new Event('seeked')); await new Promise(resolve => setTimeout(resolve, 700))
        session.stop()
        const removed = player.querySelectorAll('.realtime-interpolation-canvas').length === 0
        session = await startRealtimeInterpolation(video, { onError: value => errors.push(value) })
        await new Promise(resolve => setTimeout(resolve, 700))
        const restarted = player.classList.contains('sanye-realtime-interpolation-active')
        const normalErrors = [...errors]
        session.canvas.dispatchEvent(new Event('webglcontextlost'))
        await new Promise(resolve => setTimeout(resolve, 100))
        const recovered = !player.classList.contains('sanye-realtime-interpolation-active')
          && player.querySelectorAll('.realtime-interpolation-canvas').length === 0 && errors.length === 1
        return { stats, errors: normalErrors, active, paused, resumed, seeking, removed, restarted, recovered,
          dimensions: [video.videoWidth, video.videoHeight], playback: video.getVideoPlaybackQuality().totalVideoFrames }
      } finally {
        session?.stop(); releaseInterpolationAudio(video); video.pause(); video.removeAttribute('src'); video.load(); player.remove()
      }
    })
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'live.json'), JSON.stringify(report, null, 2))
    console.log('LIVE_INTERPOLATION', JSON.stringify(report))
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.dimensions, [1920, 1080])
    for (const key of ['active', 'paused', 'resumed', 'seeking', 'removed', 'restarted', 'recovered']) assert.equal(report[key], true, key)
    assert.ok(report.stats.some(value => value.interpolatedFrames > 0 && value.outputFps > 30))
    assert.ok(report.stats.length >= 3 && report.stats.slice(-2).every(value => value.outputFps >= 118),
      '1080p enhancement must sustain approximately 120 generated frames/sec after warm-up')
    assert.ok(report.stats.slice(-2).every(value => value.frameIntervalP95Ms < 13),
      'throttled workers must retain honest sub-13ms actual frame pacing')
    // 默认自适应延迟（VQ-29）：音频延迟跟随实际生效的补帧延迟，不再固定 150ms，但必须与视频延迟一致。
    assert.ok(report.stats.some(value => value.audioDelayMs > 0 && value.audioDelayMs <= 150.5),
      '补间层生效时必须有跟随视频延迟的音频延迟')
    assert.ok(report.stats.filter(value => value.interpolationDelay?.active)
      .every(value => Math.abs(value.audioDelayMs - value.interpolationDelay.effectiveMs) <= 40),
    `音频延迟必须跟随生效的补帧延迟：${JSON.stringify(report.stats.map(value =>
      ({ audio: value.audioDelayMs, delay: value.interpolationDelay?.effectiveMs, active: value.interpolationDelay?.active })))}`)
    assert.ok(report.stats.every(value => value.targetFps === 120 && value.outputFps <= 125))
  } finally { await browser.close() }
})

test('player applies interpolation by default and quality enhancement does not disable it', { timeout: 45000 }, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 840 } })
    await page.addInitScript(() => {
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args)
          if (String(args[0]).includes('interpolationRenderer')) this.addEventListener('message', ({ data }) => {
            if (data.type === 'stats') window.__qualityStats = data.stats
          })
        }
      }
    })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/v1/**', route => {
      const url = new URL(route.request().url())
      let data = null
      if (url.pathname.endsWith('/favorites/127/status')) data = { favorite: false }
      if (url.pathname === '/api/v1/anime/127') data = { id: 127, title: '补帧验收', type: '电视动画', tags: [], characters: [], similar: [], schedule: [] }
      if (url.pathname === '/api/v1/anime/127/episodes') data = [{ id: 901, episodeNo: 1, title: '受控运动片段', playbackUrl: origin + '/motion-fixture.mp4', mimeType: 'video/mp4' }]
      return route.fulfill({ json: { code: 0, data } })
    })
    await page.route('**/motion-fixture.mp4', route => route.fulfill({ path: fixturePath, contentType: 'video/mp4' }))
    await page.goto(origin + '/anime/127')
    const video = page.locator('.art-video')
    await video.waitFor({ state: 'attached', timeout: 10000 }).catch(async error => {
      console.log('PLAYER_ERRORS', errors, await page.locator('body').innerText()); throw error
    })
    await page.waitForFunction(() => document.querySelector('.art-video')?.readyState >= 2)
    await video.evaluate(async element => { element.muted = true; element.loop = true; await element.play() })
    await page.locator('.sanye-realtime-interpolation-active').waitFor()
    const choose = async text => {
      await page.locator('.art-video-player').hover()
      await page.locator('.art-control-anime4k').hover()
      await page.locator('.art-control-anime4k .art-selector-item').filter({ hasText: new RegExp('^' + text + '$') }).click()
      await page.locator('.sanye-realtime-interpolation-active').waitFor()
    }
    await page.locator('.art-video-player').hover()
    await page.locator('.art-control-interpolation').hover()
    const hoveredMenu = await page.locator('.art-control-interpolation .art-selector-list').elementHandle()
    assert.ok(hoveredMenu)
    await page.waitForFunction(() => Boolean(window.__qualityStats))
    await page.waitForTimeout(3500)
    assert.equal(await hoveredMenu.evaluate(element => element.isConnected), true,
      'periodic stats must not replace the hovered menu')
    await page.locator('.art-control-interpolation .art-selector-item').filter({ hasText: /^90 FPS$/ }).click()
    await page.waitForFunction(() => window.__qualityStats?.requestedFps === 90)
    for (const value of ['性能', '均衡', '锐化', '修复', '超分 2×', '关闭']) {
      await choose(value)
      assert.equal(await page.locator('.realtime-interpolation-canvas').count(), 1)
      assert.equal(await page.locator('.anime4k-canvas').count(), 0, 'enhancement must use the interpolation worker pipeline')
    }
    await page.evaluate(() => { window.__qualityStats = null })
    await choose('超分 2×')
    await page.waitForFunction(() => window.__qualityStats?.requestedProfile === 'upscale')
    await page.waitForFunction(() => document.querySelector('.art-control-anime4k .art-selector-item.art-current')?.dataset.value === window.__qualityStats?.effectiveProfile)
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:playback:preferences:v1')).quality), 'upscale')
    await page.locator('.art-control-anime4k').hover()
    await page.screenshot({ path: path.join(output, 'quality-fallback-menu.png'), animations: 'disabled' })
    await fs.writeFile(path.join(output, 'quality-fallback.json'), JSON.stringify(await page.evaluate(() => ({
      stats: window.__qualityStats,
      selected: document.querySelector('.art-control-anime4k .art-selector-item.art-current')?.dataset.value,
      preference: JSON.parse(localStorage.getItem('sanye:playback:preferences:v1')).quality,
    })), null, 2))
    await choose('关闭')
    const chooseRate = async text => {
      await page.locator('.art-video-player').hover()
      await page.locator('.art-control-interpolation').hover()
      await page.locator('.art-control-interpolation .art-selector-item').filter({ hasText: new RegExp('^' + text + '$') }).click()
    }
    await chooseRate('原始')
    await page.locator('.realtime-interpolation-canvas').waitFor({ state: 'detached' })
    await chooseRate('自动')
    await page.locator('.sanye-realtime-interpolation-active').waitFor()
    await chooseRate('144 FPS')
    assert.equal(await page.locator('.art-control-interpolation .art-selector-value').innerText(), '帧率')
    await page.locator('.sanye-realtime-interpolation-active').waitFor()
    await page.screenshot({ path: path.join(output, 'player-desktop.png'), animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await page.locator('.anime-player-frame').evaluate(element => element.getBoundingClientRect().right <= innerWidth))
    await page.screenshot({ path: path.join(output, 'player-mobile.png'), animations: 'disabled' })
    await page.goto(origin + '/search')
    assert.equal(await page.locator('.realtime-interpolation-canvas').count(), 0)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})

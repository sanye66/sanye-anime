const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5187'
const output = path.resolve(__dirname, '../sanye_deploy/.local/player-quality')

test('cadence policy respects refresh estimates, sustained overload and recovery without enabling experimental rates automatically', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const result = await page.evaluate(async () => {
      const { FrameCadence } = await import('/src/video/frameCadence.ts')
      const ceilings = [60, 120, 144, 165, 240].map(hz => {
        const policy = new FrameCadence('auto'); policy.observeDisplay(hz)
        for (let i = 0; i < 44; i++) policy.observe(policy.target, 0.5)
        return policy.target
      })
      const manual = new FrameCadence(165); manual.observeDisplay(60)
      manual.observe(145, 1); manual.observe(145, 1)
      manual.observe(145, 1)
      const beforeSecond = manual.target
      manual.observe(145, 1)
      const lower = manual.target
      for (let i = 0; i < 20; i++) manual.observe(manual.target, 0.5)
      const saturated = new FrameCadence(240)
      for (let i = 0; i < 5; i++) saturated.observe(125, 4.7)
      return { ceilings, beforeSecond, lower, recovered: manual.target, saturated: saturated.target }
    })
    assert.deepEqual(result, { ceilings: [60, 120, 144, 165, 165], beforeSecond: 165, lower: 144, recovered: 165, saturated: 120 })
  } finally { await browser.close() }
})

test('1080p live quality and high-refresh matrix reports completion, fallback and frame pacing', { timeout: 240000 }, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/quality-fixture.mp4', route => route.fulfill({ path: path.resolve(output, '../realtime-interpolation/source-1080p.mp4'), contentType: 'video/mp4' }))
    await page.goto(origin)
    const matrix = ['off', 'fast', 'balanced', 'sharp', 'restore', 'upscale'].flatMap(profile => [[60, profile], [120, profile]])
    matrix.push([90, 'sharp'], [144, 'sharp'], [165, 'sharp'], [240, 'sharp'], ['auto', 'sharp'])
    const requestedCase = process.env.SANYE_QUALITY_CASE
    const cases = requestedCase ? matrix.filter(([targetFps, profile]) => `${targetFps}:${profile}` === requestedCase) : matrix
    assert.ok(cases.length > 0, `unknown SANYE_QUALITY_CASE: ${requestedCase}`)
    const report = await page.evaluate(async cases => {
      const { startRealtimeInterpolation, releaseInterpolationAudio } = await import('/src/video/realtimeInterpolation.ts')
      const player = document.createElement('div'); player.className = 'art-video-player'
      const video = document.createElement('video'); video.muted = true; video.loop = true
      video.src = '/quality-fixture.mp4'; player.append(video); document.body.replaceChildren(player)
      const results = []
      let session
      try {
        await video.play()
        for (const [targetFps, profile] of cases) {
          if (video.currentTime > 0.1) await new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = 0 })
          const stats = [], errors = []
          session = await startRealtimeInterpolation(video, { targetFps, enhance: profile !== 'off', profile: profile === 'off' ? undefined : profile,
            onStats: value => stats.push(value), onError: value => errors.push(value) })
          await new Promise(resolve => setTimeout(resolve, 7500))
          results.push({ requested: targetFps, profile, stats, errors,
            active: player.classList.contains('sanye-realtime-interpolation-active') })
          session.stop()
        }
      } finally { session?.stop(); releaseInterpolationAudio(video); video.pause(); video.removeAttribute('src'); video.load() }
      return results
    }, cases)
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'live-matrix.json'), JSON.stringify(report, null, 2))
    for (const item of report) {
      const tail = item.stats.slice(-2)
      console.log('QUALITY_LIVE', JSON.stringify({ ...item, stats: tail }))
      assert.deepEqual(item.errors, []); assert.equal(item.active, true)
      assert.ok(tail.length === 2 && tail.every(stat => stat.outputFps >= stat.targetFps * 0.9))
      if (['off', 'fast', 'balanced', 'sharp'].includes(item.profile) && typeof item.requested === 'number' && item.requested <= 165) {
        assert.ok(tail.every(stat => stat.targetFps === item.requested && stat.outputFps >= item.requested * 0.96))
      }
      if (item.profile !== 'sharp') assert.ok(tail.every(stat => stat.effectiveProfile === item.profile || stat.fallbackReason.length > 0))
      assert.ok(item.stats.every(stat => stat.requestedProfile === item.profile))
      if (tail.some(stat => stat.effectiveProfile !== item.profile)) assert.ok(tail.every(stat => stat.qualityFallbacks.length > 0))
      assert.ok(item.stats.every(stat => stat.resources.textures <= 79), 'owned frame textures must remain bounded')
      assert.ok(tail.every(stat => stat.outputWidth >= 1920 && stat.outputHeight >= 1080))
    }
  } finally { await browser.close() }
})

test('restoration and neural 2x upscaling produce distinct, correctly oriented GPU output at 1080p', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const results = []
      document.body.replaceChildren()
      for (const width of [256, 1920]) for (const mode of ['off', 'restore', 'upscale']) {
        const height = width * 9 / 16
        const source = new OffscreenCanvas(width, height), ctx = source.getContext('2d')
        ctx.fillStyle = '#dd3020'; ctx.fillRect(0, 0, width, height / 2)
        ctx.fillStyle = '#2080dd'; ctx.fillRect(0, height / 2, width, height / 2)
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(width, height); ctx.stroke()
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const renderer = new MotionRenderer(canvas, 0, false, mode === 'off' ? undefined : mode), gl = renderer.gl
        const originalReadPixels = gl.readPixels.bind(gl)
        let uploadReadbacks = 0, uploading = false
        gl.readPixels = (...args) => { if (uploading) uploadReadbacks++; return originalReadPixels(...args) }
        const field = { width: 1, height: 1, data: new Float32Array([0, 0, 1, 0]), sceneCut: false }
        const times = [], hashes = []
        let frame, texturePixels
        for (let i = 0; i < 4; i++) {
          if (frame) renderer.release(frame)
          uploading = true
          try { frame = renderer.upload(source, i / 30, field) } finally { uploading = false }
          const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frame.texture, 0)
          texturePixels = new Uint8Array(8)
          gl.readPixels(canvas.width / 8, canvas.height / 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, texturePixels.subarray(0, 4))
          gl.readPixels(canvas.width / 8, canvas.height * 3 / 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, texturePixels.subarray(4))
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb)
          renderer.render(frame, frame, 0.5)
          const pixel = new Uint8Array(4)
          gl.readPixels(canvas.width / 8, canvas.height * 3 / 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
          if (gl.getError() !== gl.NO_ERROR) throw new Error('invalid enhancement GL operation: ' + mode)
          if (pixel[0] < pixel[2] + 20) throw new Error('enhancement inverted or blank: ' + mode + ' ' + pixel)
          times.push(renderer.enhancementMs)
        }
        const patch = new Uint8Array(32 * 32 * 4)
        gl.readPixels(canvas.width / 2 - 16, canvas.height / 2 - 16, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, patch)
        let hash = 2166136261
        for (const value of patch) hash = Math.imul(hash ^ value, 16777619)
        hashes.push(hash)
        if (width === 256) {
          const snapshot = document.createElement('canvas'); snapshot.width = canvas.width; snapshot.height = canvas.height
          snapshot.getContext('2d').drawImage(canvas, 0, 0)
          snapshot.style.cssText = 'width:256px;height:144px;display:block;margin:8px'
          document.body.append(snapshot)
        }
        results.push({ width, mode, output: [canvas.width, canvas.height], times, hash, uploadReadbacks, texturePixels: [...texturePixels], failure: renderer.enhancementFailure })
        renderer.stop()
      }
      const recoveryCanvas = document.createElement('canvas'); recoveryCanvas.width = 64; recoveryCanvas.height = 36
      const recoverySource = new OffscreenCanvas(64, 36)
      const recoveryContext = recoverySource.getContext('2d'); recoveryContext.fillStyle = '#40b878'; recoveryContext.fillRect(0, 0, 64, 36)
      const recoveryField = { width: 1, height: 1, data: new Float32Array([0, 0, 1, 0]), sceneCut: false }
      const failed = new MotionRenderer(recoveryCanvas, 0, true, 'restore')
      failed.enhancer.process = () => { throw new Error('controlled enhancement failure') }
      let threw = false
      try { failed.upload(recoverySource, 0, recoveryField) } catch { threw = true }
      failed.disposePipeline()
      const recovered = new MotionRenderer(recoveryCanvas, 0, true)
      const recoveredFrame = recovered.upload(recoverySource, 0, recoveryField)
      recovered.render(recoveredFrame, recoveredFrame, 0)
      const recoveredPixel = new Uint8Array(4), recoveredGl = recovered.gl
      recoveredGl.readPixels(10, 10, 1, 1, recoveredGl.RGBA, recoveredGl.UNSIGNED_BYTE, recoveredPixel)
      const recovery = { threw, error: recoveredGl.getError(), pixel: [...recoveredPixel] }
      recovered.stop()
      return { results, recovery }
    })
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'enhancement-cost.json'), JSON.stringify(report, null, 2))
    await page.screenshot({ path: path.join(output, 'enhancement.png'), fullPage: true })
    console.log('QUALITY_ENHANCEMENT', JSON.stringify(report))
    for (const item of report.results) {
      assert.equal(item.failure, '')
      assert.ok(item.uploadReadbacks <= (item.mode === 'off' ? 0 : 1),
        'enhancement completion fallback may sample once, never once per source frame')
      if (item.mode !== 'off') assert.equal(item.uploadReadbacks, 1)
      assert.deepEqual(item.output, [item.width * (item.mode === 'upscale' ? 2 : 1), item.width * 9 / 16 * (item.mode === 'upscale' ? 2 : 1)])
    }
    assert.equal(new Set(report.results.filter(item => item.width === 256).map(item => item.hash)).size, 3)
    assert.equal(report.recovery.threw, true)
    assert.equal(report.recovery.error, 0, 'failed enhancement query must be ended before the context is reused')
    assert.ok(report.recovery.pixel.slice(0, 3).some(value => value > 0))
  } finally { await browser.close() }
})

test('bidirectional flow preserves thin lines, fast pans, endpoints and cut boundaries', async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const { MotionEstimator } = await import('/src/video/motionFlow.ts')
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const width = 256, height = 144
      const image = offset => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#253045'; ctx.fillRect(0, 0, width, height)
        for (let y = 0; y < height; y += 12) for (let x = -48; x < width; x += 12) {
          const seed = ((x + 80) * 173 + y * 71) % 170
          ctx.fillStyle = `rgb(${60 + seed},${90 + seed / 2},${220 - seed / 2})`
          ctx.fillRect(x + offset, y, 7, 7)
        }
        ctx.fillStyle = '#ffffff'; ctx.fillRect(97 + offset, 25, 1, 90)
        return { canvas, pixels: ctx.getImageData(0, 0, width, height).data }
      }
      const results = []
      for (const displacement of [2, 12, 24]) {
        const estimator = new MotionEstimator(), a = image(0), b = image(displacement), mid = image(displacement / 2)
        const first = estimator.estimate(a.pixels, width, height), field = estimator.estimate(b.pixels, width, height)
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const renderer = new MotionRenderer(canvas, 0), gl = renderer.gl
        const previous = renderer.upload(a.canvas, 0, first), current = renderer.upload(b.canvas, 1 / 24, field)
        const read = () => { const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels }
        const error = (actual, expected, left = 40, right = width - 40) => {
          let sum = 0, n = 0
          for (let y = 25; y < height - 25; y++) for (let x = left; x < right; x++) for (let c = 0; c < 3; c++) {
            sum += Math.abs(actual[((height - 1 - y) * width + x) * 4 + c] - expected[(y * width + x) * 4 + c]); n++
          }
          return sum / n
        }
        renderer.render(previous, current, 0.5)
        const pixels = read(), midpointError = error(pixels, mid.pixels)
        const thinLineError = error(pixels, mid.pixels, 96 + displacement / 2, 100 + displacement / 2)
        renderer.render(previous, current, 0); const startError = error(read(), a.pixels)
        renderer.render(previous, current, 1); const endError = error(read(), b.pixels)
        const occluded = image(displacement), ctx = occluded.canvas.getContext('2d')
        ctx.fillStyle = '#cc4444'; ctx.fillRect(80, 20, 80, 100)
        const occlusion = estimator.estimate(ctx.getImageData(0, 0, width, height).data, width, height)
        let hiddenConfidence = 0, hiddenSamples = 0
        for (let y = 0; y < occlusion.height; y++) for (let x = 0; x < occlusion.width; x++) {
          const px = (x + 0.5) * width / occlusion.width, py = (y + 0.5) * height / occlusion.height
          if (px > 95 && px < 145 && py > 35 && py < 105) {
            hiddenConfidence += occlusion.backward[(y * occlusion.width + x) * 4 + 2]; hiddenSamples++
          }
        }
        renderer.updateFlow(current, { width: 1, height: 1, data: new Float32Array([0, 0, 1, 0]), backward: new Float32Array(4), sceneCut: false })
        renderer.render(previous, current, 0.75)
        const oneSidedError = error(read(), a.pixels)
        renderer.updateFlow(current, { width: 1, height: 1, data: new Float32Array(4), backward: new Float32Array(4), sceneCut: false })
        renderer.render(previous, current, 0.75)
        const unreliableError = error(read(), b.pixels)
        const sharpCanvas = document.createElement('canvas'); sharpCanvas.width = width; sharpCanvas.height = height
        const sharp = new MotionRenderer(sharpCanvas, 0.22), sharpGl = sharp.gl
        const sharpRead = () => { const pixels = new Uint8Array(width * height * 4); sharpGl.readPixels(0, 0, width, height, sharpGl.RGBA, sharpGl.UNSIGNED_BYTE, pixels); return pixels }
        const sharpDifference = (actual, expected) => actual.reduce((sum, value, index) => sum + Math.abs(value - expected[index]), 0) / actual.length
        const sharpPrevious = sharp.upload(a.canvas, 0, first)
        const sharpCurrent = sharp.upload(b.canvas, 1 / 24, {
          width: 1, height: 1,
          data: new Float32Array([0, 0, 1, 0]),
          backward: new Float32Array(4),
          sceneCut: false,
        })
        sharp.render(sharpPrevious, sharpPrevious, 0)
        const sharpReference = sharpRead()
        sharp.render(sharpPrevious, sharpCurrent, 0.75)
        const oneSidedSharpError = sharpDifference(sharpRead(), sharpReference)
        sharp.render(sharpPrevious, sharpCurrent, 1)
        const sharpEnd = sharpRead()
        sharpCurrent.cut = true
        sharp.render(sharpCurrent, sharpCurrent, 1)
        const sharpEndError = sharpDifference(sharpEnd, sharpRead())
        sharp.stop()
        current.cut = true; renderer.render(previous, current, 0.75)
        const cutHoldError = error(read(), a.pixels)
        const white = new Uint8ClampedArray(width * height * 4).fill(255)
        const cut = estimator.estimate(white, width, height)
        results.push({ displacement, midpointError, thinLineError, startError, endError, cutHoldError, oneSidedError, oneSidedSharpError, sharpEndError, unreliableError,
          hiddenConfidence: hiddenConfidence / hiddenSamples,
          panCut: field.sceneCut, occlusionCut: occlusion.sceneCut, cut: cut.sceneCut,
          occlusionConfidence: Array.from(occlusion.backward).filter((_, i) => i % 4 === 2).filter(v => v < 0.15).length })
        renderer.stop()
      }
      return results
    })
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'motion-quality.json'), JSON.stringify(report, null, 2))
    console.log('QUALITY_MOTION', JSON.stringify(report))
    for (const item of report) {
      assert.equal(item.panCut, false)
      assert.equal(item.occlusionCut, false)
      assert.equal(item.cut, true)
      assert.equal(item.startError, 0); assert.equal(item.endError, 0); assert.equal(item.cutHoldError, 0)
      assert.equal(item.oneSidedError, 0); assert.equal(item.unreliableError, 0)
      assert.equal(item.oneSidedSharpError, 0, 'sharp detail must come from the trusted one-sided frame')
      assert.equal(item.sharpEndError, 0, 'the sharp endpoint must use the original endpoint frame')
      assert.ok(item.hiddenConfidence < 0.2, 'occluded region must reject inconsistent tracks')
      assert.ok(item.midpointError < 12, 'fast pan midpoint should retain image structure')
      assert.ok(item.thinLineError < 25, 'one-pixel line should survive motion compensation')
      assert.ok(item.occlusionConfidence > 0)
    }
  } finally { await browser.close() }
})

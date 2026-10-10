const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

test('GPU storage reuse preserves pixels, resizing and enhancement fallback without recompiling interpolation', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })
  const output = path.resolve(__dirname, '../sanye_deploy/.local/player-quality/p2-gpu')
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188')
    const reference = '/@fs/' + path.resolve(__dirname, '../sanye_deploy/.local/player-quality/pre-p2/sanye_client/src/video/motionRenderer.ts').replaceAll('\\', '/')
    const report = await page.evaluate(async reference => {
      const { MotionRenderer: Before } = await import(reference)
      const { MotionRenderer: After } = await import('/src/video/motionRenderer.ts')
      const results = [], screenshots = []
      const field = { width: 8, height: 4, data: new Float32Array(8 * 4 * 4), sceneCut: false }
      for (let i = 2; i < field.data.length; i += 4) field.data[i] = 1
      const blank = { width: 1, height: 1, data: new Float32Array(4), sceneCut: true }
      function instrument(gl) {
        const counts = { allocations: 0, updates: 0, programs: 0, attributes: 0, uniforms: 0 }
        const liveTextures = new Set(), livePrograms = new Set()
        for (const [method, key] of [['texImage2D', 'allocations'], ['copyTexImage2D', 'allocations'],
          ['texSubImage2D', 'updates'], ['copyTexSubImage2D', 'updates'], ['createProgram', 'programs'],
          ['getAttribLocation', 'attributes'], ['getUniformLocation', 'uniforms']]) {
          const native = gl[method].bind(gl)
          gl[method] = (...args) => { counts[key]++; return native(...args) }
        }
        for (const [create, destroy, live] of [['createTexture', 'deleteTexture', liveTextures], ['createProgram', 'deleteProgram', livePrograms]]) {
          const allocate = gl[create].bind(gl), release = gl[destroy].bind(gl)
          gl[create] = (...args) => { const value = allocate(...args); if (value) live.add(value); return value }
          gl[destroy] = value => { live.delete(value); return release(value) }
        }
        return { counts, liveTextures, livePrograms }
      }
      function draw(source, index) {
        const context = source.getContext('2d'), { width, height } = source
        context.fillStyle = `rgb(${180 + index},40,30)`; context.fillRect(0, 0, width, height / 2)
        context.fillStyle = 'rgb(30,90,210)'; context.fillRect(0, height / 2, width, height / 2)
        context.strokeStyle = 'white'; context.lineWidth = 1
        context.beginPath(); context.moveTo(width / 4, 0); context.lineTo(width / 2, height); context.stroke()
      }
      for (const width of [256, 1920]) for (const mode of ['off', 'restore', 'upscale']) {
        for (const [variant, Renderer] of [['before', Before], ['after', After]]) {
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width * 9 / 16
          const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false })
          const tracked = instrument(gl)
          const renderer = new Renderer(canvas, 0, false, mode === 'off' ? undefined : mode)
          const source = new OffscreenCanvas(width, width * 9 / 16), costs = [], hashes = []
          let frame
          for (let index = 0; index < 10; index++) {
            draw(source, index)
            if (frame) renderer.release(frame)
            const started = performance.now()
            frame = renderer.upload(source, index / 30, blank, true)
            renderer.updateFlow(frame, field); renderer.render(frame, frame, 0)
            const pixels = new Uint8Array(16 * 16 * 4)
            gl.readPixels(canvas.width / 2 - 8, canvas.height / 2 - 8, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
            if (gl.getError() !== gl.NO_ERROR) throw new Error(`GL failure: ${variant} ${mode}`)
            if (index >= 3) costs.push(performance.now() - started)
            let hash = 2166136261
            for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619)
            hashes.push(hash)
          }
          if (width === 256 && variant === 'after') {
            const image = document.createElement('canvas'); image.width = canvas.width; image.height = canvas.height
            image.getContext('2d').drawImage(canvas, 0, 0); image.style.width = '256px'; screenshots.push(image)
          }
          const resources = renderer.resourceStats ?? null
          renderer.stop()
          results.push({ width, mode, variant, costs, hashes, counts: tracked.counts, resources,
            remainingTextures: tracked.liveTextures.size, remainingPrograms: tracked.livePrograms.size })
        }
      }
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 144
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false }), tracked = instrument(gl)
      const renderer = new After(canvas, 0, true, 'upscale')
      const source = new OffscreenCanvas(256, 144); draw(source, 1)
      let frame = renderer.upload(source, 0, field)
      renderer.release(frame); renderer.release(frame)
      const pooledOnce = renderer.resourceStats.pooledFrames
      const programsBefore = tracked.counts.programs
      renderer.setEnhancement('restore', 0)
      frame = renderer.upload(source, 1, field); renderer.release(frame)
      renderer.setEnhancement(undefined, 0.05)
      canvas.width = source.width = 128; canvas.height = source.height = 72; draw(source, 2)
      frame = renderer.upload(source, 2, field); renderer.render(frame, frame, 0)
      const pixel = new Uint8Array(4); gl.readPixels(10, 50, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      const fallback = { pooledOnce, programDelta: tracked.counts.programs - programsBefore,
        pixel: [...pixel], error: gl.getError(), resources: renderer.resourceStats }
      renderer.release(frame); renderer.clearFramePool()
      const clearedPool = renderer.resourceStats
      renderer.setEnhancement('restore', 0)
      renderer.enhancer.process = () => { throw new Error('controlled failure') }
      let threw = false
      try { renderer.upload(source, 3, field) } catch { threw = true }
      renderer.setEnhancement(undefined, 0.05)
      const afterFailure = renderer.resourceStats
      frame = renderer.upload(source, 4, field); renderer.render(frame, frame, 0)
      renderer.release(frame)
      const held = Array.from({ length: 40 }, (_, index) => renderer.upload(source, 5 + index, field))
      for (const value of held) renderer.release(value)
      const boundedPool = renderer.resourceStats
      renderer.stop(); renderer.stop()
      document.body.replaceChildren(...screenshots)
      return { results, fallback, clearedPool, boundedPool, afterFailure, threw, remainingTextures: tracked.liveTextures.size, remainingPrograms: tracked.livePrograms.size }
    }, reference)
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    await page.screenshot({ path: path.join(output, 'profiles.png') })
    for (const item of report.results.filter(item => item.variant === 'after')) {
      const previous = report.results.find(value => value.variant === 'before' && value.width === item.width && value.mode === item.mode)
      assert.deepEqual(item.hashes, previous.hashes, `${item.mode} ${item.width} pixels changed`)
      assert.ok(new Set(item.hashes).size > 1, 'storage reuse must still upload changing image content')
      assert.ok(item.counts.allocations < previous.counts.allocations)
      assert.ok(item.counts.uniforms < previous.counts.uniforms)
      assert.equal(item.remainingTextures, 0); assert.equal(item.remainingPrograms, 0)
    }
    assert.equal(report.fallback.pooledOnce, 1)
    assert.equal(report.fallback.programDelta, 0)
    assert.equal(report.fallback.error, 0)
    assert.equal(report.clearedPool.textures, 0)
    assert.equal(report.clearedPool.ownedTextureBytes, 0)
    assert.equal(report.boundedPool.pooledFrames, 24)
    assert.equal(report.boundedPool.textures, 72)
    assert.ok(report.fallback.pixel[0] > report.fallback.pixel[2])
    assert.equal(report.threw, true)
    assert.equal(report.afterFailure.textures, 0)
    assert.equal(report.remainingTextures, 0); assert.equal(report.remainingPrograms, 0)
    console.log('P2_GPU_PIPELINE', JSON.stringify(report.results.map(({ hashes, ...rest }) => rest)))
  } finally { await browser.close() }
})

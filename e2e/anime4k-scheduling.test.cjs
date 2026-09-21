const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

test('performance enhancement follows decoded frames and releases its canvas on stop', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto('http://127.0.0.1:5187/')
    const result = await page.evaluate(async () => {
      const { startAnime4KVideo } = await import('/src/video/anime4k.ts')
      const container = document.createElement('div')
      container.className = 'art-video-player'
      const video = document.createElement('video')
      const source = document.createElement('canvas')
      source.width = 320; source.height = 180
      const ctx = source.getContext('2d')
      let raf
      let count = 0
      const draw = () => { ctx.fillStyle = count++ % 2 ? '#e04040' : '#40c060'; ctx.fillRect(0, 0, 320, 180); raf = requestAnimationFrame(draw) }
      draw()
      const stream = source.captureStream(60)
      video.srcObject = stream; video.muted = true
      container.append(video); document.body.append(container)
      let session
      try {
        await video.play()
        await new Promise(resolve => video.requestVideoFrameCallback(resolve))
        const original = video.requestVideoFrameCallback.bind(video)
        let scheduled = 0
        video.requestVideoFrameCallback = callback => { scheduled++; return original(callback) }
        session = await startAnime4KVideo(video, 'fast')
        await new Promise(resolve => setTimeout(resolve, 500))
        const dimensions = { width: session.canvas.width, height: session.canvas.height }
        video.pause()
        await new Promise(resolve => setTimeout(resolve, 100))
        const paused = !container.classList.contains('sanye-anime4k-active')
        await video.play()
        await new Promise(resolve => setTimeout(resolve, 100))
        const resumed = container.classList.contains('sanye-anime4k-active')
        session.stop()
        return { scheduled, dimensions, paused, resumed, remaining: container.querySelectorAll('canvas').length }
      } finally {
        session?.stop(); cancelAnimationFrame(raf)
        stream.getTracks().forEach(track => track.stop()); video.srcObject = null; container.remove()
      }
    })
    assert.ok(result.scheduled > 0, 'must use requestVideoFrameCallback instead of fixed 30fps timer')
    assert.deepEqual(result.dimensions, { width: 320, height: 180 })
    assert.equal(result.paused, true)
    assert.equal(result.resumed, true)
    assert.equal(result.remaining, 0)
  } finally { await browser.close() }
})

test('quality profiles keep native resolution and fast mode reduces GPU passes', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto('http://127.0.0.1:5187/')
    const result = await page.evaluate(async () => {
      const { createAnime4KVideoUpscaler } = await import('/src/video/anime4kRuntime.ts')
      const { VideoUpscaler } = await import('/node_modules/anime4k.js/dist/upscaler.mjs')
      const shaders = await import('/node_modules/anime4k.js/dist/shaders.mjs')
      const source = document.createElement('canvas')
      source.width = 1920; source.height = 1080
      const context = source.getContext('2d')
      context.fillStyle = '#38a080'; context.fillRect(0, 0, 1920, 1080)
      context.fillStyle = '#f08060'; context.fillRect(600, 200, 500, 600)
      const stream = source.captureStream(30)
      const video = document.createElement('video')
      video.srcObject = stream; video.muted = true
      document.body.append(video)
      const results = {}
      try {
        await video.play()
        const profiles = {
          previousFast: new VideoUpscaler([shaders.Anime4K_Clamp_Highlights, shaders.Anime4K_Restore_CNN_S]),
          fast: createAnime4KVideoUpscaler('fast'),
          balanced: createAnime4KVideoUpscaler('balanced'),
          sharp: createAnime4KVideoUpscaler('sharp'),
        }
        for (const [name, upscaler] of Object.entries(profiles)) {
          const canvas = document.createElement('canvas')
          const original = WebGLRenderingContext.prototype.drawArrays
          let passes = 0
          WebGLRenderingContext.prototype.drawArrays = function (...args) { passes++; return original.apply(this, args) }
          try {
            upscaler.attachVideo(video, canvas)
            upscaler.start()
            const gl = canvas.getContext('webgl')
            const pixel = new Uint8Array(4)
            gl.readPixels(960, 540, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
            results[name] = { passes, width: canvas.width, height: canvas.height, pixel: [...pixel] }
          } finally {
            WebGLRenderingContext.prototype.drawArrays = original
            upscaler.detachVideo()
          }
        }
      } finally {
        stream.getTracks().forEach(track => track.stop()); video.srcObject = null; video.remove()
      }
      return results
    })
    console.log('QUALITY_GPU_CHECK', JSON.stringify(result))
    assert.ok(result.fast.passes < result.previousFast.passes)
    for (const name of ['fast', 'balanced', 'sharp']) {
      assert.equal(result[name].width, 1920)
      assert.equal(result[name].height, 1080)
      assert.ok(result[name].pixel.slice(0, 3).some(value => value > 0), `${name} must render a nonblank frame`)
    }
  } finally { await browser.close() }
})

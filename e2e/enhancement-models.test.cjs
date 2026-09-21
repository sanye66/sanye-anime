const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const output = path.resolve(__dirname, '../sanye_deploy/.local/enhancement-models')

test('installed Anime4K model candidates report completed GPU cost and valid pixels', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const { ImageUpscaler } = await import('/node_modules/anime4k.js/dist/upscaler.mjs')
      const shaders = await import('/node_modules/anime4k.js/dist/shaders.mjs')
      document.body.replaceChildren()
      document.body.style.cssText = 'background:#202428;color:white;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px'
      const results = []
      for (const mode of ['restore', 'upscale']) for (const size of ['S', 'M', 'L']) {
        const source = document.createElement('canvas'); source.width = 1920; source.height = 1080
        const ctx = source.getContext('2d')
        ctx.fillStyle = '#df3527'; ctx.fillRect(0, 0, 1920, 540)
        ctx.fillStyle = '#227bde'; ctx.fillRect(0, 540, 1920, 540)
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
        for (let x = 150; x < 1800; x += 150) {
          ctx.beginPath(); ctx.moveTo(x, 80); ctx.bezierCurveTo(x - 80, 330, x + 80, 690, x, 1000); ctx.stroke()
        }
        const canvas = document.createElement('canvas')
        const pipeline = [shaders.Anime4K_Clamp_Highlights, shaders['Anime4K_Restore_CNN_' + size]]
        if (mode === 'upscale') pipeline.push(shaders['Anime4K_Upscale_CNN_x2_' + size])
        const upscaler = new ImageUpscaler(pipeline)
        try {
          upscaler.attachSource(source, canvas)
          const gl = canvas.getContext('webgl'), pixel = new Uint8Array(4), times = []
          const info = gl.getExtension('WEBGL_debug_renderer_info')
          for (let i = 0; i < 5; i++) {
            const started = performance.now()
            upscaler.upscale()
            // Synchronize the measurement with GPU completion, including upload and all passes.
            gl.readPixels(canvas.width / 16, canvas.height * 3 / 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
            times.push(performance.now() - started)
          }
          const top = [...pixel]
          gl.readPixels(canvas.width / 16, canvas.height / 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
          const steady = times.slice(2).sort((a, b) => a - b)
          results.push({ mode, size, width: canvas.width, height: canvas.height, top, bottom: [...pixel],
            gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            samplesMs: times, medianMs: steady[1], glError: gl.getError() })
          const figure = document.createElement('figure'), label = document.createElement('figcaption')
          figure.style.margin = '0'; label.textContent = `${mode} ${size}: ${steady[1].toFixed(1)} ms`
          const snapshot = document.createElement('canvas'); snapshot.width = 320; snapshot.height = 180
          snapshot.getContext('2d').drawImage(canvas, 0, 0, 320, 180)
          snapshot.style.cssText = 'width:100%;height:auto'
          figure.append(snapshot, label); document.body.append(figure)
        } finally { upscaler.detachSource(); canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext() }
      }
      return results
    })
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    await page.screenshot({ path: path.join(output, 'models.png'), fullPage: true })
    for (const item of report) {
      console.log('MODEL_COST', JSON.stringify(item))
      assert.equal(item.glError, 0)
      assert.ok(item.top[0] > item.top[2] + 50 && item.bottom[2] > item.bottom[0] + 50)
      assert.deepEqual([item.width, item.height], item.mode === 'upscale' ? [3840, 2160] : [1920, 1080])
      assert.ok(item.medianMs > 0)
    }
  } finally { await browser.close() }
})

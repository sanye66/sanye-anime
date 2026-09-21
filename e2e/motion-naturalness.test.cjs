const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

test('GPU motion synthesis advances edges and rejects conflicting motion without sharpening halos', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188/')
    const result = await page.evaluate(async () => {
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const width = 64, height = 32
      const image = offset => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = 'rgb(80,80,80)'; ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = 'rgb(160,160,160)'; ctx.fillRect(16 + offset, 8, 8, 16)
        return canvas
      }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      const renderer = new MotionRenderer(canvas, 1)
      const gl = renderer.gl
      const forward = { width: 1, height: 1, data: new Float32Array([8 / width, 0, 1, 0]),
        backward: new Float32Array([-8 / width, 0, 1, 0]), sceneCut: false }
      const previous = renderer.upload(image(0), 0, forward)
      const current = renderer.upload(image(8), 1, forward)
      const sample = (x, y = 16) => {
        const pixel = new Uint8Array(4)
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        return pixel[0]
      }
      renderer.render(previous, current, 0.5)
      const motion = [sample(18), sample(22), sample(26), sample(30)]
      renderer.updateFlow(current, { ...forward, backward: new Float32Array([8 / width, 0, 1, 0]) })
      renderer.render(previous, current, 0.75)
      const conflict = sample(26)
      renderer.updateFlow(current, { ...forward, backward: new Float32Array(4) })
      renderer.render(previous, current, 0.5)
      const oneSided = [sample(18), sample(22), sample(26), sample(30)]
      renderer.render(previous, current, 0)
      const edge = [sample(15), sample(16), sample(23), sample(24)]
      const error = gl.getError()
      renderer.stop()
      return { motion, conflict, oneSided, edge, error }
    })
    assert.equal(result.error, 0)
    assert.ok(result.motion[1] > 135 && result.motion[2] > 135, `moving edge should occupy midpoint: ${result.motion}`)
    assert.ok(result.motion[0] < 105 && result.motion[3] < 105, `moving edge should not leave trails: ${result.motion}`)
    assert.ok(result.conflict > 135, `conflicting flow must select unwarped nearest source: ${result.conflict}`)
    assert.ok(result.oneSided[1] > 135 && result.oneSided[2] > 135,
      `trusted one-sided flow must retain nonzero motion: ${result.oneSided}`)
    assert.ok(result.oneSided[0] < 105 && result.oneSided[3] < 105,
      `trusted one-sided flow must not fall back to a stationary frame: ${result.oneSided}`)
    assert.ok(result.edge.every(value => value >= 75 && value <= 165), `sharpening must stay within source range: ${result.edge}`)
    console.log('MOTION_NATURALNESS', JSON.stringify(result))
  } finally { await browser.close() }
})

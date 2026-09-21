const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

test('enhance-source caching is compared with enhance-each-output at identical output sizes', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })
  try {
    const page = await browser.newPage()
    await page.goto(process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188')
    const report = await page.evaluate(async () => {
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const width = 1920, height = 1080, phases = [0.2, 0.4, 0.6, 0.8], results = []
      const image = shift => {
        const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ad392b'; ctx.fillRect(0, 0, width, height / 2)
        ctx.fillStyle = '#235fb6'; ctx.fillRect(0, height / 2, width, height / 2)
        ctx.fillStyle = 'white'; ctx.fillRect(width / 2 + shift, 10, 1, height - 20)
        return canvas
      }
      const a = image(0), b = image(8)
      const flow = { width: 1, height: 1, data: new Float32Array([8 / width, 0, 1, 0]),
        backward: new Float32Array([-8 / width, 0, 1, 0]), sceneCut: false }
      const still = { ...flow, data: new Float32Array([0, 0, 1, 0]), backward: new Float32Array([0, 0, 1, 0]) }
      const make = mode => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        return new MotionRenderer(canvas, 0, false, mode)
      }
      const read = renderer => {
        const pixels = new Uint8Array(64 * 64 * 4), gl = renderer.gl
        gl.readPixels(renderer.canvas.width / 2 - 32, renderer.canvas.height / 2 - 32, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Processing-order GL failure')
        return pixels
      }
      for (const mode of ['restore', 'upscale']) {
        const cached = make(mode), raw = make(), late = make(mode)
        try {
          let start = performance.now()
          const cachedA = cached.upload(a, 0, flow), cachedB = cached.upload(b, 1 / 24, flow)
          read(cached)
          const sourceSetupMs = performance.now() - start
          const rawA = raw.upload(a, 0, flow), rawB = raw.upload(b, 1 / 24, flow)
          const cachedCosts = [], lateCosts = [], differences = []
          let outputFrame
          for (const phase of phases) {
            start = performance.now(); cached.render(cachedA, cachedB, phase)
            const before = read(cached); cachedCosts.push(performance.now() - start)
            if (outputFrame) late.release(outputFrame)
            start = performance.now(); raw.render(rawA, rawB, phase)
            outputFrame = late.upload(raw.canvas, phase / 24, still); late.render(outputFrame, outputFrame, 0)
            const after = read(late); lateCosts.push(performance.now() - start)
            let difference = 0
            for (let i = 0; i < before.length; i++) difference += Math.abs(before[i] - after[i])
            differences.push(difference / before.length)
          }
          results.push({ mode, input: [width, height], output: [cached.canvas.width, cached.canvas.height],
            alternativeOutput: [late.canvas.width, late.canvas.height], sourceEnhancements: 2, outputEnhancements: phases.length,
            sourceSetupMs, cachedCosts, lateCosts, midpointDifference: differences })
        } finally { cached.stop(); raw.stop(); late.stop() }
      }
      return results
    })
    const output = path.resolve(__dirname, '../sanye_deploy/.local/player-quality/p2-gpu')
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'processing-order.json'), JSON.stringify(report, null, 2))
    for (const item of report) {
      assert.deepEqual(item.output, item.alternativeOutput)
      assert.ok(item.cachedCosts.every(Number.isFinite) && item.lateCosts.every(Number.isFinite))
      assert.ok(item.midpointDifference.every(Number.isFinite))
    }
    console.log('P2_PROCESSING_ORDER', JSON.stringify(report))
  } finally { await browser.close() }
})

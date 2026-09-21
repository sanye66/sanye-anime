const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const { width, height, image, identity, rotate, scenarios, loadEstimator, originalFile, currentFile } = require('./p2-motion-cpu.test.cjs')

test('rendered midpoint quality is compared with analytic motion truth, not only accepted vectors', { timeout: 60000 }, async () => {
  const fixtures = []
  for (const scenario of scenarios.filter(value => value.name !== 'cut')) {
    const midMap = scenario.name.startsWith('rotation')
      ? (x, y) => rotate(x, y, -Number.parseInt(scenario.name.split('-')[1]) * Math.PI / 360)
      : scenario.name === 'deformation' ? (x, y) => [x - 5.5 * Math.sin(y * 0.045), y]
        : (x, y) => [x - 4, y - (scenario.name === 'pan' ? 2 : 0)]
    const beforeOverlay = scenario.name === 'occlusion' ? scenario.overlay : scenario.beforeOverlay
    const midOverlay = scenario.name === 'thin-line' ? (x, y) => x === 94 && y >= 25 && y < 165 ? 235 : undefined
      : scenario.name === 'occlusion' ? scenario.overlay : undefined
    const before = image(identity, beforeOverlay), after = image(scenario.inverse, scenario.overlay), truth = image(midMap, midOverlay)
    const fields = {}
    for (const [key, file] of [['before', originalFile], ['after', currentFile]]) {
      const Estimator = loadEstimator(file), estimator = new Estimator()
      estimator.estimate(before, width, height)
      const field = estimator.estimate(after, width, height)
      fields[key] = { ...field, data: [...field.data], backward: [...field.backward] }
    }
    fixtures.push({ name: scenario.name, before: Buffer.from(before).toString('base64'),
      after: Buffer.from(after).toString('base64'), truth: Buffer.from(truth).toString('base64'), fields })
  }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188')
    const result = await page.evaluate(async ({ fixtures, width, height }) => {
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const decode = encoded => Uint8ClampedArray.from(atob(encoded), value => value.charCodeAt(0))
      const makeImage = data => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0)
        return canvas
      }
      const results = [], previews = []
      for (const fixture of fixtures) {
        const a = makeImage(decode(fixture.before)), b = makeImage(decode(fixture.after)), truth = decode(fixture.truth)
        const row = document.createElement('div'), label = document.createElement('div'); label.textContent = fixture.name
        row.append(label, makeImage(truth))
        const errors = {}
        for (const variant of ['before', 'after']) {
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
          const renderer = new MotionRenderer(canvas, 0)
          const field = { ...fixture.fields[variant], data: new Float32Array(fixture.fields[variant].data), backward: new Float32Array(fixture.fields[variant].backward) }
          const previous = renderer.upload(a, 0, field), current = renderer.upload(b, 1 / 24, field)
          renderer.render(previous, current, 0.5)
          const pixels = new Uint8Array(width * height * 4), gl = renderer.gl
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          if (gl.getError() !== gl.NO_ERROR) throw new Error('Invalid quality output')
          let sum = 0, count = 0, bad = 0
          for (let y = 20; y < height - 20; y++) for (let x = 20; x < width - 20; x++) {
            const error = Math.abs(pixels[((height - 1 - y) * width + x) * 4] - truth[(y * width + x) * 4])
            sum += error; count++; if (error > 30) bad++
          }
          const snapshot = document.createElement('canvas'); snapshot.width = width; snapshot.height = height
          snapshot.getContext('2d').drawImage(canvas, 0, 0); row.append(snapshot)
          errors[variant] = { mae: sum / count, pixelsOver30: bad, count }
          renderer.stop()
        }
        results.push({ name: fixture.name, ...errors }); previews.push(row)
      }
      document.body.replaceChildren(...previews)
      return results
    }, { fixtures, width, height })
    const output = path.resolve(__dirname, '../sanye_deploy/.local/player-quality/p2-motion-render')
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(result, null, 2))
    await page.screenshot({ path: path.join(output, 'comparison.png'), fullPage: true })
    console.log('P2_RENDERED_MOTION', JSON.stringify(result))
    assert.ok(result.every(item => item.after.mae <= item.before.mae + 0.5), 'candidate must not materially regress other motion scenes')
    assert.ok(result.some(item => item.after.mae < item.before.mae - 0.01), 'vector rejection alone is not a visual improvement')
    for (const [name, ratio] of [['deformation', 0.95], ['occlusion', 0.9], ['rotation-6deg', 0.99]]) {
      const item = result.find(value => value.name === name)
      assert.ok(item.after.mae <= item.before.mae * ratio, `${name} did not retain its measured pixel improvement`)
    }
  } finally { await browser.close() }
})

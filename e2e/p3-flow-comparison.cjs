const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const experiment = path.resolve(process.argv[2] || '')
if (!process.argv[2]) {
  console.error('Usage: node e2e/p3-flow-comparison.cjs <p3-experiment-directory> [frontend-url]')
  process.exit(2)
}
const frontendUrl = process.argv[3] || process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const candidateReportPath = path.join(experiment, 'report.json')
const outputRoot = path.join(experiment, 'flow-comparison')

async function fileBase64(filename) {
  return (await fs.readFile(filename)).toString('base64')
}

async function main() {
  const candidateReport = JSON.parse(await fs.readFile(candidateReportPath, 'utf8'))
  const pairSuite = candidateReport.pairSuite
  if (!pairSuite?.results?.length) throw new Error(`No pairSuite results in ${candidateReportPath}`)
  await fs.mkdir(outputRoot, { recursive: false })

  const fixtures = []
  for (const row of pairSuite.results) {
    const beforePath = path.join(experiment, 'pair-input', row.scenario, '0.png')
    const afterPath = path.join(experiment, 'pair-input', row.scenario, '1.png')
    fixtures.push({
      scenario: row.scenario,
      timestep: row.timestep,
      before: await fileBase64(beforePath),
      after: await fileBase64(afterPath),
      truth: row.truth.path,
    })
  }

  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(frontendUrl)
    const rendered = await page.evaluate(async ({ fixtures, width, height }) => {
      const { MotionEstimator } = await import('/src/video/motionFlow.ts')
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const decode = async encoded => {
        const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(bitmap, 0, 0)
        bitmap.close()
        return canvas
      }
      const encodePixels = pixels => {
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const topDown = new Uint8ClampedArray(pixels.length)
        for (let y = 0; y < height; y++) {
          const source = (height - 1 - y) * width * 4
          topDown.set(pixels.subarray(source, source + width * 4), y * width * 4)
        }
        canvas.getContext('2d').putImageData(new ImageData(topDown, width, height), 0, 0)
        return { canvas, png: canvas.toDataURL('image/png').split(',')[1] }
      }

      document.body.replaceChildren()
      document.body.style.cssText = 'margin:16px;background:#17191d;color:#eee;font:14px sans-serif'
      const results = []
      const byScenario = new Map()
      for (const fixture of fixtures) {
        let state = byScenario.get(fixture.scenario)
        if (!state) {
          const before = await decode(fixture.before), after = await decode(fixture.after)
          const beforePixels = before.getContext('2d').getImageData(0, 0, width, height).data
          const afterPixels = after.getContext('2d').getImageData(0, 0, width, height).data
          const estimator = new MotionEstimator()
          const estimateStarted = performance.now()
          estimator.estimate(beforePixels, width, height)
          const field = estimator.estimate(afterPixels, width, height)
          const estimateMs = performance.now() - estimateStarted
          const renderCanvas = document.createElement('canvas')
          renderCanvas.width = width; renderCanvas.height = height
          const renderer = new MotionRenderer(renderCanvas, 0)
          const uploadStarted = performance.now()
          const previous = renderer.upload(before, 0, field)
          const current = renderer.upload(after, 1, field)
          renderer.gl.finish()
          const uploadFinishMs = performance.now() - uploadStarted
          state = { renderer, previous, current, estimateMs, uploadFinishMs }
          byScenario.set(fixture.scenario, state)
        }
        const { renderer, previous, current } = state
        const pixels = new Uint8Array(width * height * 4)
        const renderStarted = performance.now()
        renderer.render(previous, current, fixture.timestep)
        renderer.gl.finish()
        const renderFinishMs = performance.now() - renderStarted
        const readbackStarted = performance.now()
        renderer.gl.readPixels(0, 0, width, height, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels)
        const readbackMs = performance.now() - readbackStarted
        if (renderer.gl.getError() !== renderer.gl.NO_ERROR) throw new Error(`WebGL error for ${fixture.scenario}`)
        const encoded = encodePixels(pixels)
        const row = document.createElement('section')
        row.style.cssText = 'display:flex;align-items:center;gap:12px;margin:8px 0'
        const label = document.createElement('span')
        label.style.width = '150px'
        label.textContent = `${fixture.scenario} t=${fixture.timestep}`
        row.append(label, encoded.canvas)
        document.body.append(row)
        results.push({
          scenario: fixture.scenario,
          timestep: fixture.timestep,
          truth: fixture.truth,
          png: encoded.png,
          timing: {
            estimatePairMs: state.estimateMs,
            uploadAndFinishMs: state.uploadFinishMs,
            renderAndFinishMs: renderFinishMs,
            readbackMs,
            firstForScenario: !results.some(item => item.scenario === fixture.scenario),
          },
        })
      }
      for (const state of byScenario.values()) state.renderer.stop()
      return results
    }, { fixtures, width: pairSuite.width, height: pairSuite.height })

    const reportResults = []
    for (const item of rendered) {
      const scenarioDir = path.join(outputRoot, item.scenario)
      await fs.mkdir(scenarioDir, { recursive: true })
      const output = path.join(scenarioDir, `t-${item.timestep.toFixed(2)}.png`)
      await fs.writeFile(output, Buffer.from(item.png, 'base64'), { flag: 'wx' })
      reportResults.push({ ...item, png: undefined, output, truth: path.resolve(item.truth) })
    }
    const screenshot = path.join(outputRoot, 'comparison.png')
    await page.screenshot({ path: screenshot, fullPage: true })
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      experiment,
      frontendUrl,
      width: pairSuite.width,
      height: pairSuite.height,
      timingMeaning: 'Motion pair estimation and texture upload are once per scene; renderAndFinishMs includes gl.finish for each timestep; readbackMs is recorded separately.',
      screenshot,
      results: reportResults,
    }
    const reportPath = path.join(outputRoot, 'report.json')
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' })
    console.log(JSON.stringify({ status: 'passed', report: reportPath, results: reportResults.length }))
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error.stack || error)
  process.exitCode = 1
})

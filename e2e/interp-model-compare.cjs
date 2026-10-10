/**
 * Measure the production optical-flow interpolator and a neural candidate on the same real triplets.
 *
 * Protocol: `e2e/interp-model-extract.py` exports triplets (frame n, frame n+1, frame n+2) from a real
 * clip. Frame n+1 is the ground truth for a phase-0.5 interpolation between the outer frames, so both
 * methods are scored against a real frame rather than against synthetic truth or against each other.
 *
 * Both methods are measured by the same code, in the same page, against the same decoded pixels:
 *
 *   flow  the production path, unchanged: resize to the analysis width chosen by FlowAnalysisPolicy,
 *         estimate motion with `MotionEstimator`, upload the full-resolution pair, and render at
 *         phase 0.5 with `MotionRenderer`.
 *   rife  rife-ncnn-vulkan v4.6 (fixed release, hash-audited in the P3 record), pair mode, GPU 0.
 *
 * Neither method is given a hint about the other, and the score is not derived from either method's
 * own confidence fields. Nearest-frame baselines are reported as well, so the two numbers can be read
 * against "what holding a source frame would have looked like".
 *
 * This measures interpolation accuracy, not realtime playback cost. It does not touch player code.
 */

const { chromium } = require('playwright')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

/** Minimal argv handling: positional run directory, then `--key value` pairs. */
const argv = process.argv.slice(2)
const option = key => {
  const index = argv.indexOf(`--${key}`)
  return index >= 0 ? argv[index + 1] : undefined
}
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const runRoot = path.resolve(!argv[0]?.startsWith('--') && argv[0]
  ? argv[0] : 'sanye_deploy/.local/player-quality/interp-model-comparison/run1')
const rifeRoot = path.resolve('sanye_deploy/.local/player-quality/p3/candidate/rife-ncnn-vulkan-20221029-windows')
const rifeExe = path.join(rifeRoot, 'rife-ncnn-vulkan.exe')
const rifeModel = path.join(rifeRoot, 'rife-v4.6')
/** Border excluded from the score: interpolation has no valid source beyond the frame edge. */
const BORDER = 24
/**
 * Analysis widths for the production path. The shipped `FlowAnalysisPolicy` starts at 128 for a
 * 1080p source and promotes itself up to 384 when the measured flow cost leaves budget, so the
 * initial width alone would understate what the player can actually do. Measuring the whole range
 * separates "the algorithm is weak here" from "the analysis budget is tight here".
 */
const ANALYSIS_WIDTHS = (option('widths') || '128,192,256,384').split(',').map(Number)
/** Representative cases exported as side-by-side images for visual review. */
const PREVIEW_LIMIT = 6

async function rifeOnce(aPath, bPath, outPath) {
  const started = Date.now()
  const result = spawnSync(rifeExe, ['-0', aPath, '-1', bPath, '-o', outPath, '-m', rifeModel, '-g', '0'],
    { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0 || !fs.existsSync(outPath)) {
    throw new Error(`rife failed (${result.status}): ${result.stderr || result.stdout}`)
  }
  return { invoked: true, elapsedMs: Date.now() - started }
}

async function main() {
  const fixtures = JSON.parse(await fsp.readFile(path.join(runRoot, 'fixtures.json'), 'utf8'))
  const rifeDir = path.join(runRoot, 'rife')
  await fsp.mkdir(rifeDir, { recursive: true })

  // Only triplets that do not span a cut are scored. Cuts are reported separately because the two
  // methods are specified to behave differently there rather than better or worse.
  const only = option('only')?.split(',').filter(Boolean)
  const scored = fixtures.triplets.filter(item => !item.isCut && (!only || only.includes(item.name)))
  const skipped = fixtures.triplets.filter(item => item.isCut)
  const rifeCosts = {}
  // Reuse an existing candidate output when only the flow side is being re-measured at new widths.
  for (const item of scored) {
    const outPath = path.join(rifeDir, `${item.name}.png`)
    if (fs.existsSync(outPath) && option('reuse-rife') !== 'false') {
      rifeCosts[item.name] = { invoked: false, reused: true }
      continue
    }
    rifeCosts[item.name] = await rifeOnce(path.join(runRoot, 'source', `${item.name}-a.png`),
      path.join(runRoot, 'source', `${item.name}-b.png`), outPath)
  }

  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    // Serve the run directory over the page origin so fixtures and candidate output decode through the
    // browser's own PNG decoder instead of a Node-side decoder with different rounding.
    await page.route('**/fixtures/**', route => {
      const requested = decodeURIComponent(new URL(route.request().url()).pathname.replace('/fixtures/', ''))
      const resolved = path.resolve(runRoot, requested)
      if (!resolved.startsWith(runRoot) || !fs.existsSync(resolved)) return route.fulfill({ status: 404, body: '' })
      return route.fulfill({ path: resolved, contentType: 'image/png' })
    })
    await page.goto(origin)
    const results = await page.evaluate(async ({ triplets, border, previewLimit, analysisWidths }) => {
      const { MotionEstimator } = await import('/src/video/motionFlow.ts')
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const { FlowAnalysisPolicy } = await import('/src/video/flowAnalysisPolicy.ts')

      const load = async name => {
        const response = await fetch(`/fixtures/source/${name}.png`)
        if (!response.ok) throw new Error(`fixture ${name} missing`)
        return createImageBitmap(await response.blob())
      }
      const loadRife = async name => {
        const response = await fetch(`/fixtures/rife/${name}.png`)
        if (!response.ok) throw new Error(`rife output ${name} missing`)
        return createImageBitmap(await response.blob())
      }

      /** Metrics over RGB inside a border, comparing a candidate frame against the truth frame. */
      const measure = (candidate, truth, width, height) => {
        let sum = 0, count = 0, squares = 0
        const lumaOf = (data, index) => 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
        // Single-window SSIM over luma with the standard stabilisers; stated here because there is no
        // single canonical SSIM variant.
        let meanCandidate = 0, meanTruth = 0, samples = 0
        for (let y = border; y < height - border; y++) {
          for (let x = border; x < width - border; x++) {
            const index = (y * width + x) * 4
            for (let channel = 0; channel < 3; channel++) {
              const error = Math.abs(candidate[index + channel] - truth[index + channel])
              sum += error; squares += error * error; count++
            }
            meanCandidate += lumaOf(candidate, index); meanTruth += lumaOf(truth, index); samples++
          }
        }
        const mae = sum / count
        const mse = squares / count
        const psnr = mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse)
        meanCandidate /= samples; meanTruth /= samples
        let varianceCandidate = 0, varianceTruth = 0, covariance = 0
        for (let y = border; y < height - border; y++) {
          for (let x = border; x < width - border; x++) {
            const index = (y * width + x) * 4
            const a = lumaOf(candidate, index) - meanCandidate
            const b = lumaOf(truth, index) - meanTruth
            varianceCandidate += a * a; varianceTruth += b * b; covariance += a * b
          }
        }
        varianceCandidate /= samples; varianceTruth /= samples; covariance /= samples
        const c1 = (0.01 * 255) ** 2, c2 = (0.03 * 255) ** 2
        const ssim = ((2 * meanCandidate * meanTruth + c1) * (2 * covariance + c2))
          / ((meanCandidate ** 2 + meanTruth ** 2 + c1) * (varianceCandidate + varianceTruth + c2))
        return { mae, psnrDb: psnr, ssim }
      }

      const pixelsOf = (source, width, height) => {
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(source, 0, 0, width, height)
        return context.getImageData(0, 0, width, height).data
      }

      const policy = new FlowAnalysisPolicy()
      /**
       * Render the production flow path once at a given analysis width and score it against truth.
       * Everything except the downscale factor is identical to the shipped pipeline.
       */
      /**
       * `honourSceneCut` reproduces the shipped behaviour: when the estimator reports a scene cut the
       * renderer snaps to a source frame instead of warping. Forcing it off measures the interpolator
       * itself, which matters because this benchmark feeds the estimator frames two apart while
       * playback feeds it adjacent frames, so a cut can be reported here that playback would not see.
       */
      const runFlow = (a, b, width, height, analysisWidth, honourSceneCut = true) => {
        const analysisHeight = Math.max(32, Math.round(analysisWidth * height / width))
        const estimator = new MotionEstimator()
        estimator.estimate(pixelsOf(a, analysisWidth, analysisHeight), analysisWidth, analysisHeight)
        const estimated = estimator.estimate(pixelsOf(b, analysisWidth, analysisHeight), analysisWidth, analysisHeight)
        const field = honourSceneCut ? estimated : { ...estimated, sceneCut: false }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const renderer = new MotionRenderer(canvas, 0)
        const placeholder = { width: 1, height: 1, data: new Float32Array(4), sceneCut: true }
        const canvasA = document.createElement('canvas'); canvasA.width = width; canvasA.height = height
        canvasA.getContext('2d').drawImage(a, 0, 0)
        const canvasB = document.createElement('canvas'); canvasB.width = width; canvasB.height = height
        canvasB.getContext('2d').drawImage(b, 0, 0)
        const previous = renderer.upload(canvasA, 0, placeholder, true)
        const current = renderer.upload(canvasB, 1 / 24, placeholder, true)
        renderer.updateFlow(previous, field)
        renderer.updateFlow(current, field)
        renderer.render(previous, current, 0.5)
        const pixels = new Uint8Array(width * height * 4)
        const gl = renderer.gl
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        if (gl.getError() !== gl.NO_ERROR) throw new Error('flow output invalid')
        // The renderer targets a WebGL canvas, so rows come back bottom-up.
        const flipped = new Uint8Array(pixels.length)
        for (let y = 0; y < height; y++)
          flipped.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4)
        // Snapshot before stopping: `stop()` releases the drawing surface, and a canvas read after
        // that would silently produce an empty preview.
        const snapshot = document.createElement('canvas')
        snapshot.width = width; snapshot.height = height
        snapshot.getContext('2d').drawImage(canvas, 0, 0)
        renderer.stop()
        return { pixels: flipped, canvas: snapshot, sceneCut: estimated.sceneCut }
      }

      const rows = [], previews = []
      for (const triplet of triplets) {
        const [a, b, truth, rife] = [await load(`${triplet.name}-a`), await load(`${triplet.name}-b`),
          await load(`${triplet.name}-truth`), await loadRife(triplet.name)]
        const width = a.width, height = a.height
        const truthPixels = pixelsOf(truth, width, height)
        const rifePixels = pixelsOf(rife, width, height)
        const aPixels = pixelsOf(a, width, height)
        const bPixels = pixelsOf(b, width, height)

        const flowByWidth = {}
        let sceneCut = false
        for (const analysisWidth of analysisWidths) {
          const run = runFlow(a, b, width, height, analysisWidth)
          if (analysisWidth === analysisWidths[analysisWidths.length - 1]) sceneCut = run.sceneCut
          flowByWidth[analysisWidth] = measure(run.pixels, truthPixels, width, height)
        }
        // Same path with the scene-cut snap disabled, to separate "estimator flagged a cut" from
        // "the interpolator cannot track this motion".
        const forcedWidth = analysisWidths[analysisWidths.length - 1]
        const forcedRun = runFlow(a, b, width, height, forcedWidth, false)
        const flowForced = measure(forcedRun.pixels, truthPixels, width, height)
        const shippedWidth = policy.widthFor(width)
        const row = {
          name: triplet.name, aSeconds: triplet.aSeconds,
          magnitude: triplet.magnitude, coherence: triplet.coherence, residual: triplet.residual,
          blocks: triplet.blocks, shippedAnalysisWidth: shippedWidth,
          flowByAnalysisWidth: flowByWidth,
          flowSceneCut: sceneCut,
          flowForcedInterpolation: flowForced,
          rife: measure(rifePixels, truthPixels, width, height),
          holdA: measure(aPixels, truthPixels, width, height),
          holdB: measure(bPixels, truthPixels, width, height),
          // A candidate that merely copied one input would be invisible in a mean-error table.
          rifeCopiesInput: JSON.stringify(measure(rifePixels, aPixels, width, height).mae) === '0'
            || JSON.stringify(measure(rifePixels, bPixels, width, height).mae) === '0',
        }
        rows.push(row)
      }

      // Side-by-side previews for the cases with the largest gain and the largest loss.
      const widest = analysisWidths[analysisWidths.length - 1]
      const ranked = [...rows].sort((left, right) =>
        (right.flowByAnalysisWidth[widest].mae - right.rife.mae) - (left.flowByAnalysisWidth[widest].mae - left.rife.mae))
      // Both ends matter: the largest gains show what the model buys, the largest losses show what it
      // costs on the cases the current path already handles.
      const half = Math.max(1, Math.floor(previewLimit / 2))
      const chosen = ranked.length <= previewLimit ? ranked
        : [...ranked.slice(0, half), ...ranked.slice(-half)]
      const unique = [...new Map(chosen.map(item => [item.name, item])).values()]
      for (const row of unique) {
        const [a, b, truth, rife] = [await load(`${row.name}-a`), await load(`${row.name}-b`),
          await load(`${row.name}-truth`), await loadRife(row.name)]
        const width = a.width, height = a.height
        const flowRun = runFlow(a, b, width, height, widest)
        const flowCanvas = flowRun.canvas
        const truthPixels = pixelsOf(truth, width, height)
        const sheet = document.createElement('canvas')
        const tile = 480, gap = 8, label = 26, zoom = 240
        sheet.width = tile * 5 + gap * 6
        sheet.height = (Math.round(tile * height / width) + gap + label) * 2
        const context = sheet.getContext('2d')
        context.fillStyle = '#101418'; context.fillRect(0, 0, sheet.width, sheet.height)
        context.font = '14px sans-serif'
        // Reading the WebGL canvas back into a 2D canvas bakes in the same pixels that were scored.
        const panels = [['原帧 n', a], ['原帧 n+2', b], ['真实中间帧（n+1）', truth],
          ['现有光流补间', flowCanvas], ['RIFE 补间', rife]]
        panels.forEach(([text, source], index) => {
          const left = gap + index * (tile + gap)
          context.fillStyle = '#e8eef7'
          context.fillText(text, left, 18)
          context.drawImage(source, left, label, tile, sheet.height - label - gap)
        })
        // The differences that matter are local, so the second row zooms into the block where the
        // production path deviates most from the real middle frame.
        const block = 32
        let bestScore = -1, bestX = 0, bestY = 0
        for (let top = 0; top + block <= height; top += block) {
          for (let lft = 0; lft + block <= width; lft += block) {
            let total = 0
            for (let y = top; y < top + block; y++) {
              for (let x = lft; x < lft + block; x++) {
                const index = (y * width + x) * 4
                total += Math.abs(flowRun.pixels[index] - truthPixels[index])
              }
            }
            if (total > bestScore) { bestScore = total; bestX = lft; bestY = top }
          }
        }
        const sx = Math.max(0, Math.min(width - zoom, bestX + block / 2 - zoom / 2))
        const sy = Math.max(0, Math.min(height - zoom, bestY + block / 2 - zoom / 2))
        const rowTop = Math.round(tile * height / width) + gap + label + 18
        context.fillStyle = '#e8eef7'
        context.fillText(`误差最大处放大（源自 ${Math.round(sx)},${Math.round(sy)}）`, gap, rowTop - 4)
        panels.forEach(([, source], index) => {
          context.drawImage(source, sx, sy, zoom, zoom, gap + index * (tile + gap), rowTop, tile, tile)
        })
        previews.push({ name: row.name, maeFlow: row.flowByAnalysisWidth[widest].mae, maeRife: row.rife.mae,
          png: sheet.toDataURL('image/png') })
      }
      return { rows, previews }
    }, { triplets: scored.map(item => ({ name: item.name, aSeconds: item.aSeconds })), border: BORDER,
      previewLimit: PREVIEW_LIMIT, analysisWidths: ANALYSIS_WIDTHS })

    // Fill descriptors back in: the page only received names, so the labels stay in one place.
    const descriptors = new Map(fixtures.triplets.map(item => [item.name, item]))
    const rows = results.rows.map(row => ({ ...row, ...Object.fromEntries(Object.entries(descriptors.get(row.name) || {})
      .filter(([key]) => ['magnitude', 'coherence', 'residual', 'blocks', 'aSeconds', 'spanCutDiff'].includes(key))) }))
    const previewDir = path.join(runRoot, 'preview')
    await fsp.mkdir(previewDir, { recursive: true })
    for (const preview of results.previews) {
      await fsp.writeFile(path.join(previewDir, `${preview.name}.png`),
        Buffer.from(preview.png.replace(/^data:image\/png;base64,/, ''), 'base64'))
    }

    const mean = values => values.reduce((total, value) => total + value, 0) / values.length
    const widest = ANALYSIS_WIDTHS[ANALYSIS_WIDTHS.length - 1]
    const flowAt = width => rows.map(row => row.flowByAnalysisWidth[width])
    const winsAt = width => rows.filter(row => row.rife.mae < row.flowByAnalysisWidth[width].mae).length
    /**
     * Pearson correlation between "how non-rigid the half-step motion is" and "how much better the
     * neural candidate does". A strong negative correlation with coherence, and a strong positive
     * correlation with residual, means the model's advantage is concentrated in non-rigid motion
     * rather than being uniform.
     */
    const correlation = (values, target) => {
      const usable = values.map((value, index) => [value, target[index]]).filter(([value]) => value !== null)
      if (usable.length < 3) return null
      const left = usable.map(([value]) => value), right = usable.map(([, value]) => value)
      const leftMean = mean(left), rightMean = mean(right)
      const covariance = mean(left.map((value, index) => (value - leftMean) * (right[index] - rightMean)))
      const leftSpread = Math.sqrt(mean(left.map(value => (value - leftMean) ** 2)))
      const rightSpread = Math.sqrt(mean(right.map(value => (value - rightMean) ** 2)))
      return leftSpread && rightSpread ? covariance / (leftSpread * rightSpread) : null
    }
    const advantageAt = width => rows.map(row => row.flowByAnalysisWidth[width].mae - row.rife.mae)
    const advantage = advantageAt(widest)
    const report = {
      capturedAt: new Date().toISOString(),
      measurementScope: 'Interpolation accuracy against real intermediate frames; no realtime cost claim.',
      analysisWidths: ANALYSIS_WIDTHS,
      protocol: {
        groundTruth: 'frame n+1 against a phase-0.5 interpolation of frames n and n+2',
        border: BORDER,
        metrics: {
          mae: 'mean absolute RGB error, 0-255',
          psnrDb: '10*log10(255^2 / mse) over RGB',
          ssim: 'single-window SSIM over luma with C1=(0.01*255)^2, C2=(0.03*255)^2',
        },
        flow: 'production MotionEstimator + MotionRenderer at phase 0.5, measured at every policy analysis width',
        rife: 'rife-ncnn-vulkan 20221029, rife-v4.6, pair mode, GPU 0',
      },
      source: fixtures.source,
      counts: { triplets: fixtures.triplets.length, scored: scored.length,
                skippedCuts: skipped.map(item => item.name),
                rifeCopiedAnInput: rows.filter(row => row.rifeCopiesInput).length },
      summary: {
        rifeMaeMean: mean(rows.map(row => row.rife.mae)),
        rifeSsimMean: mean(rows.map(row => row.rife.ssim)),
        holdAMaeMean: mean(rows.map(row => row.holdA.mae)),
        holdBMaeMean: mean(rows.map(row => row.holdB.mae)),
        byAnalysisWidth: Object.fromEntries(ANALYSIS_WIDTHS.map(width => [width, {
          flowMaeMean: mean(flowAt(width).map(item => item.mae)),
          flowSsimMean: mean(flowAt(width).map(item => item.ssim)),
          rifeWinRate: winsAt(width) / rows.length,
        }])),
        widestAnalysisWidth: widest,
        rifeWinsAtWidest: winsAt(widest),
        flowWinsAtWidest: rows.length - winsAt(widest),
        scored: rows.length,
        flowReportedSceneCut: rows.filter(row => row.flowSceneCut).length,
        flowForcedMaeMean: mean(rows.map(row => row.flowForcedInterpolation.mae)),
        rifeWinsVsForcedFlow: rows.filter(row => row.rife.mae < row.flowForcedInterpolation.mae).length,
        advantageVsCoherence: correlation(rows.map(row => row.coherence), advantage),
        advantageVsResidual: correlation(rows.map(row => row.residual), advantage),
        advantageVsMagnitude: correlation(rows.map(row => row.magnitude), advantage),
      },
      rifeInvocationCost: rifeCosts,
      triplets: rows,
      worstForRife: [...rows].sort((left, right) =>
        (left.flowByAnalysisWidth[widest].mae - left.rife.mae) - (right.flowByAnalysisWidth[widest].mae - right.rife.mae))
        .slice(0, 6).map(row => ({ name: row.name, aSeconds: row.aSeconds, coherence: row.coherence,
          residual: row.residual, magnitude: row.magnitude,
          flowMae: row.flowByAnalysisWidth[widest].mae, rifeMae: row.rife.mae })),
      bestForRife: [...rows].sort((left, right) =>
        (right.flowByAnalysisWidth[widest].mae - right.rife.mae) - (left.flowByAnalysisWidth[widest].mae - left.rife.mae))
        .slice(0, 6).map(row => ({ name: row.name, aSeconds: row.aSeconds, coherence: row.coherence,
          residual: row.residual, magnitude: row.magnitude,
          flowMae: row.flowByAnalysisWidth[widest].mae, rifeMae: row.rife.mae })),
    }
    report.subset = only ? only : null
    await fsp.writeFile(path.join(runRoot, `comparison${option('tag') ? `-${option('tag')}` : ''}.json`),
      JSON.stringify(report, null, 2))
    console.log('INTERP_MODEL_COMPARISON', JSON.stringify({ summary: report.summary,
      counts: report.counts,
      previews: results.previews.map(item => ({ name: item.name, maeFlow: item.maeFlow, maeRife: item.maeRife })) }))
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })

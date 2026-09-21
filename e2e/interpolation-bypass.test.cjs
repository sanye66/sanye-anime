const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const output = path.resolve(__dirname, '../sanye_deploy/.local/interpolation-bypass')
const hlsDirectory = path.join(output, 'media')
const hlsPlaylist = path.join(hlsDirectory, 'source.m3u8')

/** 受控 60 FPS 本地 HLS 夹具：用于在真实播放链路上验证源帧率达标时的旁路。 */
before(async () => {
  await fsp.mkdir(hlsDirectory, { recursive: true })
  try {
    await fsp.access(hlsPlaylist)
    return
  } catch {}
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    await page.exposeFunction('saveMedia', async (name, bytes) => {
      await fsp.writeFile(path.join(hlsDirectory, name), Buffer.from(bytes))
    })
    await page.evaluate(async () => {
      const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js')
      const { interpolationAssets } = await import('/src/video/interpolation.ts')
      const engine = new FFmpeg()
      try {
        await engine.load(interpolationAssets)
        const status = await engine.exec(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=60:duration=24',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=24', '-c:v', 'libx264', '-preset', 'ultrafast',
          '-crf', '30', '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2',
          '-hls_list_size', '0', '-hls_segment_filename', 'source%d.ts', 'source.m3u8'], 300000)
        if (status !== 0) throw new Error('60 FPS fixture generation failed')
        for (const file of await engine.listDir('/')) {
          if (/^source\d*\.(ts|m3u8)$/.test(file.name)) await window.saveMedia(file.name, Array.from(await engine.readFile(file.name)))
        }
      } finally { engine.terminate() }
    })
  } finally { await browser.close() }
}, { timeout: 300000 })

function loadPolicy() {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/interpolationDemandPolicy.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  return scope.exports.InterpolationDemandPolicy
}

/** 以固定帧间隔驱动判定策略，返回模式时间线；`sourceFps` 序列可与 `targetFps` 同步变化。 */
function drive(policy, options) {
  const timeline = []
  let now = options.from ?? 0
  for (const sourceFps of options.sourceFps) {
    now += 1000 / (options.tickFps ?? 60)
    const targetFps = typeof options.targetFps === 'function' ? options.targetFps(now) : options.targetFps
    const mode = policy.observe({ nowMs: now, sourceFps, targetFps })
    timeline.push({ atMs: now, mode })
  }
  return { timeline, endedAt: now, modes: timeline.map(entry => entry.mode) }
}

const fixed = (fps, count) => Array(count).fill(fps)
const modeChanges = result => result.timeline.filter((entry, index) => index > 0 && entry.mode !== result.timeline[index - 1].mode)

test('a source that already meets the target switches to bypass once and stays there', () => {
  const Policy = loadPolicy()
  const policy = new Policy()
  const result = drive(policy, { sourceFps: fixed(60, 300), targetFps: 60 })
  assert.deepEqual(result.modes.slice(0, 24), Array(24).fill('flow'), '保持窗口未满时不得提前旁路')
  assert.equal(result.modes[0], 'flow', '默认与优化前一致地执行补帧')
  const changes = modeChanges(result)
  assert.equal(changes.length, 1, '只允许切换一次，不得来回抖动')
  assert.equal(changes[0].mode, 'none')
  assert.ok(changes[0].atMs >= 400, `旁路必须覆盖完整保持窗口，实际 ${Math.round(changes[0].atMs)}ms`)
  assert.ok(changes[0].atMs <= 470, `旁路应在保持窗口结束后立即生效，实际 ${Math.round(changes[0].atMs)}ms`)
  assert.equal(policy.reason, '源帧率已达目标，无需补帧')
  assert.equal(policy.snapshot(60).transitions, 1)
})

test('the hysteresis band keeps the current mode and never flaps', () => {
  const Policy = loadPolicy()
  // 60 FPS 源在 60 目标下先进入旁路，随后落到滞回带（0.8–0.92 倍目标）内抖动。
  const policy = new Policy()
  const entry = drive(policy, { sourceFps: fixed(60, 120), targetFps: 60 })
  assert.equal(entry.modes.at(-1), 'none')
  const band = drive(policy, { from: entry.endedAt,
    sourceFps: fixed(30, 600).map((_, index) => index % 2 ? 54 : 51), targetFps: 60 })
  assert.ok(band.modes.every(mode => mode === 'none'), '滞回带（51–54 FPS / 60）内不得退出旁路')

  // 从补帧侧进入滞回带同样不下探：24 FPS 源回升到 0.85 倍目标仍保留补帧。
  const residue = new Policy()
  const below = drive(residue, { sourceFps: fixed(24, 120), targetFps: 60 })
  assert.ok(below.modes.every(mode => mode === 'flow'))
  const recovered = drive(residue, { from: below.endedAt, sourceFps: fixed(51, 600), targetFps: 60 })
  assert.ok(recovered.modes.every(mode => mode === 'flow'), '滞回带内不得自行进入旁路')
})

test('a source that drops below the target resumes interpolation after the hold window', () => {
  const Policy = loadPolicy()
  const policy = new Policy()
  const high = drive(policy, { sourceFps: fixed(60, 180), targetFps: 60 })
  assert.equal(high.modes.at(-1), 'none')
  const low = drive(policy, { from: high.endedAt, sourceFps: fixed(24, 300), targetFps: 60 })
  const changes = modeChanges(low)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].mode, 'flow')
  // 中位数窗口先要换成低帧率样本，再叠加保持窗口，因此恢复点晚于保持窗口本身。
  assert.ok(changes[0].atMs - high.endedAt >= 700, `恢复补帧必须覆盖完整保持窗口，实际 ${Math.round(changes[0].atMs - high.endedAt)}ms`)
  assert.ok(changes[0].atMs - high.endedAt <= 1250, '源帧率持续不足时必须在一秒量级内恢复补帧')
  assert.equal(policy.reason, '源帧率低于目标，保留补帧')
})

test('a target change re-evaluates against the new target without flapping', () => {
  const Policy = loadPolicy()
  const policy = new Policy()
  const sixty = drive(policy, { sourceFps: fixed(60, 240), targetFps: 60 })
  assert.equal(sixty.modes.at(-1), 'none')
  // 目标升到 120：60 FPS 源低于目标，必须回到补帧。
  const raised = drive(policy, { from: sixty.endedAt, sourceFps: fixed(60, 300), targetFps: 120 })
  assert.equal(modeChanges(raised).length, 1)
  assert.equal(raised.modes.at(-1), 'flow')
  // 目标回到 60：源帧率重新达标，按新目标回到旁路。
  const lowered = drive(policy, { from: raised.endedAt, sourceFps: fixed(60, 300), targetFps: 60 })
  assert.equal(modeChanges(lowered).length, 1)
  assert.equal(lowered.modes.at(-1), 'none')
  assert.equal(policy.snapshot(60).transitions, 3)
})

test('dropped-frame dips and timeline resets keep the current mode', () => {
  const Policy = loadPolicy()
  const policy = new Policy()
  const entry = drive(policy, { sourceFps: fixed(60, 180), targetFps: 60 })
  assert.equal(entry.modes.at(-1), 'none')
  // 每 20 个样本插入一次半速样本：瞬时低谷不得退出旁路。
  const jittered = drive(policy, { from: entry.endedAt,
    sourceFps: fixed(60, 600).map((_, index) => index % 20 === 19 ? 30 : 60), targetFps: 60 })
  assert.ok(jittered.modes.every(mode => mode === 'none'), '偶发丢帧不得退回补帧')
  policy.reset()
  assert.equal(policy.mode, 'none', '时间轴重置只丢弃连续证据，不改变当前模式')
  const after = drive(policy, { from: jittered.endedAt, sourceFps: fixed(60, 300), targetFps: 60 })
  assert.ok(after.modes.every(mode => mode === 'none'))
  assert.equal(policy.snapshot(60).transitions, 1)
})

test('the isolation control always keeps interpolation', () => {
  const Policy = loadPolicy()
  const policy = new Policy({ forceFlow: true })
  const result = drive(policy, { sourceFps: fixed(60, 600), targetFps: 60 })
  assert.ok(result.modes.every(mode => mode === 'flow'), '隔离对照必须保留补帧路径')
  assert.equal(policy.reason, '隔离对照：强制保留补帧')
  assert.equal(policy.snapshot(60).forced, true)
})

test('the renderer produces the original frame on the bypass phase and matches the flow path there', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const width = 64, height = 64
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const renderer = new MotionRenderer(canvas, 0.05, false), gl = renderer.gl
      const field = { width: 1, height: 1, data: new Float32Array(4), sceneCut: false }
      const still = { width: 1, height: 1, data: new Float32Array(4), sceneCut: false }
      const source = (rgb) => {
        const buffer = new OffscreenCanvas(width, height), context = buffer.getContext('2d')
        context.fillStyle = `rgb(${rgb.join(',')})`; context.fillRect(0, 0, width, height)
        return buffer
      }
      const read = () => {
        const pixels = new Uint8Array(width * height * 4)
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        return { pixels: Array.from(pixels), center: [pixels[(32 * width + 32) * 4], pixels[(32 * width + 32) * 4 + 1], pixels[(32 * width + 32) * 4 + 2]] }
      }
      // 两张相邻源帧只差很小的色差：着色器不会因“两侧差异过大”直接退回单帧，光流路径在中点确实合成新像素。
      const previousColor = [200, 60, 60], currentColor = [210, 70, 70]
      const previous = renderer.upload(source(previousColor), 0, still, true)
      const current = renderer.upload(source(currentColor), 1 / 60, still, true)
      // 对照：上传一组真实运动场，使补帧路径在中点确实合成新画面。
      renderer.updateFlow(current, { width: 1, height: 1, sceneCut: false,
        data: new Float32Array([0.25, 0, 1, 0]), backward: new Float32Array([-0.25, 0, 1, 0]) })
      const samples = {}
      // `bypass-nearest` 对应生产旁路：绘制阶段把相位吸附到最近原帧（中点之后取 current）。
      for (const [name, phase, frameOnly] of [['flow-start', 0, false], ['bypass-start', 0, true],
        ['flow-end', 1, false], ['bypass-end', 1, true], ['flow-middle', 0.5, false], ['bypass-nearest', 1, true]]) {
        renderer.render(previous, current, phase, frameOnly)
        samples[name] = read()
      }
      return { samples, previousColor, currentColor }
    })
    await fsp.mkdir(output, { recursive: true })
    await fsp.writeFile(path.join(output, 'pixel-parity.json'), JSON.stringify(report, null, 2))
    const samples = report.samples
    const same = (left, right) => JSON.stringify(left.pixels) === JSON.stringify(right.pixels)
    assert.ok(same(samples['flow-start'], samples['bypass-start']), '相位 0 上旁路与光流路径必须逐字节一致')
    assert.ok(same(samples['flow-end'], samples['bypass-end']), '相位 1 上旁路与光流路径必须逐字节一致')
    // 旁路输出最近的原帧：与源帧逐字节一致，不含任何合成像素。
    const nearest = samples['bypass-nearest'].center
    assert.deepEqual(nearest, report.currentColor, `旁路必须输出原帧，实际中心像素 ${nearest.join('/')}`)
    // 对照在同一时刻输出两帧之间的合成色，说明差异只来自“是否生成新画面”。
    const blended = samples['flow-middle'].center
    const differs = (left, right) => left.some((channel, index) => Math.abs(channel - right[index]) > 1)
    assert.ok(differs(blended, report.previousColor) && differs(blended, report.currentColor),
      `对照在窗口中点必须产生合成帧，实际中心像素 ${blended.join('/')}`)
    assert.ok(blended.every((channel, index) => channel > Math.min(report.previousColor[index], report.currentColor[index])
      && channel < Math.max(report.previousColor[index], report.currentColor[index])),
      `对照的合成帧必须落在相邻原帧之间，实际 ${blended.join('/')}`)
    console.log('INTERPOLATION_PIXEL', JSON.stringify({ bypassNearest: nearest, flowMiddle: blended,
      previousColor: report.previousColor, currentColor: report.currentColor,
      bypassStart: samples['bypass-start'].center, flowStart: samples['flow-start'].center }))
  } finally { await browser.close() }
})

test('real 60 FPS playback bypasses interpolation without leaving the enhanced canvas path', { timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.addInitScript(() => {
      localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 60, quality: 'fast' }))
      // 旁路判定只进入 Worker 统计，这里代理 Worker 消息以便在真实播放链路上取证。
      const NativeWorker = window.Worker
      window.__interpolationWindows = []
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args)
          window.__interpolationWindows = window.__interpolationWindows || []
          this.addEventListener('message', event => {
            if (event.data?.type === 'stats') window.__interpolationWindows.push({ at: performance.now(), stats: event.data.stats })
          })
        }
      }
    })
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/api/v1/anime/external-preview?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
      title: '源帧率达标旁路观测', originalTitle: '', type: '电影', tags: [],
      episodes: [{ id: 902, episodeNo: 1, title: '测试片段', playbackUrl: `${origin}/interpolation-hls/source.m3u8`,
        mimeType: 'application/vnd.apple.mpegurl' }],
    } } }))
    await page.route('**/interpolation-hls/*', async route => {
      const name = path.basename(new URL(route.request().url()).pathname)
      await route.fulfill({ path: path.join(hlsDirectory, name),
        contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
        headers: { 'Cache-Control': 'no-store' } })
    })
    await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(`${origin}/interpolation-hls/source.m3u8`)}`)
    await page.waitForFunction(() => {
      const video = document.querySelector('video')
      return video && video.readyState >= 3 && video.currentTime > 0.5
    }, null, { timeout: 60000 })
    await page.waitForSelector('.sanye-realtime-interpolation-active', { timeout: 30000 })
    await page.waitForFunction(() => (window.__interpolationWindows || []).length >= 4, null, { timeout: 60000 })
    const report = await page.evaluate(() => {
      const windows = window.__interpolationWindows || []
      const started = windows.length ? windows[0].at : performance.now()
      return { windows: windows.map(window => ({ at: Math.round(window.at - started), stats: window.stats })),
        canvasVisible: Boolean(document.querySelector('.sanye-realtime-interpolation-active .realtime-interpolation-canvas')) }
    })
    await fsp.writeFile(path.join(output, 'playback-report.json'), JSON.stringify(report, null, 2))
    assert.deepEqual(pageErrors, [])
    assert.ok(report.canvasVisible, '真实播放必须保持增强画布可见')
    const steady = report.windows.filter(window => window.at >= 1500)
    assert.ok(steady.length >= 2, `必须收集到判定完成后的统计窗口，实际 ${steady.length}`)
    assert.ok(steady.every(window => window.stats.interpolationNeed === 'none'), '60 FPS 源在 60 目标下不得执行光流补帧')
    assert.ok(steady.every(window => window.stats.flowSkippedFrames > 0 && window.stats.interpolatedFrames === 0),
      '必须记录跳过的光流分析且不产出合成帧')
    assert.ok(steady.every(window => (window.stats.measurement?.counts?.analysis ?? 0) === 0),
      '真实播放链路上不得再执行运动分析')
    assert.ok(steady.every(window => window.stats.interpolationDemand.sourceFps >= 54 && window.stats.interpolationDemand.sourceFps <= 66),
      '真实播放测得的源帧率必须接近 60 FPS')
    assert.ok(steady.every(window => window.stats.renderSlots >= 30 && window.stats.stallFrames === 0),
      '旁路必须持续呈现且不产生停顿帧')
    assert.ok(report.windows.at(-1).stats.interpolationDemand.transitions <= 1,
      '真实播放中判定不得反复切换')
    console.log('INTERPOLATION_PLAYBACK', JSON.stringify({ canvasVisible: report.canvasVisible,
      windows: report.windows.map(window => ({ at: window.at, need: window.stats.interpolationNeed,
        sourceFps: window.stats.interpolationDemand.sourceFps, skipped: window.stats.flowSkippedFrames,
        analysis: window.stats.measurement?.counts?.analysis ?? 0, interpolated: window.stats.interpolatedFrames,
        renderSlots: window.stats.renderSlots, outputFps: window.stats.outputFps, stallFrames: window.stats.stallFrames })) }))
  } finally { await browser.close() }
})

test('the render worker skips flow analysis while the source already meets the target', { timeout: 300000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const width = 320, height = 180
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
      /** 受控源：按给定帧间隔投递移动方块的帧；媒体时间随墙钟推进，源帧间隔按声明值上报。 */
      const runSegment = async (worker, state, fps, durationMs) => {
        const interval = 1000 / fps
        const deadline = performance.now() + durationMs
        while (performance.now() < deadline) {
          const startedAt = performance.now()
          state.media += (startedAt - state.lastWall) / 1000
          state.lastWall = startedAt
          const time = state.media
          const context = state.source.getContext('2d')
          context.fillStyle = '#102030'; context.fillRect(0, 0, width, height)
          context.fillStyle = '#e0e0e0'
          context.fillRect(Math.floor(((time * fps) % 200) / 200 * (width - 40)), height / 3, 40, height / 3)
          const bitmap = await createImageBitmap(state.source)
          worker.postMessage({ type: 'frame', bitmap, time, sourceInterval: 1 / fps,
            displayTime: performance.timeOrigin + startedAt + interval, rate: 1, generation: state.generation }, [bitmap])
          const wait = interval - (performance.now() - startedAt)
          await sleep(wait > 0 ? wait : 0)
        }
      }
      const startWorker = (canvas, options) => {
        const worker = new Worker('/src/video/interpolationRenderer.worker.ts', { type: 'module' })
        const state = { generation: 0, media: 0, startedAt: performance.now(), lastWall: performance.now(),
          windows: [], errors: [], source: new OffscreenCanvas(width, height) }
        worker.onmessage = ({ data }) => {
          if (data.type === 'stats') state.windows.push({ at: performance.now() - state.startedAt, stats: data.stats })
          if (data.type === 'error') state.errors.push(data.message)
        }
        worker.onerror = event => state.errors.push(event.message)
        const offscreen = canvas.transferControlToOffscreen()
        worker.postMessage({ type: 'init', canvas: offscreen, delay: 0.15, targetFps: 60, measureStages: true,
          interpolationDemand: options.interpolationDemand, profile: options.profile ?? 'off' }, [offscreen])
        return { worker, state }
      }
      const canvasOf = () => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas }
      const stopped = async ({ worker, state }) => {
        await sleep(1200)
        state.generation++
        worker.postMessage({ type: 'reset', generation: state.generation })
        await sleep(100)
        worker.terminate()
        return { errors: state.errors, startedAt: state.startedAt, windows: state.windows }
      }
      const segments = {}
      const auto = startWorker(canvasOf(), { interpolationDemand: 'auto' })
      segments.bypassStart = performance.now()
      await runSegment(auto.worker, auto.state, 60, 3500)
      segments.lowStart = performance.now()
      await runSegment(auto.worker, auto.state, 24, 3500)
      segments.returnStart = performance.now()
      await runSegment(auto.worker, auto.state, 60, 2600)
      segments.autoEnd = performance.now()
      const automatic = await stopped(auto)

      const control = startWorker(canvasOf(), { interpolationDemand: 'always' })
      segments.controlStart = performance.now()
      await runSegment(control.worker, control.state, 60, 3600)
      segments.controlEnd = performance.now()
      const forced = await stopped(control)

      const enhanced = startWorker(canvasOf(), { interpolationDemand: 'auto', profile: 'upscale' })
      segments.enhancedStart = performance.now()
      await runSegment(enhanced.worker, enhanced.state, 60, 3200)
      segments.enhancedEnd = performance.now()
      const withEnhancement = await stopped(enhanced)

      return { automatic, control: forced, enhanced: withEnhancement, segments, size: { width, height } }
    })
    await fsp.mkdir(output, { recursive: true })
    await fsp.writeFile(path.join(output, 'worker-report.json'), JSON.stringify(report, null, 2))
    const { automatic, control, enhanced, segments } = report
    const { width, height } = report.size
    assert.deepEqual(automatic.errors, [])
    assert.deepEqual(control.errors, [])
    assert.deepEqual(enhanced.errors, [])
    assert.ok(automatic.windows.length >= 8, `必须收集到足够的统计窗口，实际 ${automatic.windows.length}`)

    /** 统计窗口时刻是相对各自会话起点记录的，比较前先换算成同一时间轴。 */
    const between = (run, from, to, headStart = 0) => run.windows.filter(window =>
      window.at + run.startedAt >= from + headStart && window.at + run.startedAt <= to)
    const auto = {
      // 首窗包含判定生效前的补帧窗口，成本断言只看判定完成之后的窗口。
      bypass: between(automatic, segments.bypassStart, segments.lowStart),
      bypassSteady: between(automatic, segments.bypassStart, segments.lowStart, 1400),
      low: between(automatic, segments.lowStart, segments.returnStart, 900),
      resumed: between(automatic, segments.returnStart, segments.autoEnd, 700),
    }
    const counts = window => window.stats.measurement?.counts ?? {}
    const bypassWindows = auto.bypass.filter(window => window.stats.interpolationNeed === 'none')
    assert.ok(bypassWindows.length >= 2, '60 FPS 源在 60 目标下必须进入无需补帧')
    const steadyWindows = auto.bypassSteady.filter(window => window.stats.interpolationNeed === 'none')
    assert.ok(steadyWindows.length >= 1, '必须至少有一个判定完成后的完整统计窗口')
    assert.ok(steadyWindows.every(window => (counts(window).analysis ?? 0) === 0 && (counts(window).resize ?? 0) === 0
      && (counts(window).flowQueue ?? 0) === 0 && (counts(window).flowRoundTrip ?? 0) === 0),
      '无需补帧的窗口不得执行缩放、光流分析或运动场往返')
    assert.ok(bypassWindows.every(window => window.stats.flowSkippedFrames > 0), '必须记录跳过的光流分析次数')
    assert.ok(steadyWindows.every(window => window.stats.interpolatedFrames === 0), '旁路不得产出合成帧')
    assert.ok(steadyWindows.every(window => window.stats.computeMs === 0), '旁路的运动分析耗时为 0')
    assert.ok(steadyWindows.every(window => window.stats.outputFps >= 45), '旁路仍必须持续呈现原帧')
    assert.ok(auto.low.length >= 1 && auto.low.every(window => window.stats.interpolationNeed === 'flow'),
      '源帧率降到 24 FPS 后必须恢复光流补帧')
    assert.ok(auto.low.every(window => (counts(window).analysis ?? 0) > 0 && window.stats.interpolatedFrames > 0),
      '恢复补帧的窗口必须执行光流分析并产出补间帧')
    assert.ok(auto.resumed.length >= 1 && auto.resumed.every(window => window.stats.interpolationNeed === 'none'),
      '源帧率回到 60 FPS 后必须重新进入无需补帧')
    const windowModes = automatic.windows.map(window => window.stats.interpolationNeed)
    const windowChanges = windowModes.filter((mode, index) => index > 0 && mode !== windowModes[index - 1]).length
    assert.ok(automatic.windows.at(-1).stats.interpolationDemand.transitions <= 3,
      `一次起播内只允许“补帧→旁路→补帧→旁路”三次模式变化，实际 ${automatic.windows.at(-1).stats.interpolationDemand.transitions}`)
    assert.ok(windowChanges <= 3, '统计窗口里不得出现开关式抖动')

    const controlWindows = between(control, segments.controlStart, segments.controlEnd, 900)
    assert.ok(controlWindows.length >= 2)
    assert.ok(controlWindows.every(window => window.stats.interpolationNeed === 'flow'), '隔离对照必须保留补帧')
    assert.ok(controlWindows.every(window => (counts(window).analysis ?? 0) > 0 && window.stats.interpolatedFrames > 0))
    const uploadsPerWindow = window => counts(window).upload ?? 0
    const updatesPerWindow = (window, index, list) => list[index + 1].stats.resources.textureUpdates - window.stats.resources.textureUpdates
    const ratio = (windows) => windows.slice(0, -1).map((window, index) =>
      updatesPerWindow(window, index, windows) / Math.max(1, uploadsPerWindow(windows[index + 1]))).sort((a, b) => a - b)
    const bypassRatio = ratio(steadyWindows)
    const controlRatio = ratio(controlWindows)
    const median = values => values[Math.floor(values.length / 2)]
    const bypassMedian = median(bypassRatio), controlMedian = median(controlRatio)
    assert.ok(bypassMedian <= 1.6, `旁路每帧的 GPU 纹理上传应只有原帧，实际中位数 ${bypassMedian.toFixed(2)}`)
    assert.ok(controlMedian >= 2.4, `对照每帧应额外上传前后运动场，实际中位数 ${controlMedian.toFixed(2)}`)
    assert.ok(controlMedian >= bypassMedian * 2, '同源 60→60 对照的光流上传成本必须显著高于旁路')
    assert.ok(steadyWindows.every(window => (counts(window).analysis ?? 0) === 0)
      && controlWindows.every(window => (counts(window).analysis ?? 0) > 0), '光流分析次数是两路成本的直接差异')

    assert.ok(enhanced.windows.length >= 2)
    const enhancedWindows = between(enhanced, segments.enhancedStart, segments.enhancedEnd, 1600)
    assert.ok(enhancedWindows.length >= 1, '必须至少有一个判定完成后的增强窗口')
    assert.ok(enhancedWindows.every(window => window.stats.interpolationNeed === 'none' && window.stats.flowSkippedFrames > 0),
      '开启增强时同样跳过光流补帧')
    assert.ok(enhancedWindows.every(window => window.stats.interpolatedFrames === 0 && (counts(window).analysis ?? 0) === 0),
      '开启增强时同样不得执行光流分析或产出合成帧')
    assert.ok(enhancedWindows.every(window => window.stats.enhancementMs > 0), '旁路必须保留增强处理')
    assert.ok(enhancedWindows.every(window => window.stats.renderSlots >= 45), '旁路必须持续呈现增强后的原帧')
    assert.ok(enhancedWindows.every(window => window.stats.outputWidth === (window.stats.effectiveProfile === 'upscale' ? width * 2 : width)),
      '输出尺寸必须跟随实际增强档位')
    console.log('INTERPOLATION_BYPASS', JSON.stringify({ automatic: automatic.windows.map(window => ({
      at: Math.round(window.at), need: window.stats.interpolationNeed, skipped: window.stats.flowSkippedFrames,
      analysis: counts(window).analysis ?? 0, interpolated: window.stats.interpolatedFrames, computeMs: window.stats.computeMs,
      outputFps: window.stats.outputFps })), controlMedian, bypassMedian,
      enhanced: enhancedWindows.map(window => ({ need: window.stats.interpolationNeed, profile: window.stats.effectiveProfile,
        output: `${window.stats.outputWidth}x${window.stats.outputHeight}` })) }))
  } finally { await browser.close() }
})

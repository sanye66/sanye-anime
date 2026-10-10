const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const output = path.resolve(__dirname, '../sanye_deploy/.local/high-refresh-presentation')
// 与 1080p 实时补帧入口共用同一份受控夹具，避免两套片源导致口径不可比。
const fixturePath = path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4')
/**
 * 目标设备刷新率。留空时按本机浏览器实测刷新率记录，并保持「物理呈现待环境」；
 * 高刷设备上按实际值传入（120/144/165），本入口据此核对实测刷新率与设备声明是否一致。
 */
const declaredHz = Number(process.env.SANYE_DISPLAY_HZ || 0)

before(async () => {
  try { await fs.access(fixturePath); return } catch {}
  await fs.mkdir(path.dirname(fixturePath), { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    await page.exposeFunction('saveFixture', bytes => fs.writeFile(fixturePath, Buffer.from(bytes)))
    await page.evaluate(async () => {
      const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js')
      const { interpolationAssets } = await import('/src/video/interpolation.ts')
      const engine = new FFmpeg()
      try {
        await engine.load(interpolationAssets)
        const status = await engine.exec(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=10',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:v', 'libx264', '-preset', 'ultrafast',
          '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'fixture.mp4'], 180000)
        if (status !== 0) throw new Error('1080p fixture generation failed')
        await window.saveFixture(Array.from(await engine.readFile('fixture.mp4')))
      } finally { engine.terminate() }
    })
  } finally { await browser.close() }
}, { timeout: 240000 })

test('presentation layers separate source, generated, submitted and observed frames', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const result = await page.evaluate(async () => {
      const { PresentationLedger, foldPresentationLayers } = await import('/src/video/presentationLayers.ts')
      const base = { sourceFrames: 30, generatedFrames: 120, interpolatedFrames: 90, submittedFrames: 120,
        observedFrames: 60, presentedPhaseP95Ms: 4, refreshHz: 60, targetFps: 120, clock: 'timer', windowMs: 1000 }
      const refreshBound = foldPresentationLayers(base)
      const aligned = foldPresentationLayers({ ...base, clock: 'display' })
      const paced = foldPresentationLayers({ ...base, targetFps: 60 })
      const unconfirmed = foldPresentationLayers({ ...base, observedFrames: 0 })
      const short = foldPresentationLayers({ ...base, generatedFrames: 96 })
      const ledger = new PresentationLedger()
      ledger.addSource(30)
      ledger.addGenerated(120, 91)
      for (let i = 0; i < 120; i++) ledger.addSubmission()
      for (let i = 0; i < 60; i++) ledger.notePresentedPhase(i === 0 ? 12 : 3)
      ledger.addObserved(60)
      const window = ledger.takeWindow({ refreshHz: 60, targetFps: 120, clock: 'timer', windowMs: 1000 })
      const cleared = ledger.takeWindow({ refreshHz: 60, targetFps: 120, clock: 'timer', windowMs: 1000 })
      return { refreshBound, aligned, paced, unconfirmed, short, window, cleared }
    })
    assert.equal(result.refreshBound.kind, 'refresh-bound')
    assert.equal(result.aligned.kind, 'aligned')
    assert.equal(result.paced.kind, 'deadline-paced')
    assert.equal(result.unconfirmed.kind, 'unconfirmed')
    // 生成达到目标与提交超出呈现是两个独立结论：生成 120/秒可以达标，同时只有 60 帧被观察为呈现。
    assert.equal(result.refreshBound.generationOnTarget, true)
    assert.equal(result.refreshBound.presentationGap, 60)
    assert.equal(result.refreshBound.generationRatio, 4)
    assert.match(result.refreshBound.summary, /源帧 30 · 生成帧 120（补间 90） · 提交 120 · 呈现 60/)
    // 浏览器内没有物理扫描证据：任何窗口都不得把可观察呈现写成物理呈现已确认。
    for (const layers of Object.values(result)) {
      if (layers && typeof layers === 'object' && 'physical' in layers) assert.equal(layers.physical, 'unverified')
    }
    // 生成帧低于目标 96% 时必须判为未达标，不能用提交次数替代生成能力。
    assert.equal(result.short.generationOnTarget, false)
    assert.equal(result.window.sourceFrames, 30)
    assert.equal(result.window.interpolatedFrames, 91)
    assert.equal(result.window.submittedFrames, 120)
    assert.equal(result.window.observedFrames, 60)
    assert.equal(result.window.presentedPhaseP95Ms, 3)
    assert.equal(result.cleared.sourceFrames, 0)
    assert.equal(result.cleared.observedFrames, 0)
  } finally { await browser.close() }
})

test('refresh alignment keeps submissions on the display boundary at 60Hz and records what is presented', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/quality-fixture.mp4', route => route.fulfill({ path: fixturePath, contentType: 'video/mp4' }))
    await page.goto(origin)
    const cases = [
      { key: 'aligned-60', targetFps: 60, alignment: 'deadline', seconds: 6 },
      { key: 'deadline-120', targetFps: 120, alignment: 'deadline', seconds: 8 },
      { key: 'refresh-120', targetFps: 120, alignment: 'refresh', seconds: 8 },
    ]
    const report = await page.evaluate(async cases => {
      const { startRealtimeInterpolation, releaseInterpolationAudio } = await import('/src/video/realtimeInterpolation.ts')
      const player = document.createElement('div'); player.className = 'art-video-player'
      const video = document.createElement('video'); video.muted = true; video.loop = true
      video.src = '/quality-fixture.mp4'; player.append(video); document.body.replaceChildren(player)
      const results = []
      let session
      try {
        await video.play()
        for (const item of cases) {
          if (video.currentTime > 0.1) await new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = 0 })
          const stats = [], errors = []
          session = await startRealtimeInterpolation(video, { targetFps: item.targetFps, enhance: true, profile: 'sharp',
            presentationAlignment: item.alignment, onStats: value => stats.push(value), onError: value => errors.push(value) })
          await new Promise(resolve => setTimeout(resolve, item.seconds * 1000))
          results.push({ ...item, stats, errors, active: player.classList.contains('sanye-realtime-interpolation-active') })
          session.stop()
        }
      } finally { session?.stop(); releaseInterpolationAudio(video); video.pause(); video.removeAttribute('src'); video.load() }
      return results
    }, cases)
    await fs.mkdir(output, { recursive: true })
    const summary = report.map(item => ({ key: item.key, targetFps: item.targetFps, alignment: item.alignment,
      errors: item.errors, active: item.active, windows: item.stats.map(stat => stat.presentation) }))
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ declaredHz: declaredHz || null,
      device: declaredHz ? `declared-${declaredHz}hz` : 'local-unverified', cases: summary }, null, 2))
    for (const item of summary) console.log('PRESENTATION_LAYERS', JSON.stringify(item))
    for (const item of report) {
      assert.deepEqual(item.errors, [])
      assert.equal(item.active, true)
      const windows = item.stats.map(stat => stat.presentation).filter(Boolean)
      assert.ok(windows.length >= 2, `${item.key} must report presentation windows`)
      for (const window of windows) {
        // 四层必须各自独立存在，并且不能把生成帧写成呈现帧。
        assert.ok(window.sourceFrames > 0, `${item.key}: source frames must be recorded`)
        assert.ok(window.generatedFrames > 0, `${item.key}: generated frames must be recorded`)
        assert.ok(window.submittedFrames > 0, `${item.key}: submissions must be recorded`)
        assert.ok(window.observedFrames > 0, `${item.key}: observable presentation must be recorded`)
        assert.equal(window.physical, 'unverified')
        assert.ok(window.observedFrames <= window.submittedFrames + 2,
          `${item.key}: observable presentation cannot exceed submissions`)
      }
      const refresh = Math.max(...windows.map(window => window.refreshHz))
      if (declaredHz) assert.ok(Math.abs(refresh - declaredHz) <= declaredHz * 0.05,
        `${item.key}: measured refresh ${refresh} must match declared ${declaredHz}`)
      // 每个窗口各自判读口径：自动降档后同一个会话里会出现目标等于刷新能力的窗口。
      for (const window of windows) {
        if (window.refreshHz <= 0 || window.observedFrames <= 0) { assert.equal(window.kind, 'unconfirmed'); continue }
        if (window.targetFps > window.refreshHz * 1.04) {
          // 目标高于刷新能力：生成帧率可以达标，但可观察呈现只能到刷新上限，二者必须分开报告。
          assert.equal(window.kind, 'refresh-bound')
          assert.ok(window.summary.includes('上限'))
        } else if (window.clock === 'display') assert.equal(window.kind, 'aligned')
        else assert.equal(window.kind, 'deadline-paced')
      }
      // 首个窗口包含挂载与刷新估计，尚未形成可判读的呈现口径；按已确认刷新率的窗口判定。
      const requestedWindows = windows.filter(window => window.refreshHz > 0 && window.targetFps === item.targetFps)
      assert.ok(requestedWindows.length > 0, `${item.key}: the requested target rate must be attempted`)
      if (item.key === 'aligned-60') assert.ok(requestedWindows.every(window => window.generationOnTarget))
      if (item.alignment === 'refresh') {
        const intervalMs = 1000 / item.targetFps
        const phases = requestedWindows.map(window => window.presentedPhaseP95Ms).filter(value => value !== null)
        assert.ok(phases.length > 0, `${item.key}: boundary samples must be recorded`)
        assert.ok(phases.every(value => value <= intervalMs + 1),
          `${item.key}: the frame presented at the boundary must stay within one target interval`)
        assert.ok(item.stats.every(stat => stat.presentationAlignment === 'refresh'))
      }
    }
  } finally { await browser.close() }
})

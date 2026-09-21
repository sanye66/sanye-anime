const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'

test('short frame delivery gaps keep the delayed picture and audio timeline stable', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180
      document.body.replaceChildren(canvas)
      const offscreen = canvas.transferControlToOffscreen()
      const worker = new Worker('/src/video/interpolationRenderer.worker.ts', { type: 'module' })
      const events = [], stats = [], errors = []
      worker.onmessage = ({ data }) => {
        if (data.type === 'active') events.push({ active: data.active, time: performance.now() })
        if (data.type === 'stats') stats.push(data.stats)
        if (data.type === 'error') errors.push(data.message)
      }
      worker.onerror = event => errors.push(event.message)
      const source = new OffscreenCanvas(320, 180), ctx = source.getContext('2d')
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
      const started = performance.now()
      let generation = 0
      const frame = async () => {
        const time = (performance.now() - started) / 1000
        ctx.fillStyle = '#203040'; ctx.fillRect(0, 0, 320, 180)
        ctx.fillStyle = '#dddddd'; ctx.fillRect(Math.floor(time * 20) % 200, 40, 60, 80)
        const bitmap = await createImageBitmap(source)
        worker.postMessage({ type: 'frame', bitmap, time, displayTime: performance.timeOrigin + started + time * 1000, rate: 1, generation }, [bitmap])
      }
      try {
        worker.postMessage({ type: 'init', canvas: offscreen, profile: 'off', delay: 0.06, targetFps: 60 }, [offscreen])
        for (let i = 0; i < 30; i++) { await frame(); await sleep(33) }
        const warmEvents = events.slice()
        const boundary = events.length
        await sleep(80)
        for (let i = 0; i < 12; i++) { await frame(); await sleep(33) }
        const gapEvents = events.slice(boundary)
        // 供应短暂中断（约 0.4 秒）必须保持补间层，避免画质与增强反复开关。
        const jitterBoundary = events.length
        await sleep(400)
        const jitterEvents = events.slice(jitterBoundary)
        for (let i = 0; i < 12; i++) { await frame(); await sleep(33) }
        // 持续中断超过回退阈值后才允许整层回到原画。
        await sleep(1500)
        const stalledEvent = events.at(-1)
        for (let i = 0; i < 12; i++) { await frame(); await sleep(33) }
        const recoveredEvent = events.at(-1)
        generation++
        worker.postMessage({ type: 'reset', generation })
        await sleep(80)
        return { warmEvents, gapEvents, jitterEvents, stalledEvent, recoveredEvent, resetEvent: events.at(-1), stats, errors }
      } finally { worker.terminate() }
    })
    const output = path.resolve(__dirname, '../sanye_deploy/.local/interpolation-stability')
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'timeline.json'), JSON.stringify(result, null, 2))
    assert.deepEqual(result.errors, [])
    assert.ok(result.warmEvents.some(event => event.active), 'worker must render interpolated frames before the gap')
    assert.deepEqual(result.gapEvents, [], 'a brief delivery gap must not toggle the raw video or audio delay')
    assert.deepEqual(result.jitterEvents, [], 'a sub-second delivery gap must not switch the enhancement layer back to the source')
    assert.equal(result.stalledEvent.active, false, 'sustained processing failure must fall back to the source')
    assert.equal(result.recoveredEvent.active, true, 'new frames must restore interpolation after a sustained stall')
    assert.equal(result.resetEvent.active, false, 'explicit pause/seek reset must still reveal the source video')
    assert.ok(result.stats.length > 0, 'worker must report pacing and bottleneck evidence')
    assert.ok(result.stats.every(stat => stat.analysisWidth >= 128 && stat.analysisWidth <= 384),
      'flow analysis may adapt independently without reducing output resolution')
    assert.ok(result.stats.every(stat => Number.isFinite(stat.scheduleLateP95Ms) && Number.isInteger(stat.droppedSourceFrames)))
    // 没有刷新估计时仍是计时器时钟（不按刷新比例抽样），提交由刷新边界回调驱动，
    // 每个边界最多补齐一个刷新周期内的时隙，唤醒次数不多于绘制次数，不留高频空转。
    assert.ok(result.stats.every(stat => stat.presentationClock === 'timer' && stat.refreshTicks === 0
      && stat.presentationAlignment === 'refresh' && stat.boundaryTicks > 0
      && stat.boundaryTicks + stat.timerWakeups <= stat.renderSlots + 8
      && stat.boundaryTicks >= stat.renderSlots - 2
      && Number.isInteger(stat.skippedSlots) && stat.refreshConfirmed === false),
    '没有刷新估计时按刷新边界驱动提交，且每个绘制最多一次唤醒，不留高频空转')
    assert.ok(result.stats.every(stat => Number.isFinite(stat.renderTickP95Ms) && stat.renderTickP95Ms >= 0
      && stat.renderTickP95Ms <= stat.renderTickMaxMs && stat.longRenderTicks >= 0),
    '绘制耗时、最大耗时与长绘制计数必须自洽')
    assert.ok(result.stats.every(stat => Number.isInteger(stat.stallFrames) && stat.stallFrames >= 0),
      '落后时用最近可用帧绘制的窗口必须可观测')
    assert.ok(result.stats.every(stat => ['none', 'delivery', 'flow', 'enhancement', 'render'].includes(stat.cadenceBottleneck)))
  } finally { await browser.close() }
})

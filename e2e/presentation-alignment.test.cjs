const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'

test('display-aligned presentation keeps the refresh callback as the only per-frame wakeup', { timeout: 60000 }, async () => {
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
      const stats = [], errors = []
      worker.onmessage = ({ data }) => {
        if (data.type === 'stats') stats.push(data.stats)
        if (data.type === 'error') errors.push(data.message)
      }
      worker.onerror = event => errors.push(event.message)
      const source = new OffscreenCanvas(320, 180), ctx = source.getContext('2d')
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
      const started = performance.now()
      const generation = 0
      const frame = async () => {
        const time = (performance.now() - started) / 1000
        ctx.fillStyle = '#203040'; ctx.fillRect(0, 0, 320, 180)
        ctx.fillStyle = '#dddddd'; ctx.fillRect(Math.floor(time * 20) % 200, 40, 60, 80)
        const bitmap = await createImageBitmap(source)
        worker.postMessage({ type: 'frame', bitmap, time, displayTime: performance.timeOrigin + started + time * 1000, rate: 1, generation }, [bitmap])
      }
      try {
        worker.postMessage({ type: 'init', canvas: offscreen, profile: 'off', delay: 0.06, targetFps: 60 }, [offscreen])
        for (let index = 0; index < 20; index++) { await frame(); await sleep(33) }
        worker.postMessage({ type: 'display', hz: 60, generation })
        const boundary = stats.length
        for (let index = 0; index < 90; index++) { await frame(); await sleep(33) }
        return { boundary, stats, errors }
      } finally { worker.terminate() }
    })
    const output = path.resolve(__dirname, '../sanye_deploy/.local/presentation-alignment')
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'alignment.json'), JSON.stringify(result, null, 2))
    assert.deepEqual(result.errors, [])
    const aligned = result.stats.slice(result.boundary)
    assert.ok(aligned.length >= 2, '切换刷新对齐后必须继续上报统计窗口')
    const display = aligned.filter(stat => stat.presentationClock === 'display').slice(1)
    assert.ok(display.length >= 1, '刷新能力可承载目标帧率时必须改用刷新回调驱动')
    assert.ok(display.every(stat => stat.refreshHz > 45 && stat.refreshHz < 75),
      '刷新估计必须来自实际回调间隔，不能直接引用上报值')
    assert.ok(display.every(stat => stat.refreshConfirmed), '刷新回调实际交付后必须确认展示时钟')
    assert.ok(display.every(stat => stat.timerWakeups === 0 && stat.skippedSlots === 0),
      '展示模式下不再逐帧唤醒计时器，也不追赶过期时隙')
    assert.ok(display.every(stat => stat.renderSlots >= 30 && stat.renderSlots <= stat.refreshTicks + 1),
      '每个窗口都要按目标帧率占用刷新时隙，且一拍只画一帧')
    assert.ok(display.every(stat => stat.outputWidth === 320 && stat.outputHeight === 180 && stat.effectiveProfile === 'off'
      && stat.requestedProfile === 'off'), '刷新对齐不得改动输出尺寸、质量档位或用户请求')
    assert.ok(display.every(stat => stat.renderTickMaxMs < 1000 / 60 * 2), '单次绘制提交不得占满整个帧周期')
    assert.ok(display.every(stat => stat.longFrameRatio <= 0.1), '刷新对齐后长帧比例应保持低位')
  } finally { await browser.close() }
})

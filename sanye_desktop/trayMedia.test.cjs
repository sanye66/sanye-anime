const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('../e2e/node_modules/playwright')
const { trayMediaScript } = require('./trayMedia.cjs')

test('tray pause preserves real video position and blocks late playback until restored', { timeout: 15000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent('<canvas width="320" height="180"></canvas><video muted></video>')
    await page.evaluate(async () => {
      const canvas = document.querySelector('canvas'), video = document.querySelector('video')
      const context = canvas.getContext('2d')
      let frame = 0
      const draw = () => {
        context.fillStyle = frame++ % 2 ? '#5070c0' : '#50c070'
        context.fillRect(0, 0, 320, 180)
        requestAnimationFrame(draw)
      }
      draw()
      video.srcObject = canvas.captureStream(30)
      await video.play()
    })
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0.05)
    await page.evaluate(trayMediaScript(true))
    const paused = await page.locator('video').evaluate(video => ({ paused: video.paused, time: video.currentTime, source: !!video.srcObject }))
    assert.equal(paused.paused, true)
    assert.equal(paused.source, true)
    assert.ok(paused.time > 0)
    await page.locator('video').evaluate(video => video.play().catch(() => {}))
    await page.waitForFunction(() => document.querySelector('video').paused)
    await page.evaluate(trayMediaScript(false))
    assert.equal(await page.locator('video').evaluate(video => video.paused), true)
    await page.locator('video').evaluate(video => video.play())
    await page.waitForFunction(time => !document.querySelector('video').paused && document.querySelector('video').currentTime > time, paused.time)
  } finally { await browser.close() }
})

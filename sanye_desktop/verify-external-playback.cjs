const { LocalRuntime } = require('./runtime.cjs')
const { chromium } = require('../e2e/node_modules/playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const assert = require('node:assert/strict')

async function main() {
  const directory = path.resolve(__dirname, '../sanye_deploy/.local/external-playback', randomUUID())
  const root = process.env.SANYE_DESKTOP_RUNTIME || path.join(__dirname, 'runtime')
  const report = { status: 'running', keyword: process.env.SANYE_VERIFY_KEYWORD || '天气之子', root, directory, phase: 'startup', failures: [] }
  const runtime = new LocalRuntime(root, directory)
  let browser
  let page
  try {
    const origin = await runtime.start(0)
    browser = await chromium.launch()
    const context = await browser.newContext({ viewport: { width: 1280, height: 840 } })
    await context.addCookies([{ name: 'sanyeDesktop', value: runtime.cookie, url: origin, httpOnly: true, sameSite: 'Strict' }])
    page = await context.newPage()
    page.on('requestfailed', request => {
      const url = new URL(request.url())
      if (url.protocol.startsWith('http')) report.failures.push({ path: url.origin + url.pathname, error: request.failure()?.errorText })
    })
    page.on('response', response => {
      if (response.url().includes('/anime/external-preview')) {
        void response.json().then(body => { report.preview = { status: response.status(), code: body.code, message: body.message, episodes: body.data?.episodes?.length } }).catch(() => {})
      }
    })
    report.phase = 'search'
    await page.goto(`${origin}/search?keyword=${encodeURIComponent(report.keyword)}`)
    const results = page.locator('.external-result-row').filter({ hasText: report.keyword })
    const result = results.nth(Number(process.env.SANYE_VERIFY_RESULT_INDEX || 0))
    await result.waitFor({ timeout: 30000 })
    report.searchResults = await results.allTextContents()
    report.selectedResult = await result.innerText()
    report.phase = 'preview'
    const clickedAt = Date.now()
    report.watchUrl = await result.getByRole('link', { name: '直接观看', exact: true }).getAttribute('href')
    await result.getByRole('link', { name: '直接观看', exact: true }).click()
    report.sourceUrl = new URL(report.watchUrl, origin).searchParams.get('sourceUrl')
    await page.locator('video').waitFor({ timeout: 65000 })
    report.previewMs = Date.now() - clickedAt
    report.phase = 'playback'
    await page.locator('video').evaluate(video => { video.muted = true; void video.play().catch(() => {}) })
    const requiredSeconds = Math.max(3, Number(process.env.SANYE_VERIFY_SECONDS) || 3)
    await page.waitForFunction(seconds => {
      const video = document.querySelector('video')
      return video && video.videoWidth > 0 && video.currentTime > seconds && !video.paused
    }, requiredSeconds, { timeout: Math.max(60000, requiredSeconds * 1500) })
    report.requiredSeconds = requiredSeconds
    report.video = await page.locator('video').evaluate(video => ({ width: video.videoWidth, height: video.videoHeight, currentTime: video.currentTime, duration: video.duration }))
    report.playbackMs = Date.now() - clickedAt
    if (process.env.SANYE_VERIFY_PLAYER_QUALITY === '1') {
      report.phase = 'player-quality'
      report.quality = { profiles: [], target: null, active: false }
      for (const label of ['修复', '超分 2×', '锐化']) {
        await page.locator('.art-video-player').hover()
        await page.locator('.art-control-anime4k').hover()
        await page.locator('.art-control-anime4k .art-selector-item').filter({ hasText: new RegExp('^' + label + '$') }).click()
        await page.locator('.sanye-realtime-interpolation-active').waitFor({ timeout: 30000 })
        report.quality.profiles.push(label)
      }
      await page.locator('.art-control-interpolation').hover()
      await page.getByText('144 FPS', { exact: true }).click()
      await page.waitForFunction(() => document.querySelector('.art-control-interpolation .art-selector-value')?.textContent === '帧率')
      await page.locator('.sanye-realtime-interpolation-active').waitFor({ timeout: 30000 })
      report.quality.target = await page.locator('.art-control-interpolation').innerText()
      report.quality.active = await page.locator('.realtime-interpolation-canvas').evaluate(canvas => canvas.width > 0 && canvas.height > 0)
      assert.equal(report.quality.active, true)
    }
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    process.exitCode = 1
  } finally {
    if (page) {
      report.pageText = await page.locator('body').innerText().catch(() => '')
      await page.screenshot({ path: path.join(directory, 'playback.png') }).catch(() => {})
    }
    await browser?.close()
    await runtime.stop()
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })

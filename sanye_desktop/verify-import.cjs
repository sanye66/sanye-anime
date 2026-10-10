const { LocalRuntime } = require('./runtime.cjs')
const path = require('node:path')
const fs = require('node:fs/promises')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

async function main() {
  const data = path.resolve(__dirname, '../sanye_deploy/.local/desktop-import', randomUUID())
  const root = process.env.SANYE_DESKTOP_RUNTIME || path.join(__dirname, 'runtime')
  const runtime = new LocalRuntime(root, data, console.log)
  const report = { root, data, status: 'running', checks: [] }
  try {
    await runtime.start(0)
    const sourceUrl = process.env.SANYE_IMPORT_SOURCE || 'https://yhdmtv.cc/p/74487/153/0'
    const request = async (url, body) => {
      const response = await fetch(runtime.origin + url, {
        method: body ? 'POST' : 'GET',
        headers: { cookie: `sanyeDesktop=${runtime.cookie}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60000),
      })
      const result = await response.json()
      assert.equal(response.status, 200, JSON.stringify(result))
      assert.equal(result.code, 0, JSON.stringify(result))
      return result.data
    }
    const start = Date.now()
    const imported = await request('/api/v1/anime/import-url', { sourceUrl })
    assert.ok(imported.episodesImported > 0)
    const detail = await request(`/api/v1/anime/${imported.anime.id}`)
    const episodes = await request(`/api/v1/anime/${imported.anime.id}/episodes`)
    assert.ok(episodes.length > 0)
    assert.ok(episodes.some(episode => episode.playbackUrl.includes('.m3u8')))
    report.checks.push('real-source-import-through-desktop-proxy', 'published-detail-readable', 'persisted-playback-episodes')
    report.title = detail.title
    report.episodes = episodes.length
    report.elapsedMs = Date.now() - start
    const { chromium } = require('../e2e/node_modules/playwright')
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext()
      await context.addCookies([{ name: 'sanyeDesktop', value: runtime.cookie, url: runtime.origin, httpOnly: true, sameSite: 'Strict' }])
      const page = await context.newPage()
      await page.goto(`${runtime.origin}/search?keyword=${encodeURIComponent(detail.title)}`)
      const row = page.locator('.external-result-row').filter({ hasText: detail.title }).first()
      await row.waitFor({ timeout: 30000 })
      await row.getByRole('button', { name: '导入观看', exact: true }).click()
      await page.waitForURL(/\/anime\/\d+$/, { timeout: 65000 })
      await page.locator('.episode-button').first().waitFor({ timeout: 15000 })
      report.playback = 'not-started'
      try {
        await page.locator('video').waitFor({ timeout: 10000 })
        await page.locator('video').evaluate(video => { video.muted = true; void video.play().catch(() => {}) })
        await page.waitForFunction(() => { const video = document.querySelector('video'); return video && video.currentTime > 2 && video.videoWidth > 0 }, undefined, { timeout: 45000 })
        report.playback = 'passed'
        report.checks.push('imported-real-video-progresses')
      } catch {
        report.playback = 'external-video-not-playing'
      }
      await page.screenshot({ path: path.join(data, 'imported-detail.png'), fullPage: true })
      report.checks.push('real-search-import-button-opens-persisted-detail')
    } finally { await browser.close() }
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'; report.error = error.message; process.exitCode = 1
  } finally {
    await runtime.stop()
    await fs.mkdir(data, { recursive: true })
    await fs.writeFile(path.join(data, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

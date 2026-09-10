const { LocalRuntime } = require('./runtime.cjs')
const path = require('node:path')
const fs = require('node:fs/promises')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

async function main() {
  const data = path.resolve(__dirname, '../sanye_deploy/.local/desktop', randomUUID())
  const root = path.join(__dirname, 'runtime')
  const checks = []
  let runtime
  const request = async (url, method = 'GET') => {
    const res = await fetch(runtime.origin + url, { method, headers: { cookie: `sanyeDesktop=${runtime.cookie}`, 'X-Device-Id': 'desktop-acceptance-device' } })
    assert.equal(res.status, 200, `${method} ${url}`)
    const body = await res.json(); assert.equal(body.code, 0, JSON.stringify(body)); return body.data
  }
  try {
    runtime = new LocalRuntime(root, data, console.log)
    await runtime.start(0)
    checks.push('fresh-database-and-three-services')
    const conflict = new LocalRuntime(root, path.join(data, 'port-conflict'))
    await assert.rejects(conflict.start(Number(new URL(runtime.origin).port)), { code: 'EADDRINUSE' })
    await conflict.stop()
    await assert.rejects(fs.access(path.join(data, 'port-conflict/postgres/PG_VERSION')))
    checks.push('port-conflict-does-not-start-or-kill-services')
    assert.equal((await request('/api/v1/anime')).total, 6)
    checks.push('six-fixed-recommendations-seeded')
    const list = await request('/api/v1/anime?size=50')
    assert.ok(list.items.length > 0); checks.push('real-catalog')
    const anime = list.items[0]
    await request(`/api/v1/anime/${anime.id}`)
    await request(`/api/v1/anime/${anime.id}/episodes`)
    const search = await request(`/api/v1/search?keyword=${encodeURIComponent(anime.title)}`)
    assert.ok(search.items.some(item => item.id === anime.id)); checks.push('catalog-search-without-es')
    await request(`/api/v1/users/me/favorites/${anime.id}`, 'POST')
    await request(`/api/v1/users/me/history/${anime.id}`, 'POST')
    const { chromium } = require('../e2e/node_modules/playwright')
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 840 } })
      await context.addCookies([{ name: 'sanyeDesktop', value: runtime.cookie, url: runtime.origin, httpOnly: true, sameSite: 'Strict' }])
      const page = await context.newPage()
      await page.goto(runtime.origin)
      await page.locator('.main-nav').waitFor()
      assert.equal(await page.getByRole('button', { name: '登录', exact: true }).count(), 0)
      assert.equal(await page.locator('a[href="/ai"]:visible').count(), 0)
      await page.goto(runtime.origin + '/anime-repository')
      await page.getByText(anime.title, { exact: true }).first().waitFor()
      await page.screenshot({ path: path.join(data, 'desktop.png'), fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({ path: path.join(data, 'mobile.png'), fullPage: true })
      checks.push('real-browser-catalog-and-excluded-features')
    } finally { await browser.close() }
    await runtime.stop(); checks.push('owned-services-stopped')
    runtime = new LocalRuntime(root, data, console.log)
    await runtime.start(0)
    const favorites = await request('/api/v1/users/me/favorites')
    assert.ok(favorites.items.some(item => item.anime.id === anime.id))
    const history = await request('/api/v1/users/me/history')
    assert.ok(history.items.some(item => item.anime.id === anime.id)); checks.push('restart-retains-favorite-and-history')
  } finally {
    await runtime?.stop()
    await fs.mkdir(data, { recursive: true })
    await fs.writeFile(path.join(data, 'report.json'), JSON.stringify({ checks, data }, null, 2))
    console.log(JSON.stringify({ checks, report: path.join(data, 'report.json') }))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

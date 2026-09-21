const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const base = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const hit = (id, title, type) => ({ id, title, type, year: 2024, tags: [], coverUrl: '/client-covers/your-name.jpg' })
const pageData = (items, page = 1, totalPages = 1) => ({ code: 0, data: { items, page, size: 20, total: items.length, totalPages } })

test('slow requests, keyword race, category pagination, retry and return to search', { timeout: 45000 }, async () => {
  const browser = await chromium.launch()
  let releaseOld
  const oldGate = new Promise(resolve => { releaseOld = resolve })
  const requests = []
  const screenshots = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-search-experience-'))
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } })
    let fail = false
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      const keyword = url.searchParams.get('keyword')
      const type = url.searchParams.get('type')
      const preferred = url.searchParams.has('preferredOnly')
      requests.push({ keyword, type, preferred, page: url.searchParams.get('page'), external: url.pathname.endsWith('/external') })
      if (keyword === '新词') releaseOld()
      if (keyword === '旧词') await oldGate
      if (route.request().isNavigationRequest()) return route.continue()
      if (url.pathname.endsWith('/external')) {
        return route.fulfill({ json: { code: 0, data: keyword === '新词' ? [{ title: '新词片源', sourceUrl: 'https://www.yhdmtv.cc/p/1/2/0', type: type || '电视动画', coverUrl: '/client-covers/your-name.jpg' }] : [] } })
      }
      if (fail) return route.fulfill({ status: 503, json: { code: 503, message: '片库暂不可用' } })
      const items = keyword === '新词' ? [hit(127, type === '剧场版' ? '新词电影' : '新词作品', type || '电视动画')] : [hit(1, '过期作品', '电视动画')]
      return route.fulfill({ json: pageData(items, Number(url.searchParams.get('page')), type ? 1 : 2) })
    })
    await page.goto(`${base}/search?keyword=旧词`)
    await page.getByRole('textbox', { name: '搜索作品' }).fill('新词')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('新词片源', { exact: true }).waitFor()
    assert.equal(await page.getByText('过期作品', { exact: true }).count(), 0)
    releaseOld()
    await page.waitForTimeout(150)
    assert.equal(await page.getByText('过期作品', { exact: true }).count(), 0)
    assert.equal(await page.getByText('新词作品', { exact: true }).count(), 1)
    await page.getByRole('button', { name: '下一页' }).click()
    await page.getByText('第 2 / 2 页').waitFor()
    assert.ok(requests.some(request => request.keyword === '新词' && request.page === '2' && !request.external))
    await page.getByRole('button', { name: '剧场版', exact: true }).click()
    await page.getByText('新词电影', { exact: true }).waitFor()
    assert.ok(requests.some(request => request.keyword === '新词' && request.type === '剧场版' && !request.external))
    assert.ok(requests.some(request => request.keyword === '新词' && request.type === '剧场版' && request.external))
    assert.equal(await page.getByText('第 2 / 2 页').count(), 0)
    await page.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true })

    fail = true
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('片库暂不可用', { exact: true }).waitFor()
    fail = false
    await page.getByRole('button', { name: '重试片库搜索' }).click()
    await page.getByText('新词电影', { exact: true }).waitFor()
    assert.equal(await page.getByText('片库暂不可用', { exact: true }).count(), 0)
    await page.locator('.search-results a.result-row').first().click()
    await page.waitForURL('**/anime/127')
    await page.goBack()
    await page.waitForURL('**/search?keyword=*')
    assert.equal(await page.getByRole('textbox', { name: '搜索作品' }).inputValue(), '新词')
    assert.ok((await page.getByRole('button', { name: '剧场版', exact: true }).getAttribute('class')).includes('is-active'))

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByText('新词电影', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(screenshots, 'mobile.png'), fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile must not overflow horizontally')
    console.log(`Screenshots: ${screenshots}`)
  } finally {
    releaseOld()
    await browser.close()
  }
})

test('empty preferred response keeps loading until the full source result arrives', { timeout: 15000 }, async () => {
  const browser = await chromium.launch()
  let releaseComplete
  const completeGate = new Promise(resolve => { releaseComplete = resolve })
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/search/external')) {
        if (url.searchParams.has('preferredOnly')) return route.fulfill({ json: { code: 0, data: [] } })
        await completeGate
        return route.fulfill({ json: { code: 0, data: [{ title: '完整来源', type: '电视动画', sourceUrl: 'https://www.yhdmtv.cc/p/1/2/0' }] } })
      }
      return route.fulfill({ json: pageData([]) })
    })
    await page.goto(`${base}/search?keyword=慢速`)
    await page.waitForResponse(response => response.url().includes('preferredOnly=true'))
    await page.getByLabel('正在搜索').waitFor()
    releaseComplete()
    await page.getByText('完整来源', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('正在搜索').count(), 0)
  } finally {
    releaseComplete()
    await browser.close()
  }
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const base = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const pageData = (items, page = 1, totalPages = 1) => ({ code: 0, data: { items, page, size: 20, total: items.length, totalPages } })

test('keyword race, category filter, external retry and mobile layout', { timeout: 45000 }, async () => {
  const browser = await chromium.launch()
  let releaseOld
  const oldGate = new Promise(resolve => { releaseOld = resolve })
  const requests = []
  const screenshots = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-search-experience-'))
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } })
    let externalFail = false
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      if (route.request().isNavigationRequest()) return route.continue()
      // 搜索页只调用外部来源接口；站内片库接口不应再被请求。
      if (url.pathname === '/api/v1/search') {
        requests.push({ internal: true, path: url.pathname })
        return route.fulfill({ json: pageData([]) })
      }
      if (!url.pathname.endsWith('/search/external')) return route.fulfill({ json: pageData([]) })
      const keyword = url.searchParams.get('keyword')
      const type = url.searchParams.get('type')
      requests.push({ keyword, type, external: true })
      if (keyword === '新词') releaseOld()
      if (keyword === '旧词') await oldGate
      if (externalFail) return route.fulfill({ status: 503, json: { code: 5003, message: '外部搜索暂不可用' } })
      const hits = keyword === '旧词'
        ? [{ title: '过期作品', sourceUrl: 'https://www.yhdmtv.cc/p/9/9/0', type: '电视动画', coverUrl: '/client-covers/your-name.jpg' }]
        : [{
          title: keyword === '新词' && type === '剧场版' ? '新词电影' : `${keyword}片源`,
          sourceUrl: `https://www.yhdmtv.cc/p/${encodeURIComponent(keyword)}/2/0`,
          type: type || '电视动画',
          coverUrl: '/client-covers/your-name.jpg',
        }]
      return route.fulfill({ json: { code: 0, data: hits } })
    })
    await page.goto(`${base}/search?keyword=旧词`)
    await page.getByRole('textbox', { name: '搜索作品' }).fill('新词')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('新词片源', { exact: true }).waitFor()
    assert.equal(await page.getByText('过期作品', { exact: true }).count(), 0)
    releaseOld()
    await page.waitForTimeout(150)
    assert.equal(await page.getByText('过期作品', { exact: true }).count(), 0)
    assert.equal(await page.getByText('新词片源', { exact: true }).count(), 1)
    assert.equal(requests.some(request => request.internal), false, '搜索页不应请求站内片库接口')
    await page.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true })

    await page.getByRole('button', { name: '剧场版', exact: true }).click()
    await page.getByText('新词电影', { exact: true }).waitFor()
    assert.ok(requests.some(request => request.external && request.keyword === '新词' && request.type === '剧场版'))

    externalFail = true
    await page.getByRole('textbox', { name: '搜索作品' }).fill('失败词')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('搜索失败', { exact: true }).waitFor()
    externalFail = false
    await page.getByRole('button', { name: '重试', exact: true }).click()
    await page.getByText('失败词片源', { exact: true }).waitFor()
    assert.equal(await page.getByText('搜索失败', { exact: true }).count(), 0)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByText('失败词片源', { exact: true }).waitFor()
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

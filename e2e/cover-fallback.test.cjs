const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const base = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const coverFixture = {
  contentType: 'image/svg+xml',
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="100"><rect width="72" height="100" fill="#345"/></svg>',
}

test('search covers fall back to the bundled cover and then the placeholder', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    // 先注册兜底路由，再注册具体接口：Playwright 以最后注册的匹配为准。
    await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: null } }))
    await page.route('**/api/v1/search/external**', route => route.fulfill({ json: { code: 0, data: [
      { title: '你的名字', sourceUrl: 'https://www.yhdmtv.cc/p/1/2/0', type: '剧场版', coverUrl: '/missing-cover-a.jpg' },
      { title: '包里没有的作品', sourceUrl: 'https://www.yhdmtv.cc/p/3/4/0', type: '电视动画', coverUrl: '/missing-cover-b.jpg' },
    ] } }))
    await page.route('**/missing-cover-*.jpg', route => route.fulfill({ status: 404, body: '' }))
    await page.route('**/covers/**', route => route.fulfill(coverFixture))
    await page.route('**/client-covers/**', route => route.fulfill(coverFixture))

    await page.goto(`${base}/search?keyword=封面`)
    await page.locator('.external-result-row').first().waitFor()
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('.external-result-row .search-cover')]
      return images.length === 2 && images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)
    }, null, { timeout: 15000 })
    const sources = await page.locator('.external-result-row .search-cover').evaluateAll(images => images.map(image => image.src))
    assert.ok(sources[0].includes('/client-covers/your-name.jpg'), `随包同名封面未生效：${sources[0]}`)
    assert.ok(sources[1].includes('anime-placeholder.svg'), `通用占位图未生效：${sources[1]}`)
    assert.equal(await page.locator('.external-result-row .search-cover').evaluateAll(images => images.filter(image => !image.naturalWidth).length), 0)
  } finally {
    await browser.close()
  }
})

test('library covers never keep a broken image when the file is missing', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: null } }))
    await page.route('**/api/v1/anime?**', route => route.fulfill({ json: { code: 0, data: {
      items: [{ id: 4242, title: '缺封面的作品', type: '电视动画', year: 2026, tags: [], updateText: '连载中', coverUrl: '/missing-library-cover.jpg' }],
      page: 1, size: 20, total: 1, totalPages: 1,
    } } }))
    await page.route('**/missing-library-cover.jpg', route => route.fulfill({ status: 404, body: '' }))
    await page.route('**/covers/**', route => route.fulfill(coverFixture))

    await page.goto(`${base}/anime-repository`)
    await page.locator('.repository-card').first().waitFor()
    await page.waitForFunction(() => {
      const image = document.querySelector('.repository-card img')
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
    }, null, { timeout: 15000 })
    const source = await page.locator('.repository-card img').first().evaluate(image => image.src)
    assert.ok(/anime-placeholder\.svg|mushoku-oad\.svg/.test(source), `缺封面时未退到占位图：${source}`)
  } finally {
    await browser.close()
  }
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs/promises')

test('search keeps automatic fallback without exposing source selection', async () => {
  const browser = await chromium.launch()
  const output = path.resolve(__dirname, '../sanye_deploy/.local/playback-experience')
  await fs.mkdir(output, { recursive: true })
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: route.request().url().includes('/search/external')
        ? [{ title: '测试作品国语版', type: '剧场版', sourceUrl: 'https://www.yhdmtv.cc/p/1/153/0', alternativeSourceUrls: ['https://www.yhdmtv.cc/p/2/153/0'], coverUrl: '/client-covers/your-name.jpg', summary: '测试作品' }]
        : { items: [], total: 0, totalPages: 0 } } }))
      await page.goto(`${process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'}/search?keyword=测试作品`)
      const row = page.locator('.external-result-row').first()
      await row.waitFor()
      await row.getByText('测试作品国语版', { exact: true }).waitFor()
      assert.ok((await row.innerText()).includes('国语版'))
      const link = row.getByRole('link', { name: '直接观看', exact: true })
      assert.ok((await link.getAttribute('href')).includes('alternatives='))
      assert.equal(await row.getByRole('combobox').count(), 0)
      const target = new URL(await link.getAttribute('href'), 'http://localhost')
      assert.equal(target.searchParams.get('sourceUrl'), 'https://www.yhdmtv.cc/p/1/153/0')
      assert.equal(target.searchParams.get('keyword'), '测试作品')
      assert.equal(target.searchParams.get('alternatives'), 'https://www.yhdmtv.cc/p/2/153/0')
      assert.equal(await page.locator('html').getAttribute('data-sanye-theme'), 'light')
      await page.waitForFunction(() => [...document.querySelectorAll('.search-cover')].every(image => image.complete && image.naturalWidth > 0))
      await page.screenshot({ path: path.join(output, `search-${width}.png`), fullPage: true })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.close()
    }
  } finally { await browser.close() }
})

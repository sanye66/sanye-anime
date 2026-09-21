const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

test('import shows server reason and retry opens imported anime', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    let attempts = 0
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      let data = { items: [], totalPages: 0 }
      if (url.pathname.endsWith('/search/external')) data = [{ title: '导入测试', sourceUrl: 'https://yhdmtv.cc/p/74487/153/0', type: '电影' }]
      if (url.pathname.endsWith('/anime/import-url')) {
        attempts++
        assert.equal(route.request().postDataJSON().sourceUrl, 'https://yhdmtv.cc/p/74487/153/0')
        if (attempts === 1) return route.fulfill({ json: { code: 5002, message: '来源页面返回 HTTP 301' } })
        data = { anime: { id: 999 }, episodesImported: 1 }
      }
      if (url.pathname.endsWith('/anime/999')) data = { id: 999, title: '导入测试', tags: [], characters: [], similar: [], schedule: [] }
      if (url.pathname.endsWith('/episodes')) data = []
      await route.fulfill({ json: { code: 0, data } })
    })
    await page.goto('http://127.0.0.1:5188/search?keyword=导入测试')
    const button = page.getByRole('button', { name: '导入观看', exact: true })
    await button.click()
    await page.getByRole('alert').filter({ hasText: '来源页面返回 HTTP 301' }).waitFor()
    assert.equal(await button.isEnabled(), true)
    await button.click()
    await page.waitForURL('**/anime/999')
    assert.equal(attempts, 2)
  } finally { await browser.close() }
})

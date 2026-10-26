const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5190'

test('完整搜索为空时保留优先来源与筛选状态', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      let data = []
      if (url.pathname.endsWith('/search/external')) {
        if (url.searchParams.get('preferredOnly') === 'true') {
          data = [{ title: '测试作品', sourceUrl: 'https://example.com/anime', type: '电视动画' }]
        } else {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
      await route.fulfill({ json: { code: 0, data } })
    })
    await page.goto(`${origin}/search?keyword=测试作品`)
    await page.getByRole('link', { name: '直接观看' }).waitFor()
    await page.waitForFunction(() => !document.querySelector('[role="status"]'))
    assert.equal(await page.getByRole('link', { name: '直接观看' }).count(), 1)
    assert.equal(await page.getByText('没有找到匹配作品').count(), 0)
    assert.equal(await page.getByRole('button', { name: '全部', exact: true }).getAttribute('aria-pressed'), 'true')
  } finally {
    await browser.close()
  }
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

test('fast complete results render before preferred results; repeat search reuses successful results', { timeout: 20000 }, async () => {
  const browser = await chromium.launch()
  let releasePreferred
  const preferredGate = new Promise(resolve => { releasePreferred = resolve })
  try {
    const page = await browser.newPage()
    let requests = 0
    let preferredFinished = false
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/search/external')) {
        requests++
        const preferred = url.searchParams.has('preferredOnly')
        if (preferred) await preferredGate
        await route.fulfill({ json: { code: 0, data: [{
          title: preferred ? '优先候选' : '完整候选',
          sourceUrl: 'https://www.yhdmtv.cc/p/123/', type: '电视动画',
        }] } })
        if (preferred) preferredFinished = true
        return
      }
      await route.fulfill({ json: { code: 0, data: { items: [], page: 1, size: 20, total: 0, totalPages: 0 } } })
    })
    await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:4173'}/search?keyword=速度测试`)
    await page.getByText('完整候选', { exact: true }).waitFor({ timeout: 3000 })
    assert.equal(preferredFinished, false, 'complete results must render while preferred request is still pending')
    assert.equal(await page.getByText('高相关结果已显示，正在补充原词结果').count(), 0)
    const preferredResponse = page.waitForResponse(response => response.url().includes('preferredOnly=true'))
    releasePreferred()
    await preferredResponse
    await page.waitForLoadState('networkidle')
    assert.equal(await page.getByText('完整候选', { exact: true }).count(), 1)
    assert.equal(await page.getByText('优先候选', { exact: true }).count(), 0)
    assert.equal(requests, 2)
    await page.locator('.large-search').getByRole('button', { name: '搜索', exact: true }).click()
    await page.waitForLoadState('networkidle')
    assert.equal(await page.getByText('完整候选', { exact: true }).count(), 1)
    assert.equal(requests, 2, 'repeated search must not fetch external results again within the TTL')
  } finally {
    releasePreferred()
    await browser.close()
  }
})

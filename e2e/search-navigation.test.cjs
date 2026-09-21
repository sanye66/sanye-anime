const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

test('desktop search submit, error retry, empty state and back navigation', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 840 } })
    let fail = false
    let externalFail = false
    const queries = []
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/v1/search') {
        const keyword = url.searchParams.get('keyword')
        queries.push(keyword)
        if (fail) return route.fulfill({ status: 503, json: { code: 503, message: '片库服务连接失败' } })
        const items = keyword === '不存在的作品' ? [] : [{ id: 127, title: '你的名字', type: '剧场版', tags: [], year: 2016 }]
        return route.fulfill({ json: { code: 0, data: { items, page: 1, total: items.length, totalPages: items.length, size: 20 } } })
      }
      if (url.pathname === '/api/v1/search/external') return externalFail
        ? route.fulfill({ status: 503, json: { code: 5003, message: '外部搜索暂不可用，请稍后重试' } })
        : route.fulfill({ json: { code: 0, data: [] } })
      return route.fulfill({ status: 503, json: { code: 503, message: 'Not in fixture' } })
    })
    await page.goto('http://127.0.0.1:5187/')
    await page.getByRole('textbox', { name: '全局搜索', exact: true }).fill('你的名字')
    await page.getByRole('button', { name: '提交全局搜索' }).click()
    const result = page.locator('.search-results a.result-row')
    await result.first().waitFor()
    assert.ok(queries.includes('你的名字'))
    await result.first().click()
    await page.waitForURL('**/anime/127')
    await page.getByRole('button', { name: '返回上一级' }).click()
    await page.waitForURL('**/search?keyword=*')
    assert.equal(await page.getByRole('textbox', { name: '搜索作品', exact: true }).inputValue(), '你的名字')
    fail = true
    externalFail = true
    await page.getByRole('textbox', { name: '搜索作品', exact: true }).fill('无职转生')
    await page.locator('.large-search').getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('片库服务连接失败', { exact: true }).waitFor()
    await page.getByRole('button', { name: '重试外部搜索', exact: true }).waitFor()
    externalFail = false
    await page.getByRole('button', { name: '重试外部搜索', exact: true }).click()
    await page.getByRole('button', { name: '重试外部搜索', exact: true }).waitFor({ state: 'detached' })
    assert.equal(await page.locator('.empty-state').count(), 0)
    fail = false
    await page.getByRole('button', { name: '重试片库搜索' }).click()
    await result.first().waitFor()
    await page.getByRole('textbox', { name: '搜索作品', exact: true }).fill('不存在的作品')
    await page.locator('.large-search').getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('还没有找到匹配作品').waitFor()
    assert.equal(await page.locator('a[href="/ai"]:visible').count(), 0)
    const direct = await browser.newPage()
    await direct.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await direct.goto('http://127.0.0.1:5187/search')
    await direct.getByRole('button', { name: '返回上一级' }).click()
    await direct.waitForURL('http://127.0.0.1:5187/')
  } finally { await browser.close() }
})

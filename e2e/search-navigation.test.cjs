const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const path = require('node:path')

const base = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5187'

test('desktop search submit, external retry, empty state and back navigation', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 840 } })
    let externalFail = false
    const queries = []
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/v1/search/external') {
        const keyword = url.searchParams.get('keyword')
        queries.push(keyword)
        if (externalFail) return route.fulfill({ status: 503, json: { code: 5003, message: '外部搜索暂不可用，请稍后重试' } })
        const hits = keyword === '不存在的作品'
          ? []
          : [{ title: '你的名字', sourceUrl: 'https://www.yhdmtv.cc/p/7880/155/0', type: '剧场版', coverUrl: '/client-covers/your-name.jpg' }]
        return route.fulfill({ json: { code: 0, data: hits } })
      }
      if (url.pathname === '/api/v1/anime/external-preview') {
        return route.fulfill({ json: { code: 0, data: {
          title: '你的名字',
          originalTitle: '',
          type: '剧场版',
          year: 2016,
          summary: '',
          tags: [],
          updateText: '',
          coverUrl: '/covers/anime-placeholder.svg',
          sourceUrl: 'https://www.yhdmtv.cc/p/7880/155/0',
          episodes: [{
            id: 1,
            episodeNo: 1,
            title: 'HD',
            sourcePageUrl: 'https://www.yhdmtv.cc/p/7880/155/0',
            playbackUrl: '/search-navigation.mp4',
            mimeType: 'video/mp4',
          }],
        } } })
      }
      return route.fulfill({ status: 503, json: { code: 503, message: 'Not in fixture' } })
    })
    await page.route('**/search-navigation.mp4', route => route.fulfill({
      path: path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4'),
      contentType: 'video/mp4',
    }))

    await page.goto(`${base}/`)
    await page.getByRole('textbox', { name: '全局搜索', exact: true }).fill('你的名字')
    await page.getByRole('button', { name: '提交全局搜索' }).click()
    await page.locator('.external-result-row').first().waitFor()
    assert.ok(queries.includes('你的名字'))
    // 结果行保持来源候选的常规入口；站内线路在播放失败时静默接管。
    await page.locator('.external-result-row').first().getByRole('link', { name: '直接观看', exact: true }).click()
    await page.waitForURL(/\/watch\/external\?sourceUrl=/)
    await page.getByRole('button', { name: '返回上一级' }).click()
    await page.waitForURL(/\/search\?keyword=/)
    assert.equal(await page.getByRole('textbox', { name: '搜索作品', exact: true }).inputValue(), '你的名字')

    externalFail = true
    await page.getByRole('textbox', { name: '搜索作品', exact: true }).fill('无职转生')
    await page.locator('.large-search').getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('搜索失败', { exact: true }).waitFor()
    assert.equal(await page.locator('.external-result-row').count(), 0)
    externalFail = false
    await page.getByRole('button', { name: '重试', exact: true }).click()
    await page.locator('.external-result-row').first().waitFor()
    assert.equal(await page.getByText('搜索失败', { exact: true }).count(), 0)

    await page.getByRole('textbox', { name: '搜索作品', exact: true }).fill('不存在的作品')
    await page.locator('.large-search').getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('没有找到匹配作品').waitFor()
    const emptyText = (await page.locator('.empty-state').innerText()).trim()
    assert.equal(emptyText.split('\n')[0], '没有找到匹配作品')
    assert.ok(!emptyText.includes('换一个关键词'), '空状态仍展示多余提示文案')

    const direct = await browser.newPage()
    await direct.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await direct.goto(`${base}/search`)
    await direct.getByRole('button', { name: '返回上一级' }).click()
    await direct.waitForURL(`${base}/`)
  } finally { await browser.close() }
})

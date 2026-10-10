const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const path = require('node:path')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const mediaFixture = path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4')
const bundledCover = '/client-covers/your-name.jpg'
const sourceCover = '/source-poster-other-film.jpg'
const deadLine = 'https://v8.example.com/dead/index.m3u8'
const bundledLine = 'https://cdn.example.com/your-name/zhongzi/index.m3u8'

/** 返回客户端统一接口信封。 */
function success(data) {
  return { code: 0, message: 'ok', data, requestId: 'bundled-line-entry' }
}

/**
 * 站内已收录作品与外部来源的约定：
 * 1）结果行用随包封面，不显示「站内已收录」之类的额外提示与额外入口；
 * 2）来源线路不通（例如 v8 线路）时，静默改用随包线路继续播放，不出现失败提示。
 */
test('external line failure silently continues on the packaged line', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const requests = []
    page.on('request', (request) => requests.push(request.url()))
    await page.route('**/api/v1/**', (route) => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith('/anime/external-preview')) {
        return route.fulfill({ json: success({
          title: '你的名字。',
          originalTitle: '君の名は。',
          type: '剧场版',
          tags: ['剧场版'],
          coverUrl: sourceCover,
          sourceUrl: 'https://www.yhdmtv.cc/p/7880/155/0',
          episodes: [{
            id: 1,
            episodeNo: 1,
            title: 'HD中字',
            sourceLabel: 'HD中字',
            playbackUrl: deadLine,
            mimeType: 'application/vnd.apple.mpegurl',
            sourcePageUrl: 'https://www.yhdmtv.cc/p/7880/155/0',
          }],
        }) })
      }
      if (pathname.endsWith('/anime/127/episodes')) {
        return route.fulfill({ json: success([{
          id: 92,
          episodeNo: 2,
          title: '第 2 集',
          sourceLabel: '公开 HLS 播放源',
          playbackUrl: bundledLine,
          mimeType: 'video/mp4',
          sourcePageUrl: 'https://www.yhdmtv.cc/p/65395/153/2',
        }]) })
      }
      return route.fulfill({ json: success(null) })
    })
    // 来源线路直接失败，随包线路给出可解码的媒体。
    await page.route(deadLine, (route) => route.abort())
    await page.route(bundledLine, (route) => route.fulfill({ path: mediaFixture, contentType: 'video/mp4' }))
    await page.route(`**${sourceCover}`, (route) => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="100"><rect width="72" height="100" fill="#345"/></svg>',
    }))
    await page.route(`**${bundledCover}`, (route) => route.fulfill({ path: mediaFixture, contentType: 'video/mp4' }))

    const bundledLineRequest = page.waitForRequest(bundledLine, { timeout: 30000 })
    await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent('https://www.yhdmtv.cc/p/7880/155/0')}`)
    await bundledLineRequest
    await page.waitForTimeout(500)

    assert.ok(requests.includes(bundledLine), '来源线路失败后自动改用随包线路')
    assert.equal(await page.locator('.player-overlay').count(), 0, '静默接管，不显示播放失败提示')
    const text = await page.locator('.anime-player-section').innerText()
    assert.ok(!text.includes('站内已收录'), '不再显示「站内已收录」提示')
    assert.ok(!text.includes('改用站内线路'), '不再显示「改用站内线路」入口')
  } finally {
    await browser.close()
  }
})

test('search rows keep the packaged cover and the normal两个入口', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/search/external')) {
        return route.fulfill({ json: success([
          { title: '你的名字。', sourceUrl: 'https://www.yhdmtv.cc/p/7880/155/0', type: '剧场版', coverUrl: sourceCover },
          { title: '你的名字是玫瑰', sourceUrl: 'https://www.yhdmtv.cc/p/507623/364/0', type: '剧场版', coverUrl: sourceCover },
        ]) })
      }
      return route.fulfill({ json: success(null) })
    })
    await page.route(`**${sourceCover}`, (route) => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="100"><rect width="72" height="100" fill="#345"/></svg>',
    }))
    await page.route(`**${bundledCover}`, (route) => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="100"><rect width="72" height="100" fill="#e07a5f"/></svg>',
    }))

    await page.goto(`${origin}/search?keyword=${encodeURIComponent('你的名字')}`)
    const rows = page.locator('.external-result-row')
    await rows.first().waitFor()
    assert.equal(await rows.count(), 2, '搜索结果只保留来源候选')
    assert.equal(await rows.first().locator('.search-cover').getAttribute('src'), bundledCover, '站内作品使用随包封面')
    assert.ok((await rows.nth(1).locator('.search-cover').getAttribute('src')).includes('source-poster-other-film.jpg'), '非站内作品仍使用来源封面')
    const firstRowText = await rows.first().innerText()
    assert.ok(!firstRowText.includes('站内已收录'), '结果行不再显示站内提示')
    assert.equal(await rows.first().getByRole('link', { name: '直接观看', exact: true }).count(), 1)
    assert.equal(await rows.first().getByRole('button', { name: '导入观看', exact: true }).count(), 1)
    assert.equal(await rows.first().getByRole('link', { name: '站内线路观看', exact: true }).count(), 0, '不再显示站内入口按钮')
  } finally {
    await browser.close()
  }
})

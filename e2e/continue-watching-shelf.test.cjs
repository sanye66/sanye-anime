const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'

/** 返回客户端统一接口信封。 */
function success(data) {
  return { code: 0, message: 'ok', data, requestId: 'continue-watching-shelf' }
}

const card = (id, title, type, coverUrl = '') =>
  ({ id, title, type, year: 2026, tags: [type], updateText: '已完结', coverUrl, status: '已完结' })

// 客户端正式片库白名单只保留 6 部作品，接口返回其他 ID 会被过滤。
const catalog = [
  card(127, '你的名字', '剧场版', '/missing-cover-127.jpg'),
  card(133, '无职转生 · 第一季', '电视动画', '/client-covers/your-name.jpg'),
  card(136, '无职转生 · 第二季', '电视动画'),
  card(135, '无职转生 · 第二季 Part.2', '电视动画'),
  card(128, '无职转生 · 第三季', '电视动画'),
  card(137, '无职转生 · OAD 特别篇', '电视动画'),
]

const episodes = [
  ...Array.from({ length: 6 }, (_, index) => ({
    id: 900 + index,
    episodeNo: index + 1,
    title: `第 ${String(index + 1).padStart(2, '0')} 集`,
    sourceLabel: 'HD国语',
    playbackUrl: `https://cdn.example.com/guoyu-${index}.m3u8`,
    mimeType: 'application/vnd.apple.mpegurl',
    sourcePageUrl: 'https://www.yhdmtv.cc/p/133',
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    id: 920 + index,
    episodeNo: index + 1,
    title: `第 ${String(index + 1).padStart(2, '0')} 集`,
    sourceLabel: 'HD中字',
    playbackUrl: `https://cdn.example.com/zhongzi-${index}.m3u8`,
    mimeType: 'application/vnd.apple.mpegurl',
    sourcePageUrl: 'https://www.yhdmtv.cc/p/133',
  })),
]

/**
 * 覆盖个人中心货架、继续观看续播、选集分组、站内线路入口与封面占位。
 * 接口与来源封面全部模拟，随包资源（`/client-covers/*`、`/covers/*`）使用真实构建产物。
 */
test('watch history shelves, continue watching resume, grouped episodes and bundled lines', { timeout: 120000 }, async () => {
  const browser = await chromium.launch()
  const state = { historySize: 0 }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      if (path.endsWith('/home')) return route.fulfill({ json: success({ banners: [], sections: [], quickLinks: [] }) })
      if (path.endsWith('/search/external')) {
        return route.fulfill({ json: success([
          { title: '你的名字。', sourceUrl: 'https://www.yhdmtv.cc/p/1/2/0', type: '剧场版', coverUrl: '/missing-cover-x.jpg' },
          { title: '天气之子', sourceUrl: 'https://www.yhdmtv.cc/p/9/9/9', type: '剧场版', coverUrl: '/missing-cover-y.jpg' },
        ]) })
      }
      if (path.endsWith('/users/me/favorites')) {
        return route.fulfill({ json: success({ items: catalog.slice(1, 4).map((anime) => ({ anime, createdAt: '2026-09-20T00:00:00Z' })), page: 1, size: 20, total: 3, totalPages: 1 }) })
      }
      if (path.endsWith('/users/me/history')) {
        state.historySize = Number(url.searchParams.get('size'))
        return route.fulfill({ json: success({ items: catalog.map((anime) => ({ anime, lastViewAt: '2026-09-20T00:00:00Z' })), page: 1, size: state.historySize, total: catalog.length, totalPages: 1 }) })
      }
      if (path.endsWith('/users/me/continue-watching')) {
        return route.fulfill({ json: success(catalog.slice(0, 4).map((anime, index) => ({
          animeId: anime.id,
          episodeId: 900 + index,
          episodeTitle: `第 ${index + 1} 集`,
          positionSeconds: 300 + index,
          durationSeconds: 1440,
          completed: false,
          updatedAt: '2026-09-29T00:00:00Z',
        }))) })
      }
      if (/\/anime\/\d+\/episodes$/.test(path)) return route.fulfill({ json: success(episodes) })
      if (/\/anime\/\d+$/.test(path)) return route.fulfill({ json: success(catalog.find((item) => path.endsWith(`/anime/${item.id}`)) ?? catalog[0]) })
      if (path.endsWith('/anime/external-preview')) {
        return route.fulfill({ json: success({
          title: '你的名字。',
          originalTitle: '君の名は。',
          type: '剧场版',
          tags: ['剧场版'],
          coverUrl: '/missing-cover-x.jpg',
          sourceUrl: 'https://www.yhdmtv.cc/p/1/2/0',
          episodes: [{ id: 1, episodeNo: 1, title: '立即播放', sourceLabel: 'HD中字', playbackUrl: 'https://cdn.example.com/dead.m3u8', mimeType: 'application/vnd.apple.mpegurl', sourcePageUrl: 'https://www.yhdmtv.cc/p/1/2/0' }],
        }) })
      }
      return route.fulfill({ json: success(null) })
    })
    // 来源封面与上传封面都不可用：必须退到随包通用占位封面，不能留下破图。
    await page.route('**/missing-cover-*.jpg', (route) => route.fulfill({ status: 404, body: '' }))
    await page.route('**/admin-profile/**', (route) => route.fulfill({ status: 404, body: '' }))
    await page.route('**/client-covers/**', (route) => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="450"><rect width="320" height="450" fill="#e07a5f"/></svg>',
    }))

    await page.goto(`${origin}/mine`)
    await page.locator('.mine-rail-card').first().waitFor()
    const historyPanel = page.locator('.mine-library-panel', { hasText: '观看历史' })
    assert.equal(await historyPanel.locator('.mine-rail-card img').count(), catalog.length, '观看历史以封面小卡片展示')
    assert.ok(await historyPanel.getByRole('button', { name: '向右滑动观看历史' }).isVisible(), '观看历史提供左右滑动按钮')
    const scroll = await historyPanel.locator('.mine-rail').evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }))
    assert.ok(scroll.scroll > scroll.client, '观看历史货架可以横向滚动')
    await historyPanel.getByRole('button', { name: '向右滑动观看历史' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.mine-rail')[1].scrollLeft > 0, null, { timeout: 5000 })
    assert.equal(state.historySize, 20, '首屏历史按一页读取')
    await historyPanel.getByRole('button', { name: '查看全部' }).click()
    await page.waitForFunction(() => document.querySelector('.mine-rail.is-expanded') !== null)
    assert.equal(state.historySize, 60, '查看全部后扩大读取页长')
    await historyPanel.getByRole('button', { name: '收起' }).click()
    await page.waitForFunction(() => document.querySelector('.mine-rail.is-expanded') === null)

    await page.locator('.mine-continue-card').first().click()
    await page.waitForURL(/\/anime\/127\?/)
    const query = new URL(page.url()).searchParams
    assert.equal(query.get('resume'), '1', '继续观看携带续播标记')
    assert.equal(query.get('t'), '300', '继续观看携带记录秒数')
    await page.locator('.anime-player-section').waitFor({ timeout: 15000 })
    await page.locator('.anime-detail-hero').waitFor()
    assert.ok(await page.locator('video').first().evaluate((video) => video.autoplay), '续播入口让播放器自动开始播放')
    await page.goto(`${origin}/anime/127`)
    await page.locator('.anime-player-section').waitFor({ timeout: 15000 })
    assert.ok(await page.locator('video').first().evaluate((video) => !video.autoplay), '普通进入详情页不会自动播放')

    await page.goto(`${origin}/anime/133`)
    await page.locator('.episode-group-label').first().waitFor({ timeout: 15000 })
    assert.deepEqual(await page.locator('.episode-group-label').allInnerTexts().then((items) => items.map((item) => item.split('\n')[0])), ['国语', '中字'], '选集按线路分组')
    const labels = await page.locator('.episode-group-buttons button').allInnerTexts()
    assert.ok(labels.every((label) => /第 \d+ 集/.test(label)), '选集按钮显示集数')
    assert.equal((await page.locator('.episode-button.active').first().innerText()).trim(), '第 01 集', '默认选中第一集')

    await page.goto(`${origin}/search?keyword=${encodeURIComponent('你的名字')}`)
    const firstRow = page.locator('.external-result-row').first()
    await firstRow.waitFor()
    // 站内作品用随包封面，但结果行不再显示站内提示或额外入口。
    assert.equal(await firstRow.locator('.search-cover').getAttribute('src'), '/client-covers/your-name.jpg', '站内作品使用随包封面')
    assert.equal(await firstRow.locator('.tag-local').count(), 0, '结果行不再显示站内提示')

    assert.deepEqual(pageErrors, [], '页面不应出现运行期错误')
  } finally {
    await browser.close()
  }
})

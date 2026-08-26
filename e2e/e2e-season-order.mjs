import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const expectedTitles = [
  '无职转生 · 第一季',
  '无职转生 · 第二季',
  '无职转生 · 第二季 Part.2',
  '无职转生 · 第三季',
  '无职转生 · OAD 特别篇',
]

// 故意使用乱序接口数据，证明页面顺序来自统一季度规则，而不是后端返回顺序。
const scrambledAnime = [
  { id: 137, title: '无职转生 OAD', originalTitle: '', type: '电视动画', year: 2026, score: 95, status: 'PUBLISHED', tags: ['特别篇'], updateText: '已完结' },
  { id: 128, title: '无职转生 第三季', originalTitle: '', type: '电视动画', year: 2026, score: 96, status: 'PUBLISHED', tags: ['奇幻'], updateText: '连载中' },
  { id: 135, title: '无职转生 第二季 Part.2', originalTitle: '', type: '电视动画', year: 2026, score: 97, status: 'PUBLISHED', tags: ['剧情'], updateText: '已完结' },
  { id: 133, title: '无职转生 第一季', originalTitle: '', type: '电视动画', year: 2026, score: 99, status: 'PUBLISHED', tags: ['成长'], updateText: '已完结' },
  { id: 136, title: '无职转生 第二季', originalTitle: '', type: '电视动画', year: 2026, score: 98, status: 'PUBLISHED', tags: ['魔法'], updateText: '已完结' },
]

/** 返回项目统一响应信封，避免专项测试依赖当前后端和中间件状态。 */
function pageResponse(items) {
  return {
    code: 0,
    message: 'ok',
    requestId: 'season-order-e2e',
    data: { items, page: 1, size: 50, total: items.length, totalPages: 1 },
  }
}

/** 读取页面中的季度标题并断言固定观看顺序。 */
async function assertOrder(page, route, selector, label) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.locator(selector).first().waitFor({ timeout: 10_000 })
  const titles = (await page.locator(selector).allTextContents()).map((title) => title.trim())
  const actual = titles.join(',')
  const expected = expectedTitles.join(',')
  if (actual !== expected) {
    throw new Error(`${label}季度顺序错误：${actual}`)
  }
  console.log(`PASS ${label}季度顺序：${titles.join(' -> ')}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.route('**/api/v1/anime?**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(pageResponse(scrambledAnime)),
  }))
  await page.route('**/api/v1/search?**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(pageResponse(scrambledAnime)),
  }))

  await assertOrder(page, '/anime-repository', '.repository-card-title strong', '片库')
  await assertOrder(page, `/search?keyword=${encodeURIComponent('无职转生')}`, '.result-copy strong', '搜索')
  console.log('季度排序 Playwright：通过 2/2')
} finally {
  await browser.close()
}

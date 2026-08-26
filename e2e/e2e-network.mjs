import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch()

// ---------- 场景 A：断网（API 与封面全部中断） ----------
{
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.route('**/api/v1/**', (route) => route.abort())
  await page.route('**/covers/**', (route) => route.abort())

  const pages = [
    { path: '/', marker: '首页接口暂不可用' },
    { path: '/anime-repository', marker: '接口暂不可用，已展示本地演示数据' },
    { path: '/anime/1', marker: '网络异常，加载失败' },
    { path: '/schedule', marker: '接口暂不可用，当前展示本地演示数据' },
    { path: '/search?keyword=星海', marker: '搜索服务暂不可用' },
    { path: '/mine', marker: '收藏接口暂不可用' },
    { path: '/official', marker: '公开内容接口暂不可用' },
    { path: '/official/legal', marker: '正文接口暂不可用' },
    { path: '/ai', marker: '发送' },
  ]
  for (const item of pages) {
    const before = errors.length
    await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(3200)
    const body = await page.locator('body').innerText()
    const markerVisible = body.includes(item.marker)
    const noError = errors.length === before
    ok(`断网 ${item.path} 降级可用`, body.length > 80 && markerVisible && noError,
      `正文${body.length} 降级态${markerVisible} 页面错误${errors.length - before}`)
  }

  // 断网恢复自愈：先保持拦截进入首页触发降级，再解除拦截后点重试，数据应恢复
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(3200)
  const retryBtn = page.getByRole('button', { name: '重试' }).first()
  await retryBtn.waitFor({ timeout: 10000 })
  await page.unroute('**/api/v1/**')
  await page.unroute('**/covers/**')
  await retryBtn.click()
  await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 15000 })
  ok('断网恢复后重试加载真实数据', true, '你的名字恢复显示')
  await page.close()
}

// ---------- 场景 B：弱网（API 延迟 4 秒，应展示加载态后正常出数据） ----------
{
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.route('**/api/v1/**', async (route) => {
    await new Promise((r) => setTimeout(r, 4000))
    await route.continue()
  })

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('.feed-skeleton').first().waitFor({ timeout: 3500 })
  const skeletonSeen = await page.locator('.feed-skeleton').count()
  await page.waitForFunction(() => document.querySelectorAll('.feed-skeleton').length === 0, null, { timeout: 15000 })
  const skeletonGone = await page.locator('.feed-skeleton').count()
  const cards = await page.locator('.anime-shelf-grid .anime-cover-card').count()
  ok('弱网首页展示加载骨架', skeletonSeen > 0, `骨架${skeletonSeen}`)
  ok('弱网首页延迟后正常出数据', skeletonGone === 0 && cards >= 4 && errors.length === 0, `骨架残留${skeletonGone} 卡片${cards} 错误${errors.length}`)

  await page.goto(`${BASE}/schedule`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 15000 })
  ok('弱网排期页延迟后正常出数据', errors.length === 0, `错误${errors.length}`)
  await page.close()
}

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n弱网/断网专项：通过 ${results.length - failed} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)

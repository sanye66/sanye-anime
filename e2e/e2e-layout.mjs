import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const ADMIN_BASE = process.env.ADMIN_BASE ?? 'http://localhost:5175'
const VIEWPORTS = [1100, 1280, 1440]
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch()

async function newPage(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 160)}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 160)}`))
  page.on('requestfailed', (r) => {
    if (!r.url().includes('favicon') && !r.url().includes('8443')) errors.push(`[reqfail] ${r.url().slice(0, 90)}`)
  })
  return { page, errors }
}

const clientChecks = [
  ['首页', `${BASE}/`, async (page) => {
    await page.getByText('最近更新', { exact: false }).first().waitFor({ timeout: 10000 })
    return { key: 'hero', visible: await page.locator('.home-hero').isVisible().catch(() => false) }
  }],
  ['番剧仓库', `${BASE}/anime-repository`, async (page) => {
    await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 10000 })
    return { key: 'table', visible: await page.locator('.repository-summary').isVisible().catch(() => false) }
  }],
  ['作品详情', `${BASE}/anime/127`, async (page) => {
    await page.getByText('问 AI 关于这部作品', { exact: false }).first().waitFor({ timeout: 10000 })
    return { key: 'detail', visible: await page.getByText('你的名字', { exact: false }).first().isVisible().catch(() => false) }
  }],
  ['AI 工作区', `${BASE}/ai`, async (page) => {
    await page.waitForTimeout(1200)
    return { key: 'input', visible: await page.locator('.chat-input input').isVisible().catch(() => false) }
  }],
  ['一周排期', `${BASE}/schedule`, async (page) => {
    await page.waitForTimeout(1000)
    return { key: 'tabs', visible: await page.locator('.schedule-day-tabs').isVisible().catch(() => false) }
  }],
  ['我的', `${BASE}/mine`, async (page) => {
    await page.getByText('收藏', { exact: false }).first().waitFor({ timeout: 10000 })
    return { key: 'library', visible: await page.locator('.mine-library-grid').isVisible().catch(() => false) }
  }],
  ['官网首页', `${BASE}/official`, async (page) => {
    await page.waitForTimeout(1000)
    return { key: 'official', visible: await page.locator('.official-hero').isVisible().catch(() => false) }
  }],
]

const adminChecks = [
  ['仪表盘', `${ADMIN_BASE}/dashboard`, async (page) => {
    await page.waitForTimeout(1200)
    return { key: 'metric', visible: await page.locator('.admin-metric').first().isVisible().catch(() => false) }
  }],
  ['内容管理', `${ADMIN_BASE}/content`, async (page) => {
    await page.getByText('你的名字', { exact: false }).first().waitFor({ timeout: 15000 })
    return { key: 'table', visible: await page.locator('.admin-table').isVisible().catch(() => false) }
  }],
  ['用户反馈', `${ADMIN_BASE}/feedback`, async (page) => {
    await page.waitForTimeout(1200)
    return { key: 'table', visible: await page.locator('.admin-table').isVisible().catch(() => false) }
  }],
  ['任务管理', `${ADMIN_BASE}/jobs`, async (page) => {
    await page.getByText('系统默认', { exact: false }).first().waitFor({ timeout: 15000 })
    return { key: 'table', visible: await page.locator('.admin-table').isVisible().catch(() => false) }
  }],
]

for (const width of VIEWPORTS) {
  const { page, errors } = await newPage(width)

  // ===== 客户端（未登录匿名态）=====
  for (const [name, url, check] of clientChecks) {
    const before = errors.length
    let okFlag = true
    let detail = ''
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() =>
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }))
      const probe = await check(page)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const newErrors = errors.slice(before).filter((e) => !e.includes('8443'))
      okFlag = probe.visible && overflow <= 1 && newErrors.length === 0
      detail = `溢出${overflow}px 关键区${probe.visible} 错误${newErrors.length}`
    } catch (e) {
      okFlag = false
      detail = String(e).slice(0, 100)
    }
    ok(`未登录 ${width}px ${name}`, okFlag, detail)
  }

  // ===== 管理端未登录守卫（跳登录页）=====
  await page.goto(`${ADMIN_BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(800)
  ok(`未登录 ${width}px 管理端守卫`, page.url().includes('/login'), page.url())

  // ===== 管理端登录后 =====
  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('input[aria-label="账号"]').fill('admin')
  await page.locator('input[aria-label="密码"]').fill('admin123')
  await page.locator('.login-form button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  ok(`登录 ${width}px 管理端`, true, 'admin 登录成功')

  for (const [name, url, check] of adminChecks) {
    const before = errors.length
    let okFlag = true
    let detail = ''
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() =>
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }))
      const probe = await check(page)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const newErrors = errors.slice(before)
      okFlag = probe.visible && overflow <= 1 && newErrors.length === 0
      detail = `溢出${overflow}px 关键区${probe.visible} 错误${newErrors.length}`
    } catch (e) {
      okFlag = false
      detail = String(e).slice(0, 100)
    }
    ok(`登录 ${width}px ${name}`, okFlag, detail)
  }
  await page.close()
}

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n布局与双状态回归共 ${results.length} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)

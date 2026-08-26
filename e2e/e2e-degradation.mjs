import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const ADMIN_BASE = process.env.ADMIN_BASE ?? 'http://localhost:5175'
const scenario = process.argv[2] ?? 'anime'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)))

async function goto(url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() =>
    page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }))
  await page.waitForTimeout(1800)
}

async function checkClient(name, url, expectText) {
  const before = pageErrors.length
  try {
    await goto(url)
    const body = await page.locator('body').innerText()
    const has = expectText ? body.includes(expectText) : true
    const crash = pageErrors.slice(before).length > 0
    ok(`客户端 ${name}（${scenario} 故障降级）`, has && !crash && body.length > 50,
      `降级文本=${has} 页面异常=${crash} 长度=${body.length}`)
  } catch (e) {
    ok(`客户端 ${name}（${scenario} 故障降级）`, false, String(e).slice(0, 100))
  }
}

async function adminLogin() {
  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('input[aria-label="账号"]').fill('admin')
  await page.locator('input[aria-label="密码"]').fill('admin123')
  await page.locator('.login-form button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
}

async function checkAdmin(name, url, expectText) {
  const before = pageErrors.length
  try {
    await goto(url)
    const body = await page.locator('body').innerText()
    const has = expectText ? body.includes(expectText) : true
    const crash = pageErrors.slice(before).length > 0
    ok(`管理端 ${name}（${scenario} 故障降级）`, has && !crash && body.length > 50,
      `降级文本=${has} 页面异常=${crash} 长度=${body.length}`)
  } catch (e) {
    ok(`管理端 ${name}（${scenario} 故障降级）`, false, String(e).slice(0, 100))
  }
}

try {
  if (scenario === 'anime') {
    await checkClient('首页（本地回退）', `${BASE}/`, '你的名字')
    await checkClient('番剧仓库（本地回退）', `${BASE}/anime-repository`, '你的名字')
    await checkClient('作品详情（失败态）', `${BASE}/anime/1`, '')
    await adminLogin()
    await checkAdmin('内容管理（正式片库回退）', `${ADMIN_BASE}/content`, '你的名字')
  } else if (scenario === 'ai-chat') {
    await checkClient('AI 工作区（页面可用）', `${BASE}/ai`, '')
    await adminLogin()
    await checkAdmin('仪表盘（统计降级）', `${ADMIN_BASE}/dashboard`, '统计接口暂不可用')
  } else if (scenario === 'favorite') {
    await checkClient('我的（收藏/历史降级）', `${BASE}/mine`, '接口暂不可用')
  } else if (scenario === 'feedback') {
    await checkClient('问题反馈（页面可用）', `${BASE}/mine/feedback`, '')
  } else {
    ok('未知场景', false, scenario)
  }
} catch (e) {
  ok('执行异常', false, String(e).slice(0, 200))
}

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${scenario} 故障降级验证：通过 ${results.length - failed} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)

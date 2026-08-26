import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))

try {
  // 1. 打开首页，点击右上角登录 → 跳转 mock CAS
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(1000)
  const loginBtn = page.locator('header button, .user-area button, .app-header button').filter({ hasText: '登录' }).first()
  await loginBtn.click()
  await page.waitForURL('**/cas/login**', { timeout: 15000 })
  ok('点击登录跳转 Mock CAS', page.url().includes('localhost:8095'), page.url())

  // 2. Mock CAS 登录页提交
  await page.locator('form[action="/cas/login"]').waitFor({ timeout: 10000 })
  await page.locator('input[name="username"]').fill('sanye-e2e-user')
  await page.locator('button[type="submit"]').click()

  // 3. 回跳客户端 → 前端处理 ticket → 登录态
  await page.waitForURL(`${BASE}/**`, { timeout: 15000 })
  await page.waitForTimeout(2500)
  const token = await page.evaluate(() => localStorage.getItem('sanye_access_token'))
  const body = await page.locator('body').innerText()
  ok('前端回调保存 token', Boolean(token) && token.length > 20, token ? `token 长度 ${token.length}` : '无 token')
  ok('登录态展示（右上角用户区）', body.includes('sanye-e2e-user') || !body.includes('登录'), body.slice(0, 80))
  ok('回调后无页面异常', errors.length === 0, errors.join(' | '))
} catch (e) {
  ok('执行异常', false, String(e).slice(0, 200))
}

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\nCAS 前端登录流程：通过 ${results.length - failed} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)

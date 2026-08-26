import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()

try {
  // 1. 登录获取真实 token
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(800)
  await page.locator('header button, .profile-button').filter({ hasText: '登录' }).first().click()
  await page.waitForURL('**/cas/login**', { timeout: 15000 })
  await page.locator('form[action="/cas/login"]').waitFor({ timeout: 10000 })
  await page.locator('input[name="username"]').fill('refresh-user')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/**`, { timeout: 15000 })
  await page.waitForTimeout(2500)
  const goodToken = await page.evaluate(() => localStorage.getItem('sanye_access_token'))
  ok('登录拿到有效 token', Boolean(goodToken) && goodToken.length > 20, `token 长度 ${goodToken?.length ?? 0}`)

  // 2. 破坏 access token，保留 refreshToken，访问受保护页触发 401 → 自动 refresh → 重放
  await page.evaluate(() => localStorage.setItem('sanye_access_token', 'bad-expired-token'))
  const before = await page.evaluate(() => localStorage.getItem('sanye_access_token'))
  await page.goto(`${BASE}/mine`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(3000)
  const after = await page.evaluate(() => localStorage.getItem('sanye_access_token'))
  const body = await page.locator('body').innerText()
  const refreshed = after && after !== before && after.length > 20
  ok('401 自动 refresh 并重放', refreshed && body.length > 50 && !page.url().includes('/cas/login'),
    `token 更新=${refreshed} 页面正常=${body.length > 50} url=${page.url()}`)
} catch (e) {
  ok('执行异常', false, String(e).slice(0, 200))
}

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n前端自动 refresh：通过 ${results.length - failed} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)

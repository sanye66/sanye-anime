import { chromium } from 'playwright'

const ADMIN_BASE = process.env.ADMIN_BASE ?? 'http://localhost:5175'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch()
const errors = []

try {
  const page = await browser.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('input[aria-label="账号"]').fill('admin')
  await page.locator('input[aria-label="密码"]').fill('admin123')
  await page.locator('.login-form button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await page.goto(`${ADMIN_BASE}/audit`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('.admin-table:visible .el-table__row').first().waitFor({ timeout: 15000 })

  // 1. 操作日志列表渲染
  const operText = await page.locator('.admin-table:visible').innerText()
  ok('操作日志列表渲染', operText.includes('admin') && operText.includes('操作时间'), '含操作人与时间列')

  // 2. 操作日志状态筛选（成功）
  await page.locator('.admin-toolbar:visible .el-select').click()
  await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '成功' }).first().click()
  await page.getByRole('button', { name: '查询' }).click()
  await page.waitForTimeout(1200)
  const operFailed = await page.locator('.admin-table:visible .el-table__row .el-tag--danger').count()
  ok('操作日志状态筛选（成功）', operFailed === 0, `失败标签${operFailed}`)
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await page.waitForTimeout(1000)

  // 3. 操作日志详情
  await page.locator('.admin-table:visible .el-table__row').first().getByRole('button', { name: '详情' }).click()
  await page.locator('.el-dialog').waitFor({ timeout: 10000 })
  const operDetailText = await page.locator('.el-dialog').innerText()
  ok('操作日志详情弹窗', operDetailText.includes('请求参数') && operDetailText.includes('返回结果'), '含参数/结果/异常字段')
  await page.locator('.el-dialog .el-dialog__headerbtn').click()

  // 4. 登录日志 Tab
  await page.getByRole('tab', { name: '登录日志' }).click()
  await page.locator('.admin-table:visible .el-table__row').first().waitFor({ timeout: 15000 })
  const loginText = await page.locator('.admin-table:visible').innerText()
  ok('登录日志列表渲染', loginText.includes('用户名') && loginText.includes('登录时间'), '含用户与时间列')

  // 5. 登录日志状态筛选（成功）
  await page.locator('.admin-toolbar:visible .el-select').click()
  await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '成功' }).first().click()
  await page.getByRole('button', { name: '查询' }).click()
  await page.waitForTimeout(1200)
  const loginFailed = await page.locator('.admin-table:visible .el-table__row .el-tag--danger').count()
  ok('登录日志状态筛选（成功）', loginFailed === 0, `失败标签${loginFailed}`)
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await page.waitForTimeout(1000)

  // 6. 登录日志详情
  await page.locator('.admin-table:visible .el-table__row').first().getByRole('button', { name: '详情' }).click()
  await page.locator('.el-dialog').waitFor({ timeout: 10000 })
  const loginDetailText = await page.locator('.el-dialog').innerText()
  ok('登录日志详情弹窗', loginDetailText.includes('状态') && loginDetailText.includes('浏览器') && loginDetailText.includes('用户名'), '含状态/浏览器/系统字段')
  await page.locator('.el-dialog .el-dialog__headerbtn').click()

  ok('无控制台/页面错误', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  ok('执行异常', false, String(e).slice(0, 200))
}

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n权限与审计页：通过 ${results.length - failed} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)

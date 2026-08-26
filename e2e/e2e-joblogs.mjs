import { chromium } from 'playwright'

const ADMIN_BASE = process.env.ADMIN_BASE ?? 'http://localhost:5175'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function login(page, username, password) {
  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('input[aria-label="账号"]').waitFor({ timeout: 10000 })
  await page.locator('input[aria-label="账号"]').fill(username)
  await page.locator('input[aria-label="密码"]').fill(password)
  await page.locator('.login-form button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
}

const browser = await chromium.launch()
const errors = []

try {
  // 1. 管理员登录 → 任务日志页列表渲染
  const page = await browser.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(String(err)))
  await login(page, 'admin', 'admin123')
  await page.goto(`${ADMIN_BASE}/jobs/logs`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('.admin-table .el-table__row').first().waitFor({ timeout: 15000 })
  const rowCount = await page.locator('.admin-table .el-table__row').count()
  const countText = await page.locator('.admin-page-count').textContent()
  ok('任务日志列表渲染', rowCount > 0 && /共 \d+ 条记录/.test(countText ?? ''), `行数${rowCount} ${countText}`)

  // 2. 状态筛选：正常
  await page.locator('.admin-toolbar .el-select').click()
  await page.locator('.el-select-dropdown__item').filter({ hasText: '正常' }).first().click()
  await page.getByRole('button', { name: '查询' }).click()
  await page.waitForTimeout(1200)
  const normalTags = await page.locator('.admin-table .el-table__row .el-tag').count()
  const failedTags = await page.locator('.admin-table .el-table__row .el-tag--danger').count()
  ok('状态筛选（正常）', normalTags > 0 && failedTags === 0, `正常标签${normalTags} 失败标签${failedTags}`)
  await page.getByRole('button', { name: '重置' }).click()
  await page.waitForTimeout(1000)

  // 3. 详情弹窗
  await page.locator('.admin-table .el-table__row').first().getByRole('button', { name: '详情' }).click()
  await page.locator('.el-dialog').waitFor({ timeout: 10000 })
  const dialogText = await page.locator('.el-dialog').innerText()
  ok('执行记录详情弹窗', dialogText.includes('任务名称') && dialogText.includes('日志信息'), '详情字段完整')
  await page.locator('.el-dialog .el-dialog__headerbtn').click()

  // 4. 删除单条执行记录
  const beforeDelete = await page.locator('.admin-page-count').textContent()
  await page.locator('.admin-table .el-table__row').first().getByRole('button', { name: '删除' }).click()
  await page.locator('.el-message-box').waitFor({ timeout: 10000 })
  await page.locator('.el-message-box__btns .el-button--primary').click()
  await page.getByText('执行记录已删除').waitFor({ timeout: 10000 })
  await page.waitForTimeout(800)
  const afterDelete = await page.locator('.admin-page-count').textContent()
  ok('删除单条执行记录', beforeDelete !== afterDelete, `${beforeDelete} → ${afterDelete}`)
  await page.close()

  // 5. 权限：普通角色 ry 拥有 monitor:job:list（RuoYi common 角色种子），可访问任务日志
  const ryPage = await browser.newPage()
  await login(ryPage, 'ry', 'admin123')
  await ryPage.goto(`${ADMIN_BASE}/jobs/logs`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await ryPage.locator('.admin-table .el-table__row').first().waitFor({ timeout: 15000 })
  const ryRowCount = await ryPage.locator('.admin-table .el-table__row').count()
  ok('有权限角色可访问任务日志', ryPage.url().includes('/jobs/logs') && ryRowCount > 0, `ry 行数${ryRowCount}`)
  await ryPage.close()

  ok('无控制台/页面错误', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  ok('执行异常', false, String(e).slice(0, 200))
}

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n任务日志页：通过 ${results.length - failed} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)

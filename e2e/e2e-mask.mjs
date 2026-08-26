import { chromium } from 'playwright'

const ADMIN_BASE = 'http://localhost:5175'
const GATEWAY = process.env.GATEWAY ?? 'http://localhost:8091/api/v1'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const token = await fetch(`${GATEWAY}/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'e2e-mask-script' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
}).then((r) => r.json()).then((b) => b.token)

const apiHeaders = { 'Content-Type': 'application/json', 'X-Device-Id': 'e2e-mask-script', Authorization: `Bearer ${token}` }
const tempName = `mask_user_${Date.now().toString().slice(-8)}`
const resetSecret = 'ResetSecret@2026'
let tempUserId = null

// 1. 创建临时用户 + 重置密码（触发操作日志）
const createRes = await fetch(`${GATEWAY}/admin/system/user`, {
  method: 'POST',
  headers: apiHeaders,
  body: JSON.stringify({ userName: tempName, nickName: '脱敏测试', password: 'Admin123!', status: '0', deptId: 105, roleIds: [2] }),
}).then((r) => r.json())
ok('临时用户创建', createRes.code === 200, tempName)

const listRes = await fetch(`${GATEWAY}/admin/system/user/list?pageNum=1&pageSize=100`, { headers: apiHeaders }).then((r) => r.json())
tempUserId = listRes.rows?.find((u) => u.userName === tempName)?.userId ?? null

const resetRes = await fetch(`${GATEWAY}/admin/system/user/resetPwd`, {
  method: 'PUT',
  headers: apiHeaders,
  body: JSON.stringify({ userId: tempUserId, password: resetSecret }),
}).then((r) => r.json())
ok('重置密码成功', resetRes.code === 200 && tempUserId != null, `userId=${tempUserId}`)

await new Promise((r) => setTimeout(r, 800))

// 2. 从操作日志接口读取重置密码记录，验证 DB 层已脱敏
const operRes = await fetch(`${GATEWAY}/admin/monitor/operlog/list?pageNum=1&pageSize=100`, { headers: apiHeaders }).then((r) => r.json())
const resetLogs = (operRes.rows ?? []).filter((row) => row.operUrl?.includes('/system/user/resetPwd'))
const leaked = resetLogs.some((row) => (row.operParam ?? '').includes(resetSecret) || /"password"\s*:/.test(row.operParam ?? ''))
ok('DB 层密码脱敏（无明文 password）', resetLogs.length > 0 && !leaked, `记录${resetLogs.length}条 泄露${leaked}`)

// 3. UI 层展示脱敏兜底
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
  const resetRow = page.locator('.admin-table:visible .el-table__row').filter({ hasText: '/system/user/resetPwd' }).first()
  await resetRow.waitFor({ timeout: 10000 })
  await resetRow.getByRole('button', { name: '详情' }).click()
  await page.locator('.el-dialog').waitFor({ timeout: 10000 })
  const dialogText = await page.locator('.el-dialog').innerText()
  const uiLeaked = dialogText.includes(resetSecret) || /"password"\s*:/.test(dialogText)
  ok('UI 层展示无明文密码', !uiLeaked, `展示泄露${uiLeaked}`)
  await page.locator('.el-dialog .el-dialog__headerbtn').click()
  ok('无控制台/页面错误', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  ok('执行异常', false, String(e).slice(0, 200))
} finally {
  await browser.close()
}

// 4. 清理临时用户
if (tempUserId != null) {
  await fetch(`${GATEWAY}/admin/system/user/${tempUserId}`, { method: 'DELETE', headers: apiHeaders })
}

const failed = results.filter((r) => !r.pass).length
console.log(`\n日志脱敏验证：通过 ${results.length - failed} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)


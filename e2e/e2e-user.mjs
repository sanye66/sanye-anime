import { chromium } from 'playwright'

const ADMIN_BASE = 'http://localhost:5175'
const GATEWAY = process.env.GATEWAY ?? 'http://localhost:8091/api/v1'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function apiLogin() {
  const res = await fetch(`${GATEWAY}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'e2e-user-script' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const body = await res.json()
  return body.token
}

const token = await apiLogin()
const apiHeaders = { 'Content-Type': 'application/json', 'X-Device-Id': 'e2e-user-script', Authorization: `Bearer ${token}` }
const tempName = `e2e_user_${Date.now().toString().slice(-8)}`
let tempUserId = null

// 创建临时用户（仅用于停用/启用状态流转，测试后删除）
const createRes = await fetch(`${GATEWAY}/admin/system/user`, {
  method: 'POST',
  headers: apiHeaders,
  body: JSON.stringify({ userName: tempName, nickName: 'E2E 临时用户', password: 'admin123', status: '0', deptId: 105, roleIds: [2] }),
})
const createBody = await createRes.json()
ok('测试用户创建', createBody.code === 200, tempName)

async function cleanup() {
  if (tempUserId == null) {
    const list = await fetch(`${GATEWAY}/admin/system/user/list?pageNum=1&pageSize=50`, { headers: apiHeaders }).then((r) => r.json())
    tempUserId = list.rows?.find((u) => u.userName === tempName)?.userId ?? null
  }
  if (tempUserId != null) {
    await fetch(`${GATEWAY}/admin/system/user/${tempUserId}`, { method: 'DELETE', headers: apiHeaders })
  }
}

const browser = await chromium.launch()
const errors = []

try {
  const page = await browser.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(String(err)))

  // 登录并进入用户管理
  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('input[aria-label="账号"]').fill('admin')
  await page.locator('input[aria-label="密码"]').fill('admin123')
  await page.locator('.login-form button[type="submit"]').click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await page.goto(`${ADMIN_BASE}/users`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('.admin-table .el-table__row').first().waitFor({ timeout: 15000 })

  // 1. 列表渲染
  const allText = await page.locator('.admin-table').innerText()
  const adminTag = await page.locator('.admin-table .el-tag--danger').count()
  ok('用户列表渲染', allText.includes('admin') && allText.includes('ry') && adminTag >= 1, `管理员标签${adminTag}`)

  // 2. 按用户名检索
  await page.locator('.admin-toolbar input[placeholder="按用户名检索"]').fill('ry')
  await page.getByRole('button', { name: '查询' }).click()
  await page.waitForTimeout(1000)
  const rowText = await page.locator('.admin-table').innerText()
  ok('按用户名检索', rowText.includes('ry') && !rowText.includes('admin'), '筛选后仅 ry 相关行')
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await page.waitForTimeout(1000)

  // 3. 详情弹窗
  await page.locator('.admin-table .el-table__row').filter({ hasText: 'admin' }).first().getByRole('button', { name: '详情' }).click()
  await page.locator('.el-dialog').waitFor({ timeout: 10000 })
  const detailText = await page.locator('.el-dialog').innerText()
  ok('用户详情弹窗', detailText.includes('用户名') && detailText.includes('部门'), '详情字段完整')
  await page.locator('.el-dialog .el-dialog__headerbtn').click()

  // 4. 重置密码长度校验（不提交真实重置，避免破坏后续登录）
  await page.locator('.admin-table .el-table__row').filter({ hasText: 'ry' }).first().getByRole('button', { name: '重置密码' }).click()
  await page.locator('.el-dialog input[type="password"]').fill('123')
  await page.locator('.el-dialog__footer').getByRole('button', { name: '确认重置' }).click()
  await page.getByText('密码长度需为 6-20 位').waitFor({ timeout: 10000 })
  ok('重置密码表单校验', await page.locator('.el-dialog').count() > 0, '短密码被拒绝且弹窗保留')
  await page.locator('.el-dialog__footer').getByRole('button', { name: '取消' }).click()

  // 5. 停用/启用状态流转（临时用户）
  await page.getByRole('button', { name: '刷新' }).click()
  await page.locator('.admin-table .el-table__row').filter({ hasText: tempName }).first().waitFor({ timeout: 10000 })
  const tempRow = page.locator('.admin-table .el-table__row').filter({ hasText: tempName }).first()
  await tempRow.getByRole('button', { name: '停用' }).click()
  await page.locator('.el-message-box__btns .el-button--primary').click()
  await page.getByText(/已停用/).waitFor({ timeout: 10000 })
  const disabledTag = await tempRow.locator('.el-tag--danger').count()
  ok('停用用户', disabledTag > 0, '状态标签切换为停用')
  await tempRow.getByRole('button', { name: '启用' }).click()
  await page.locator('.el-message-box__btns .el-button--primary').click()
  await page.getByText(/已启用/).waitFor({ timeout: 10000 })
  const enabledTag = await tempRow.locator('.el-tag--success').count()
  ok('启用用户', enabledTag > 0, '状态标签恢复为正常')

  ok('无控制台/页面错误', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  ok('执行异常', false, String(e).slice(0, 200))
} finally {
  await cleanup()
  await browser.close()
}

const failed = results.filter((r) => !r.pass).length
console.log(`\n用户管理页：通过 ${results.length - failed} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)


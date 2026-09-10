import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const out = resolve(import.meta.dirname, '../sanye_deploy/.local/tr03/ui')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const checks = []
let mode = 'success', permissions = ['*:*:*'], triggers = 0
const records = [
  { id: 21, triggerTime: '2026-09-09 12:00:00', handleTime: '2026-09-09 12:00:01', triggerCode: 200, handleCode: 200, triggerMessage: '调度成功', handleMessage: '执行成功' },
  { id: 20, triggerTime: '2026-09-09 11:00:00', handleTime: '2026-09-09 11:00:01', triggerCode: 200, handleCode: 500, triggerMessage: '调度成功', handleMessage: '执行失败，请检查服务后重试' },
]
await page.addInitScript(() => localStorage.setItem('sanye_admin_access_token', 'ui-fixture-token'))
await page.route('**/api/v1/admin/**', async route => {
  const url = new URL(route.request().url())
  let body = { code: 200, data: [], rows: [], total: 0 }
  if (url.pathname.endsWith('/getInfo')) body = { code: 200, user: { userId: 1, nickName: '验收管理员' }, permissions }
  else if (url.pathname.endsWith('/monitor/xxl-job')) body = { code: mode === 'error' ? 500 : 200, msg: '调度服务暂不可用', data: { configured: mode !== 'unconfigured', jobId: 3, executorAppName: 'sanye_job_acceptance', executorOnline: mode !== 'offline' } }
  else if (url.pathname.endsWith('/xxl-job/logs')) {
    if (mode === 'slow') await new Promise(r => setTimeout(r, 500))
    const rows = mode === 'empty' ? [] : url.searchParams.get('status') === '2' ? records.slice(1) : records
    body = { code: 200, data: { rows, total: rows.length } }
  } else if (url.pathname.endsWith('/xxl-job/trigger')) { triggers++; await new Promise(r => setTimeout(r, 600)); body = { code: 200, msg: '已提交' } }
  await route.fulfill({ json: body })
})
async function open(next) { mode = next; await page.goto('http://127.0.0.1:5176/jobs?scheduler=xxl'); await page.getByRole('heading', { name: '作品索引对账与重建' }).waitFor() }
async function check(name, fn) { await fn(); checks.push(name); console.log(name) }
try {
  await open('success')
  await check('online status and log detail', async () => {
    await page.getByText('执行器在线', { exact: true }).waitFor()
    await page.getByRole('button', { name: '查看执行详情', exact: true }).first().click()
    await page.getByRole('dialog').getByText('执行成功', { exact: true }).waitFor()
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.screenshot({ path: resolve(out, 'desktop.png'), fullPage: true })
  })
  await check('trigger submits once while pending', async () => {
    const button = page.getByRole('button', { name: '立即执行', exact: true })
    await button.click()
    assert.ok(await button.isDisabled())
    await page.getByText('任务已提交，请查看执行记录', { exact: true }).waitFor()
    assert.equal(triggers, 1)
  })
  await check('failed execution retry', async () => {
    await page.getByRole('button', { name: '重新执行索引任务', exact: true }).click()
    await page.waitForTimeout(800)
    assert.equal(triggers, 2)
  })
  await check('mobile layout and detail', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: resolve(out, 'mobile.png'), fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.getByRole('button', { name: '查看执行详情', exact: true }).first().click()
    await page.getByRole('dialog').waitFor()
    await page.screenshot({ path: resolve(out, 'mobile-detail.png'), fullPage: true })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await check('offline disables trigger', async () => { await open('offline'); await page.getByText('执行器离线', { exact: true }).waitFor(); assert.ok(await page.getByRole('button', { name: '立即执行', exact: true }).isDisabled()) })
  await check('unconfigured state', async () => { await open('unconfigured'); await page.getByText('XXL-JOB 尚未配置', { exact: true }).waitFor() })
  await check('failure and recovery', async () => { await open('error'); await page.getByText('调度服务暂不可用', { exact: true }).waitFor(); mode = 'success'; await page.getByRole('button', { name: '刷新 XXL-JOB', exact: true }).click(); await page.getByText('执行器在线', { exact: true }).waitFor() })
  await check('empty logs', async () => { await open('empty'); await page.getByText('暂无执行记录', { exact: true }).waitFor() })
  await check('read-only user cannot trigger', async () => { permissions = ['monitor:job:list', 'monitor:job:query']; await open('success'); await page.getByText('执行器在线', { exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: '立即执行', exact: true }).count(), 0); assert.equal(await page.getByRole('button', { name: '重新执行索引任务', exact: true }).count(), 0) })
  await check('logs require query permission', async () => { permissions = ['monitor:job:list']; await open('success'); await page.getByText('无权查看执行记录', { exact: true }).waitFor() })
  await check('Quartz remains reachable', async () => { permissions = ['*:*:*']; await open('success'); await page.getByRole('tab', { name: 'Quartz', exact: true }).click(); await page.getByRole('button', { name: '新建任务', exact: true }).waitFor() })
} finally {
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify(checks, null, 2))
  await browser.close()
}

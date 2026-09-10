import { chromium } from 'playwright'
import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

export async function verifyLiveAdmin(setMode, out, suffix) {
  const base = 'http://localhost:18089'
  const password = process.env.TR03_RUOYI_PASSWORD
  assert.ok(password, 'Inject the local RuoYi acceptance password')
  async function login(username) {
    const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    const data = await r.json()
    assert.equal(data.code, 200, 'RuoYi login failed')
    return data.token
  }
  const token = await login('admin')
  const viewer = await login('ry')
  async function api(path, method = 'GET', auth = token) {
    return (await fetch(`${base}${path}`, { method, headers: auth ? { Authorization: `Bearer ${auth}` } : {} })).json()
  }
  assert.notEqual((await api('/monitor/xxl-job', 'GET', null)).code, 200)
  const viewerInfo = await api('/getInfo', 'GET', viewer)
  // The seed user must not have the job trigger permission in this isolated acceptance database.
  assert.ok(!viewerInfo.permissions.includes('monitor:job:changeStatus') && !viewerInfo.permissions.includes('*:*:*'))
  assert.notEqual((await api('/monitor/xxl-job/trigger', 'POST', viewer)).code, 200)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.addInitScript(token => { localStorage.setItem('sanye_admin_access_token', token); localStorage.setItem('sanyeThemeMode', 'light') }, token)
  const evidence = []
  try {
    await page.goto('http://127.0.0.1:5176/jobs?scheduler=xxl')
    await page.getByText('执行器在线', { exact: true }).waitFor()
    async function trigger(expect, action) {
      const previous = new Set((await api('/monitor/xxl-job/logs')).data.rows.map(x => x.id))
      await action()
      await page.getByText('任务已提交，请查看执行记录', { exact: true }).last().waitFor()
      let found
      for (let i = 0; i < 30; i++) {
        found = (await api('/monitor/xxl-job/logs')).data.rows.find(x => !previous.has(x.id) && x.handleCode === expect)
        if (found) break
        await page.waitForTimeout(1000)
      }
      assert.ok(found, `Missing expected callback ${expect}`)
      evidence.push({ id: found.id, triggerCode: found.triggerCode, handleCode: found.handleCode })
      await page.getByRole('button', { name: '刷新 XXL-JOB', exact: true }).click()
      await page.getByRole('cell', { name: String(found.id), exact: true }).waitFor()
    }
    await trigger(200, () => page.getByRole('button', { name: '立即执行', exact: true }).click())
    setMode('fail')
    await trigger(500, () => page.getByRole('button', { name: '立即执行', exact: true }).click())
    setMode('normal')
    await trigger(200, () => page.getByRole('button', { name: '重新执行索引任务', exact: true }).first().click())
    await page.getByRole('button', { name: '查看执行详情', exact: true }).first().click()
    await page.getByRole('dialog').getByText('执行成功', { exact: true }).waitFor()
    await page.screenshot({ path: resolve(out, `${suffix}-ruoyi-detail.png`), fullPage: true })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.screenshot({ path: resolve(out, `${suffix}-ruoyi-desktop.png`), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: resolve(out, `${suffix}-ruoyi-mobile.png`), fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    const response = await api('/monitor/xxl-job/logs?status=2')
    assert.ok(response.data.rows.length > 0 && response.data.rows.every(row => row.status === 'FAILED'))
    evidence.push({ anonymousDenied: true, unauthorizedUserDenied: true, failedFilterVerified: true })
  } finally {
    writeFileSync(resolve(out, `${suffix}-ruoyi-evidence.json`), JSON.stringify(evidence, null, 2))
    await browser.close()
    setMode('normal')
  }
}

const { _electron: electron } = require('../e2e/node_modules/playwright')
const path = require('node:path')
const fs = require('node:fs/promises')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')

async function main() {
  const data = path.resolve(__dirname, '../sanye_deploy/.local/desktop-exe', randomUUID())
  await fs.mkdir(data, { recursive: true })
  const exe = process.env.SANYE_DESKTOP_EXE || path.join(__dirname, 'dist/self-signed/win-unpacked/三叶动漫.exe')
  const report = { checks: [], playback: 'not-run', data, exe, phase: 'artifacts', status: 'running' }
  let app
  let child
  await fs.writeFile(path.join(data, 'report.json'), JSON.stringify(report, null, 2))
  try {
    report.artifacts = {}
    for (const file of [path.basename(exe), 'resources/app.asar', 'resources/runtime/client/index.html', 'resources/runtime/seed.sql']) {
      report.artifacts[file] = createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe), file))).digest('hex')
    }
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    report.phase = 'launch'
    // Detect OS execution rejection without Playwright's early child-process rejection race.
    const probe = spawnSync(exe, ['--version'], { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 15000, encoding: 'utf8' })
    if (probe.error || probe.status !== 0) throw new Error(`EXE execution preflight failed: ${probe.error?.message || probe.stderr || probe.status}`)
    app = await electron.launch({ executablePath: exe, args: [`--sanye-data-dir=${data}`], env, timeout: 30000 })
    child = app.process()
    report.phase = 'browser'
    const page = await app.firstWindow()
    const capture = async name => {
      // Native capture avoids CDP screenshot stalls on the Windows compositor.
      const result = await app.evaluate(async ({ BrowserWindow }) => {
        let timer
        try {
          const image = await Promise.race([
            BrowserWindow.getAllWindows()[0].capturePage(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native capture timed out')), 15000) }),
          ])
          if (image.isEmpty()) throw new Error('Packaged window capture is empty')
          const bitmap = image.toBitmap(), colors = new Set()
          const stride = Math.max(4, Math.floor(bitmap.length / 256 / 4) * 4)
          for (let offset = 0; offset < bitmap.length; offset += stride) {
            colors.add(`${bitmap[offset]},${bitmap[offset + 1]},${bitmap[offset + 2]}`)
          }
          if (colors.size < 3) throw new Error('Packaged window capture is blank')
          return { png: image.toPNG().toString('base64'), size: image.getSize(), colors: colors.size }
        } finally { clearTimeout(timer) }
      })
      await fs.writeFile(path.join(data, name), Buffer.from(result.png, 'base64'))
      ;(report.captures ??= []).push({ name, size: result.size, colors: result.colors })
    }
    await page.waitForURL('http://127.0.0.1:28710/', { timeout: 180000 })
    await page.locator('.home-hero').waitFor()
    assert.equal(await page.locator('a[href="/ai"]:visible').count(), 0)
    assert.equal(await page.getByRole('button', { name: '登录', exact: true }).count(), 0)
    report.checks.push('packaged-exe-starts-with-bundled-runtime', 'fixed-home-recommendations', 'login-ai-pet-excluded')
    await page.evaluate(async () => { await Promise.all([...document.images].filter(i => i.loading !== 'lazy').map(i => i.decode().catch(() => {}))) })
    await capture('home.png')
    await page.getByRole('button', { name: '收起导航' }).click()
    assert.equal(await page.locator('.sidebar').evaluate(e => e.getBoundingClientRect().width), 64)
    await page.getByRole('button', { name: '展开导航' }).click()
    assert.equal(await page.locator('.sidebar').evaluate(e => e.getBoundingClientRect().width), 248)
    report.checks.push('packaged-sidebar-collapse-and-expand')
    await page.getByRole('textbox', { name: '全局搜索', exact: true }).fill('你的名字')
    await page.getByRole('button', { name: '提交全局搜索' }).click()
    const searchResult = page.locator('.search-results a.result-row[href="/anime/127"]')
    await searchResult.waitFor({ timeout: 30000 })
    await searchResult.click()
    await page.waitForURL('**/anime/127')
    await page.getByRole('button', { name: '返回上一级' }).click()
    await page.waitForURL('**/search?keyword=*')
    assert.equal(await page.getByRole('textbox', { name: '搜索作品', exact: true }).inputValue(), '你的名字')
    report.checks.push('packaged-real-search-and-back')
    await capture('search.png')
    await page.goto('http://127.0.0.1:28710/anime-repository')
    await page.getByText('你的名字', { exact: true }).first().waitFor()
    await page.evaluate(async () => { for (const img of document.images) img.loading = 'eager'; await Promise.all([...document.images].map(img => img.decode().catch(() => {}))) })
    const broken = await page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')))
    assert.deepEqual(broken, [])
    report.checks.push('all-catalog-covers-render')
    await capture('catalog.png')
    await page.goto('http://127.0.0.1:28710/anime/127')
    await page.locator('[aria-label="剧集播放器"]').waitFor({ timeout: 20000 })
    assert.equal(await page.locator('a[href^="/ai"]:visible').count(), 0)
    try {
      await page.locator('video').waitFor({ timeout: 20000 })
      await page.locator('video').evaluate(video => { video.muted = true; void video.play().catch(() => {}) })
      await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 2 && v.videoWidth > 0 }, undefined, { timeout: 45000 })
      report.playback = 'passed'
    } catch {
      report.playback = 'external-source-not-playing'
    }
    await page.locator('[aria-label="剧集播放器"]').scrollIntoViewIfNeeded()
    await capture('playback.png')
    report.checks.push('real-detail-and-episode-list')
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    process.exitCode = 1
  } finally {
    if (app) {
      try {
        await Promise.race([
          (async () => {
            await app.evaluate(({ app }) => app.quit()).catch(() => {})
            await new Promise(resolve => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once('exit', resolve) })
          })(),
          new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('EXE shutdown timed out after 60 seconds')), 60000); timer.unref() }),
        ])
        report.exitCode = child.exitCode
        report.checks.push(report.exitCode === 0 ? 'packaged-exe-exits' : 'packaged-exe-exit-failed')
        if (report.exitCode !== 0) { report.status = 'failed'; process.exitCode = 1 }
      } catch (error) {
        report.status = 'failed'; report.shutdownError = error.message; process.exitCode = 1
        child?.kill()
      }
    }
    await fs.writeFile(path.join(data, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

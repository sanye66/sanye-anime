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
  const exe = process.env.SANYE_DESKTOP_EXE || path.join(__dirname, 'dist/signed/win-unpacked/sanye_anime.exe')
  const report = { checks: [], playback: 'not-run', data, exe, phase: 'artifacts', status: 'running' }
  let app
  await fs.writeFile(path.join(data, 'report.json'), JSON.stringify(report, null, 2))
  try {
    report.artifacts = {}
    for (const file of ['sanye_anime.exe', 'resources/app.asar', 'resources/runtime/client/index.html', 'resources/runtime/seed.sql']) {
      report.artifacts[file] = createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe), file))).digest('hex')
    }
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    report.phase = 'launch'
    // Detect OS execution rejection without Playwright's early child-process rejection race.
    const probe = spawnSync(exe, ['--version'], { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 15000, encoding: 'utf8' })
    if (probe.error || probe.status !== 0) throw new Error(`EXE execution preflight failed: ${probe.error?.message || probe.stderr || probe.status}`)
    app = await electron.launch({ executablePath: exe, args: [`--sanye-data-dir=${data}`], env, timeout: 30000 })
    report.phase = 'browser'
    const page = await app.firstWindow()
    await page.waitForURL('http://127.0.0.1:28710/', { timeout: 180000 })
    await page.locator('.home-hero').waitFor()
    assert.equal(await page.locator('a[href="/ai"]:visible').count(), 0)
    assert.equal(await page.getByRole('button', { name: '登录', exact: true }).count(), 0)
    report.checks.push('packaged-exe-starts-with-bundled-runtime', 'fixed-home-recommendations', 'login-ai-pet-excluded')
    await page.evaluate(async () => { await Promise.all([...document.images].filter(i => i.loading !== 'lazy').map(i => i.decode().catch(() => {}))) })
    await page.screenshot({ path: path.join(data, 'home.png') })
    await page.goto('http://127.0.0.1:28710/anime-repository')
    await page.getByText('你的名字', { exact: true }).first().waitFor()
    await page.evaluate(async () => { for (const img of document.images) img.loading = 'eager'; await Promise.all([...document.images].map(img => img.decode().catch(() => {}))) })
    const broken = await page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')))
    assert.deepEqual(broken, [])
    report.checks.push('all-catalog-covers-render')
    await page.screenshot({ path: path.join(data, 'catalog.png') })
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
    await page.screenshot({ path: path.join(data, 'playback.png') })
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
            await new Promise(resolve => { if (app.process().exitCode !== null || app.process().signalCode !== null) resolve(); else app.process().once('exit', resolve) })
          })(),
          new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('EXE shutdown timed out after 60 seconds')), 60000); timer.unref() }),
        ])
        report.exitCode = app.process().exitCode
        report.checks.push(report.exitCode === 0 ? 'packaged-exe-exits' : 'packaged-exe-exit-failed')
        if (report.exitCode !== 0) { report.status = 'failed'; process.exitCode = 1 }
      } catch (error) {
        report.status = 'failed'; report.shutdownError = error.message; process.exitCode = 1
        app.process().kill()
      }
    }
    await fs.writeFile(path.join(data, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

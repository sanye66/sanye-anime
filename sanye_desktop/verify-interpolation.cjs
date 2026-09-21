const { _electron: electron } = require('../e2e/node_modules/playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const assert = require('node:assert/strict')

;(async () => {
  const data = path.resolve(__dirname, '../sanye_deploy/.local/interpolation-exe', randomUUID())
  await fs.mkdir(data, { recursive: true })
  const report = { data, status: 'running' }
  let app, child
  try {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({ executablePath: path.resolve(__dirname, 'dist/self-signed/win-unpacked/sanye_anime.exe'), args: [`--sanye-data-dir=${data}`], env })
    child = app.process()
    const page = await app.firstWindow()
    await page.waitForURL('http://127.0.0.1:28710/', { timeout: 180000 })
    await page.goto('http://127.0.0.1:28710/anime/127')
    await page.locator('.art-control-interpolation').waitFor({ timeout: 30000 })
    await page.locator('.art-video-player').hover()
    await page.locator('.art-control-interpolation').click()
    const modal = page.getByRole('dialog', { name: '120fps 插帧' })
    await modal.waitFor()
    await modal.getByRole('radio', { name: '本地视频' }).check()
    await modal.getByLabel('选择插帧视频').setInputFiles(path.resolve(__dirname, '../sanye_deploy/.local/interpolation/source.mp4'))
    await modal.getByRole('button', { name: '生成 120fps' }).click()
    await modal.getByRole('link', { name: '保存视频' }).waitFor({ timeout: 120000 })
    await modal.locator('video').evaluate(async video => { video.muted = true; await video.play() })
    await page.waitForTimeout(400)
    report.output = await modal.locator('video').evaluate(video => ({ width: video.videoWidth, height: video.videoHeight, duration: video.duration, currentTime: video.currentTime }))
    assert.equal(report.output.width, 96)
    assert.ok(report.output.currentTime > 0)
    await page.screenshot({ path: path.join(data, 'result.png') })
    await modal.getByRole('button', { name: '返回原视频' }).click()
    assert.equal(await page.locator('.interpolation-dialog').count(), 0)
    assert.equal(await page.locator('.art-video').count(), 1)
    report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1 }
  finally {
    if (app) {
      await app.evaluate(({ app }) => app.quit()).catch(() => {})
      await new Promise(resolve => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve()
        const timer = setTimeout(() => { child.kill(); report.shutdownTimeout = true; resolve() }, 60000)
        child.once('exit', () => { clearTimeout(timer); resolve() })
      })
      report.exitCode = child.exitCode
    }
    await fs.writeFile(path.join(data, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  }
})()

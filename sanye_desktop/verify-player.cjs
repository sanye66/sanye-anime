const { _electron: electron } = require('../e2e/node_modules/playwright')
const path = require('node:path')
const fs = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
const assert = require('node:assert/strict')

;(async () => {
  const data = path.resolve(__dirname, '../sanye_deploy/.local/player-performance', randomUUID())
  await fs.mkdir(data, { recursive: true })
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const report = { data, samples: [], status: 'running' }
  let app
  let child
  try {
    app = await electron.launch({ executablePath: path.resolve(__dirname, 'dist/self-signed/win-unpacked/sanye_anime.exe'), args: [`--sanye-data-dir=${data}`], env })
    child = app.process()
    report.gpu = await app.evaluate(({ app }) => app.getGPUFeatureStatus())
    const page = await app.firstWindow()
    await page.waitForURL('http://127.0.0.1:28710/', { timeout: 180000 })
    report.window = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      const before = { visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused() }
      window.restore(); window.show(); window.setAlwaysOnTop(true); window.focus()
      return before
    })
    const sample = async name => {
      const result = await page.locator('video').evaluate(async video => {
        const before = video.getVideoPlaybackQuality()
        const start = video.currentTime
        const started = performance.now()
        const frames = []
        let handle
        function tick(now, metadata) { frames.push({ now, time: metadata.mediaTime }); handle = video.requestVideoFrameCallback(tick) }
        handle = video.requestVideoFrameCallback(tick)
        await new Promise(resolve => setTimeout(resolve, 8000))
        video.cancelVideoFrameCallback(handle)
        const after = video.getVideoPlaybackQuality()
        const canvas = document.querySelector('.anime4k-canvas')
        return { elapsed: (performance.now() - started) / 1000, advanced: video.currentTime - start, decoded: after.totalVideoFrames - before.totalVideoFrames, dropped: after.droppedVideoFrames - before.droppedVideoFrames, presented: frames.length, width: video.videoWidth, height: video.videoHeight, readyState: video.readyState, visibility: document.visibilityState, canvas: canvas ? { width: canvas.width, height: canvas.height } : null }
      })
      report.samples.push({ name, ...result })
      report.gpuDuringPlayback = await app.evaluate(({ app }) => app.getGPUFeatureStatus())
      await fs.writeFile(path.join(data, 'report.json'), JSON.stringify(report, null, 2))
      console.log(JSON.stringify({ name, ...result }))
    }
    for (const id of [127, 133]) {
      await page.goto(`http://127.0.0.1:28710/anime/${id}`)
      await page.locator('video').waitFor({ timeout: 30000 })
      await page.locator('video').evaluate(v => { v.muted = true; void v.play().catch(() => {}) })
      await page.waitForFunction(() => document.querySelector('video')?.currentTime > 2, undefined, { timeout: 60000 })
      await sample(`${id}-original`)
      if (id === 127) {
        await page.locator('.art-video-player').hover()
        await page.locator('.art-control-anime4k').hover()
        await page.locator('.art-control-anime4k .art-selector-item').filter({ hasText: '性能' }).click()
        await page.waitForTimeout(3000)
        report.enhancementActive = await page.locator('.sanye-anime4k-active').count() > 0
        await sample(`${id}-enhanced-fast`)
        await page.locator('.art-video-player').hover()
        await page.locator('.art-control-anime4k').hover()
        await page.locator('.art-control-anime4k .art-selector-item').filter({ hasText: '关闭' }).click()
        await page.waitForTimeout(500)
        assert.equal(await page.locator('.anime4k-canvas').count(), 0)
        await page.screenshot({ path: path.join(data, 'controls.png') })
      }
    }
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

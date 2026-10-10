// 只用于验收：在隐藏窗口里加载本地 vite 来源并运行 probe.js，把结果写到 report.json。
//
// 与 webgpu-motion-probe 同样的理由：WebGPU 需要安全上下文（127.0.0.1 属于可信来源），
// Playwright 自带的 Chromium 缺少 dxcompiler.dll，无法创建 WebGPU 设备，因此只能在真实 Electron 里验收。
// 全程不创建可见窗口、不启动本地服务。
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const origin = process.env.SANYE_WEBGPU_ORIGIN || 'http://127.0.0.1:5173'
const reportDirectory = path.resolve(__dirname, '../../sanye_deploy/.local/webgpu-enhance')
const reportPath = path.join(reportDirectory, 'report.json')

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 640, height: 360,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: true } })
  fs.mkdirSync(reportDirectory, { recursive: true })
  const write = value => fs.writeFileSync(reportPath, JSON.stringify(value, null, 2))
  try {
    await window.loadURL(origin)
    const source = fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf8')
    await window.webContents.executeJavaScript(`window.__probeSource = ${JSON.stringify(source)}; true`)
    const report = await window.webContents.executeJavaScript(`(async () => {
      const url = URL.createObjectURL(new Blob([window.__probeSource], { type: 'text/javascript' }))
      try { const module = await import(url); return await module.run() }
      finally { URL.revokeObjectURL(url) }
    })()`)
    write({ status: 'passed', report })
  } catch (error) {
    write({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
  } finally {
    app.exit(0)
  }
})

const { BrowserWindow, screen } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

function startProgressCompanion(app) {
  if (process.platform !== 'win32') return
  const base = app.isPackaged ? path.join(process.resourcesPath, 'pet') : path.join(__dirname, '..', 'sanye_pet')
  const renderer = app.isPackaged ? path.join(base, 'renderer', 'progress.html') : path.join(base, 'dist', 'runner', 'progress.html')
  const preload = path.join(base, app.isPackaged ? 'preload.cjs' : 'electron/preload.cjs')
  const script = path.join(base, app.isPackaged ? 'watch-progress.ps1' : 'electron/watch-progress.ps1')
  if (!fs.existsSync(renderer) || !fs.existsSync(script)) return
  let overlay = null
  let lastUpdate = 0
  let candidateBar = null
  let candidateCount = 0
  const watcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', script], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  })
  let pending = ''
  watcher.stdout.on('data', chunk => {
    pending += chunk.toString()
    if (pending.length > 8192) pending = ''
    let end
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end)
      pending = pending.slice(end + 1)
      let value
      try { value = JSON.parse(line) } catch { candidateBar = null; candidateCount = 0; overlay?.hide(); continue }
      if (![value.x, value.y, value.width, value.height, value.percent].every(Number.isFinite)) { candidateBar = null; candidateCount = 0; overlay?.hide(); continue }
      const bounds = screen.getDisplayNearestPoint({ x: value.x, y: value.y }).bounds
      const barWidth = Math.min(Math.round(value.width), bounds.width - 48)
      const barHeight = Math.max(8, Math.ceil(value.height))
      if (barWidth < 30 || barHeight > 40 || value.x < bounds.x || value.x + barWidth > bounds.x + bounds.width || value.y - 64 < bounds.y || value.y + barHeight > bounds.y + bounds.height) { candidateBar = null; candidateCount = 0; overlay?.hide(); continue }
      const barKey = `${value.x}:${value.y}:${barWidth}:${Math.round(value.height)}`
      candidateCount = candidateBar === barKey ? candidateCount + 1 : 1
      candidateBar = barKey
      if (candidateCount < 3) { overlay?.hide(); continue }
      lastUpdate = Date.now()
      if (!overlay) {
        overlay = new BrowserWindow({ width: barWidth + 64, height: 64 + barHeight, x: value.x - 32, y: value.y - 64,
          transparent: true, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
          webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false } })
        overlay.setIgnoreMouseEvents(true)
        overlay.loadFile(renderer, { query: { progressRunner: '1' } })
        overlay.webContents.once('did-finish-load', () => {
          if (overlay && candidateBar === barKey) {
            overlay.webContents.send('pet:progress', { percent: Math.max(0, Math.min(100, value.percent)), barWidth, barHeight })
            overlay.showInactive()
          }
        })
        overlay.on('closed', () => { overlay = null })
      }
      overlay.setBounds({ x: value.x - 32, y: value.y - 64, width: barWidth + 64, height: 64 + barHeight })
      overlay.webContents.send('pet:progress', { percent: Math.max(0, Math.min(100, value.percent)), barWidth, barHeight })
      if (!overlay.isVisible() && !overlay.webContents.isLoading()) overlay.showInactive()
    }
  })
  watcher.on('error', () => overlay?.hide())
  watcher.on('exit', () => overlay?.hide())
  const stale = setInterval(() => { if (Date.now() - lastUpdate > 1500) overlay?.hide() }, 1000)
  app.on('before-quit', () => { clearInterval(stale); watcher.kill(); overlay?.destroy() })
}

module.exports = { startProgressCompanion }

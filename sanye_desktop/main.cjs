const { app, BrowserWindow, Tray, Menu, dialog, session, shell } = require('electron')
const path = require('node:path')
const { LocalRuntime } = require('./runtime.cjs')
const { trayMediaScript } = require('./trayMedia.cjs')

let runtime, window, tray, quitting = false, starting = Promise.resolve()
let trayHidden = false, root
const loadingPage = 'data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN"><meta charset="utf-8"><style>body{background:#17191d;color:#eee;font:16px system-ui;padding:48px}h1{font-size:28px}</style><h1>三叶动漫</h1><p>正在启动本地服务...</p></html>')

function runtimeRoot() {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'runtime'), path.join(path.dirname(process.execPath), 'resources', 'runtime')]
    : [path.join(__dirname, 'runtime')]
  // Prefer a directory that actually holds the bundled runtime, so a path the
  // system cannot represent surfaces with a usable fallback instead of ENOENT.
  return candidates.find(directory => require('node:fs').existsSync(path.join(directory, 'postgres', 'bin', 'postgres.exe'))) || candidates[0]
}

function updateRuntime() {
  // Explicit exit waits for in-flight startup before releasing owned services.
  starting = starting.then(async () => {
    if (quitting) return
    if (runtime) return
    runtime = new LocalRuntime(root, path.join(app.getPath('userData'), 'local-services'),
      status => { if (!window.isDestroyed()) window.setTitle(`三叶动漫 - ${status}`) },
      error => { void dialog.showMessageBox({ type: 'error', message: '本地服务已停止', detail: error.message }).then(() => app.quit()) })
    try {
      const origin = await runtime.start()
      if (quitting) return
      await session.defaultSession.cookies.set({ url: origin, name: 'sanyeDesktop', value: runtime.cookie, httpOnly: true, sameSite: 'strict', path: '/' })
      if (quitting) return
      await window.loadURL(origin)
      window.setTitle('三叶动漫')
    } catch (error) {
      await runtime.stop()
      runtime = null
      if (!quitting) throw error
    }
  }).catch(async error => {
    if (!quitting) {
      await dialog.showMessageBox({ type: 'error', message: '本地服务运行失败', detail: `${error.message}\n日志目录：${path.join(app.getPath('userData'), 'local-services', 'logs')}` })
      app.quit()
    }
  })
}

function syncTrayMedia() {
  if (!window || window.isDestroyed()) return
  void window.webContents.executeJavaScript(trayMediaScript(trayHidden)).catch(() => {})
}

function hideToTray() {
  if (quitting || !tray || tray.isDestroyed()) return
  trayHidden = true
  syncTrayMedia()
  window.hide()
}

function showWindow() {
  if (quitting || !window || window.isDestroyed()) return
  trayHidden = false
  syncTrayMedia()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}
const dataArgument = process.argv.find(value => value.startsWith('--sanye-data-dir='))
if (dataArgument) {
  const data = dataArgument.slice('--sanye-data-dir='.length)
  if (!path.isAbsolute(data)) throw new Error('Desktop data directory must be absolute')
  require('node:fs').mkdirSync(data, { recursive: true })
  app.setPath('userData', data)
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', showWindow)
  app.on('activate', showWindow)
  app.whenReady().then(async () => {
    window = new BrowserWindow({ width: 1280, height: 840, minWidth: 800, minHeight: 600, backgroundColor: '#17191d',
      icon: path.join(__dirname, 'assets', 'icon.ico'),
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: true } })
    window.setMenu(null)
    try {
      tray = new Tray(path.join(__dirname, 'assets', 'icon.ico'))
      tray.setToolTip('三叶动漫')
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: '显示主窗口', click: showWindow },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() },
      ]))
      tray.on('click', showWindow)
      tray.on('double-click', showWindow)
    } catch {
      tray?.destroy()
      tray = null
      void dialog.showMessageBox({ type: 'warning', message: '系统托盘不可用', detail: '关闭窗口将退出应用。' })
    }
    window.on('close', event => {
      if (!quitting && tray && !tray.isDestroyed()) {
        event.preventDefault()
        hideToTray()
      }
    })
    window.webContents.on('did-finish-load', syncTrayMedia)
    await window.loadURL(loadingPage)
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    root = runtimeRoot()
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => {
      if (!runtime?.origin || new URL(url).origin !== runtime.origin) event.preventDefault()
    })
    updateRuntime()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', event => {
    if (quitting) return
    event.preventDefault(); quitting = true
    if (runtime) runtime.stopping = true
    void Promise.resolve(starting).then(() => runtime?.stop()).then(() => {
      tray?.destroy()
      tray = null
      app.quit()
    }).catch(async error => {
      try { await dialog.showMessageBox({ type: 'error', message: '本地服务清理失败', detail: error.message }) }
      finally { app.exit(1) }
    })
  })
}

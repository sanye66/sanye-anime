const { app, BrowserWindow, dialog, session, shell } = require('electron')
const path = require('node:path')
const { LocalRuntime } = require('./runtime.cjs')

let runtime, window, quitting = false, starting
const dataArgument = process.argv.find(value => value.startsWith('--sanye-data-dir='))
if (dataArgument) {
  const data = dataArgument.slice('--sanye-data-dir='.length)
  if (!path.isAbsolute(data)) throw new Error('Desktop data directory must be absolute')
  require('node:fs').mkdirSync(data, { recursive: true })
  app.setPath('userData', data)
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { window?.restore(); window?.focus() })
  app.whenReady().then(async () => {
    window = new BrowserWindow({ width: 1280, height: 840, minWidth: 800, minHeight: 600, backgroundColor: '#17191d',
      icon: path.join(__dirname, 'assets', 'icon.ico'),
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } })
    window.setMenu(null)
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN"><meta charset="utf-8"><style>body{background:#17191d;color:#eee;font:16px system-ui;padding:48px}h1{font-size:28px}</style><h1>sanye_anime</h1><p>正在启动本地服务...</p></html>'))
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    const root = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.join(__dirname, 'runtime')
    runtime = new LocalRuntime(root, path.join(app.getPath('userData'), 'local-services'),
      status => { if (!window.isDestroyed()) window.setTitle(`sanye_anime - ${status}`) },
      error => { void dialog.showMessageBox({ type: 'error', message: '本地服务已停止', detail: error.message }).then(() => app.quit()) })
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => {
      if (runtime.origin && new URL(url).origin !== runtime.origin) event.preventDefault()
    })
    starting = (async () => {
      try {
        const origin = await runtime.start()
        if (quitting) return
        await session.defaultSession.cookies.set({ url: origin, name: 'sanyeDesktop', value: runtime.cookie, httpOnly: true, sameSite: 'strict', path: '/' })
        await window.loadURL(origin)
        window.setTitle('sanye_anime')
      } catch (error) {
        await runtime.stop()
        if (!quitting) {
          await dialog.showMessageBox({ type: 'error', message: '本地服务启动失败', detail: `${error.message}\n日志目录：${path.join(app.getPath('userData'), 'local-services', 'logs')}` })
          app.quit()
        }
      }
    })()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', event => {
    if (quitting) return
    event.preventDefault(); quitting = true
    if (runtime) runtime.stopping = true
    void Promise.resolve(starting).then(() => runtime?.stop()).then(() => app.quit()).catch(async error => {
      try { await dialog.showMessageBox({ type: 'error', message: '本地服务清理失败', detail: error.message }) }
      finally { app.exit(1) }
    })
  })
}

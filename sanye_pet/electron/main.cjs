const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const CLIENT_URL = process.env.SANYE_CLIENT_URL || 'http://localhost:5173'
// 桌宠窗口只包住角色和交互面板，透明区域不会绘制额外场景背景。
const PET_W = 300
const PET_H = 360
const POSITION_FILE = 'pet-position.json'
const SETTINGS_FILE = 'pet-settings.json'

const DEFAULT_SETTINGS = {
  scale: 1,
  opacity: 1,
  animation: true,
  bubbles: true,
  reminders: false,
  quietStart: '22:00',
  quietEnd: '08:00',
  startOnBoot: false,
}

let win = null
let tray = null
let alwaysOnTop = true
let settings = { ...DEFAULT_SETTINGS }

function getPositionFile() {
  return path.join(app.getPath('userData'), POSITION_FILE)
}

function getSettingsFile() {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

function readSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(getSettingsFile(), 'utf8'))
    return { ...DEFAULT_SETTINGS, ...saved }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true })
  fs.writeFileSync(getSettingsFile(), JSON.stringify(settings, null, 2), 'utf8')
}

function applyStartupSetting() {
  app.setLoginItemSettings({ openAtLogin: settings.startOnBoot })
}

function readSavedPosition() {
  try {
    const saved = JSON.parse(fs.readFileSync(getPositionFile(), 'utf8'))
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) return { x: saved.x, y: saved.y }
  } catch {
    // 首次启动或配置损坏时使用默认位置。
  }
  return null
}

function clampPosition(position) {
  // 拖动后将窗口限制在当前屏幕工作区内，避免角色被拖出屏幕无法找回。
  const display = screen.getDisplayNearestPoint(position)
  const { workArea } = display
  return {
    x: Math.min(Math.max(position.x, workArea.x), workArea.x + workArea.width - PET_W),
    y: Math.min(Math.max(position.y, workArea.y), workArea.y + workArea.height - PET_H),
  }
}

function savePosition() {
  if (!win) return
  try {
    const [x, y] = win.getPosition()
    fs.mkdirSync(path.dirname(getPositionFile()), { recursive: true })
    fs.writeFileSync(getPositionFile(), JSON.stringify({ x, y }), 'utf8')
  } catch {
    // 位置记忆失败不应阻止桌宠继续运行。
  }
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const savedPosition = readSavedPosition()
  const position = clampPosition(savedPosition ?? {
    x: workArea.x + workArea.width - PET_W - 24,
    y: workArea.y + workArea.height - PET_H - 12,
  })
  win = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.setAlwaysOnTop(alwaysOnTop, 'floating')

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5199'
  if (process.env.PET_DEV === '1') {
    win.loadURL(devUrl)
  } else {
    const renderer = path.join(__dirname, '..', 'dist', 'renderer', 'index.html')
    if (fs.existsSync(renderer)) {
      win.loadFile(renderer)
    } else {
      win.loadURL(devUrl)
    }
  }
  win.on('closed', () => {
    savePosition()
    win = null
  })
  win.on('moved', savePosition)
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray.png')
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('三叶桌宠')
  const menu = Menu.buildFromTemplate([
    { label: '显示桌宠', click: () => showPet() },
    { label: '隐藏桌宠', click: () => win?.hide() },
    { type: 'separator' },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: alwaysOnTop,
      click: (item) => {
        alwaysOnTop = item.checked
        win?.setAlwaysOnTop(alwaysOnTop, 'floating')
      },
    },
    { type: 'separator' },
    { label: '退出三叶桌宠', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', () => showPet())
}

function showPet() {
  if (!win) createWindow()
  win?.show()
  win?.focus()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showPet())
  app.whenReady().then(() => {
    settings = readSettings()
    applyStartupSetting()
    createWindow()
    createTray()
    app.on('activate', () => showPet())
  })
}

app.on('window-all-closed', (event) => {
  // 桌宠隐藏/关闭窗口后保持托盘常驻，不退出进程
  event.preventDefault()
})

ipcMain.on('pet:move-by', (_event, dx, dy) => {
  if (!win) return
  const [x, y] = win.getPosition()
  const next = clampPosition({ x: Math.round(x + dx), y: Math.round(y + dy) })
  win.setPosition(next.x, next.y)
  savePosition()
})

ipcMain.on('pet:hide', () => win?.hide())
ipcMain.on('pet:quit', () => app.quit())
ipcMain.on('pet:toggle-top', () => {
  alwaysOnTop = !alwaysOnTop
  win?.setAlwaysOnTop(alwaysOnTop, 'floating')
})
ipcMain.handle('pet:open-client', async (_event, pathArg) => {
  const base = CLIENT_URL.replace(/\/+$/, '')
  const suffix = pathArg && pathArg.startsWith('/') ? pathArg : '/'
  try {
    await shell.openExternal(`${base}${suffix}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '无法打开客户端' }
  }
})
ipcMain.handle('pet:get-config', () => ({ clientUrl: CLIENT_URL, alwaysOnTop, settings }))
ipcMain.handle('pet:set-settings', (_event, next) => {
  settings = {
    ...settings,
    scale: Math.min(1.25, Math.max(0.75, Number(next?.scale) || DEFAULT_SETTINGS.scale)),
    opacity: Math.min(1, Math.max(0.55, Number(next?.opacity) || DEFAULT_SETTINGS.opacity)),
    animation: next?.animation !== false,
    bubbles: next?.bubbles !== false,
    reminders: next?.reminders === true,
    quietStart: typeof next?.quietStart === 'string' ? next.quietStart : DEFAULT_SETTINGS.quietStart,
    quietEnd: typeof next?.quietEnd === 'string' ? next.quietEnd : DEFAULT_SETTINGS.quietEnd,
    startOnBoot: next?.startOnBoot === true,
  }
  saveSettings()
  applyStartupSetting()
  return settings
})

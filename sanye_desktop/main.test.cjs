const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const settle = () => new Promise(resolve => setImmediate(resolve))

async function launch({ trayFails = false, startup, shutdown } = {}) {
  const state = { starts: 0, stops: 0, exits: 0, messages: [] }
  const mediaEvents = new EventEmitter()
  class HTMLVideoElement {
    paused = false
    currentTime = 42
    pause() { this.paused = true }
    play() { this.paused = false; mediaEvents.emit('play', { target: this }) }
  }
  state.video = new HTMLVideoElement()
  const rendererContext = vm.createContext({ HTMLVideoElement, document: {
    addEventListener: (name, listener) => mediaEvents.on(name, listener),
    querySelectorAll: () => [state.video],
  } })
  const app = new EventEmitter()
  Object.assign(app, {
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    getPath: () => __dirname,
    quit() {
      const event = { prevented: false, preventDefault() { this.prevented = true } }
      app.emit('before-quit', event)
      if (!event.prevented) state.exits++
    },
    exit() { state.exits++ },
  })
  class BrowserWindow extends EventEmitter {
    constructor() { super(); state.window = this; this.visible = true; this.minimized = false; this.loads = 0; this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = () => {}; this.webContents.executeJavaScript = async code => vm.runInContext(code, rendererContext) }
    setMenu() {}
    setTitle() {}
    async loadURL(url) { this.loads++; this.url = url; this.webContents.emit('did-finish-load') }
    isDestroyed() { return false }
    isMinimized() { return this.minimized }
    restore() { this.minimized = false }
    show() { this.visible = true }
    hide() { this.visible = false }
    focus() { this.focused = true }
    close() {
      const event = { prevented: false, preventDefault() { this.prevented = true } }
      this.emit('close', event)
      if (!event.prevented) app.emit('window-all-closed')
      return event.prevented
    }
  }
  class Tray extends EventEmitter {
    constructor() { super(); if (trayFails) throw new Error('tray unavailable'); state.tray = this }
    setToolTip() {}
    setContextMenu(menu) { this.menu = menu }
    isDestroyed() { return !!this.destroyed }
    destroy() { this.destroyed = true }
  }
  class LocalRuntime {
    async start() { state.starts++; this.origin = 'http://127.0.0.1:1234'; await startup; return this.origin }
    async stop() { state.stops++; await shutdown }
  }
  const electron = { app, BrowserWindow, Tray, Menu: { buildFromTemplate: menu => menu },
    dialog: { async showMessageBox(message) { state.messages.push(message) } },
    session: { defaultSession: { setPermissionRequestHandler() {}, cookies: { async set() {} } } }, shell: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : name === './runtime.cjs' ? { LocalRuntime } : require(name),
    __dirname, process: { argv: [] }, URL,
  })
  await settle()
  return { ...state, state, app }
}

test('close pauses video and retains services and page through every restore entry', async () => {
  const { window, tray, app, state } = await launch()
  for (const restore of [() => tray.emit('click'), () => tray.emit('double-click'),
    () => tray.menu[0].click(), () => app.emit('second-instance'), () => app.emit('activate')]) {
    const starts = state.starts
    const loads = window.loads
    window.url = 'http://127.0.0.1:1234/anime/42?episode=2'
    state.video.play()
    assert.equal(window.close(), true)
    assert.equal(window.visible, false)
    assert.equal(window.url, 'http://127.0.0.1:1234/anime/42?episode=2')
    assert.equal(state.video.paused, true)
    assert.equal(state.video.currentTime, 42)
    state.video.play()
    assert.equal(state.video.paused, true)
    await settle()
    assert.equal(state.stops, 0)
    window.minimized = true
    restore()
    assert.equal(window.visible, true)
    assert.equal(window.minimized, false)
    assert.equal(window.focused, true)
    await settle()
    assert.equal(state.starts, starts)
    assert.equal(window.loads, loads)
    assert.equal(state.video.paused, true)
    assert.equal(window.url, 'http://127.0.0.1:1234/anime/42?episode=2')
  }
  tray.menu[2].click()
  await settle()
  assert.equal(state.stops, state.starts)
  assert.equal(state.exits, 1)
  assert.equal(tray.destroyed, true)
})

test('minimize retains the page and runtime; restoring does not restart services', async () => {
  const { window, tray, state } = await launch()
  window.url = 'http://127.0.0.1:1234/anime/42?episode=2'
  window.minimized = true
  window.emit('minimize')
  window.emit('minimize')
  await settle()
  assert.equal(window.visible, true)
  assert.equal(window.minimized, true)
  assert.equal(window.url, 'http://127.0.0.1:1234/anime/42?episode=2')
  assert.equal(state.stops, 0)
  window.restore()
  tray.emit('click')
  await settle()
  assert.equal(window.minimized, false)
  assert.equal(state.starts, 1)
  assert.equal(state.stops, 0)
  assert.equal(window.url, 'http://127.0.0.1:1234/anime/42?episode=2')
})

test('minimize during startup allows startup to complete without hiding or stopping', async () => {
  let finish
  const startup = new Promise(resolve => { finish = resolve })
  const { window, state } = await launch({ startup })
  window.minimized = true
  window.emit('minimize')
  finish()
  await settle()
  assert.equal(window.visible, true)
  assert.equal(window.minimized, true)
  assert.equal(window.url, 'http://127.0.0.1:1234')
  assert.equal(state.starts, 1)
  assert.equal(state.stops, 0)
})

test('rapid tray hide and restore neither stops nor restarts services', async () => {
  const { window, tray, state } = await launch()
  window.close()
  window.close()
  tray.emit('click')
  tray.emit('double-click')
  await settle()
  assert.equal(state.stops, 0)
  assert.equal(state.starts, 1)
  assert.equal(state.video.paused, true)
  state.video.play()
  assert.equal(state.video.paused, false)
  assert.equal(window.url, 'http://127.0.0.1:1234')
})

test('hide during startup retains the loaded page and prevents late video playback', async () => {
  let finish
  const startup = new Promise(resolve => { finish = resolve })
  const { window, state } = await launch({ startup })
  window.close()
  finish()
  await settle()
  assert.equal(window.url, 'http://127.0.0.1:1234')
  assert.equal(window.visible, false)
  assert.equal(state.stops, 0)
  state.video.play()
  assert.equal(state.video.paused, true)
  assert.equal(state.exits, 0)
})

test('exit during startup waits for startup and then cleans up services', async () => {
  let finish
  const startup = new Promise(resolve => { finish = resolve })
  const { window, tray, state } = await launch({ startup })
  assert.equal(window.close(), true)
  tray.menu[2].click()
  await settle()
  assert.equal(state.stops, 0)
  assert.equal(state.exits, 0)
  finish()
  await settle()
  assert.equal(state.stops, 1)
  assert.equal(state.exits, 1)
})

test('unavailable tray keeps close-to-exit behavior instead of stranding a hidden app', async () => {
  const { window, state } = await launch({ trayFails: true })
  assert.equal(state.messages[0].message, '系统托盘不可用')
  assert.equal(window.close(), false)
  await settle()
  assert.equal(state.stops, 1)
  assert.equal(state.exits, 1)
})

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('petApi', {
  moveBy: (dx, dy) => ipcRenderer.send('pet:move-by', dx, dy),
  hide: () => ipcRenderer.send('pet:hide'),
  quit: () => ipcRenderer.send('pet:quit'),
  toggleTop: () => ipcRenderer.send('pet:toggle-top'),
  onProgress: (listener) => {
    const handler = (_event, value) => listener(value)
    ipcRenderer.on('pet:progress', handler)
    return () => ipcRenderer.removeListener('pet:progress', handler)
  },
  openClient: (pathArg) => ipcRenderer.invoke('pet:open-client', pathArg),
  getConfig: () => ipcRenderer.invoke('pet:get-config'),
  setSettings: (settings) => ipcRenderer.invoke('pet:set-settings', settings),
})

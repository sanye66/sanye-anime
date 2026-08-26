const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('petApi', {
  moveBy: (dx, dy) => ipcRenderer.send('pet:move-by', dx, dy),
  hide: () => ipcRenderer.send('pet:hide'),
  quit: () => ipcRenderer.send('pet:quit'),
  toggleTop: () => ipcRenderer.send('pet:toggle-top'),
  openClient: (pathArg) => ipcRenderer.invoke('pet:open-client', pathArg),
  getConfig: () => ipcRenderer.invoke('pet:get-config'),
  setSettings: (settings) => ipcRenderer.invoke('pet:set-settings', settings),
})

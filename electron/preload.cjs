const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  listGames: () => ipcRenderer.invoke('games:list'),
  launchGame: (game) => ipcRenderer.invoke('game:launch', game),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (next) => ipcRenderer.invoke('settings:save', next),
  resetAllPlaytime: () => ipcRenderer.invoke('playtime:resetAll'),
  debugSteam: () => ipcRenderer.invoke('debug:steam'),
  forceQuit: (game) => ipcRenderer.invoke('game:forceQuit', game),
  onSessionStart: (handler) => ipcRenderer.on('game:session-started', (_e, payload) => handler(payload)),
  onSessionEnd: (handler) => ipcRenderer.on('game:session-ended', (_e, payload) => handler(payload))
})



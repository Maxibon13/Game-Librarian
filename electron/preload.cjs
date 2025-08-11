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
  onSessionEnd: (handler) => ipcRenderer.on('game:session-ended', (_e, payload) => handler(payload)),
  // Updater
  getAppConfig: () => ipcRenderer.invoke('updater:getConfig'),
  debugVersion: () => ipcRenderer.invoke('version:debug'),
  checkForUpdate: () => ipcRenderer.invoke('updater:check'),
  runUpdater: () => ipcRenderer.invoke('updater:run'),
  installUpdateAndExit: () => ipcRenderer.invoke('updater:installAndExit'),
  runUpdaterWithLogs: () => ipcRenderer.invoke('updater:runWithLogs'),
  onUpdaterLog: (handler) => ipcRenderer.on('updater:log', (_e, line) => handler(line)),
  onUpdaterDone: (handler) => ipcRenderer.on('updater:done', (_e, payload) => handler(payload)),
  initBackend: () => ipcRenderer.invoke('backend:init')
})



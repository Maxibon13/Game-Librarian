import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  listGames: () => ipcRenderer.invoke('games:list'),
  launchGame: (game) => ipcRenderer.invoke('game:launch', game),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (next) => ipcRenderer.invoke('settings:save', next)
})



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
  openPath: (p) => ipcRenderer.invoke('os:openPath', p),
  revealPath: (p) => ipcRenderer.invoke('os:revealPath', p),
  revealSteamGame: (args) => ipcRenderer.invoke('steam:revealGameFolder', args),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  onSessionStart: (handler) => ipcRenderer.on('game:session-started', (_e, payload) => handler(payload)),
  onSessionEnd: (handler) => ipcRenderer.on('game:session-ended', (_e, payload) => handler(payload)),
  onGamesUpdated: (handler) => ipcRenderer.on('games:updated', (_e, updatedGames) => handler(updatedGames)),
  onGamesRefreshing: (handler) => ipcRenderer.on('games:refreshing', (_e, busy) => handler(!!busy)),
  onLaunchRequested: (handler) => ipcRenderer.on('game:launch-requested', (_e, game) => handler(game)),
  onFocusSearch: (handler) => ipcRenderer.on('ui:focus-search', () => handler()),
  onWindowState: (handler) => ipcRenderer.on('window:state', (_e, state) => handler(state)),
  rescanGames: () => ipcRenderer.invoke('games:rescan'),
  setCustomTitle: (launcher, id, title) => ipcRenderer.invoke('games:setCustomTitle', { launcher, id, title }),
  getActiveSessions: () => ipcRenderer.invoke('session:active'),
  resolveCover: (url) => ipcRenderer.invoke('covers:resolve', url),
  clearCoverCache: () => ipcRenderer.invoke('covers:clear'),
  createStartShortcut: (game) => ipcRenderer.invoke('shell:createStartShortcut', game),
  applyHotkeys: () => ipcRenderer.invoke('hotkeys:apply'),
  // Window chrome
  getWindowChrome: () => ipcRenderer.invoke('window:getChrome'),
  setTitleBarOverlay: (opts) => ipcRenderer.invoke('window:setTitleBarOverlay', opts),
  toggleFullscreen: (force) => ipcRenderer.invoke('window:toggleFullscreen', force),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggleMaximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  // Updater
  getAppConfig: () => ipcRenderer.invoke('updater:getConfig'),
  debugVersion: () => ipcRenderer.invoke('version:debug'),
  checkForUpdate: () => ipcRenderer.invoke('updater:check'),
  runUpdater: () => ipcRenderer.invoke('updater:run'),
  installUpdateAndExit: () => ipcRenderer.invoke('updater:installAndExit'),
  runUpdaterWithLogs: () => ipcRenderer.invoke('updater:runWithLogs'),
  onUpdaterLog: (handler) => ipcRenderer.on('updater:log', (_e, line) => handler(line)),
  onUpdaterDone: (handler) => ipcRenderer.on('updater:done', (_e, payload) => handler(payload)),
  initBackend: () => ipcRenderer.invoke('backend:init'),
  detectController: () => ipcRenderer.invoke('controller:detect'),
  toggleDevtools: () => ipcRenderer.invoke('devtools:toggle'),
  exportLogsBundle: () => ipcRenderer.invoke('logs:exportBundle')
})

contextBridge.exposeInMainWorld('debugConsoleAPI', {
  getBuffer: () => ipcRenderer.invoke('debug:getBuffer'),
  clear: () => ipcRenderer.invoke('debug:clear'),
  onLog: (handler) => ipcRenderer.on('debug:log', (_e, line) => handler(line)),
  onCleared: (handler) => ipcRenderer.on('debug:cleared', () => handler())
})



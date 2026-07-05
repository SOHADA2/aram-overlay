// 렌더러(overlay/desktop)에 안전한 API만 노출
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onPlayers: (cb) => ipcRenderer.on('players', (_e, d) => cb(d)),
  onState: (cb) => ipcRenderer.on('state', (_e, d) => cb(d)),
  onSession: (cb) => ipcRenderer.on('session', (_e, d) => cb(d)),
  onMyName: (cb) => ipcRenderer.on('myname', (_e, n) => cb(n)),
  hideOverlay: () => ipcRenderer.send('overlay-hide'),
  openWeb: () => ipcRenderer.send('open-web'),
  previewOverlay: () => ipcRenderer.send('overlay-preview'),
  previewSession: () => ipcRenderer.send('session-preview'),
  homeToggle: () => ipcRenderer.send('home-toggle'),
  homeClose: () => ipcRenderer.send('home-close'),
  getPlayers: () => ipcRenderer.invoke('get-players'),
  setMyName: (n) => ipcRenderer.send('set-myname', n),
});

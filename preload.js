// 렌더러(overlay/desktop)에 안전한 API만 노출
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onPlayers: (cb) => ipcRenderer.on('players', (_e, d) => cb(d)),
  onState: (cb) => ipcRenderer.on('state', (_e, d) => cb(d)),
  hideOverlay: () => ipcRenderer.send('overlay-hide'),
  openWeb: () => ipcRenderer.send('open-web'),
  previewOverlay: () => ipcRenderer.send('overlay-preview'),
  homeToggle: () => ipcRenderer.send('home-toggle'),
  homeClose: () => ipcRenderer.send('home-close'),
});

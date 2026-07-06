// 렌더러(overlay/desktop)에 안전한 API만 노출
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onPlayers: (cb) => ipcRenderer.on('players', (_e, d) => cb(d)),
  onState: (cb) => ipcRenderer.on('state', (_e, d) => cb(d)),
  onSession: (cb) => ipcRenderer.on('session', (_e, d) => cb(d)),
  onMyName: (cb) => ipcRenderer.on('myname', (_e, n) => cb(n)),
  onVersion: (cb) => ipcRenderer.on('version', (_e, v) => cb(v)),   // 🔖 홈페이지 버전(실시간 동기화)
  // 🔄 업데이트 토스트
  onUpdateInfo: (cb) => ipcRenderer.on('update-info', (_e, d) => cb(d)),
  updateNow: () => ipcRenderer.send('update-now'),
  updateLater: () => ipcRenderer.send('update-later'),
  hideOverlay: () => ipcRenderer.send('overlay-hide'),
  openWeb: () => ipcRenderer.send('open-web'),
  previewOverlay: () => ipcRenderer.send('overlay-preview'),
  previewSession: () => ipcRenderer.send('session-preview'),
  homeToggle: () => ipcRenderer.send('home-toggle'),
  homeClose: () => ipcRenderer.send('home-close'),
  getPlayers: () => ipcRenderer.invoke('get-players'),
  getProfile: () => ipcRenderer.invoke('profile-data'),   // 📊 프로필 대시보드
  getRecords: () => ipcRenderer.invoke('records-data'),   // 📋 기록
  getRanking: () => ipcRenderer.invoke('ranking-data'),   // 🏆 랭킹
  setMyName: (n) => ipcRenderer.send('set-myname', n),
  setHost: (v) => ipcRenderer.send('set-host', v),
  // ⚔️ 팀 짜기(방장 전용)
  tbStart: (names, mode) => ipcRenderer.invoke('tb-start', { names, mode }),
  tbSkip: () => ipcRenderer.send('tb-skip'),
  onTeamBuild: (cb) => ipcRenderer.on('teambuild', (_e, d) => cb(d)),
  // 🗳️ 투표
  voteCast: (mvpPick, mannerPick) => ipcRenderer.invoke('vote-cast', { mvpPick, mannerPick }),
  voteClear: () => ipcRenderer.invoke('vote-clear'),
  // 💰 정산
  onSettlement: (cb) => ipcRenderer.on('settlement', (_e, d) => cb(d)),
  // 🎒 아이템 페이즈
  onItemPhase: (cb) => ipcRenderer.on('itemphase', (_e, d) => cb(d)),
  itemToggle: (id) => ipcRenderer.invoke('item-toggle', { id }),
  itemBuy: (id) => ipcRenderer.invoke('item-buy', { id }),                 // 🛒 구매
  emblemEquip: (id) => ipcRenderer.invoke('emblem-equip', { id }),        // ⚒️ 강철심장 장착(id 또는 null=해제)
  synergyEquip: (sid, tier) => ipcRenderer.invoke('synergy-equip', { sid, tier }),  // 🃏 시너지 활성화
});

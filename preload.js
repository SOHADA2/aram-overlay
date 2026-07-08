// 렌더러(overlay/desktop)에 안전한 API만 노출
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onPlayers: (cb) => ipcRenderer.on('players', (_e, d) => cb(d)),
  onState: (cb) => ipcRenderer.on('state', (_e, d) => cb(d)),
  onSession: (cb) => ipcRenderer.on('session', (_e, d) => cb(d)),
  onMyName: (cb) => ipcRenderer.on('myname', (_e, n) => cb(n)),
  onVersion: (cb) => ipcRenderer.on('version', (_e, v) => cb(v)),   // 🔖 홈페이지 버전(실시간 동기화)
  onDocked: (cb) => ipcRenderer.on('docked', (_e, v) => cb(v)),     // 🖥️ 클라 도킹 중이면 각진 모서리
  onSlotTeam: (cb) => ipcRenderer.on('slot-team', (_e, t) => cb(t)),  // 📍 클라 위 내 팀 마커(1/2)
  sideClose: () => ipcRenderer.send('side-hide'),                   // ◀ 내 정보 패널 닫기
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
  onMystats: (cb) => ipcRenderer.on('mystats', (_e, d) => cb(d)),   // 🎮 인게임 오늘전적·연승
  // 🎒 아이템 페이즈
  onItemPhase: (cb) => ipcRenderer.on('itemphase', (_e, d) => cb(d)),
  itemToggle: (id) => ipcRenderer.invoke('item-toggle', { id }),
  itemBuy: (id) => ipcRenderer.invoke('item-buy', { id }),                 // 🛒 구매
  emblemEquip: (id) => ipcRenderer.invoke('emblem-equip', { id }),        // ⚒️ 강철심장 장착(id 또는 null=해제)
  synergyEquip: (sid, tier) => ipcRenderer.invoke('synergy-equip', { sid, tier }),  // 🃏 시너지 활성화
  // 🛒🃏🎫 상점/가챠/패스 (사이드패널 카테고리)
  getShop: () => ipcRenderer.invoke('shop-data'),
  buyTicket: (type, qty) => ipcRenderer.invoke('shop-buy-ticket', { type, qty }),
  getGacha: () => ipcRenderer.invoke('gacha-data'),
  gachaPull: (times) => ipcRenderer.invoke('gacha-pull', { times }),
  getPass: () => ipcRenderer.invoke('pass-data'),
  claimPass: (lv) => ipcRenderer.invoke('pass-claim', { lv }),
  openHome: (goto) => ipcRenderer.send('open-home', { goto }),               // 🌐 홈 창 열기+딥링크(복권/대장간)
  onHomeGoto: (cb) => ipcRenderer.on('home-goto', (_e, t) => cb(t)),
  onHomeShown: (cb) => ipcRenderer.on('home-shown', () => cb()),             // 홈 창 표시/리사이즈 → webview 재레이아웃
});

// ── ARAM 내전 오버레이 (Electron 메인 프로세스) ─────────────────────────
// 역할: 창(오버레이/데스크톱)·트레이·전역 단축키 관리 + 데이터 폴링(메인에서 HTTPS 처리)
//   · 인게임 명단: Live Client Data API(127.0.0.1:2999·게임 실행 중에만 응답·자체서명 무시)
//   · 내전 LP/티어: 홈페이지와 같은 Firebase(공개 read)
// 브릿지(aram-bridge) 없이도 오버레이는 단독 동작. 게임 감지=2999 응답 여부.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const https = require('https');

const WEB_URL = 'https://sohada2.github.io/aram/';
const FIREBASE_DB = 'https://aramchaos-ca022-default-rtdb.asia-southeast1.firebasedatabase.app';
const TOGGLE_HOTKEY = 'Shift+F5';

let overlayWin = null, desktopWin = null, tray = null;
let inGame = false, userHid = false, lpMap = {}, latestPlayers = [];

// ── HTTPS GET (JSON) ────────────────────────────────────────────────────
function getJson(opts) {
  return new Promise(resolve => {
    const req = https.get(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
const liveClientPlayerList = () => getJson({ host: '127.0.0.1', port: 2999, path: '/liveclientdata/playerlist', rejectUnauthorized: false, timeout: 2000 });
const fetchLpPlayers = () => getJson(`${FIREBASE_DB}/season2/players.json`);

const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();

// ── 창 생성 ──────────────────────────────────────────────────────────────
function createOverlay() {
  overlayWin = new BrowserWindow({
    width: 320, height: 440, x: 24, y: 90,
    transparent: true, frame: false, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: true, show: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');          // borderless-전체화면 게임 위로
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadFile('overlay/overlay.html');
  overlayWin.on('closed', () => { overlayWin = null; });
}
function createDesktop() {
  desktopWin = new BrowserWindow({
    width: 520, height: 560, resizable: true, minWidth: 420, minHeight: 420,
    backgroundColor: '#0e0c16', title: 'ARAM 내전 오버레이',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  desktopWin.setMenuBarVisibility(false);
  desktopWin.loadFile('desktop/desktop.html');
  desktopWin.on('closed', () => { desktopWin = null; });
}

// ── 오버레이 표시/숨김 ────────────────────────────────────────────────────
function showOverlay() { if (overlayWin && !overlayWin.isVisible()) overlayWin.showInactive(); } // 게임 포커스 뺏지 않게
function hideOverlay() { if (overlayWin && overlayWin.isVisible()) overlayWin.hide(); }
function toggleOverlay() {
  if (!overlayWin) return;
  if (overlayWin.isVisible()) { hideOverlay(); userHid = true; }
  else { showOverlay(); userHid = false; }
}

function broadcast(channel, payload) {
  for (const w of [overlayWin, desktopWin]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}

// ── 폴링 루프 ──────────────────────────────────────────────────────────────
async function pollGame() {
  const list = await liveClientPlayerList();
  const nowIn = Array.isArray(list);
  if (nowIn) {
    latestPlayers = list.filter(p => !p.isBot).map(p => ({
      name: (p.riotIdGameName || p.summonerName || (typeof p.riotId === 'string' ? p.riotId.split('#')[0] : '') || '').trim(),
      champ: p.championName || '',
      teamId: p.team === 'ORDER' ? 100 : p.team === 'CHAOS' ? 200 : 0,
    })).filter(p => p.name);
  }
  if (nowIn !== inGame) {              // 상태 전환
    inGame = nowIn;
    if (inGame) { if (!userHid) showOverlay(); }
    else { hideOverlay(); userHid = false; latestPlayers = []; }
    broadcast('state', { inGame });
  }
  broadcast('players', { players: latestPlayers, lpMap });
}
async function pollLp() {
  const data = await fetchLpPlayers();
  if (data) {
    const m = {};
    for (const k in data) { const d = data[k]; const n = norm(d.name || k); if (n) m[n] = { tier: d.tier || '', lp: d.lp || 0 }; }
    lpMap = m; broadcast('players', { players: latestPlayers, lpMap });
  }
}

// ── 트레이 ──────────────────────────────────────────────────────────────
function makeTray() {
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  if (!icon.isEmpty()) icon = icon.resize({ width: 18, height: 18 });
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('ARAM 내전 오버레이');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `오버레이 토글 (${TOGGLE_HOTKEY})`, click: toggleOverlay },
    { label: '내전 홈페이지 열기', click: () => shell.openExternal(WEB_URL) },
    { label: '데스크톱 창 열기', click: () => { if (!desktopWin) createDesktop(); else desktopWin.show(); } },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
  tray.on('double-click', () => { if (!desktopWin) createDesktop(); else desktopWin.show(); });
}

// ── IPC ──────────────────────────────────────────────────────────────────
ipcMain.on('overlay-hide', () => { hideOverlay(); userHid = true; });
ipcMain.on('open-web', () => shell.openExternal(WEB_URL));

// ── 앱 시작 ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createOverlay();
  createDesktop();
  makeTray();
  globalShortcut.register(TOGGLE_HOTKEY, toggleOverlay);
  pollGame(); pollLp();
  setInterval(pollGame, 2500);
  setInterval(pollLp, 60000);
});
app.on('window-all-closed', (e) => { /* 트레이 상주 — 창 다 닫혀도 안 죽음 */ });
app.on('will-quit', () => globalShortcut.unregisterAll());

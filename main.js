// ── ARAM 내전 오버레이 (Electron 메인 프로세스) ─────────────────────────
// 역할: 창(오버레이/데스크톱)·트레이·전역 단축키 관리 + 데이터 폴링(메인에서 HTTPS 처리)
//   · 인게임 명단: Live Client Data API(127.0.0.1:2999·게임 실행 중에만 응답·자체서명 무시)
//   · 내전 LP/티어: 홈페이지와 같은 Firebase(공개 read)
// 브릿지(aram-bridge) 없이도 오버레이는 단독 동작. 게임 감지=2999 응답 여부.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, nativeImage, screen } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const { execFile } = require('child_process');

const WEB_URL = 'https://sohada2.github.io/aram/';
const FIREBASE_DB = 'https://aramchaos-ca022-default-rtdb.asia-southeast1.firebasedatabase.app';
const TOGGLE_HOTKEY = 'Shift+F5';

let overlayWin = null, desktopWin = null, homeWin = null, tray = null;
let inGame = false, userHid = false, lpMap = {}, latestPlayers = [];
let sampleActive = false;   // 미리보기(게임 없이 모양 보기) 중이면 폴링이 안 지움
let sessionData = null, lastFormed = 0;   // 🧩 홈페이지 session(팀 배정) 상태
let config = {};            // { myName }  — 내 이름(팀 판별용)

// 설정 파일(userData) — 내 이름 저장
let CONFIG_PATH = '';
function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) { return {}; } }
function saveConfig() { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config)); } catch (_) {} }

// 🖥️ 롤 클라이언트 창에 도킹(오른쪽 가장자리에 붙이기·GGQ 스타일)
let dockedBounds = null;   // 마지막으로 맞춘 클라 물리좌표(중복 setBounds 방지)
const _psScript = `
$ErrorActionPreference='SilentlyContinue'
Add-Type @'
using System;using System.Runtime.InteropServices;
public class Win{
 [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c,string n);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 public struct RECT{public int L,T,R,B;}
}
'@
$h=[Win]::FindWindow($null,'League of Legends')
if($h -ne [IntPtr]::Zero -and [Win]::IsWindowVisible($h) -and -not [Win]::IsIconic($h)){
 $r=New-Object Win+RECT; [void][Win]::GetWindowRect($h,[ref]$r)
 Write-Output ('{0} {1} {2} {3}' -f $r.L,$r.T,$r.R,$r.B)
}`;
const _psB64 = Buffer.from(_psScript, 'utf16le').toString('base64');
function findClientBounds() {                 // 롤 클라 창의 물리 픽셀 사각형 반환(없으면 null)
  return new Promise(resolve => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', _psB64],
      { timeout: 4000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const p = stdout.trim().split(/\s+/).map(Number);
        if (p.length === 4 && p.every(Number.isFinite) && p[2] > p[0]) resolve({ x: p[0], y: p[1], w: p[2] - p[0], h: p[3] - p[1] });
        else resolve(null);
      });
  });
}
function applyDock(pb) {                       // 물리좌표 → DIP 변환 후 클라 오른쪽에 붙임
  if (!overlayWin || !pb) return;
  const sf = (screen.getPrimaryDisplay().scaleFactor) || 1;
  const cx = pb.x / sf, cy = pb.y / sf, cw = pb.w / sf, ch = pb.h / sf;
  const W = Math.max(300, Math.min(380, Math.round(cw * 0.30)));
  overlayWin.setBounds({ x: Math.round(cx + cw - W), y: Math.round(cy), width: Math.round(W), height: Math.round(ch) });
}
async function pollDock() {
  if (config.dock === false) return;           // 도킹 끈 상태면 자유 배치
  const pb = await findClientBounds();
  if (!pb) return;                             // 클라 안 떠 있으면 그대로 둠
  const sig = `${pb.x},${pb.y},${pb.w},${pb.h}`;
  if (sig !== dockedBounds) { dockedBounds = sig; applyDock(pb); }
  if (overlayWin && !overlayWin.isVisible() && !userHid) overlayWin.showInactive();  // 클라 뜨면 자동 표시
}

// 팀 배정 미리보기용 샘플 session
const SAMPLE_SESSION = {
  active: true, teamSize: 3, mode: 'balance', teamsFormedAt: 1,
  teamA: ['울퉁쓰', '애긔반달곰', '신규회원임'],
  teamB: ['ap렉사이서폿', '맹독 벌꿀오소리', '나랑듀오해듀오'],
};

// 미리보기용 샘플 — 실제 내전 멤버 이름이라 Firebase LP가 실제로 붙음
const SAMPLE_PLAYERS = [
  { name: '울퉁쓰',          champ: 'Orianna',   teamId: 100 },
  { name: '애긔반달곰',      champ: 'Aatrox',    teamId: 100 },
  { name: '신규회원임',      champ: 'Aurora',    teamId: 100 },
  { name: 'ap렉사이서폿',    champ: 'Garen',     teamId: 200 },
  { name: '맹독 벌꿀오소리', champ: 'Nasus',     teamId: 200 },
  { name: '나랑듀오해듀오',  champ: 'Seraphine', teamId: 200 },
];

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
const fetchSession   = () => getJson(`${FIREBASE_DB}/session.json`);
const fetchPlayers   = () => getJson(`${FIREBASE_DB}/players.json`);   // 등록 플레이어(이름 목록)

const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();

// ── 창 생성 ──────────────────────────────────────────────────────────────
function createOverlay() {
  overlayWin = new BrowserWindow({
    width: 456, height: 452, x: 24, y: 84, minWidth: 260, minHeight: 220,
    transparent: true, frame: false, resizable: true, movable: true,   // 크기 조절 가능(반응형)
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
    width: 520, height: 600, resizable: true, minWidth: 420, minHeight: 440,
    backgroundColor: '#0e0c16', title: 'ARAM 내전 오버레이',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  desktopWin.setMenuBarVisibility(false);
  desktopWin.loadFile('desktop/desktop.html');
  desktopWin.on('closed', () => { desktopWin = null; });
}

// 🌐 홈페이지 오버레이 — 게임 위에 진짜 홈페이지(팀짜기·투표·정산)를 띄운다(webview로 임베드)
function createHome() {
  homeWin = new BrowserWindow({
    width: 430, height: 720, x: 380, y: 60,
    frame: false, backgroundColor: '#0e0c16', show: false,
    alwaysOnTop: true, skipTaskbar: true, resizable: true, minWidth: 340, minHeight: 440,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true },
  });
  homeWin.setAlwaysOnTop(true, 'screen-saver');
  homeWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  homeWin.loadFile('home/home.html');
  homeWin.on('closed', () => { homeWin = null; });
}
function toggleHome() {
  if (!homeWin) { createHome(); homeWin.show(); return; }
  if (homeWin.isVisible()) homeWin.hide(); else homeWin.show();
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
  if (nowIn) sampleActive = false;          // 실게임 시작 → 미리보기 해제
  else if (sampleActive) return;            // 미리보기 유지 중(실게임 아님) → 건드리지 않음
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
    broadcast('state', { inGame, label: inGame ? '게임 중' : '대기' });
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

// 🧩 홈페이지 session(팀 배정) 폴링 — 새 팀 짜이면 오버레이 자동 표시
async function pollSession() {
  const s = await fetchSession();
  const formed = (s && s.teamsFormedAt) || 0;
  if (formed && formed !== lastFormed) {         // 새 팀 배정 감지
    lastFormed = formed; sampleActive = false; userHid = false; sessionData = s;
    showOverlay();
    broadcast('session', { session: s, myName: config.myName || '', lpMap });
    return;
  }
  if (sampleActive) return;                       // 미리보기 유지 중이면 안 건드림
  sessionData = s || null;
  broadcast('session', { session: sessionData, myName: config.myName || '', lpMap });
}

// ── 트레이 ──────────────────────────────────────────────────────────────
function toggleDock() {
  config.dock = (config.dock === false);   // 뒤집기(기본 켜짐)
  saveConfig();
  if (config.dock !== false) { dockedBounds = null; pollDock(); }
  refreshTrayMenu();
}
function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '롤 클라이언트에 붙이기(도킹)', type: 'checkbox', checked: config.dock !== false, click: toggleDock },
    { type: 'separator' },
    { label: `오버레이 토글 (${TOGGLE_HOTKEY})`, click: toggleOverlay },
    { label: '홈페이지 오버레이 토글 (Shift+F6)', click: toggleHome },
    { type: 'separator' },
    { label: '내전 홈페이지 (기본 브라우저)', click: () => shell.openExternal(WEB_URL) },
    { label: '데스크톱 창 열기', click: () => { if (!desktopWin) createDesktop(); else desktopWin.show(); } },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
}
function makeTray() {
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  if (!icon.isEmpty()) icon = icon.resize({ width: 18, height: 18 });
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('ARAM 내전 오버레이');
  refreshTrayMenu();
  tray.on('double-click', () => { if (!desktopWin) createDesktop(); else desktopWin.show(); });
}

// ── IPC ──────────────────────────────────────────────────────────────────
ipcMain.on('overlay-hide', () => { hideOverlay(); userHid = true; });
ipcMain.on('open-web', () => shell.openExternal(WEB_URL));
ipcMain.on('home-toggle', toggleHome);
ipcMain.on('home-close', () => { if (homeWin) homeWin.hide(); });
ipcMain.on('set-myname', (_e, name) => {           // 내 이름 저장 → 팀 판별
  config.myName = name || ''; saveConfig();
  broadcast('myname', config.myName);
  broadcast('session', { session: sessionData, myName: config.myName, lpMap });
});
ipcMain.handle('get-players', async () => {        // 데스크톱 이름 선택용 목록
  const d = await fetchPlayers();
  const names = d ? [...new Set(Object.values(d).map(p => p && p.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')) : [];
  return { names, myName: config.myName || '' };
});
ipcMain.on('session-preview', () => {              // 팀 배정 뷰 미리보기(샘플)
  sampleActive = true; userHid = false; sessionData = SAMPLE_SESSION; showOverlay();
  if (overlayWin) {
    overlayWin.webContents.send('state', { inGame: true, label: '미리보기' });
    overlayWin.webContents.send('session', { session: SAMPLE_SESSION, myName: '울퉁쓰', lpMap });
  }
});
ipcMain.on('overlay-preview', () => {          // 게임 없이 오버레이 모양 미리보기
  sampleActive = true; userHid = false; latestPlayers = SAMPLE_PLAYERS.slice();
  showOverlay();
  if (overlayWin) {
    overlayWin.webContents.send('state', { inGame: true, label: '미리보기' });
    overlayWin.webContents.send('players', { players: latestPlayers, lpMap });
  }
});

// ── 앱 시작 ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  CONFIG_PATH = path.join(app.getPath('userData'), 'aram-overlay-config.json');
  config = loadConfig();
  createOverlay();
  createDesktop();
  makeTray();
  globalShortcut.register(TOGGLE_HOTKEY, toggleOverlay);
  globalShortcut.register('Shift+F6', toggleHome);   // 🌐 홈페이지 오버레이
  pollGame(); pollLp(); pollSession(); pollDock();
  setInterval(pollGame, 2500);
  setInterval(pollLp, 60000);
  setInterval(pollSession, 3000);
  setInterval(pollDock, 2500);        // 🖥️ 롤 클라 창 따라 도킹
});
app.on('window-all-closed', (e) => { /* 트레이 상주 — 창 다 닫혀도 안 죽음 */ });
app.on('will-quit', () => globalShortcut.unregisterAll());

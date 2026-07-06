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
const FIREBASE_API_KEY = 'AIzaSyAzRirJzvaqu6jelqUUjV_Tik1MgsALEE4';   // aram/index.html firebaseConfig와 동일(홈페이지에 공개된 값)
const TOGGLE_HOTKEY = 'Shift+F5';
const { buildTeams, normName } = require('./teams');   // ⚔️ 홈페이지 makeTeams 1:1 이식

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
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 public struct RECT{public int L,T,R,B;}
 public static string Find(){
  IntPtr h=FindWindow(null,"League of Legends");
  if(h==IntPtr.Zero||!IsWindowVisible(h)||IsIconic(h)) return "";
  RECT r; GetWindowRect(h,out r);
  return r.L+" "+r.T+" "+r.R+" "+r.B;
 }
}
'@
[Win]::Find()`;
const _psB64 = Buffer.from(_psScript, 'utf16le').toString('base64');
function findClientBounds() {                 // 롤 클라 창의 물리 픽셀 사각형 반환(없으면 null)
  return new Promise(resolve => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', _psB64],
      { timeout: 4000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const p = stdout.trim().split(/\s+/).map(Number);
        const w = p[2] - p[0], h = p[3] - p[1];
        if (p.length === 4 && p.every(Number.isFinite) && w >= 700 && h >= 400)   // 유령/최소화 창(136x39 등) 무시
          resolve({ x: p[0], y: p[1], w, h });
        else resolve(null);
      });
  });
}
function applyDock(pb) {                       // 물리좌표 → DIP 변환 후 클라 오른쪽 '바깥'에 붙임
  if (!overlayWin || !pb) return;
  const sf = (screen.getPrimaryDisplay().scaleFactor) || 1;
  const cx = pb.x / sf, cy = pb.y / sf, cw = pb.w / sf, ch = pb.h / sf;
  const disp = screen.getDisplayMatching({ x: Math.round(cx), y: Math.round(cy), width: Math.round(cw), height: Math.round(ch) });
  const dispRight = disp.workArea.x + disp.workArea.width;
  let W = Math.min(400, Math.round(dispRight - (cx + cw)));   // 클라 오른쪽 바깥 남은 공간(최대 400)
  if (W < 300) W = 300;                                       // 공간 부족하면 300(살짝 겹칠 수 있음)
  let x = Math.round(cx + cw);                                // 클라 오른쪽 '바깥'
  if (x + W > dispRight) x = Math.max(disp.workArea.x, dispRight - W);   // 화면 밖이면 안으로 당김
  overlayWin.setBounds({ x, y: Math.round(cy), width: W, height: Math.round(ch) });
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
const fetchMatches   = () => getJson(`${FIREBASE_DB}/matches.json`);   // ⚔️ 팀짜기 승률 계산용(수 MB — 팀짤 때만)
const fetchSeason    = () => getJson(`${FIREBASE_DB}/config/currentSeason.json`);

// ── HTTPS 요청(JSON body) — 익명 인증·Firebase 쓰기용 ─────────────────────
function reqJson(method, url, body) {
  return new Promise(resolve => {
    const u = new URL(url);
    const data = body === undefined ? null : JSON.stringify(body);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d) }); } catch (_) { resolve({ status: res.statusCode, json: null }); } });
    });
    req.on('error', () => resolve({ status: 0, json: null }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, json: null }); });
    if (data) req.write(data);
    req.end();
  });
}

// 🔑 Firebase 익명 인증 — 쓰기 규칙(auth != null)용. 홈페이지 signInAnonymously와 동일한 신뢰모델.
let _fbTok = null, _fbTokAt = 0;
async function fbToken() {
  if (_fbTok && Date.now() - _fbTokAt < 50 * 60 * 1000) return _fbTok;   // idToken 수명 1h → 50분 캐시
  const r = await reqJson('POST', `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, { returnSecureToken: true });
  if (r.json && r.json.idToken) { _fbTok = r.json.idToken; _fbTokAt = Date.now(); return _fbTok; }
  return null;
}
// session 등 노드 전체 교체(set) — 홈페이지 set(ref(db,'session'), ...)과 동일 시맨틱
async function fbSet(pathStr, value) {
  const tok = await fbToken();
  if (!tok) return { ok: false, err: '인증 실패(네트워크 확인)' };
  const r = await reqJson('PUT', `${FIREBASE_DB}/${pathStr}.json?auth=${tok}`, value);
  if (r.status === 200) return { ok: true };
  if (r.status === 401 || r.status === 403) { _fbTok = null; }   // 토큰 만료/거부 → 다음 시도에 재발급
  return { ok: false, err: `쓰기 실패(HTTP ${r.status})` };
}

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
    width: 460, height: 640, resizable: true, minWidth: 400, minHeight: 520,
    backgroundColor: '#0b0912', title: '아수라장 내전',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,   // ready-to-show까지 숨김 → 깜빡임 방지 + 런처(VBS SW_HIDE) 힌트 무시하고 명시 표시
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  desktopWin.setMenuBarVisibility(false);
  desktopWin.loadFile('desktop/desktop.html');
  // 🪟 시작 시 메인 화면을 확실히 앞으로 (트레이로만 숨는 문제 수정)
  desktopWin.once('ready-to-show', () => showDesktop());
  // ✕ 닫기 = 트레이 상주(앱 종료 아님) — 다시 트레이/도킹으로 열 수 있음
  desktopWin.on('close', (e) => { if (!app._quitting) { e.preventDefault(); desktopWin.hide(); } });
  desktopWin.on('closed', () => { desktopWin = null; });
}
// 데스크톱(메인) 창 표시 — 생성 안 됐으면 만들고, 숨어있으면 띄워서 앞으로
function showDesktop() {
  if (!desktopWin || desktopWin.isDestroyed()) { createDesktop(); return; }
  if (desktopWin.isMinimized()) desktopWin.restore();
  desktopWin.show();
  desktopWin.moveTop();
  desktopWin.focus();
}

// 🌐 홈페이지 오버레이 — 게임 위에 진짜 홈페이지(팀짜기·투표·정산)를 띄운다(webview로 임베드)
function createHome() {
  homeWin = new BrowserWindow({
    width: 430, height: 720, x: 380, y: 60,
    frame: false, backgroundColor: '#0e0c16', show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
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

// ── ⚔️ 팀 짜기(방장 전용) — 홈페이지와 완전 연동 ─────────────────────────
// 흐름 = 홈페이지 startItemPhase→makeTeams와 동일한 session 쓰기 2단계:
//   ① session = {phase:'item', itemPhaseEnd: now+15s, players:[normName...]} → 홈페이지 참가자에게 아이템 타이머 배너 자동 표시
//   ② 15초 후(스킵 가능) 같은 알고리즘으로 팀 계산 → session = 홈페이지 makeTeams와 동일 페이로드
//      → 홈페이지 유저 = 기존 onValue 흐름 그대로 팀 발표·결과·관전자 배팅 / 오버레이 유저 = pollSession이 teamsFormedAt 감지
let _tb = null;   // 진행 중 팀짜기 {names, mode, endAt, timer, prevSession, season, matches}
function sendTb(payload) { if (desktopWin && !desktopWin.isDestroyed()) desktopWin.webContents.send('teambuild', payload); }

async function startTeamBuild(names, mode) {
  if (!config.isHost) return { ok: false, err: '방장만 팀을 짤 수 있어요 (홈 화면에서 방장 체크)' };
  if (_tb) return { ok: false, err: '이미 팀 짜기가 진행 중이에요' };
  names = (names || []).map(n => String(n)).filter(Boolean);
  if (names.length < 4) return { ok: false, err: `일반 매치엔 최소 4명이 필요해요! (현재 ${names.length}명)` };
  const prevSession = await fetchSession();                    // 전판 팀(회피용) — 덮어쓰기 전에 읽어둠
  const seasonV = await fetchSeason();
  const season = (typeof seasonV === 'number') ? seasonV : 2;
  const itemPhaseEnd = Date.now() + 15000;
  // ① 아이템 사용 단계 — 홈페이지 startItemPhase와 동일 쓰기(참가자 명단 실어 참가자에게만 타이머 노출)
  const w = await fbSet('session', { phase: 'item', itemPhaseEnd, players: names.map(n => normName(n)) });
  if (!w.ok) return { ok: false, err: w.err };
  _tb = { names, mode: (mode === 'random' ? 'random' : 'balance'), endAt: itemPhaseEnd, prevSession, season, matches: null, finishing: false };
  fetchMatches().then(m => { if (_tb) _tb.matches = m || {}; });   // 15초 동안 승률 데이터 미리 로드
  _tb.timer = setInterval(() => {
    if (!_tb) return;
    const left = Math.max(0, Math.ceil((_tb.endAt - Date.now()) / 1000));
    sendTb({ state: 'countdown', left });
    if (Date.now() >= _tb.endAt) finishTeamBuild();
  }, 250);
  sendTb({ state: 'countdown', left: 15 });
  return { ok: true };
}

async function finishTeamBuild() {
  const tb = _tb;
  if (!tb || tb.finishing) return;
  tb.finishing = true;
  clearInterval(tb.timer);
  sendTb({ state: 'building' });
  try {
    const matches = tb.matches || (await fetchMatches()) || {};
    const r = buildTeams({
      names: tb.names, mode: tb.mode, matches, season: tb.season,
      prevTeamA: (tb.prevSession && tb.prevSession.teamA) || [],
      prevTeamB: (tb.prevSession && tb.prevSession.teamB) || [],
      spectatorExclude: config.spectatorExclude || [],
    });
    // ② 팀 확정 — 홈페이지 makeTeams의 set(ref(db,'session'), {...})와 동일 페이로드
    const ANNOUNCE_DURATION = 7400;   // 홈페이지 팀 발표(7초+페이드) 후 관전자 예측 시작
    const spectatorPickStartAt = r.spectators.length > 0 ? Date.now() + ANNOUNCE_DURATION : null;
    const payload = {
      active: true,
      teamA: r.teamA,
      teamB: r.teamB,
      teamSize: r.teamSize, mode: tb.mode, isEventMatch: false,
      spectator: r.spectators[0] || null,
      spectators: r.spectators.length > 0 ? r.spectators : null,
      spectatorPickStartAt,
      spectatorPick: null,
      spectatorPicks: null,
      spectatorBets: null,
      manualEog: null,
      teamsFormedAt: Date.now(),
      mvp: { active: true },
      manner: { active: true },
    };
    const w = await fbSet('session', payload);
    _tb = null;
    if (w.ok) sendTb({ state: 'done', teamA: r.teamA, teamB: r.teamB, spectators: r.spectators, teamSize: r.teamSize });
    else sendTb({ state: 'error', err: '팀 결과 저장 실패 — ' + w.err });
  } catch (e) {
    _tb = null;
    sendTb({ state: 'error', err: String((e && e.message) || e) });
  }
}
function skipItemPhase() { if (_tb && !_tb.finishing) _tb.endAt = Date.now(); }   // 홈페이지 skipItemPhase와 동일(즉시 팀 구성)

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
    { label: '메인 화면 열기', click: showDesktop },
    { type: 'separator' },
    { label: '종료', click: () => { app._quitting = true; app.quit(); } },
  ]));
}
function makeTray() {
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  if (!icon.isEmpty()) icon = icon.resize({ width: 18, height: 18 });
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('아수라장 내전 — 클릭하면 메인 화면');
  refreshTrayMenu();
  tray.on('click', showDesktop);          // 좌클릭도 메인 화면(윈도우 트레이 관례)
  tray.on('double-click', showDesktop);
}

// ── IPC ──────────────────────────────────────────────────────────────────
ipcMain.on('overlay-hide', () => { hideOverlay(); userHid = true; });
ipcMain.on('open-web', () => shell.openExternal(WEB_URL));
ipcMain.on('home-toggle', toggleHome);
ipcMain.on('home-close', () => { if (homeWin) homeWin.hide(); });
ipcMain.on('set-myname', (_e, name) => {           // 내 이름(입장 ID) 저장 → 팀 판별
  config.myName = name || ''; saveConfig();
  broadcast('myname', config.myName);
  broadcast('session', { session: sessionData, myName: config.myName, lpMap });
});
ipcMain.on('set-host', (_e, v) => {                // 방장(팀 짜기 진행자) 여부
  config.isHost = !!v; saveConfig();
});
ipcMain.handle('get-players', async () => {        // 데스크톱 ID 선택용 목록 + 현재 설정
  const d = await fetchPlayers();
  const names = d ? [...new Set(Object.values(d).map(p => p && p.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')) : [];
  return { names, myName: config.myName || '', isHost: !!config.isHost };
});
ipcMain.handle('tb-start', (_e, { names, mode }) => startTeamBuild(names, mode));   // ⚔️ 팀 짜기 시작(방장)
ipcMain.on('tb-skip', () => skipItemPhase());                                       // ⏭️ 아이템 시간 건너뛰기
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
// 중복 실행 방지 — 이미 켜져 있으면 새 인스턴스 대신 기존 메인 화면을 앞으로
const _gotLock = app.requestSingleInstanceLock();
if (!_gotLock) { app.quit(); }
else {
  app.on('second-instance', () => showDesktop());   // 사장님이 런처를 또 누르면 메인 화면 표시
  app.whenReady().then(() => {
    CONFIG_PATH = path.join(app.getPath('userData'), 'aram-overlay-config.json');
    config = loadConfig();
    createOverlay();
    createDesktop();   // ready-to-show에서 showDesktop() → 시작 시 메인 화면 앞으로
    makeTray();
    globalShortcut.register(TOGGLE_HOTKEY, toggleOverlay);
    globalShortcut.register('Shift+F6', toggleHome);   // 🌐 홈페이지 오버레이
    pollGame(); pollLp(); pollSession(); pollDock();
    setInterval(pollGame, 2500);
    setInterval(pollLp, 60000);
    setInterval(pollSession, 3000);
    setInterval(pollDock, 2500);        // 🖥️ 롤 클라 창 따라 도킹
  });
}
app.on('before-quit', () => { app._quitting = true; });   // 종료 시엔 close를 트레이 숨김으로 가로채지 않음
app.on('window-all-closed', (e) => { /* 트레이 상주 — 창 다 닫혀도 안 죽음 */ });
app.on('will-quit', () => globalShortcut.unregisterAll());

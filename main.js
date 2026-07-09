// ── ARAM 내전 오버레이 (Electron 메인 프로세스) ─────────────────────────
// 역할: 창(오버레이/데스크톱)·트레이·전역 단축키 관리 + 데이터 폴링(메인에서 HTTPS 처리)
//   · 인게임 명단: Live Client Data API(127.0.0.1:2999·게임 실행 중에만 응답·자체서명 무시)
//   · 내전 LP/티어: 홈페이지와 같은 Firebase(공개 read)
// 브릿지(aram-bridge) 없이도 오버레이는 단독 동작. 게임 감지=2999 응답 여부.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, nativeImage, screen, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');   // 🔄 GitHub Releases 자동 업데이트
const path = require('path');
const https = require('https');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

const WEB_URL = 'https://sohada2.github.io/aram/';
const FIREBASE_DB = 'https://aramchaos-ca022-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_API_KEY = 'AIzaSyAzRirJzvaqu6jelqUUjV_Tik1MgsALEE4';   // aram/index.html firebaseConfig와 동일(홈페이지에 공개된 값)
const TOGGLE_HOTKEY = 'Shift+F5';
const { buildTeams, normName } = require('./teams');   // ⚔️ 홈페이지 makeTeams 1:1 이식
const { availableGoldS2 } = require('./gold');         // 💰 아이템 구매 골드 검증(홈 calcPlayerGoldEarned S2 이식)
const { computeProfile, computeRecords, computeRanking, computeMyStats, computeRecordsEx } = require('./profile');   // 📊 프로필/기록/랭킹(홈 프로필 정보 이식)
const store = require('./store');   // 🛒🃏🎫 상점/가챠/패스(홈 로직 이식)
const bridge = require('./bridge');                    // 🔌 내장 브릿지(LCU EOG 캡처) — aram-bridge 완전 대체

let overlayWin = null, desktopWin = null, homeWin = null, tray = null;
let inGame = false, userHid = false, lpMap = {}, latestPlayers = [];
let sampleActive = false;   // 미리보기(게임 없이 모양 보기) 중이면 폴링이 안 지움
let sessionData = null, lastFormed = 0;   // 🧩 홈페이지 session(팀 배정) 상태
let config = {};            // { myName }  — 내 이름(팀 판별용)

// 설정 파일(userData) — 내 이름 저장
let CONFIG_PATH = '';
function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) { return {}; } }
function saveConfig() { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config)); } catch (_) {} }

// 🖥️ 롤 클라이언트 창에 도킹 — SetWinEventHook(LOCATIONCHANGE)로 이동 즉시 추종(찰싹·덜렁임 없음)
// 이벤트 기반이라 클라를 드래그하면 프레임 단위로 따라옴 + 90ms 폴백(놓친 이벤트·켜짐/꺼짐 감지)
let dockedBounds = null;   // 마지막 적용 좌표(중복 setBounds 방지)
let dockedNow = false, dockProc = null, _dockBuf = '';
let leftWin = null, leftDockedBounds = null, leftUserHid = false;   // 🖥️ 왼쪽 도킹 = 내 정보(프로필/기록/랭킹)
let slotWin = null, _slotSig = '', _slotTeam = 0, _slotDoneFormed = 0;   // 📍 클라 로비 위 '내 팀 여기' 마커 (_slotDoneFormed=게임이 시작된 팀결성 시각 → 그 판 끝나도 재등장 안 함)
let _floating = false;   // 클라 없음 = 패널을 독립 창으로 띄운 상태
let _lastRect = null;    // 마지막 감지된 클라 창 좌표(팀 마커 갱신용)
let _clientPresent = false, _goneTimer = null, _quitPromptOpen = false;   // 🚪 클라 창 존재 추적(종료 시 "같이 끌까요?" 확인창)
let _startTs = 0;        // 시작 시각(시작 직후 잠깐은 패널 안 숨김)
const _dockScript = `
$ErrorActionPreference='SilentlyContinue'
Add-Type @'
using System;using System.Runtime.InteropServices;
public class Win{
 [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c,string n);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int a,out RECT r,int s);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint a,uint b,IntPtr m,WinEventProc cb,uint p,uint t,uint f);
 [DllImport("user32.dll")] public static extern IntPtr SetTimer(IntPtr h,IntPtr id,uint ms,IntPtr fn);
 [DllImport("user32.dll")] public static extern int GetMessage(out MSG m,IntPtr h,uint a,uint b);
 [DllImport("user32.dll")] public static extern bool TranslateMessage(ref MSG m);
 [DllImport("user32.dll")] public static extern IntPtr DispatchMessage(ref MSG m);
 public delegate void WinEventProc(IntPtr hook,uint ev,IntPtr hwnd,int idO,int idC,uint th,uint tm);
 public struct RECT{public int L,T,R,B;}
 public struct POINT{public int X,Y;}
 public struct MSG{public IntPtr hwnd;public uint msg;public IntPtr wp;public IntPtr lp;public uint time;public POINT pt;}
 static IntPtr target=IntPtr.Zero;
 static string last=null;
 static WinEventProc cb;
 static string Snap(){
  IntPtr h=FindWindow(null,"League of Legends");
  target=h;
  if(h==IntPtr.Zero) return "gone";                // 클라 창 자체가 없음(=종료) — 최소화와 구분
  if(!IsWindowVisible(h)||IsIconic(h)) return "";  // 최소화/숨김(=종료 아님·플로팅)
  RECT r; if(DwmGetWindowAttribute(h,9,out r,16)!=0 && !GetWindowRect(h,out r)) return "";  // 9=DWMWA_EXTENDED_FRAME_BOUNDS(보이는 실제 경계·투명 테두리 제외)
  int fg=(GetForegroundWindow()==h)?1:0;
  return r.L+" "+r.T+" "+r.R+" "+r.B+" "+fg;
 }
 static void Emit(){ string s=Snap(); if(s!=last){ last=s; Console.Out.WriteLine(s); Console.Out.Flush(); } }
 static void OnEvent(IntPtr hook,uint ev,IntPtr hwnd,int idO,int idC,uint th,uint tm){
  if(ev==0x800B){ if(idO!=0 || hwnd!=target) return; }   // 위치변경=대상 창 본체만(오버헤드 최소)
  Emit();
 }
 public static void Run(){
  cb=new WinEventProc(OnEvent);
  SetWinEventHook(0x0003,0x0003,IntPtr.Zero,cb,0,0,0);   // FOREGROUND(전경 전환)
  SetWinEventHook(0x0016,0x0017,IntPtr.Zero,cb,0,0,0);   // MINIMIZE START/END
  SetWinEventHook(0x800B,0x800B,IntPtr.Zero,cb,0,0,0);   // LOCATIONCHANGE(이동/크기=실시간 추종)
  SetTimer(IntPtr.Zero,IntPtr.Zero,90,IntPtr.Zero);      // 폴백 90ms(놓친 이벤트·클라 켜짐/꺼짐)
  Emit();
  MSG m;
  while(GetMessage(out m,IntPtr.Zero,0,0)>0){ if(m.msg==0x0113) Emit(); TranslateMessage(ref m); DispatchMessage(ref m); }
 }
}
'@
[Win]::Run()`;
const _dockB64 = Buffer.from(_dockScript, 'utf16le').toString('base64');

function setDockedFlag(v) {                    // 도킹 상태 → 오버레이에 알려 모서리 각지게(각/둥금 전환)
  if (v === dockedNow) return; dockedNow = v;
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('docked', v);
}
function applyDock(pb) {                       // 팀/명단 오버레이 = 클라 '왼쪽' 바깥에 붙임
  if (!overlayWin || !pb) return;
  const sf = (screen.getPrimaryDisplay().scaleFactor) || 1;
  const cx = pb.x / sf, cy = pb.y / sf, cw = pb.w / sf, ch = pb.h / sf;
  const disp = screen.getDisplayMatching({ x: Math.round(cx), y: Math.round(cy), width: Math.round(cw), height: Math.round(ch) });
  const dispLeft = disp.workArea.x;
  let W = Math.min(400, Math.round(cx - dispLeft));   // 클라 왼쪽 바깥 남은 공간(최대 400)
  if (W < 300) W = 300;
  let x = Math.round(cx - W);
  if (x < dispLeft) x = dispLeft;                     // 화면 밖이면 붙임(살짝 겹칠 수 있음)
  overlayWin.setBounds({ x, y: Math.round(cy), width: W + 2, height: Math.round(ch) });   // +2 클라 쪽으로 겹쳐 틈 제거
}
function applyDockLeft(pb) {                    // 내 정보 패널 = 클라 '오른쪽' 바깥에 붙임
  if (!leftWin || leftWin.isDestroyed()) return;
  const sf = (screen.getPrimaryDisplay().scaleFactor) || 1;
  const cx = pb.x / sf, cy = pb.y / sf, cw = pb.w / sf, ch = pb.h / sf;
  const disp = screen.getDisplayMatching({ x: Math.round(cx), y: Math.round(cy), width: Math.round(cw), height: Math.round(ch) });
  const dispRight = disp.workArea.x + disp.workArea.width;
  let x = Math.round(cx + cw) - 2;                            // -2 클라 쪽으로 겹쳐 틈 제거
  let W = Math.min(400, Math.round(dispRight - x));           // 클라 오른쪽 바깥 남은 공간
  if (W < 300) W = 300;
  if (x + W > dispRight) x = Math.max(disp.workArea.x, dispRight - W);   // 화면 밖이면 안으로 당김
  leftWin.setBounds({ x, y: Math.round(cy), width: W, height: Math.round(ch) });
}
function hideLeftPanel() { if (leftWin && !leftWin.isDestroyed() && leftWin.isVisible()) leftWin.hide(); leftDockedBounds = null; }
// 🪟 Win11 창 모서리 둥글림 강제 해제 (roundedCorners:false가 안 먹는 환경 대비 · DWMWA_WINDOW_CORNER_PREFERENCE=33·DONOTROUND=1)
function forceSquareCorners(win) {
  if (!win || win.isDestroyed()) return;
  let hwnd;
  try { const b = win.getNativeWindowHandle(); hwnd = b.length >= 8 ? b.readBigUInt64LE(0).toString() : String(b.readUInt32LE(0)); } catch (_) { return; }
  const ps = `Add-Type -Namespace Sq -Name W -MemberDefinition '[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int s);'; $v=1; [Sq.W]::DwmSetWindowAttribute([IntPtr]${hwnd},33,[ref]$v,4)`;
  try { spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }); } catch (_) {}
}
function squareAllPanels() { for (const w of [overlayWin, leftWin, slotWin]) forceSquareCorners(w); }
// 📍 클라 로비 위 '내 팀 여기' 마커 — 팀 컬럼을 네모 테두리로 강조(클릭 통과)
let _slotReady = false;
function createSlotWin() {
  slotWin = new BrowserWindow({
    width: 300, height: 300, show: false, frame: false, transparent: true, hasShadow: false,
    backgroundColor: '#00000000',   // 완전 투명(흰 배경 렌더 방지)
    resizable: false, focusable: false, skipTaskbar: true, alwaysOnTop: false, roundedCorners: false, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  slotWin.setIgnoreMouseEvents(true, { forward: true });   // 클릭 통과 → 클라 조작 방해 X
  slotWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  _slotReady = false;
  slotWin.webContents.on('did-finish-load', () => { _slotReady = true; if (_slotTeam) { try { slotWin.webContents.send('slot-team', _slotTeam); } catch (_) {} } });
  slotWin.loadFile('slot/slot.html');
  slotWin.on('closed', () => { slotWin = null; _slotReady = false; });
}
function hideSlotMarker() { if (slotWin && !slotWin.isDestroyed() && slotWin.isVisible()) slotWin.hide(); _slotSig = ''; }
function _repaintSlot() {   // 투명창이 흰 박스로 안 그려지는 Win 버그 → 1px 넛지로 강제 리페인트
  if (!slotWin || slotWin.isDestroyed()) return;
  try { const b = slotWin.getBounds(); slotWin.setBounds({ x: b.x, y: b.y, width: b.width + 1, height: b.height }); slotWin.setBounds(b); } catch (_) {}
}
function updateSlotMarker(p) {   // p=[L,T,R,B] 원시 px(클라 감지됨)
  const t = teamOf(sessionData, config.myName);
  const side = t === 'teamA' ? 1 : t === 'teamB' ? 2 : 0;
  // 로비 + 내 팀 있고 + 클라가 활성창일 때만(다른 창 위에 안 뜨게) · 이번 팀결성으로 게임이 이미 시작됐으면 숨김(게임 후 재등장 방지 — 다음 팀결성 때만 다시)
  const startedThisFormation = !!(lastFormed && _slotDoneFormed === lastFormed);
  if (config.slot === false || inGame || !side || !clientFg || startedThisFormation) { hideSlotMarker(); return; }
  if (!slotWin || slotWin.isDestroyed()) createSlotWin();
  const sf = (screen.getPrimaryDisplay().scaleFactor) || 1;
  const cx = p[0] / sf, cy = p[1] / sf, cw = (p[2] - p[0]) / sf, ch = (p[3] - p[1]) / sf;
  // 작은 배지를 팀 컬럼 우상단에(친구목록 펼침 기준). 1팀=왼쪽 컬럼 / 2팀=가운데 컬럼
  const bw = 128, bh = 38;
  const colRight = side === 1 ? cx + cw * 0.39 : cx + cw * 0.79;
  const x = Math.round(colRight - bw - 4);
  const y = Math.round(cy + ch * 0.235);   // 클라 상단에서 아래로 내린 위치(팀 컬럼 헤더에 맞춤) — 더 내리려면 이 값을 키우세요
  if (side !== _slotTeam) { _slotTeam = side; try { slotWin.webContents.send('slot-team', side); } catch (_) {} }
  const sig = `${x},${y},${side}`;
  if (sig !== _slotSig) { _slotSig = sig; slotWin.setBounds({ x, y, width: bw, height: bh }); }
  if (!_slotReady) return;                               // 콘텐츠 로드 후에 표시(흰 박스 방지)
  if (!slotWin.isVisible()) { slotWin.showInactive(); try { slotWin.setAlwaysOnTop(true, 'screen-saver'); } catch (_) {} _repaintSlot(); }
}
// 🪟 클라와 같은 층위 — 롤 클라(또는 우리 패널)가 활성일 때만 패널을 위로, 아니면 뒤로(다른 앱에 안 가림)
let clientFg = false, panelFg = false, _lastRaise = null, _dropTimer = null;
let _ovFocus = false, _lfFocus = false;
function applyRaise() {
  if (inGame) return;   // 게임 중엔 pollGame이 오버레이 관리
  // 🪟 도킹/플로팅 모두: 패널은 항상 보임(숨기지 않음)·일반 z-order로.
  //   → 다른 앱을 클릭하면 그 창 뒤로 자연스럽게 가고(사라지지 않음), 클라를 다시 눌러도 억지로 튀어나오지(pop) 않음.
  //   (사장님 요청: "그냥 그 창 뒤로만 가면 되니까 안 사라져도 됨")
  const show = (win, allowed) => {
    if (!win || win.isDestroyed()) return;
    try { win.setAlwaysOnTop(false, 'normal'); } catch (_) {}
    if (allowed) { if (!win.isVisible()) win.showInactive(); }
    else if (win.isVisible()) win.hide();   // 사용자가 직접 숨긴(userHid/leftUserHid) 경우만 숨김
  };
  show(overlayWin, !userHid && !sampleActive);
  show(leftWin, config.sidePanel !== false && !leftUserHid);
  // 📍 마커는 클라가 '활성창'일 때만(도킹 중·다른 앱 위엔 안 뜨게)
  if (!_floating && clientFg && _lastRect) updateSlotMarker(_lastRect); else hideSlotMarker();
}
function evalRaise() {   // 올릴 땐 즉시, 내릴 땐 살짝 텀(클라↔패널 클릭 전환 깜빡임 방지)
  if (clientFg || panelFg) { if (_dropTimer) { clearTimeout(_dropTimer); _dropTimer = null; } applyRaise(); }
  else if (!_dropTimer) _dropTimer = setTimeout(() => { _dropTimer = null; applyRaise(); }, 300);
}
function setPanelFg() { const v = _ovFocus || _lfFocus; if (v !== panelFg) { panelFg = v; evalRaise(); } }
async function maybePromptQuitOnClientClose() {
  if (app._quitting || _quitPromptOpen || _clientPresent || inGame) return;   // 그새 다시 켜졌거나 게임 중이면 안 띄움
  _quitPromptOpen = true;
  try {
    const r = await dialog.showMessageBox({
      type: 'question', buttons: ['종료', '계속 켜두기'], defaultId: 0, cancelId: 1, noLink: true,
      title: '롤 클라이언트 종료됨', message: '롤 클라이언트가 종료됐어요.', detail: '내전 오버레이도 같이 종료할까요?',
    });
    if (r.response === 0 && !_clientPresent) { app._quitting = true; app.quit(); }
  } catch (_) {} finally { _quitPromptOpen = false; }
}
function handleDockLine(line) {
  const raw = String(line).trim();
  if (raw === 'gone') {   // 🚪 클라 창 자체가 사라짐(종료) — 최소화(빈 줄)와 구분
    hideSlotMarker(); floatPanels();
    if (clientFg) { clientFg = false; evalRaise(); }
    if (_clientPresent) {   // 있었다가 사라짐 = 방금 종료 → 잠깐 뒤에도 없으면 "같이 끌까요?" (오탐 방지 디바운스)
      _clientPresent = false;
      if (!_goneTimer && !app._quitting) _goneTimer = setTimeout(() => { _goneTimer = null; maybePromptQuitOnClientClose(); }, 2500);
    }
    return;
  }
  const p = raw.split(/\s+/).map(Number);
  const valid = p.length >= 4 && p.slice(0, 4).every(Number.isFinite) && (p[2] - p[0]) >= 700 && (p[3] - p[1]) >= 400;
  if (config.dock === false || !valid) {   // 도킹 끔 or 최소화/숨김 → 독립 창(플로팅)으로 (종료 아님)
    hideSlotMarker(); floatPanels();
    if (clientFg) { clientFg = false; evalRaise(); }
    return;
  }
  if (_goneTimer) { clearTimeout(_goneTimer); _goneTimer = null; }   // 클라 다시 나타남 → 종료 확인 취소
  _clientPresent = true;
  if (_floating) { _floating = false; _lastRaise = null; }   // 플로팅 → 도킹 전환
  _lastRect = p;
  const fg = p[4] === 1;                            // 롤 클라가 지금 활성창인가
  if (fg !== clientFg) { clientFg = fg; }
  const w = p[2] - p[0], h = p[3] - p[1], sig = `${p[0]},${p[1]},${w},${h}`;
  // ◀ 팀·명단 오버레이 = 클라 왼쪽 (숨김 상태여도 위치는 갱신)
  if (sig !== dockedBounds) { dockedBounds = sig; applyDock({ x: p[0], y: p[1], w, h }); }
  setDockedFlag(true);
  // ▶ 내 정보 = 클라 오른쪽
  if (config.sidePanel !== false && !leftUserHid && sig !== leftDockedBounds) { leftDockedBounds = sig; applyDockLeft({ x: p[0], y: p[1], w, h }); }
  evalRaise();          // 표시/숨김·위로 = 클라 활성 여부에 따라(다른 창 위에 안 뜨게)
  updateSlotMarker(p);  // 📍 내 팀 마커
}
function startDockStream() {
  if (dockProc) return;
  try {
    dockProc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', _dockB64], { windowsHide: true });
    dockProc.stdout.on('data', chunk => {
      _dockBuf += chunk.toString(); let i;
      while ((i = _dockBuf.indexOf('\n')) >= 0) { const ln = _dockBuf.slice(0, i).trim(); _dockBuf = _dockBuf.slice(i + 1); handleDockLine(ln); }
    });
    dockProc.on('exit', () => { dockProc = null; if (!app._quitting) setTimeout(startDockStream, 2000); });  // 죽으면 재기동
    dockProc.on('error', () => { dockProc = null; });
  } catch (_) { dockProc = null; }
}
function stopDockStream() { if (dockProc) { try { dockProc.kill(); } catch (_) {} dockProc = null; } }

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
const fetchLobby     = () => getJson(`${FIREBASE_DB}/lobby.json`);   // 🛠️ 방장 팀 구성 준비 중 배너(홈페이지와 동일 노드)
const fetchPlayers   = () => getJson(`${FIREBASE_DB}/players.json`);   // 등록 플레이어(이름 목록)
const fetchMatches   = () => getJson(`${FIREBASE_DB}/matches.json`);   // ⚔️ 팀짜기 승률 계산용(수 MB — 팀짤 때만)
const fetchNormalMatches = () => getJson(`${FIREBASE_DB}/normal_matches.json`);   // 🎫 패스 퀘스트·기록 필터용
const fetchMagolla = () => getJson(`${FIREBASE_DB}/magolla_matches.json?orderBy="$key"&limitToLast=30`);   // ⚔️ 막고라 기록용(최근 30)
const fetchMatchesRecent = () => getJson(`${FIREBASE_DB}/matches.json?orderBy="$key"&limitToLast=60`);   // 📋 기록 fast-path(최근 60·push키=시간순)
const fetchLpSeason = (s) => getJson(`${FIREBASE_DB}/season${s}/players.json`);   // 🏆 시즌별 랭킹   // 🎫 패스 퀘스트 판정용(일반게임도 스탯 인정)
const fetchSeason    = () => getJson(`${FIREBASE_DB}/config/currentSeason.json`);
const fetchSettlement= () => getJson(`${FIREBASE_DB}/lastSettlement.json`);   // 💰 정산 결과(참여자 전파용)
const fetchMatch     = (key) => getJson(`${FIREBASE_DB}/matches/${key}.json`);   // 💥 발동 효과(시너지·강철심장·아이템) 스냅샷
const fetchGoldAll   = () => getJson(`${FIREBASE_DB}/gold.json`);      // 🎒 아이템 페이즈 — 내 gold 노드 찾기용
const fetchMyLp      = () => getJson(`${FIREBASE_DB}/season2/players.json`);   // 배치/승급전 판정용
const fetchAppVersion= () => getJson(`${FIREBASE_DB}/config/appVersion.json`);  // 🔖 홈페이지 현재 버전(오버레이에 실시간 동기화 표시)

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
async function fbDelete(pathStr) {   // 특정 키 삭제 — 홈페이지 remove()와 동일(투표 취소용)
  const tok = await fbToken();
  if (!tok) return { ok: false };
  const r = await reqJson('DELETE', `${FIREBASE_DB}/${pathStr}.json?auth=${tok}`);
  if (r.status === 401 || r.status === 403) { _fbTok = null; }
  return { ok: r.status === 200 };
}
async function fbUpdate(pathStr, value) {   // 노드 일부 필드만 갱신(PATCH) — 홈페이지 update()와 동일. items_s2만 덮어씀(다른 필드 유실 방지).
  const tok = await fbToken();
  if (!tok) return { ok: false, err: '인증 실패' };
  const r = await reqJson('PATCH', `${FIREBASE_DB}/${pathStr}.json?auth=${tok}`, value);
  if (r.status === 401 || r.status === 403) { _fbTok = null; }
  return { ok: r.status === 200, err: r.status === 200 ? null : `쓰기 실패(HTTP ${r.status})` };
}
async function fbPush(pathStr, value) {   // 홈페이지 push(ref(db,path), value)와 동일 — 새 고유 키 생성 후 반환
  const tok = await fbToken();
  if (!tok) return { ok: false, err: '인증 실패' };
  const r = await reqJson('POST', `${FIREBASE_DB}/${pathStr}.json?auth=${tok}`, value);
  if (r.status === 401 || r.status === 403) { _fbTok = null; }
  return { ok: r.status === 200, key: r.json && r.json.name, err: r.status === 200 ? null : `쓰기 실패(HTTP ${r.status})` };
}

// ── 🥊 막고라 매치 생성(방장) — 홈페이지 openMagollaModal 파이터 선정 로직 이식 ──
// 생성만 오버레이가 담당. session/magollaMatchId 설정 → 홈페이지 유저에게 배팅 모달 자동 전파(배팅·결과·정산은 홈페이지).
const MG_TIER_ORDER = ['unranked', 'iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger'];
let _mgLastFighters = null;   // 직전 파이터 쌍(연속 회피)
async function createMagollaMatch(names) {
  if (!config.isHost) return { ok: false, err: '방장만 막고라를 시작할 수 있어요' };
  names = (names || []).map(n => String(n)).filter(Boolean);
  if (names.length < 5) return { ok: false, err: `막고라는 최소 5명이 필요해요 (현재 ${names.length}명)` };
  const [lpAll, seasonV] = await Promise.all([fetchLpPlayers(), fetchSeason()]);
  const season = (typeof seasonV === 'number') ? seasonV : 2;
  const lp = lpAll || {};
  const scoreOf = (name) => { const d = lp[normName(name)] || {}; return (MG_TIER_ORDER.indexOf(d.tier || 'unranked') + 1) * 100 + (d.lp || 0); };
  const players = names.map(n => ({ name: n, score: scoreOf(n) })).sort((a, b) => a.score - b.score);
  // LP 가중 랜덤 파이터 2명 선정(차이 작을수록↑·직전 쌍 제외·직전 파이터 포함 30%)
  const lastPair = _mgLastFighters, lastSet = new Set(lastPair || []);
  const pairs = [];
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const diff = Math.abs(players[i].score - players[j].score);
    const n1 = normName(players[i].name), n2 = normName(players[j].name);
    const isLast = lastPair && ((n1 === lastPair[0] && n2 === lastPair[1]) || (n1 === lastPair[1] && n2 === lastPair[0]));
    let weight = isLast ? 0 : 1 / (diff + 20);
    if (!isLast && (lastSet.has(n1) || lastSet.has(n2))) weight *= 0.3;
    pairs.push({ diff, i, j, weight });
  }
  let pool = pairs.filter(p => p.weight > 0);
  if (!pool.length) { pairs.forEach(p => p.weight = 1 / (p.diff + 20)); pool = pairs; }
  const totalW = pool.reduce((s, p) => s + p.weight, 0);
  let rnd = Math.random() * totalW, best = pool[pool.length - 1];
  for (const p of pool) { rnd -= p.weight; if (rnd <= 0) { best = p; break; } }
  const f1 = players[best.i].name, f2 = players[best.j].name;
  const spectators = players.filter((_, idx) => idx !== best.i && idx !== best.j).map(p => p.name);
  const pr = await fbPush('magolla_matches', {
    status: 'betting', fighter1: f1, fighter2: f2, spectators,
    createdBy: config.myName || '진행자', season, bettingStartAt: Date.now(), bets: {}, result: null, createdAt: Date.now(),   // 배팅 즉시 시작(90초)
  });
  if (!pr.ok || !pr.key) return { ok: false, err: pr.err || '생성 실패(네트워크 확인)' };
  _mgLastFighters = [normName(f1), normName(f2)];
  const sw = await fbSet('session/magollaMatchId', pr.key);   // → 모든 기기에 배팅 모달 전파
  if (!sw.ok) return { ok: false, err: sw.err };
  fbSet('lobby', null).catch(() => {});   // 준비 중 배너 제거
  return { ok: true, matchId: pr.key, fighter1: f1, fighter2: f2 };
}
// 🎒 내 gold 노드({key, name, items_s2, ...}) 찾기 — 이름 매칭
let _myGoldKey = null;   // 내 gold 노드 키 캐시 → 재화 갱신 시 전체 gold.json 대신 내 노드만(가벼움)
async function fetchMyGold() {
  if (!config.myName) return null;
  const me = normName(config.myName);
  if (_myGoldKey) {   // 캐시된 키 → 내 노드만 가볍게 조회
    const d = await getJson(`${FIREBASE_DB}/gold/${_myGoldKey}.json`);
    if (d && normName(d.name || '') === me) return { key: _myGoldKey, data: d };
    _myGoldKey = null;   // 키 어긋나면(계정 변경 등) 재스캔
  }
  const all = await fetchGoldAll();
  if (!all) return null;
  for (const k in all) { if (all[k] && normName(all[k].name || '') === me) { _myGoldKey = k; return { key: k, data: all[k] }; } }
  return null;
}
// 내 시즌2 LP 상태(배치/승급전 — 아이템 활성화 조건)
async function fetchMyLpState() {
  const all = await fetchMyLp();
  if (!all || !config.myName) return null;
  const me = normName(config.myName);
  for (const k in all) { if (normName(all[k]?.name || k) === me) return all[k]; }
  return all[me] || null;
}
// 이름 → 홈페이지 투표 키(fbKey = normName 후 공백→_) · session에서 내 팀 판별
const fbKeyOf = name => normName(name).replace(/\s+/g, '_');
function teamOf(s, name) {
  if (!s || !name) return null;
  const n = normName(name);
  if ((s.teamA || []).some(x => normName(x) === n)) return 'teamA';
  if ((s.teamB || []).some(x => normName(x) === n)) return 'teamB';
  return null;
}

const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();

// ── 창 생성 ──────────────────────────────────────────────────────────────
function createOverlay() {
  overlayWin = new BrowserWindow({
    width: 456, height: 452, x: 24, y: 84, minWidth: 260, minHeight: 220,
    transparent: true, frame: false, resizable: true, movable: true,   // 크기 조절 가능(반응형)
    alwaysOnTop: false, skipTaskbar: true, show: false, focusable: true,   // 로비=클라와 같은 층위, 게임 중만 위로(pollGame)
    roundedCorners: false,   // 🪟 Win11 창 모서리 둥글림 끄기 → 클라에 각지게 딱 맞음
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadFile('overlay/overlay.html');
  overlayWin.on('focus', () => { _ovFocus = true; setPanelFg(); });   // 패널 클릭=활성 유지
  overlayWin.on('blur', () => { _ovFocus = false; setPanelFg(); });
  overlayWin.on('closed', () => { overlayWin = null; _ovFocus = false; setPanelFg(); });
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
// ◀ 왼쪽 도킹 내 정보 패널(프로필/기록/랭킹) — 오른쪽 오버레이와 같은 톤
function createLeftPanel() {
  leftWin = new BrowserWindow({
    width: 360, height: 600, x: 24, y: 84, minWidth: 260, minHeight: 300,
    frame: false, backgroundColor: '#010A13', show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    alwaysOnTop: false, skipTaskbar: true, resizable: true, focusable: true,   // 클라와 같은 층위(로비 정보 패널)
    roundedCorners: false,   // 🪟 Win11 창 모서리 둥글림 끄기 → 클라에 각지게 딱 맞음
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true },   // webview=복권/대장간 홈 임베드
  });
  leftWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  leftWin.loadFile('sidepanel/sidepanel.html');
  leftWin.on('focus', () => { _lfFocus = true; setPanelFg(); });   // 패널 클릭=활성 유지
  leftWin.on('blur', () => { _lfFocus = false; setPanelFg(); });
  leftWin.on('closed', () => { leftWin = null; _lfFocus = false; setPanelFg(); });
}
// 데스크톱(메인) 창 표시 — 생성 안 됐으면 만들고, 숨어있으면 띄워서 앞으로 (레거시·트레이 폴백용)
function showDesktop() {
  if (!desktopWin || desktopWin.isDestroyed()) { createDesktop(); return; }
  if (desktopWin.isMinimized()) desktopWin.restore();
  desktopWin.show();
  desktopWin.moveTop();
  desktopWin.focus();
}
// ── 독립 창(플로팅) 배치 — 클라 없을 때 좌우에 띄움 ──────────────────────
function standaloneBounds(which) {
  // 클라 없음 = 좌우 끝에 벌리지 않고 두 패널을 화면 가운데에 나란히 모음
  const wa = screen.getPrimaryDisplay().workArea;
  const h = Math.min(760, wa.height - 100);
  const y = Math.round(wa.y + (wa.height - h) / 2);
  const LW = 430, RW = 380, GAP = 10;                          // 좌(팀·명단) · 우(내 정보) · 사이 간격
  const startX = Math.round(wa.x + (wa.width - (LW + GAP + RW)) / 2);
  return which === 'left'
    ? { x: startX, y, width: LW, height: h }                   // ◀ 팀·명단 오버레이(가운데 왼쪽)
    : { x: startX + LW + GAP, y, width: RW, height: h };       // ▶ 내 정보(가운데 오른쪽)
}
function floatPanels() {   // 클라 없음/도킹 끔 → 독립 창으로 표시(첫 전환 때만 위치 세팅)
  if (inGame) { hideLeftPanel(); return; }   // 게임 중엔 내 정보 패널 숨김(오버레이는 pollGame이 관리)
  const reposition = !_floating;
  _floating = true; _lastRaise = null;
  for (const [win, allowed, side] of [[overlayWin, !userHid && !sampleActive, 'left'], [leftWin, config.sidePanel !== false && !leftUserHid, 'right']]) {
    if (!win || win.isDestroyed() || !allowed) continue;
    if (reposition) win.setBounds(standaloneBounds(side));
    try { win.setAlwaysOnTop(false, 'normal'); } catch (_) {}
    if (!win.isVisible()) win.showInactive();
  }
  setDockedFlag(false);
}
function showMainPanel() {   // 트레이/재실행 → 내 정보 패널(메인)을 앞으로
  if (!leftWin || leftWin.isDestroyed()) createLeftPanel();
  if (config.sidePanel === false) { config.sidePanel = true; saveConfig(); refreshTrayMenu(); }
  leftUserHid = false;
  if (!leftWin.isVisible() && _floating) leftWin.setBounds(standaloneBounds('right'));   // 플로팅일 때만 위치 리셋
  leftWin.show(); leftWin.moveTop(); leftWin.focus();
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
  homeWin.on('show', () => { try { homeWin.webContents.send('home-shown'); } catch (_) {} });   // webview 뷰포트 재레이아웃 트리거
  homeWin.on('resize', () => { try { homeWin.webContents.send('home-shown'); } catch (_) {} });
  homeWin.on('closed', () => { homeWin = null; });
}
function toggleHome() {
  if (!homeWin) { createHome(); homeWin.show(); return; }
  if (homeWin.isVisible()) homeWin.hide(); else homeWin.show();
}

// ── 🔄 업데이트 알림 토스트 (우하단·「지금 업데이트」 버튼 포함) ─────────────────
//   Windows 네이티브 알림은 Electron으로 버튼을 못 붙여서, 같은 자리(우하단)에 테마 맞춘 커스텀 토스트를 띄운다.
let updateToastWin = null;
function showUpdateToast(version) {
  const W = 340, H = 152, M = 16;
  const wa = screen.getPrimaryDisplay().workArea;
  const x = wa.x + wa.width - W - M, y = wa.y + wa.height - H - M;
  if (updateToastWin && !updateToastWin.isDestroyed()) {
    updateToastWin.setBounds({ x, y, width: W, height: H });
    updateToastWin.webContents.send('update-info', { version });
    updateToastWin.showInactive();
    return;
  }
  updateToastWin = new BrowserWindow({
    width: W, height: H, x, y, frame: false, transparent: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  updateToastWin.setAlwaysOnTop(true, 'screen-saver');
  updateToastWin.loadFile('desktop/update-toast.html');
  updateToastWin.once('ready-to-show', () => { updateToastWin.showInactive(); updateToastWin.webContents.send('update-info', { version }); });
  updateToastWin.on('closed', () => { updateToastWin = null; });
}

// ── 🔴 라이브 계정 (숨은 백그라운드 창) — 방장 오버레이가 진짜 홈페이지를 liveMode로 돌려 "경기 저장/정산"을 담당 ──
//   왜 이 방식? 저장은 이 앱에서 제일 복잡·위험(LP·골드·시너지·강철심장·승급전). 오버레이에 재구현하면 계산이 갈라지고
//   두 번째 저장 경로 = 이중 기록 위험. 그래서 홈페이지의 "검증된 저장 코드 + 원자적 락(saveLock + gameId 마커)"을 그대로 돌린다.
//   방장(config.isHost)일 때만 뜸. 이미 다른 라이브 계정이 있으면 홈페이지가 스스로 물러남(handleLiveKicked). 창은 숨김·backgroundThrottling off.
let liveWin = null, _liveArmed = false, _liveStatus = 'off';   // off·connecting·live·other·error
function setLiveStatus(s) { if (s === _liveStatus) return; _liveStatus = s; broadcast('live-status', s); }
// 라이브 실제 상태 판정 — liveWin이 실제로 live-mode인지(=저장·정산 담당). enterLiveMode 반환값이 아니라 '실제 상태'로 판단.
//   (enterLiveMode는 소유권 claim 후 updateLiveHouseGold 등 UI 함수에서 예외날 수 있는데, 그건 라이브 진입 성공과 무관 → 예외로 오류 표시하면 안 됨)
async function _verifyLive(retry) {
  retry = retry || 0;
  if (!liveWin || liveWin.isDestroyed()) return;
  let st = {};
  try {
    const raw = await liveWin.webContents.executeJavaScript(
      `(function(){try{return JSON.stringify({live:!!(document.body&&document.body.classList.contains('live-mode')),dev:localStorage.getItem('aram_deviceId')||''});}catch(e){return '{}'}})()`
    );
    st = JSON.parse(raw);
  } catch (_) { return; }
  if (st.live) { setLiveStatus('live'); return; }   // liveWin이 라이브 모드 유지 = 정상(이 오버레이가 저장·정산 담당)
  // 라이브 모드 아님 → 다른 기기가 소유 중이면 그 기기가 담당(정상) → 'other'
  let owner = null;
  try { owner = await getJson(`${FIREBASE_DB}/config/liveOwner.json`); } catch (_) {}
  const fresh = owner && owner.heartbeatAt && (Date.now() - owner.heartbeatAt < 70000);
  if (fresh && owner.deviceId && st.dev && owner.deviceId !== st.dev) { setLiveStatus('other'); return; }
  if (retry < 3) { setTimeout(() => _verifyLive(retry + 1), 3000); return; }   // 부팅 지연일 수 있어 재시도
  setLiveStatus('error');
}
function startLiveAccount() {
  if (!config.isHost) return;
  if (liveWin && !liveWin.isDestroyed()) return;
  _liveArmed = false;
  setLiveStatus('connecting');
  liveWin = new BrowserWindow({
    show: false, width: 960, height: 720, skipTaskbar: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false },
  });
  liveWin.setMenuBarVisibility(false);
  liveWin.webContents.on('did-finish-load', async () => {
    if (_liveArmed) return; _liveArmed = true;
    // 🔴 수동 홈페이지 라이브 계정과 100% 동일 진입: enterLiveMode()가 setLiveMode(true)→claimLiveOwner(소유권)+heartbeat 수행.
    //   그 뒤 UI 함수(updateLiveHouseGold 등)에서 예외나도 라이브 진입 자체는 성공 → 예외 무시, 잠시 후 '실제 상태'로 판정.
    try {
      await liveWin.webContents.executeJavaScript(
        `(function(){try{ if(typeof window.enterLiveMode==='function') window.enterLiveMode(); else localStorage.setItem('liveMode','1'); }catch(e){} })()`
      );
    } catch (_) {}
    setLiveStatus('connecting');
    setTimeout(() => _verifyLive(0), 2500);
  });
  liveWin.webContents.on('did-fail-load', (_e, code) => {   // 네트워크 실패 → 8초 후 재시도
    if (code === -3) return;   // ERR_ABORTED(재로드 등) 무시
    setLiveStatus('connecting');
    setTimeout(() => { if (liveWin && !liveWin.isDestroyed()) liveWin.loadURL(WEB_URL).catch(() => {}); }, 8000);
  });
  liveWin.on('close', (e) => { if (!app._quitting) { e.preventDefault(); try { liveWin.hide(); } catch (_) {} _mgLiveShown = false; } });   // 🥊 막고라로 띄웠을 때 X=숨김(라이브 계정 유지)
  liveWin.on('closed', () => { liveWin = null; setLiveStatus('off'); });
  liveWin.loadURL(WEB_URL);
}
// 🥊 막고라 = 배팅 시작·결과 입력이 라이브 전용 → 방장은 라이브 창(liveWin)을 띄워 직접 조작. 정산·세션 종료 시 다시 숨김.
let _mgLiveShown = false;
function showLiveForMagolla() {
  if (!liveWin || liveWin.isDestroyed() || _mgLiveShown) return;
  _mgLiveShown = true;
  try { liveWin.show(); liveWin.focus(); } catch (_) {}
}
function hideLiveForMagolla() {
  if (!_mgLiveShown) return; _mgLiveShown = false;
  try { if (liveWin && !liveWin.isDestroyed()) liveWin.hide(); } catch (_) {}
}
function stopLiveAccount() {
  setLiveStatus('off');
  if (!liveWin || liveWin.isDestroyed()) { liveWin = null; return; }
  const w = liveWin; liveWin = null;
  try { w.webContents.executeJavaScript("try{ if(window.exitLiveMode) window.exitLiveMode(); else localStorage.removeItem('liveMode'); }catch(e){}"); } catch (_) {}   // exitLiveMode = 소유권 즉시 반납
  try { w.close(); } catch (_) {}   // close = beforeunload 발생 → 홈페이지가 config/liveOwner 락 반납(다음 라이브 즉시 인계)
  setTimeout(() => { try { if (!w.isDestroyed()) w.destroy(); } catch (_) {} }, 1500);   // 안전망: 안 닫히면 강제 파괴(락은 60초 stale로도 회수됨)
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
  if (channel === 'session' && payload && typeof payload === 'object') payload.isHost = !!config.isHost;   // 🗳️ 방장 여부 동봉(오버레이 '정산 마감' 버튼용)
  for (const w of [overlayWin, leftWin, desktopWin]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
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
    // 게임 중(전체화면)만 위로, 로비/클라에선 같은 층위(클라 활성 시에만 evalRaise가 올림)
    try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setAlwaysOnTop(inGame, inGame ? 'screen-saver' : 'normal'); } catch (_) {}
    if (inGame) { if (!userHid) showOverlay(); _slotDoneFormed = lastFormed; hideSlotMarker(); pollMyStats(); }   // 게임 시작 → 이번 팀결성 마커 소진(끝나도 재등장 X) + 마커 숨김 + 오늘전적 갱신
    else { hideOverlay(); userHid = false; latestPlayers = []; _lastRaise = null; evalRaise(); }   // 게임 종료 → 로비 층위 재적용
    broadcast('state', { inGame, label: inGame ? '게임 중' : '대기' });
  }
  broadcast('players', { players: latestPlayers, lpMap });
}
async function pollLp() {
  const data = await fetchLpPlayers();
  if (data) {
    const m = {};
    for (const k in data) { const d = data[k]; const n = norm(d.name || k); if (n) m[n] = { tier: d.tier || '', lp: d.lp || 0, placementDone: d.placementDone !== false, promoActive: !!d.promoActive, placementGames: d.placementGames || 0 }; }
    lpMap = m; broadcast('players', { players: latestPlayers, lpMap });
  }
}

// 🔖 홈페이지 버전 동기화 — config/appVersion(홈페이지가 로드 시 기록)을 읽어 데스크톱에 표시. 항상 홈과 일치.
let webVersion = '';
async function pollVersion() {
  const v = await fetchAppVersion();
  if (typeof v === 'string' && v && v !== webVersion) { webVersion = v; broadcast('version', webVersion); }
}

// 💰 정산 폴링 — 홈페이지 finalizeVotes가 lastSettlement에 publish. 새 정산이면 현재 LP(정산 반영 후) 함께 오버레이로.
let _settleSeenAt = 0;
async function pollSettlement() {
  const s = await fetchSettlement();
  if (!s || !s.publishedAt || s.publishedAt === _settleSeenAt) return;
  _settleSeenAt = s.publishedAt;
  if (Date.now() - s.publishedAt > 10 * 60 * 1000) return;   // 10분 넘은 정산은 무시(홈페이지와 동일 신선도)
  // 정산 반영 후 최신 LP를 normName(홈 규칙) 키로 — s1LpBefore와 같은 키라 델타 계산 가능
  const raw = await fetchLpPlayers();
  const lpNow = {};
  if (raw) for (const k in raw) { const d = raw[k]; const key = normName(d.name || k); if (key) lpNow[key] = { tier: d.tier || '', lp: d.lp || 0 }; }
  // 💥 이번 판 발동 효과(시너지·강철심장·아이템) — 경기 기록 스냅샷에서 참여자별로 (홈 정산창과 동일 소스)
  let procs = null;
  if (s.matchKey) {
    const m = await fetchMatch(s.matchKey);
    if (m) procs = { syn: m.synergyEffects || {}, em: m.emblemEffects || {}, items: m.itemEffects || {} };
  }
  if (!userHid) showOverlay();
  broadcast('settlement', { settle: s, lpNow, procs });
  _matchesCacheAt = 0;   // 경기 저장됨 → 매치 캐시 무효화(다음 오늘전적/연승 최신 반영)
  pollMyStats();
}

// 🎮 인게임 패널용 — 오늘 전적·연승 브로드캐스트 (매치 캐시 재사용)
async function pollMyStats() {
  if (!config.myName) return;
  try { const matches = await getMatchesCached(); broadcast('mystats', computeMyStats(config.myName, matches)); } catch (_) {}
}

// 🧩 홈페이지 session(팀 배정) 폴링 — 새 팀 짜이면 오버레이 자동 표시
async function pollSession() {
  const [s, lob] = await Promise.all([fetchSession(), fetchLobby()]);
  // 🥊 막고라 진행 중이면 파이터·상태를 오버레이/사이드패널로(배팅·정산은 홈페이지 담당)
  const mgId = s && s.magollaMatchId;
  if (mgId) {
    const mg = await getJson(`${FIREBASE_DB}/magolla_matches/${mgId}.json`);
    const involved = mg && config.myName && [mg.fighter1, mg.fighter2].concat(mg.spectators || []).some(n => normName(n) === normName(config.myName));
    if (involved && mg.status !== 'settled' && !userHid) showOverlay();
    broadcast('magolla', mg ? Object.assign({ matchId: mgId }, mg) : { matchId: mgId });
  } else { hideLiveForMagolla(); broadcast('magolla', null); }
  // 🎒 아이템 페이즈(팀 확정 전) — 내 gold·LP 상태 함께 오버레이로. 방장/참가자 모두 아이템 사용 가능.
  if (isItemPhase(s)) {
    const [g, lp] = await Promise.all([fetchMyGold(), fetchMyLpState()]);
    if (!userHid) showOverlay();
    broadcast('lobby', null);   // 아이템 타이머가 담당 → 준비 중 배너 숨김
    broadcast('itemphase', { gold: g, lp, endAt: s.itemPhaseEnd });
    return;
  }
  const formed = (s && s.teamsFormedAt) || 0;
  if (formed && formed !== lastFormed) {         // 새 팀 배정 감지
    lastFormed = formed; sampleActive = false; userHid = false; sessionData = s;
    showOverlay();
    broadcast('lobby', null);
    broadcast('session', { session: s, myName: config.myName || '', lpMap });
    if (_lastRect && !inGame && !_floating) updateSlotMarker(_lastRect);   // 📍 팀 배정 → 마커 갱신
    return;
  }
  if (sampleActive) return;                       // 미리보기 유지 중이면 안 건드림
  sessionData = s || null;
  // 🗳️ 투표 단계면 오버레이 자동 표시(게임 끝나 숨겨졌어도) — manualEog 신선 or 이미 투표 진행 중
  if (isVotingStage(s) && !userHid) showOverlay();
  // 🛠️ 방장이 팀 구성 준비 중(참가자 고르는 중) → 대기 화면에 안내 배너. 내가 선택됐으면 오버레이 자동 표시.
  if (lob && lob.state === 'preparing' && config.myName && Array.isArray(lob.participants)
      && lob.participants.some(n => normName(n) === normName(config.myName)) && !userHid) showOverlay();
  broadcast('lobby', lob || null);
  broadcast('session', { session: sessionData, myName: config.myName || '', lpMap });
  if (_lastRect && !inGame && !_floating) updateSlotMarker(_lastRect);   // 📍 팀 상태 변경 → 마커 갱신
}

// ── ⚔️ 팀 짜기(방장 전용) — 홈페이지와 완전 연동 ─────────────────────────
// 흐름 = 홈페이지 startItemPhase→makeTeams와 동일한 session 쓰기 2단계:
//   ① session = {phase:'item', itemPhaseEnd: now+15s, players:[normName...]} → 홈페이지 참가자에게 아이템 타이머 배너 자동 표시
//   ② 15초 후(스킵 가능) 같은 알고리즘으로 팀 계산 → session = 홈페이지 makeTeams와 동일 페이로드
//      → 홈페이지 유저 = 기존 onValue 흐름 그대로 팀 발표·결과·관전자 배팅 / 오버레이 유저 = pollSession이 teamsFormedAt 감지
let _tb = null;   // 진행 중 팀짜기 {names, mode, endAt, timer, prevSession, season, matches}
function sendTb(payload) { for (const w of [leftWin, desktopWin]) if (w && !w.isDestroyed()) w.webContents.send('teambuild', payload); }

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
  // extBuild:true = 오버레이가 팀 구성 담당 → (숨은) 라이브 웹뷰는 이 페이즈에 makeTeams 하지 않음(이중 팀구성 방지)
  const w = await fbSet('session', { phase: 'item', itemPhaseEnd, players: names.map(n => normName(n)), extBuild: true });
  if (!w.ok) return { ok: false, err: w.err };
  fbSet('lobby', null).catch(() => {});   // 🛠️ 팀 결성 시작 → 준비 중 배너 제거(아이템 타이머가 담당)
  // 방장 오버레이도 즉시 아이템 뷰 표시(3초 폴 안 기다리게=이슈5) — 방장이 참가자일 때만. endAt 동일이라 우측 카운트다운과 정확 동기(이슈2)
  if (config.myName && names.map(n => normName(n)).includes(normName(config.myName))) {
    Promise.all([fetchMyGold(), fetchMyLpState()]).then(([g, lp]) => {
      if (!userHid) showOverlay();
      broadcast('itemphase', { gold: g, lp, endAt: itemPhaseEnd });
    }).catch(() => {});
  }
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

// 🗳️ 투표 단계 판정 — mvp/manner active·미확정 + (승리팀 수동선택 신선 or 이미 투표 진행 중)
//   makeTeams가 mvp:{active:true}를 팀 짤 때 미리 쓰므로 active만으론 부족 → manualEog(승패) 또는 votes 존재로 "지금 투표 중" 판정.
function isVotingStage(s) {
  if (!s || !s.mvp || !s.mvp.active || !s.manner || !s.manner.active) return false;
  if (s.mvp.confirmed || s.manner.confirmed) return false;   // 확정 = 투표 끝(정산 단계)
  const fresh = s.manualEog && s.manualEog.at && (Date.now() - s.manualEog.at < 10 * 60 * 1000);
  const anyVote = (s.mvp.teamAVotes && Object.keys(s.mvp.teamAVotes).length) ||
                  (s.mvp.teamBVotes && Object.keys(s.mvp.teamBVotes).length);
  return !!(fresh || anyVote);
}
// 🎒 아이템 페이즈 — 팀 구성 직전 15초(홈 startItemPhase가 session.phase='item'+players 씀). 내가 참가자일 때만.
function isItemPhase(s) {
  return !!(s && s.phase === 'item' && s.itemPhaseEnd && Array.isArray(s.players)
    && config.myName && s.players.includes(normName(config.myName)));
}

// ── 트레이 ──────────────────────────────────────────────────────────────
function toggleDock() {
  config.dock = (config.dock === false);   // 뒤집기(기본 켜짐)
  saveConfig();
  if (config.dock !== false) { dockedBounds = null; }   // 스트림이 다음 틱(~160ms)에 재적용
  refreshTrayMenu();
}
function toggleSidePanel() {                // ◀ 왼쪽 내 정보 패널 on/off
  config.sidePanel = (config.sidePanel === false);   // 뒤집기(기본 켜짐)
  saveConfig();
  if (config.sidePanel !== false) { leftUserHid = false; leftDockedBounds = null; }   // 켜면 다음 틱에 재표시
  else hideLeftPanel();
  refreshTrayMenu();
}
let _updateReady = false;
function refreshTrayMenu(updateReady) {
  if (!tray) return;
  if (updateReady) _updateReady = true;
  const items = [
    { label: '롤 클라이언트에 붙이기(도킹)', type: 'checkbox', checked: config.dock !== false, click: toggleDock },
    { type: 'separator' },
    { label: `오버레이 토글 (${TOGGLE_HOTKEY})`, click: toggleOverlay },
    { label: '홈페이지 오버레이 토글 (Shift+F6)', click: toggleHome },
    { label: '내 정보 패널(왼쪽)', type: 'checkbox', checked: config.sidePanel !== false, click: toggleSidePanel },
    { type: 'separator' },
    { label: '내전 홈페이지 (기본 브라우저)', click: () => shell.openExternal(WEB_URL) },
    { label: '내 정보 패널 열기', click: showMainPanel },
    { type: 'separator' },
    { label: '종료', click: () => { app._quitting = true; app.quit(); } },
  ];
  if (_updateReady) items.unshift(
    { label: '🔄 지금 업데이트 (재시작)', click: () => { app._quitting = true; try { autoUpdater.quitAndInstall(); } catch (_) { app.quit(); } } },
    { type: 'separator' },
  );
  tray.setContextMenu(Menu.buildFromTemplate(items));
}
function makeTray() {
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  if (!icon.isEmpty()) icon = icon.resize({ width: 18, height: 18 });
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('아수라장 내전 — 클릭하면 내 정보 패널');
  refreshTrayMenu();
  tray.on('click', showMainPanel);          // 좌클릭 = 내 정보 패널
  tray.on('double-click', showMainPanel);
}

// ── IPC ──────────────────────────────────────────────────────────────────
ipcMain.on('overlay-hide', () => { hideOverlay(); userHid = true; });
ipcMain.on('update-now', () => { app._quitting = true; try { autoUpdater.quitAndInstall(); } catch (_) { app.quit(); } });   // 🔄 지금 업데이트(재시작)
ipcMain.on('update-later', () => { if (updateToastWin && !updateToastWin.isDestroyed()) updateToastWin.hide(); });          // 나중에 — 트레이 메뉴로 계속 가능
ipcMain.on('open-web', () => shell.openExternal(WEB_URL));
ipcMain.on('home-toggle', toggleHome);
ipcMain.on('open-home', (_e, { goto }) => {   // 🛒 사이드패널 → 홈 창 딥링크(복권/대장간 = 홈페이지 그대로)
  if (!homeWin) createHome();
  homeWin.show();
  const send = () => { try { if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('home-goto', goto); } catch (_) {} };
  if (homeWin.webContents.isLoading()) homeWin.webContents.once('did-finish-load', send); else send();
});
ipcMain.on('home-close', () => { if (homeWin) homeWin.hide(); });
ipcMain.on('side-hide', () => { leftUserHid = true; hideLeftPanel(); });   // ◀ 내 정보 패널 닫기(트레이/도킹 재개로 다시 열림)
ipcMain.on('set-myname', (_e, name) => {           // 내 이름(입장 ID) 저장 → 팀 판별
  config.myName = name || ''; saveConfig(); _myGoldKey = null;   // 계정 바뀌면 gold 키 캐시 무효화
  broadcast('myname', config.myName);
  broadcast('session', { session: sessionData, myName: config.myName, lpMap });
});
ipcMain.on('set-host', (_e, v) => {                // 방장(팀 짜기 진행자) 여부 — 방장이면 라이브 계정(저장 담당) 자동 가동
  config.isHost = !!v; saveConfig();
  if (config.isHost) startLiveAccount(); else { stopLiveAccount(); fbSet('lobby', null).catch(() => {}); }
});
// 🛠️ 팀 결성 로비 — 방장이 참가자 고르는 중 팀원에게 "준비 중" 안내(홈페이지 /lobby 노드와 동일 = 홈 팀원도 자동 표시)
ipcMain.on('lobby-prep', (_e, { names } = {}) => {
  if (!config.isHost) return;
  const list = (Array.isArray(names) ? names : []).map(n => String(n)).filter(Boolean);
  fbSet('lobby', list.length ? { state: 'preparing', by: config.myName || '진행자', at: Date.now(), participants: list } : null).catch(() => {});
});
ipcMain.on('lobby-clear', () => { if (config.isHost) fbSet('lobby', null).catch(() => {}); });
ipcMain.handle('get-players', async () => {        // 데스크톱 ID 선택용 목록 + 현재 설정
  const d = await fetchPlayers();
  const names = d ? [...new Set(Object.values(d).map(p => p && p.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')) : [];
  if (!Object.keys(lpMap).length) await pollLp().catch(() => {});   // 첫 로드 시 티어 배지용 LP 확보
  return { names, myName: config.myName || '', isHost: !!config.isHost, webVersion, lpMap, liveStatus: _liveStatus };
});

// 🖼️ 챔피언 초상화용 ddragon 버전(1회 조회·캐시)
let _ddVer = '14.24.1';
(async () => { try { const v = await getJson('https://ddragon.leagueoflegends.com/api/versions.json'); if (Array.isArray(v) && v[0]) _ddVer = v[0]; } catch (_) {} })();
// 📊 프로필 — 내 gold + matches + LP로 대시보드 계산(강철심장·시너지·챔프·전적·LP·단짝)
ipcMain.handle('profile-data', async () => {
  if (!config.myName) return { ok: false, err: '닉네임을 먼저 선택하세요' };
  const [mg, matches, lpAll] = await Promise.all([fetchMyGold(), getMatchesCached(), fetchLpPlayers()]);
  const prof = computeProfile(config.myName, (mg && mg.data) || {}, matches, lpAll);
  return { ok: true, profile: prof, ddVer: _ddVer };
});
// 📋 기록 — 필터(s2 내전/normal 일반/magolla 막고라) + 최근 60판 fast-path(수 MB 전체 다운로드 회피)
ipcMain.handle('records-data', async (_e, arg) => {
  const filter = (arg && arg.filter) || 's2';
  const my = config.myName || '';
  if (filter === 'normal') {
    const nm = await getNormalMatchesCached();
    return { ok: true, records: computeRecordsEx('normal', null, nm, null, my), ddVer: _ddVer, myName: my };
  }
  if (filter === 'magolla') {
    const mg = await fetchMagolla().catch(() => null);
    return { ok: true, records: computeRecordsEx('magolla', null, null, mg || {}, my), ddVer: _ddVer, myName: my };
  }
  const matches = (_matchesCache && Date.now() - _matchesCacheAt < 120000)
    ? _matchesCache
    : ((await fetchMatchesRecent().catch(() => null)) || await getMatchesCached());
  return { ok: true, records: computeRecordsEx(filter, matches, null, null, my), ddVer: _ddVer, myName: my };
});
// 🏆 랭킹 — 시즌2 LP 순
ipcMain.handle('ranking-data', async () => {
  const lpAll = await fetchLpPlayers();
  return { ok: true, ranking: computeRanking(lpAll), myName: config.myName || '' };
});
ipcMain.handle('tb-start', (_e, { names, mode }) => startTeamBuild(names, mode));   // ⚔️ 팀 짜기 시작(방장)
ipcMain.on('tb-skip', () => skipItemPhase());                                       // ⏭️ 아이템 시간 건너뛰기
ipcMain.handle('magolla-start', (_e, { names }) => createMagollaMatch(names));      // 🥊 막고라 시작(방장) — 생성만·배팅/정산은 홈페이지
ipcMain.on('magolla-show-live', () => { _mgLiveShown = false; showLiveForMagolla(); });   // 🥊 (폴백) 방장: 라이브 창 직접 열기
// 🥊 방장이 오버레이에서 고른 결과 3가지를 라이브 계정 권한으로 확정(숨은 liveWin에 주입) → 홈 정산
ipcMain.handle('magolla-result', async (_e, { matchId, winner, cond, aug }) => {
  if (!config.isHost) return { ok: false, err: '방장만 결과를 확정할 수 있어요' };
  if (!liveWin || liveWin.isDestroyed()) return { ok: false, err: '라이브 계정이 없어요 (방장 체크 확인)' };
  try {
    const js = `(window.overlayMagollaResult?window.overlayMagollaResult(${JSON.stringify(matchId)},${JSON.stringify(winner)},${JSON.stringify(cond)},${JSON.stringify(aug)}):Promise.resolve('err:홈페이지 업데이트 필요'))`;
    const r = await liveWin.webContents.executeJavaScript(js);
    if (r === 'ok') return { ok: true };
    return { ok: false, err: (typeof r === 'string' && r.startsWith('err:')) ? r.slice(4) : '정산 실패' };
  } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
});
// 🗳️ 투표 — 내 이름·현재 session으로 팀/키 계산 후 mvp·manner 두 노드에 write(홈 castCombinedVote와 동일 경로)
ipcMain.handle('vote-cast', async (_e, { mvpPick, mannerPick }) => {
  const s = sessionData, me = config.myName;
  const team = teamOf(s, me);
  if (!team) return { ok: false, err: '이 경기에 참가하지 않았어요' };
  const k = fbKeyOf(me);
  const a = await fbSet(`session/mvp/${team}Votes/${k}`, mvpPick);
  const b = await fbSet(`session/manner/${team}Votes/${k}`, mannerPick);
  return { ok: a.ok && b.ok, err: a.err || b.err };
});
ipcMain.handle('vote-clear', async (_e) => {   // ↩ 다시 선택(투표 취소)
  const s = sessionData, me = config.myName;
  const team = teamOf(s, me);
  if (!team) return { ok: false };
  const k = fbKeyOf(me);
  await fbDelete(`session/mvp/${team}Votes/${k}`);
  await fbDelete(`session/manner/${team}Votes/${k}`);
  return { ok: true };
});
// 🖥️ 정산 마감 — 방장 오버레이가 숨은 라이브 계정(liveWin)에 "지금까지의 표로 정산 발행"을 지시.
//   전원 투표해야만 자동 확정되는데, 미투표자가 있으면 '건너뛰기' 버튼이 (숨은) 라이브 계정에만 있어 아무도 못 눌러
//   정산창이 영영 안 뜸 → 방장이 이 버튼으로 강제 마감. overlayForceSettle=현재까지의 표로 확정→저장→finalizeVotes→lastSettlement 발행.
ipcMain.handle('force-settle', async () => {
  if (!config.isHost) return { ok: false, err: '방장 오버레이에서만 정산을 마감할 수 있어요' };
  if (!liveWin || liveWin.isDestroyed()) return { ok: false, err: '라이브 계정 준비 중이에요 — 방장 체크 후 잠시 뒤 다시 시도해줘요' };
  try {
    const r = await liveWin.webContents.executeJavaScript(
      `(window.overlayForceSettle ? window.overlayForceSettle() : (window.skipAll && window.skipAll(), 'skip'))`
    );
    return { ok: true, r };
  } catch (e) {
    return { ok: false, err: String((e && e.message) || e) };
  }
});
// 🎒 아이템 활성화 토글 — 홈 toggleItemActive 이식(items_s2 배열 재작성·상호배제 규칙). 골드 무관.
const ITEM_CONFLICT = { s1_gamble: ['s1_lp2x'], s1_lp2x: ['s1_gamble'], s1_promo_shield: ['s1_promo_win'], s1_promo_win: ['s1_promo_shield'] };
ipcMain.handle('item-toggle', async (_e, { id }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요(닉네임 확인)' };
  const items = Array.isArray(mg.data.items_s2) ? mg.data.items_s2.map(x => ({ ...x })) : [];
  const idx = items.findIndex(it => it && it.id === id);
  if (idx < 0) return { ok: false, err: '보유하지 않은 아이템이에요' };
  const turningOn = !items[idx].active;
  if (turningOn) {
    const lp = await fetchMyLpState();
    if ((id === 's1_gamble' || id === 's1_lp2x') && !lp)   // 홈 toggleItemActive과 동일: LP 정보 없으면 차단(배치/승급전 오사용 방지)
      return { ok: false, err: '내 LP 정보를 불러오지 못했어요 — 잠시 후 다시' };
    const placementDone = !!(lp && lp.placementDone !== false);
    const promoActive = !!(lp && lp.promoActive);
    if ((id === 's1_promo_shield' || id === 's1_promo_win') && !promoActive) return { ok: false, err: '승급전 중에만 쓸 수 있어요' };
    if ((id === 's1_gamble' || id === 's1_lp2x') && (!placementDone || promoActive))
      return { ok: false, err: promoActive ? '승급전 중엔 쓸 수 없어요' : '배치고사 완료 후 쓸 수 있어요' };
    const off = new Set([id, ...(ITEM_CONFLICT[id] || [])]);   // 같은 id + 충돌 아이템 전부 끄고
    items.forEach(it => { if (off.has(it.id)) it.active = false; });
    items[idx].active = true;                                  // 이 항목만 켬
  } else {
    items.forEach(it => { if (it.id === id) it.active = false; });   // 끄기: 같은 id 전부 off
  }
  const r = await fbUpdate(`gold/${mg.key}`, { items_s2: items });
  return { ok: r.ok, err: r.err };
});
// 🛒 아이템 구매 — 홈 quickBuyItem 이식(골드 검증 후 items_s2 append + goldSpent_s2 += price). 아이템 페이즈 구매 3종.
const BUYABLE_ITEMS = { s1_promo_shield: { name: '승급전 방어권', price: 100 }, s1_promo_win: { name: '승급전 승리권', price: 100 }, s1_gamble: { name: '도박권', price: 60 } };
let _matchesCache = null, _matchesCacheAt = 0;
async function getMatchesCached() {   // 골드 계산용 matches(수 MB) — 2분 캐시(반복 계산 시 재요청 방지)
  if (_matchesCache && Date.now() - _matchesCacheAt < 120000) return _matchesCache;
  const m = await fetchMatches();
  if (m) { _matchesCache = m; _matchesCacheAt = Date.now(); }
  return _matchesCache || {};
}
ipcMain.handle('item-buy', async (_e, { id }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const def = BUYABLE_ITEMS[id];
  if (!def) return { ok: false, err: '구매할 수 없는 아이템이에요' };
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요(닉네임 확인)' };
  const matches = await getMatchesCached();
  const avail = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
  if (avail < def.price) return { ok: false, err: `골드 부족 (보유 ${avail}G · 필요 ${def.price}G)` };
  const items = Array.isArray(mg.data.items_s2) ? mg.data.items_s2.map(x => ({ ...x })) : [];
  items.push({ id, active: false });
  const spent = (typeof mg.data.goldSpent_s2 === 'number' ? mg.data.goldSpent_s2 : 0) + def.price;
  const r = await fbUpdate(`gold/${mg.key}`, { items_s2: items, goldSpent_s2: spent });
  return { ok: r.ok, err: r.err, gold: avail - def.price };
});
// ⚒️ 강철심장 장착 — 홈 emblemEquip 이식. emblemEquipped_s2 = id(또는 null=해제).
ipcMain.handle('emblem-equip', async (_e, { id }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const arr = Array.isArray(mg.data.emblems_s2) ? mg.data.emblems_s2 : [];
  if (id != null && !arr.some(e => e && e.id === id)) return { ok: false, err: '보유하지 않은 강철심장이에요' };
  const r = await fbUpdate(`gold/${mg.key}`, { emblems_s2: arr, emblem_s2: null, emblemEquipped_s2: (id == null ? null : id) });
  return { ok: r.ok, err: r.err };
});
// 🃏 시너지 활성화 — 홈 equipSynFromMain 이식. 소유(카드) 검증 후 activeSynergy_s2 = {sid,tier}(또는 null=해제).
const SYN_MEMBERS = {
  warrior: ['DrMundo', 'Gangplank', 'Yasuo'], marksman: ['Akshan', 'Jhin', 'Vayne'], assassin: ['Fizz', 'Khazix', 'Naafiri'],
  ionia: ['Jhin', 'Yasuo'], shurima: ['Akshan', 'Amumu', 'Naafiri', 'Rammus'], tank: ['Amumu', 'Malphite', 'Poppy', 'Rammus'],
  demacia: ['Morgana', 'Poppy', 'Vayne'], bilgewater: ['Fizz', 'Gangplank'], support: ['Lulu', 'Morgana'],
  mage: ['Brand', 'Malzahar', 'Mel'], void: ['Khazix', 'Malzahar'],
};
ipcMain.handle('synergy-equip', async (_e, { sid, tier }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const members = SYN_MEMBERS[sid];
  if (!members) return { ok: false, err: '알 수 없는 시너지' };
  const cards = mg.data.champCards_s2 || {};
  const owned = members.every(slug => { const c = cards[slug] || {}; return tier === 3 ? (c.s3 || 0) >= 1 : ((c.s2 || 0) >= 1 || (c.s3 || 0) >= 1); });
  if (!owned) return { ok: false, err: '시너지 카드를 다 모으지 않았어요' };
  const cur = mg.data.activeSynergy_s2 || null;
  const newVal = (cur && cur.sid === sid && cur.tier === tier) ? null : { sid, tier };
  const r = await fbUpdate(`gold/${mg.key}`, { activeSynergy_s2: newVal });
  return { ok: r.ok, err: r.err };
});
// ── 🔒 계정 조작 잠금(B안·홈 _ctrlGuard 대응) — 같은 계정 동시 '쓰기' 사고 방지 ──
//    accountSession/{fbKey} = { deviceId, app, label, at, hb }. 보기는 자유·조작 권한만 한 기기.
//    비어있음/stale(75s)/내 기기 → 자동 클레임 후 통과. 다른 기기 조작 중 → {ctrl:true} 반환(렌더러가 확인 후 takeControl).
const ACCT_STALE = 75000;
const acctKey = () => config.myName ? normName(config.myName).replace(/\s+/g, '_') : null;
let _acctHb = null;
async function claimControl() {
  const k = acctKey(); if (!k) return;
  await fbSet(`accountSession/${k}`, { deviceId: config.deviceId, app: 'overlay', label: '내전 오버레이', at: Date.now(), hb: Date.now() });
  if (!_acctHb) _acctHb = setInterval(async () => {   // 하트비트 — 아직 내가 권한자일 때만 갱신
    const kk = acctKey(); if (!kk) return;
    try {
      const s = await getJson(`${FIREBASE_DB}/accountSession/${kk}.json`);
      if (s && s.deviceId === config.deviceId) await fbUpdate(`accountSession/${kk}`, { hb: Date.now() });
    } catch (_) {}
  }, 25000);
}
async function ensureControl() {
  const k = acctKey(); if (!k) return { ok: true };   // 닉네임 없으면 기존 가드가 걸러냄
  let s = null;
  try { s = await getJson(`${FIREBASE_DB}/accountSession/${k}.json`); } catch (_) {}
  const fresh = s && s.hb && (Date.now() - s.hb) < ACCT_STALE;
  if (fresh && s.deviceId !== config.deviceId) {
    const who = s.app === 'web' ? (s.label || '웹(브라우저)') : (s.label || '다른 기기');
    return { ok: false, err: `🔒 지금 ${who}에서 이 계정을 조작 중이에요` };
  }
  if (!fresh || s.deviceId !== config.deviceId) await claimControl();   // 비었거나 stale → 인계
  return { ok: true };
}
async function releaseControl() {   // 종료 시 반납 → 다른 기기가 조용히 인계
  const k = acctKey(); if (!k) return;
  try {
    const s = await getJson(`${FIREBASE_DB}/accountSession/${k}.json`);
    if (s && s.deviceId === config.deviceId) await fbSet(`accountSession/${k}`, null);
  } catch (_) {}
}
app.on('before-quit', () => { releaseControl(); });
ipcMain.handle('take-control', async () => { await claimControl(); return { ok: true }; });
const CTRL_FAIL = c => ({ ok: false, ctrl: true, err: c.err });

// ── 🛒🃏🎫 상점/가챠/패스 (store.js = 홈 로직 이식·쓰기는 홈과 동일 필드) ──────
let _nmCache = null, _nmCacheAt = 0;
async function getNormalMatchesCached() {   // 일반게임 기록 — 2분 캐시
  if (_nmCache && Date.now() - _nmCacheAt < 120000) return _nmCache;
  const m = await fetchNormalMatches();
  if (m) { _nmCache = m; _nmCacheAt = Date.now(); }
  return _nmCache || {};
}
// 🛒 상점 조회 — 보유 골드·아이템 수·강화권·정수
ipcMain.handle('wallet-data', async () => {   // 🪙 상단 재화(골드·뽑기·투기장 코인)
  const mg = await fetchMyGold();
  if (!mg) return { ok: false };
  const matches = await getMatchesCached();
  const gold = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
  return { ok: true, gold, claw: mg.data.clawCoins_s2 || 0, arena: mg.data.arenaCoins_s2 || 0 };
});
ipcMain.handle('shop-data', async () => {
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요(닉네임 확인)' };
  const matches = await getMatchesCached();
  const gold = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
  const counts = {};
  for (const it of (Array.isArray(mg.data.items_s2) ? mg.data.items_s2 : [])) {
    if (!it || !it.id) continue;
    counts[it.id] = counts[it.id] || { n: 0, active: 0 };
    counts[it.id].n++; if (it.active) counts[it.id].active++;
  }
  return { ok: true, gold, itemCounts: counts, tickets: mg.data.emblemTickets_s2 || {}, essence: mg.data.emblemEssence_s2 || 0,
    emblems: Array.isArray(mg.data.emblems_s2) ? mg.data.emblems_s2.filter(Boolean).length : 0 };
});
// 🛒 강화권 구매 — 홈 emblemBuyTicket 이식(goldSpent + goldSpendLog 기록)
ipcMain.handle('shop-buy-ticket', async (_e, { type, qty }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const def = store.EMBLEM_TICKETS[type];
  if (!def) return { ok: false, err: '알 수 없는 강화권이에요' };
  qty = Math.max(1, Math.min(20, Math.floor(qty || 1)));
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const matches = await getMatchesCached();
  const gold = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
  const cost = def.price * qty;
  if (gold < cost) return { ok: false, err: `골드 부족 (보유 ${gold}G · 필요 ${cost}G)` };
  const tickets = { ...(mg.data.emblemTickets_s2 || {}) };
  tickets[type] = (tickets[type] || 0) + qty;
  const upd = { emblemTickets_s2: tickets, goldSpent_s2: (mg.data.goldSpent_s2 || 0) + cost, ...store.spendLogUpd(mg.data, 'emblem_ticket', `${def.name} ×${qty}`, cost) };
  const r = await fbUpdate(`gold/${mg.key}`, upd);
  return { ok: r.ok, err: r.err, gold: gold - cost };
});
// 🃏 가챠 조회 — 컬렉션·완성 시너지 목록(활성화는 기존 synergy-equip 재사용)
ipcMain.handle('gacha-data', async () => {
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요(닉네임 확인)' };
  const matches = await getMatchesCached();
  const gold = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
  const cards = mg.data.champCards_s2 || {};
  const asyn = mg.data.activeSynergy_s2 || null;
  const synList = Object.entries(SYN_MEMBERS).map(([sid, members]) => {
    const t3 = members.every(s => ((cards[s] || {}).s3 || 0) >= 1);
    const t2 = members.every(s => { const c = cards[s] || {}; return (c.s2 || 0) >= 1 || (c.s3 || 0) >= 1; });
    const tier = t3 ? 3 : t2 ? 2 : 0;
    return tier ? { sid, tier, active: !!(asyn && asyn.sid === sid && asyn.tier === tier) } : null;
  }).filter(Boolean);
  return { ok: true, gold, cards, champs: store.GACHA_CHAMPS, yuumi: !!mg.data.secretYuumi_s2, synList };
});
// 🃏 뽑기 — 홈 doGachaPull 이식(확률·기록·baseline·유미 전부 동일)
ipcMain.handle('gacha-pull', async (_e, { times }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  times = times === 10 ? 10 : 1;
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const matches = await getMatchesCached();
  const gold = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
  const cost = times === 1 ? 50 : 450;
  if (gold < cost) return { ok: false, err: `골드 부족 (보유 ${gold}G · 필요 ${cost}G)` };
  const { results, upd } = store.gachaPull(mg.data, times);
  const r = await fbUpdate(`gold/${mg.key}`, upd);
  if (!r.ok) return { ok: false, err: r.err || '뽑기 실패 — 다시 시도해주세요' };
  return { ok: true, results, gold: gold - cost };
});
// 🎫 패스 — 조회/수령 (홈 S2 퀘스트 패스·순차 클레임·일반게임 스탯 포함)
async function _passCtx() {
  const [mg, matches, nm, playersRaw] = await Promise.all([fetchMyGold(), getMatchesCached(), getNormalMatchesCached(), fetchPlayers()]);
  const players = playersRaw ? Object.values(playersRaw).filter(p => p && p.name) : [];
  return { mg, matches, nm, players };
}
ipcMain.handle('pass-data', async () => {
  const { mg, matches, nm, players } = await _passCtx();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요(닉네임 확인)' };
  return { ok: true, ...store.computePassRows(mg.data.name || config.myName, mg.data, matches, nm, players) };
});
ipcMain.handle('pass-claim', async (_e, { lv }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const { mg, matches, nm, players } = await _passCtx();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const res = store.passClaim(mg.data.name || config.myName, mg.data, lv, matches, nm, players);
  if (res.err) return { ok: false, err: res.err };
  const r = await fbUpdate(`gold/${mg.key}`, res.upd);
  return { ok: r.ok, err: r.err, reward: res.reward };
});

// ── 🔨 대장간 (store.js = 홈 대장간 로직 1:1) ─────────────────────────────
ipcMain.handle('forge-data', async () => {
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요(닉네임 확인)' };
  const heal = store.forgeHealUpd(mg.data);   // 무효 걸작 줄 자동 치유(홈 _healEmblemLines)
  if (heal) { await fbUpdate(`gold/${mg.key}`, heal); Object.assign(mg.data, heal); }
  const matches = await getMatchesCached();
  const gold = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
  return { ok: true, gold, ...store.computeForgeView(mg.data) };
});
ipcMain.handle('forge-buy-base', async () => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const matches = await getMatchesCached();
  const gold = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
  const res = store.forgeBuyBase(mg.data);
  if (res.err) return { ok: false, err: res.err };
  if (gold < res.price) return { ok: false, err: `골드 부족 (보유 ${gold}G · 필요 ${res.price}G)` };
  const r = await fbUpdate(`gold/${mg.key}`, res.upd);
  return { ok: r.ok, err: r.err };
});
ipcMain.handle('forge-enhance', async (_e, { type }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const res = store.forgeEnhance(mg.data, type);
  if (res.err) return { ok: false, err: res.err };
  const r = await fbUpdate(`gold/${mg.key}`, res.upd);
  return { ok: r.ok, err: r.err, result: res.result };
});
ipcMain.handle('forge-reroll', async () => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const res = store.forgeReroll(mg.data);
  if (res.err) return { ok: false, err: res.err };
  const r = await fbUpdate(`gold/${mg.key}`, res.upd);
  return { ok: r.ok, err: r.err, lines: res.lines };
});
ipcMain.handle('forge-sell', async (_e, { id }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const res = store.forgeSell(mg.data, id);
  if (res.err) return { ok: false, err: res.err };
  const r = await fbUpdate(`gold/${mg.key}`, res.upd);
  return { ok: r.ok, err: r.err, refund: res.refund };
});
ipcMain.handle('forge-nick', async (_e, { id, nick }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const res = store.forgeNick(mg.data, id, nick);
  if (res.err) return { ok: false, err: res.err };
  const r = await fbUpdate(`gold/${mg.key}`, res.upd);
  return { ok: r.ok, err: r.err };
});
// ── 🎟 스크래치 복권 (store.js = 홈 buyItem scratch_tier 분기 1:1) ──────────
ipcMain.handle('lottery-data', async () => {
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요(닉네임 확인)' };
  const matches = await getMatchesCached();
  const gold = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
  return { ok: true, gold, ...store.lotteryView(mg.data) };
});
ipcMain.handle('lottery-buy', async (_e, { tierIdx, useFree }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  if (!useFree) {
    const matches = await getMatchesCached();
    const gold = availableGoldS2(mg.data.name || config.myName, mg.data, matches);
    const tier = store.SCRATCH_TIERS[tierIdx];
    if (tier && gold < tier.price) return { ok: false, err: `골드 부족 (보유 ${gold}G · 필요 ${tier.price}G)` };
  }
  const res = store.lotteryBuy(mg.data, tierIdx, !!useFree);
  if (res.err) return { ok: false, err: res.err };
  const r = await fbUpdate(`gold/${mg.key}`, res.upd);
  if (!r.ok) return { ok: false, err: r.err || '구매 실패' };
  return { ok: true, rec: res.rec };
});
ipcMain.handle('lottery-aside', async (_e, { revealed }) => {   // 보류 — 긁은 칸 저장
  const mg = await fetchMyGold();
  if (!mg) return { ok: false };
  const rec = mg.data.pendingScratch_s2;
  if (!rec || !Array.isArray(rec.slots)) return { ok: false };
  const r = await fbUpdate(`gold/${mg.key}`, { pendingScratch_s2: { ...rec, revealed: Array.isArray(revealed) ? revealed : [] } });
  return { ok: r.ok };
});
ipcMain.handle('lottery-finish', async (_e, { revealedSkulls }) => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const rec = mg.data.pendingScratch_s2;
  if (!rec || !Array.isArray(rec.slots)) return { ok: false, err: '진행 중인 복권이 없어요' };
  const res = store.lotteryFinish(mg.data, rec, Math.max(0, Math.floor(revealedSkulls || 0)));
  const r = await fbUpdate(`gold/${mg.key}`, res.upd);
  return { ok: r.ok, err: r.err, net: res.net, winGold: res.winGold, skullPenalty: res.skullPenalty };
});
ipcMain.handle('lottery-cancel', async () => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금   // 한 획도 안 긁은 취소 = 환불
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const rec = mg.data.pendingScratch_s2;
  if (!rec || !Array.isArray(rec.slots)) return { ok: false, err: '진행 중인 복권이 없어요' };
  if (Array.isArray(rec.revealed) && rec.revealed.some(Boolean)) return { ok: false, err: '이미 긁기 시작해 취소할 수 없어요' };
  const r = await fbUpdate(`gold/${mg.key}`, store.lotteryCancel(mg.data, rec).upd);
  return { ok: r.ok, err: r.err };
});
ipcMain.handle('lottery-discard', async () => {
  const _c = await ensureControl(); if (!_c.ok) return CTRL_FAIL(_c);   // 🔒 계정 조작 잠금
  const mg = await fetchMyGold();
  if (!mg) return { ok: false, err: '내 계정을 찾을 수 없어요' };
  const rec = mg.data.pendingScratch_s2;
  if (!rec || !Array.isArray(rec.slots)) return { ok: false, err: '진행 중인 복권이 없어요' };
  const r = await fbUpdate(`gold/${mg.key}`, store.lotteryDiscard(mg.data, rec).upd);
  return { ok: r.ok, err: r.err };
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
// 중복 실행 방지 — 이미 켜져 있으면 새 인스턴스 대신 기존 메인 화면을 앞으로
const _gotLock = app.requestSingleInstanceLock();
if (!_gotLock) { app.quit(); }
else {
  app.on('second-instance', () => showMainPanel());   // 런처를 또 누르면 내 정보 패널 앞으로
  app.whenReady().then(() => {
    CONFIG_PATH = path.join(app.getPath('userData'), 'aram-overlay-config.json');
    config = loadConfig();
    config.isHost = false;   // 🔒 방장은 재실행마다 초기화 — 자동 방장 방지(로그인 화면서 매번 다시 체크). 추후 비밀번호 로그인 대비.
    if (!config.deviceId) { config.deviceId = 'ov_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36); saveConfig(); }   // 🔒 계정 조작 잠금용 기기 ID
    createOverlay();
    createLeftPanel(); // ▶ 내 정보 패널(로그인·방장·팀짜기) = 메인 창
    createSlotWin();   // 📍 내 팀 마커(미리 로드 → 팀 배정 시 흰 박스 없이 바로 표시)
    _startTs = Date.now();
    floatPanels();     // 클라 없으면 좌우 독립 창으로 표시(클라 켜면 도킹 스트림이 붙임)
    squareAllPanels(); setTimeout(squareAllPanels, 1500);   // 🪟 창 모서리 각지게(둥글림 강제 해제)
    makeTray();
    globalShortcut.register(TOGGLE_HOTKEY, toggleOverlay);
    globalShortcut.register('Shift+F6', toggleHome);   // 🌐 홈페이지 오버레이
    pollGame(); pollLp(); pollSession(); pollSettlement(); pollVersion(); pollMyStats(); startDockStream();
    setTimeout(() => { getMatchesCached().catch(() => {}); }, 2500);   // ⚡ 매치 캐시 예열(기록/골드 첫 로딩 빠르게)
    setInterval(pollGame, 2500);
    setInterval(pollLp, 60000);
    setInterval(pollSession, 3000);
    setInterval(pollSettlement, 3000);  // 💰 정산 결과 감지
    setInterval(pollVersion, 5 * 60 * 1000);   // 🔖 홈페이지 버전 동기화(5분마다)
    setupAutoUpdate();                  // 🔄 자동 업데이트
    // 🔌 내장 브릿지 시작 — LCU에 붙어 게임 페이즈·EOG 통계를 홈페이지가 읽는 bridge/* 경로에 기록(aram-bridge 대체)
    bridge.start({ getOperatorName: () => config.myName || null, appVer: app.getVersion(), log: (m) => { try { console.log(m); } catch (_) {} } });
    // 🔒 방장 자동 가동 안 함 — 매번 로그인 화면서 방장 체크 시에만 setHost→startLiveAccount (자동 방장 방지)
  });
}

// 🔄 자동 업데이트 — 앱 시작 시 GitHub Releases에서 새 버전 확인·백그라운드 다운로드,
//   다운로드 완료 시 트레이 알림 + 다음 실행(또는 종료 시)에 자동 설치. 팀원은 켜기만 하면 최신.
function setupAutoUpdate() {
  if (!app.isPackaged) return;   // 개발(npm start)에선 스킵
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    showUpdateToast(info.version);   // 🔄 우하단 커스텀 토스트(「지금 업데이트」 버튼 포함)
    refreshTrayMenu(true);           // 트레이에도 "지금 업데이트" 메뉴 노출(백업 경로)
  });
  autoUpdater.on('error', () => {});   // 네트워크 오류 등은 조용히 무시(다음 시도)
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);   // 30분마다 재확인
}
app.on('before-quit', () => { app._quitting = true; try { bridge.stop(); } catch (_) {} try { stopLiveAccount(); } catch (_) {} try { if (config.isHost) fbSet('lobby', null); } catch (_) {} try { stopDockStream(); } catch (_) {} });   // 종료: 브릿지·라이브계정·로비배너·도킹 스트림 정리
app.on('window-all-closed', (e) => { /* 트레이 상주 — 창 다 닫혀도 안 죽음 */ });
app.on('will-quit', () => globalShortcut.unregisterAll());

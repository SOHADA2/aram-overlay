// ── 내장 브릿지 (aram-bridge 완전 이식) ─────────────────────────────────────
// 오버레이가 롤 클라이언트(LCU)에 직접 붙어 게임 페이즈·EOG 통계(KDA·딜량·골드·증강·멀티킬)를
// 캡처해서, 홈페이지가 읽는 것과 "동일한" Firebase 경로(bridge/* · normal_matches/*)에 그대로 기록한다.
// → 홈페이지는 브릿지 코드를 하나도 안 바꾸고 오버레이를 브릿지로 인식한다(EOG 저장·투표 시작·진행자 표시·일반게임 기록·진행 배너 전부).
//
// aram-bridge index.js 를 1:1 이식하되:
//   · HTTP 상태페이지(7654)·진행자 드롭다운 제거 → 진행자 이름은 오버레이 config.myName 사용
//   · axios → Node https (의존성 추가 없음)
//   · Firebase 쓰기는 브릿지와 동일하게 "인증 없는 PUT"(bridge/·normal_matches/ 경로는 무인증 쓰기 허용됨 — 실브릿지로 검증된 동작)
//   · operators 노드에 app:'overlay' 표시 → 홈페이지가 "구버전 브릿지" 오탐 안 하게

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const { EventEmitter } = require('events');
const { execFile }     = require('child_process');

const FIREBASE_URL      = 'https://aramchaos-ca022-default-rtdb.asia-southeast1.firebasedatabase.app';
const BRIDGE_ROOT       = 'bridge';
const BRIDGE_COMPAT_VER = '1.1.38';   // 홈페이지 LATEST_BRIDGE_VER 이상이라야 "구버전 브릿지" 경고 안 뜸

// 주입 옵션(startBridge에서 세팅)
let _log        = () => {};
let _getOpName  = () => null;   // 진행자 이름 = 오버레이 config.myName
let _appVer     = '';           // 오버레이 앱 버전(정보용)

function log(msg) { try { _log('[bridge] ' + msg); } catch (_) {} }

// ── Node https 헬퍼 (axios 대체) ────────────────────────────────────────────
// LCU(127.0.0.1)·라이브클라(2999)는 자체서명 인증서라 무시. Firebase는 정상 검증.
function httpReq(method, url, body, extraHeaders) {
  return new Promise(resolve => {
    let u; try { u = new URL(url); } catch (_) { return resolve({ status: 0, data: null, etag: null }); }
    const payload = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const headers = Object.assign({}, extraHeaders || {});
    if (payload != null) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method,
      rejectUnauthorized: !(u.hostname === '127.0.0.1'),   // 로컬(LCU/2999)만 자체서명 무시
      headers, timeout: 6000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} resolve({ status: res.statusCode, data: j, etag: res.headers.etag || null }); });
    });
    req.on('error', () => resolve({ status: 0, data: null, etag: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: null, etag: null }); });
    if (payload != null) req.write(payload);
    req.end();
  });
}

// ── Firebase (인증 없는 PUT/GET — 실브릿지와 동일) ───────────────────────────
let fbOk = null, fbErrorLogged = false;
async function fbSet(p, data) {
  const r = await httpReq('PUT', `${FIREBASE_URL}/${p}.json`, data === null ? null : data);
  if (r.status >= 200 && r.status < 300) { fbOk = true; fbErrorLogged = false; return true; }
  fbOk = false;
  if (!fbErrorLogged) { log(`⚠️ Firebase 쓰기 실패(${p} · HTTP ${r.status})`); fbErrorLogged = true; }
  return false;
}
async function fbGet(p) {
  const r = await httpReq('GET', `${FIREBASE_URL}/${p}.json`);
  return r.data;
}
// ETag 기반 조건부 GET/PUT — 다른 브릿지/오버레이 동시 실행 시 atomic CAS(중복 EOG 저장 차단)
async function fbGetWithEtag(p) {
  const r = await httpReq('GET', `${FIREBASE_URL}/${p}.json`, undefined, { 'X-Firebase-ETag': 'true' });
  return { data: r.data, etag: r.etag };
}
async function fbSetIfMatch(p, data, etag) {
  const r = await httpReq('PUT', `${FIREBASE_URL}/${p}.json`, data === null ? null : data, { 'if-match': etag || 'null_etag' });
  if (r.status === 412) return { ok: false, conflict: true };
  if (r.status >= 200 && r.status < 300) { fbOk = true; return { ok: true }; }
  throw new Error('fb ' + r.status);
}

// ── 라이브 클라이언트 데이터(2999) — 진행 중 실제 참가자 명단 ────────────────
async function liveGamePlayerNames() {
  const r = await httpReq('GET', 'https://127.0.0.1:2999/liveclientdata/playerlist');
  const list = Array.isArray(r.data) ? r.data : [];
  return list.filter(p => !p.isBot)
    .map(p => String(p.riotIdGameName || p.summonerName || (typeof p.riotId === 'string' ? p.riotId.split('#')[0] : '') || '').trim())
    .filter(Boolean);
}

// ── lockfile 기반 LCU 커넥터 (aram-bridge와 동일) ────────────────────────────
class LockfileConnector extends EventEmitter {
  constructor() { super(); this._connected = false; this._timer = null; this._curPort = null; this._psAt = 0; this._busy = false; }
  start() { this._poll(); this._timer = setInterval(() => this._poll(), 3000); }
  stop()  { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
  // ⚠️ Electron 메인 프로세스라 blocking(execSync) 금지 — PowerShell 폴백은 async(execFile)로, 자주 안 뜨게 15초 스로틀.
  _findLockfile() {
    return new Promise(resolve => {
      const candidates = [
        'C:\\Riot Games\\League of Legends\\lockfile',
        'D:\\Riot Games\\League of Legends\\lockfile',
        path.join(process.env.LOCALAPPDATA || '', '..\\Local\\Riot Games\\League of Legends\\lockfile'),
      ];
      for (const p of candidates) { try { if (fs.existsSync(p)) return resolve(p); } catch (_) {} }
      if (Date.now() - this._psAt < 15000) return resolve(null);   // 비표준 설치 폴백은 15초에 한 번만
      this._psAt = Date.now();
      execFile('powershell',
        ['-NoProfile', '-NonInteractive', '-Command', "try{(Get-Process LeagueClientUx -EA Stop)[0].Path}catch{''}"],
        { timeout: 4000, windowsHide: true, encoding: 'utf8' },
        (err, stdout) => {
          const out = (!err && stdout) ? String(stdout).trim() : '';
          if (out) { const lf = path.join(path.dirname(out), 'lockfile'); try { if (fs.existsSync(lf)) return resolve(lf); } catch (_) {} }
          resolve(null);
        });
    });
  }
  async _poll() {
    if (this._busy) return;   // 이전 폴 진행 중이면 겹치지 않게
    this._busy = true;
    let lfPath = null;
    try { lfPath = await this._findLockfile(); } catch (_) {}
    this._busy = false;
    if (lfPath) {
      try {
        const [, , port, password, protocol] = fs.readFileSync(lfPath, 'utf8').trim().split(':');
        if (port && password) {
          if (this._connected && this._curPort !== port) {   // 롤 재시작 → 새 port 로 재연결
            this._connected = false; this._curPort = null; this.emit('disconnect');
          }
          if (!this._connected) {
            this._connected = true; this._curPort = port;
            this.emit('connect', { username: 'riot', password, port, protocol: protocol || 'https' });
          }
        }
        return;
      } catch (_) {}
    }
    if (this._connected) { this._connected = false; this._curPort = null; this.emit('disconnect'); }
  }
  forceReset() { if (this._connected) { this._connected = false; this._curPort = null; this.emit('disconnect'); } }
}

// ── 진행자 식별 (오버레이 config.myName + PC별 안정 ID) ──────────────────────
function _stableOperatorId() {
  const seed = (os.hostname() || 'host') + '|' + ((os.userInfo && os.userInfo().username) || '');
  let h = 0; for (let i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) | 0; }
  return 'op_' + (h >>> 0).toString(36);
}
const OPERATOR_ID = _stableOperatorId();
function _operatorPayload() {
  return { name: _getOpName() || null, at: Date.now(), ver: BRIDGE_COMPAT_VER, app: 'overlay', appVer: _appVer || null };
}

// ── 상태 변수 ────────────────────────────────────────────────────────────────
const connector = new LockfileConnector();
let basePort = null, baseAuth = null;   // LCU 접속(포트 + Basic 인증 헤더)
let lastPhase = null, pollTimer = null, heartbeatTimer = null;
let activeIsCustom = null, eogSaved = false, gameInProgress = false, activeGameId = null;
let inGamePlayersFilled = false, _lastSess = null, _lastPickNames = [], lastSavedGameId = null;
let _running = false, _pollFailCount = 0;

// ── LCU 요청(Basic 인증) ─────────────────────────────────────────────────────
async function lcu(pathStr) {
  if (!basePort) throw new Error('no lcu');
  const r = await httpReq('GET', `https://127.0.0.1:${basePort}${pathStr}`, undefined, { Authorization: baseAuth });
  if (r.status >= 200 && r.status < 300) return r.data;
  throw new Error('lcu ' + r.status);
}

// ── 하트비트(프로세스 생존 신호 + 진행자 표시) ────────────────────────────────
function startHeartbeat() {
  if (heartbeatTimer) return;
  const beat = () => {
    fbSet(`${BRIDGE_ROOT}/heartbeat`, Date.now());                        // 레거시(구버전 웹 호환)
    fbSet(`${BRIDGE_ROOT}/operators/${OPERATOR_ID}`, _operatorPayload());  // 다중 진행자 표시
  };
  beat();
  heartbeatTimer = setInterval(beat, 5000);
}

// ── 챔피언 선택 수집 (EOG 이름 보완용) ───────────────────────────────────────
async function handleChampSelect() {
  try {
    const session = await lcu('/lol-champ-select/v1/session');
    const mapPlayer = p => ({
      cellId: p.cellId, champId: p.championId,
      name: p.riotIdGameName || p.summonerName || '',
      position: p.assignedPosition || '', rerolls: p.allowedRerolls ?? 2, isSelf: !!p.isSelf,
    });
    await fbSet(`${BRIDGE_ROOT}/champSelect`, {
      myTeam: (session.myTeam || []).map(mapPlayer),
      theirTeam: (session.theirTeam || []).map(mapPlayer),
      benchChampions: (session.benchChampions || []).map(c => ({ champId: c.championId })),
      timerPhase: session.timer?.phase || '', updatedAt: Date.now(),
    });
  } catch (_) {}
}

// ── 게임 종료 통계 수집 (핵심 — KDA·딜량·골드·증강·멀티킬) ─────────────────────
async function handleEndOfGame(abnormal = false) {
  if (eogSaved) return;
  try {
    const eog = await lcu('/lol-end-of-game/v1/eog-stats-block');
    if (!eog?.teams) return;
    const currentGameId = eog.gameId || null;
    if (currentGameId && currentGameId === lastSavedGameId) return;   // 직전 게임 재캡처 차단
    if (abnormal && activeGameId && currentGameId && currentGameId !== activeGameId) return;   // 비정상 경로 gameId 가드

    // 다른 브릿지/오버레이가 이미 저장했는지 (ETag)
    let _existingEtag = null;
    try {
      const { data: existing, etag } = await fbGetWithEtag(`${BRIDGE_ROOT}/eogStats`);
      _existingEtag = etag;
      if (existing && currentGameId && existing.gameId === currentGameId) { eogSaved = true; log('동일 gameId 이미 저장 — 건너뜀'); return; }
      if (existing?.savedAt && Date.now() - existing.savedAt < 30000 && !currentGameId) { eogSaved = true; log('EOG 이미 저장(gameId 미상) — 건너뜀'); return; }
    } catch (_) {}

    const winTeam = eog.teams.find(t => t.isWinningTeam);
    const winSide = winTeam?.teamId === 100 ? 'blue' : 'red';

    let champPickNames = {};
    try { champPickNames = (await fbGet(`${BRIDGE_ROOT}/lastChampPicks`)) || {}; } catch (_) {}

    const players = [];
    for (const team of eog.teams) {
      for (const p of (team.players || [])) {
        const s = p.stats || {};
        players.push({
          summonerName: p.riotIdGameName || p.summonerName || champPickNames[p.championId] || '',
          championId:   p.championId,
          championName: p.championName || p.skinName || '',
          kills:   s.CHAMPIONS_KILLED || 0,
          deaths:  s.NUM_DEATHS || 0,
          assists: s.ASSISTS || 0,
          damage:  s.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0,
          gold:    s.GOLD_EARNED || 0,
          cs:      (s.MINIONS_KILLED || 0) + (s.NEUTRAL_MINIONS_KILLED || 0),
          teamId:  team.teamId,
          isWin:   !!team.isWinningTeam,
          items:   [s.ITEM0, s.ITEM1, s.ITEM2, s.ITEM3, s.ITEM4, s.ITEM5].filter(i => i > 0),
          augments: Object.keys(s).filter(k => /^PLAYER_AUGMENT_\d+$/.test(k))
            .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0])).map(k => s[k]).filter(i => i > 0),
          doubleKills: s.DOUBLE_KILLS || 0, tripleKills: s.TRIPLE_KILLS || 0,
          quadraKills: s.QUADRA_KILLS || 0, pentaKills: s.PENTA_KILLS || 0,
          firstBlood: (s.FIRST_BLOOD_KILL || 0) === 1,
        });
      }
    }

    // 🎮 일반게임(비커스텀)은 내전 EOG 흐름 오염 방지 위해 normal_matches 로 분리 (gameId 키 = 다중 캡처 중복 없음)
    if (activeIsCustom === false) {
      let season = null;
      try { const sv = await fbGet('config/currentSeason'); season = (sv != null) ? Number(sv) : null; } catch (_) {}
      const gid = currentGameId || ('g' + Date.now());
      await fbSet(`normal_matches/${gid}`, { gameId: currentGameId || null, ts: Date.now(), season, gameTime: eog.gameLength || 0, winSide, players });
      eogSaved = true;
      if (currentGameId) lastSavedGameId = currentGameId;
      log(`🎮 일반게임 기록 저장 (normal_matches/${gid}, ${players.length}명)`);
      return;
    }

    // 내전 EOG — ETag 조건부 PUT(다른 브릿지가 먼저 쓰면 412 → skip)
    const _eogPayload = { players, winSide, gameId: eog.gameId || null, gameTime: eog.gameLength || 0, savedAt: Date.now() };
    let _writeResult;
    try { _writeResult = await fbSetIfMatch(`${BRIDGE_ROOT}/eogStats`, _eogPayload, _existingEtag); }
    catch (e) { log('⚠️ EOG 저장 실패 — 일반 PUT 폴백'); await fbSet(`${BRIDGE_ROOT}/eogStats`, _eogPayload); _writeResult = { ok: true }; }
    if (_writeResult && _writeResult.conflict) { eogSaved = true; log('다른 브릿지가 먼저 저장(ETag 충돌) — 건너뜀'); return; }

    await fbSet(`${BRIDGE_ROOT}/voteStarted`, Date.now());
    eogSaved = true; lastSavedGameId = currentGameId;
    log(`게임 종료 저장 ✅ 승리: ${winSide === 'blue' ? '🔵 1팀' : '🔴 2팀'} · 투표 시작 신호 전송`);
  } catch (_) {}
}

// ── 진행 중 참가자 명단 (Live Client 1순위 → champSelect → gameflow) ──────────
async function updateInGamePlayers(initial = false) {
  if (!gameInProgress || inGamePlayersFilled) return;
  const live = await liveGamePlayerNames();
  if (live.length) {
    await fbSet(`${BRIDGE_ROOT}/inGame`, { isCustom: activeIsCustom, players: live, at: Date.now() });
    inGamePlayersFilled = true; log(`🎮 진행 중 명단 ${live.length}명 (liveclient)`); return;
  }
  if (!initial) return;
  let names = [], src = 'none';
  if (_lastPickNames.length) { names = _lastPickNames.slice(); src = 'champSelect'; }
  else if (_lastSess) {
    try {
      const teams = [ ...((_lastSess?.gameData?.teamOne) || []), ...((_lastSess?.gameData?.teamTwo) || []) ];
      names = teams.map(p => String(p.summonerName || p.gameName || (typeof p.riotId === 'string' ? p.riotId.split('#')[0] : '') || '').trim()).filter(Boolean);
      src = 'gameflow';
    } catch (_) {}
  }
  await fbSet(`${BRIDGE_ROOT}/inGame`, { isCustom: activeIsCustom, players: names, at: Date.now() });
  if (names.length) log(`🎮 진행 중 명단(임시) ${names.length}명 (${src})`);
}

// ── 게임 페이즈 폴링 (3초) ───────────────────────────────────────────────────
async function poll() {
  if (!basePort) return;
  try {
    const phase = await lcu('/lol-gameflow/v1/gameflow-phase');
    _pollFailCount = 0;
    if (phase !== lastPhase) {
      log(`페이즈: ${lastPhase ?? '-'} → ${phase}`);
      lastPhase = phase;
      if (phase !== 'GameStart' && phase !== 'InProgress') { inGamePlayersFilled = false; fbSet(`${BRIDGE_ROOT}/inGame`, null); }
      switch (phase) {
        case 'ChampSelect':
          await fbSet(`${BRIDGE_ROOT}/gamePhase`, 'ChampSelect'); break;
        case 'GameStart':
        case 'InProgress':
          gameInProgress = true; inGamePlayersFilled = false; _lastPickNames = [];
          try {
            const _sess = await lcu('/lol-gameflow/v1/session');
            if (_sess?.gameData?.gameId) activeGameId = _sess.gameData.gameId;
            if (_sess?.gameData) activeIsCustom = !!_sess.gameData.isCustomGame;
            _lastSess = _sess;
          } catch (_) {}
          await fbSet(`${BRIDGE_ROOT}/gamePhase`, 'InProgress');
          try {
            const picks = await fbGet(`${BRIDGE_ROOT}/champSelect`);
            if (picks) {
              const pickMap = {};
              for (const p of [...(picks.myTeam || []), ...(picks.theirTeam || [])]) { if (p.champId && p.name) pickMap[p.champId] = p.name; }
              if (Object.keys(pickMap).length) { await fbSet(`${BRIDGE_ROOT}/lastChampPicks`, pickMap); _lastPickNames = Object.values(pickMap).filter(Boolean); }
            }
          } catch (_) {}
          await fbSet(`${BRIDGE_ROOT}/champSelect`, null);
          await updateInGamePlayers(true);
          break;
        case 'PreEndOfGame':
        case 'WaitingForStats':
        case 'EndOfGame':
          await fbSet(`${BRIDGE_ROOT}/gamePhase`, 'EndOfGame'); await handleEndOfGame(); break;
        case 'Reconnect':
          await fbSet(`${BRIDGE_ROOT}/gamePhase`, gameInProgress ? 'EndOfGame' : 'Reconnect');
          if (gameInProgress && !eogSaved) await handleEndOfGame(true); break;
        case 'None': case 'Lobby': case 'Matchmaking': case 'ReadyCheck':
          if (gameInProgress && !eogSaved && (phase === 'None' || phase === 'Lobby')) await handleEndOfGame(true);
          await fbSet(`${BRIDGE_ROOT}/gamePhase`, phase);
          await fbSet(`${BRIDGE_ROOT}/champSelect`, null);
          if (['None', 'Lobby'].includes(phase)) { eogSaved = false; gameInProgress = false; activeGameId = null; activeIsCustom = null; }
          break;
      }
    }
    if (phase === 'ChampSelect') await handleChampSelect();
    if (gameInProgress && !eogSaved && ['EndOfGame', 'PreEndOfGame', 'WaitingForStats', 'Reconnect'].includes(phase))
      await handleEndOfGame(phase === 'Reconnect');
    if (gameInProgress && !inGamePlayersFilled && (phase === 'InProgress' || phase === 'GameStart'))
      await updateInGamePlayers(false);
  } catch (_) {
    _pollFailCount++;
    if (_pollFailCount >= 4) { _pollFailCount = 0; log('⚠️ LCU 응답 없음(연속) — 연결 재설정'); connector.forceReset(); }
  }
}

// ── LCU 연결 이벤트 ──────────────────────────────────────────────────────────
connector.on('connect', async data => {
  basePort = data.port;
  baseAuth = 'Basic ' + Buffer.from(`${data.username}:${data.password}`).toString('base64');
  log('롤 클라이언트 연결됨 ✅');
  try { const me = await lcu('/lol-summoner/v1/current-summoner'); log(`접속 계정: ${me.displayName || me.gameName || ''}`); } catch (_) {}
  await fbSet(`${BRIDGE_ROOT}/connected`, true);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, 3000); poll();
});
connector.on('disconnect', async () => {
  log('롤 클라이언트 종료 — 재연결 대기');
  if (gameInProgress && !eogSaved) log('⚠️ 게임 중 클라 종료 — 자동 저장 불가. 홈페이지 수동 승리팀 선택으로 진행하세요.');
  basePort = null; baseAuth = null; lastPhase = null; eogSaved = false;
  gameInProgress = false; activeGameId = null; activeIsCustom = null;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  await fbSet(`${BRIDGE_ROOT}/connected`, false);
  await fbSet(`${BRIDGE_ROOT}/inGame`, null);
});

// ── 시작/종료 ────────────────────────────────────────────────────────────────
async function start(opts) {
  if (_running) return;
  _running = true;
  _log       = (opts && opts.log)            || (() => {});
  _getOpName = (opts && opts.getOperatorName) || (() => null);
  _appVer    = (opts && opts.appVer)          || '';
  log('내장 브릿지 시작 — LCU 감지 대기');
  startHeartbeat();
  connector.start();
}
// 종료 정리 — connected/operators/inGame 노드 정리(안 하면 홈페이지가 최대 120초간 "연결중" 표시). best-effort.
function stop() {
  if (!_running) return;
  _running = false;
  connector.stop();
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  fbSet(`${BRIDGE_ROOT}/connected`, false);
  fbSet(`${BRIDGE_ROOT}/inGame`, null);
  fbSet(`${BRIDGE_ROOT}/operators/${OPERATOR_ID}`, null);
}

module.exports = { start, stop };

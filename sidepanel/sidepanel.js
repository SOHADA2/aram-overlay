// ── 왼쪽 사이드 패널 — 프로필/기록/랭킹 (desktop.js 렌더 재사용) ─────────────
const $ = id => document.getElementById(id);

// 🌌 헥스텍 배경(desktop.js buildHexfield 이식)
(function buildHexfield() {
  const NS = 'http://www.w3.org/2000/svg';
  const VB_W = 900, VB_H = 1300, R = 30, w = R * 0.8660254, dy = 1.5 * R, dx = 2 * w;
  const cols = Math.ceil(VB_W / dx) + 2, rows = Math.ceil(VB_H / dy) + 2;
  const V = (cx, cy) => ({ top: [cx, cy - R], ur: [cx + w, cy - R / 2], lr: [cx + w, cy + R / 2], bot: [cx, cy + R], ll: [cx - w, cy + R / 2], ul: [cx - w, cy - R / 2] });
  const cxcy = (i, j) => [i * dx + ((j & 1) ? w : 0), j * dy];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'hexfield'); svg.setAttribute('preserveAspectRatio', 'xMidYMid slice'); svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  const kkey = p => Math.round(p[0]) + ',' + Math.round(p[1]);
  const coord = {}, adj = {};
  const addEdge = (a, b) => { const ka = kkey(a), kb = kkey(b); coord[ka] = a; coord[kb] = b; (adj[ka] = adj[ka] || new Set()).add(kb); (adj[kb] = adj[kb] || new Set()).add(ka); };
  let gridD = '';
  for (let j = -1; j < rows; j++) for (let i = -1; i < cols; i++) {
    const [cx, cy] = cxcy(i, j); const v = V(cx, cy);
    gridD += `M${v.top}L${v.ur}L${v.lr}L${v.bot}L${v.ll}L${v.ul}Z`;
    addEdge(v.top, v.ur); addEdge(v.ur, v.lr); addEdge(v.lr, v.bot); addEdge(v.bot, v.ll); addEdge(v.ll, v.ul); addEdge(v.ul, v.top);
  }
  const grid = document.createElementNS(NS, 'path'); grid.setAttribute('class', 'hex-grid-path'); grid.setAttribute('d', gridD); svg.appendChild(grid);
  const cx0 = VB_W * 0.5, cy0 = VB_H * 0.32, rxv = VB_W * 0.40, ryv = VB_H * 0.40;
  const central = key => { const c = coord[key]; const nx = (c[0] - cx0) / rxv, ny = (c[1] - cy0) / ryv; return nx * nx + ny * ny <= 1; };
  const starts = Object.keys(adj).filter(central);
  const walk = steps => { let cur = starts[Math.floor(Math.random() * starts.length)], prev = null; const path = [coord[cur]]; for (let s = 0; s < steps; s++) { const nbrs = [...adj[cur]].filter(x => x !== prev); if (!nbrs.length) break; const nx = nbrs[Math.floor(Math.random() * nbrs.length)]; prev = cur; cur = nx; path.push(coord[cur]); } return path; };
  if (starts.length) for (let n = 0; n < 3; n++) {
    const path = walk(6 + Math.floor(Math.random() * 6)); if (path.length < 3) continue;
    const d = 'M' + path.map(p => p.join(',')).join('L');
    const wire = document.createElementNS(NS, 'path'); wire.setAttribute('class', 'route-wire'); wire.setAttribute('d', d); svg.appendChild(wire);
    const pulse = document.createElementNS(NS, 'path'); pulse.setAttribute('class', 'route-pulse'); pulse.setAttribute('d', d); pulse.setAttribute('pathLength', '100');
    pulse.style.animationDuration = (4.5 + Math.random() * 3).toFixed(2) + 's'; pulse.style.animationDelay = (Math.random() * 3).toFixed(2) + 's'; svg.appendChild(pulse);
    path.forEach(p => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'route-node'); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', '1.7'); svg.appendChild(c); });
  }
  const bg = document.querySelector('.bg'); if (bg) bg.appendChild(svg);
})();

$('s-close').addEventListener('click', () => window.api.sideClose());

// ── 로그인 상태(로그인 ↔ 내 정보) ─────────────────────────────────────────
let _rosterNames = [], _myName = '', _isHost = false, _lpMap = {};
// LP 실시간 갱신(티어 배지) — 팀짜기 탭 보고 있으면 배지도 다시 그림
if (window.api.onPlayers) window.api.onPlayers(({ lpMap }) => {
  if (!lpMap) return;
  _lpMap = lpMap;
  if (_curCat === 'team' && $('tb-pick') && $('tb-pick').style.display !== 'none') tbRenderList();
});
function showLogin() {
  $('s-login').style.display = 'flex'; $('s-app').style.display = 'none';
  $('s-ttl').style.display = ''; $('s-me').style.display = 'none'; $('s-host-box').style.display = 'none'; $('s-change').style.display = 'none';
  $('s-wallet').style.display = 'none';
  const sp = $('s-sp'); if (sp) sp.style.display = '';
}
function showLogged() {
  $('s-login').style.display = 'none'; $('s-app').style.display = 'flex';
  $('s-ttl').style.display = 'none';
  $('s-me').style.display = 'none';   // 아이디는 클라 옆이라 생략(사장님) — 대신 재화 표시
  $('s-wallet').style.display = '';
  const sp = $('s-sp'); if (sp) sp.style.display = 'none';   // 재화가 flex:1로 공간 사용
  updateWallet();
  $('s-host-box').style.display = ''; $('s-host').checked = _isHost;
  $('s-change').style.display = '';
  $('s-rail-team').style.display = _isHost ? '' : 'none';
  switchCat(_isHost && _curCat === 'team' ? 'team' : 'profile');
}
// 🪙 상단 재화(골드·뽑기코인·투기장코인) — 탭 전환/60초마다 갱신
async function updateWallet() {
  if (!window.api.getWallet) return;
  const w = await window.api.getWallet().catch(() => null);
  if (!w || !w.ok) return;
  $('s-wallet').innerHTML = `<b class="sw-g">🪙 ${w.gold.toLocaleString()}</b>${w.claw ? `<span>🕹️ ${w.claw}</span>` : ''}${w.arena ? `<span>🗡️ ${w.arena}</span>` : ''}`;
}
// 소비/획득 직후 골드 즉시 반영(응답의 잔여 골드로 · fetch 없이) → 상단 재화바 바로바로 갱신
function setWalletGold(gold) {
  if (typeof gold !== 'number') { updateWallet(); return; }
  const w = $('s-wallet'); const g = w && w.querySelector('.sw-g');
  if (g) g.textContent = `🪙 ${gold.toLocaleString()}`; else updateWallet();
}

// ── 레일 전환 ────────────────────────────────────────────────────────────
let _curCat = 'profile';
function renderCat(cat, silent) {
  if (cat === 'profile') renderProfile(silent);
  else if (cat === 'records') renderRecords(silent);
  else if (cat === 'ranking') renderRanking(silent);
  else if (cat === 'shop') renderShop(silent);
  else if (cat === 'gacha') renderGacha(silent);
  else if (cat === 'pass') renderPass(silent);
  else if (cat === 'team') tbRenderList();   // 진행 중 단계(run/done)는 건드리지 않음
  // 복권·대장간은 홈 임베드가 표시(hpEmbedFor) — 네이티브 렌더 스킵
}
function switchCat(cat) {
  _curCat = cat;
  updateWallet();
  hpEmbedFor(cat);   // 🌐 복권/대장간 = 홈페이지 임베드 표시 토글
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
  document.querySelectorAll('.cat-view').forEach(v => { v.style.display = (v.id === 'cat-' + cat) ? 'flex' : 'none'; });
  renderCat(cat, false);
}

// ── 🎟🔨 복권·대장간 = 홈페이지 임베드(단일 webview·persist:aram) — 오른 3D·긁기 모션·유미·로봇·아이템 100% 홈 그대로 ──
const HP_URL = 'https://sohada2.github.io/aram/';
const HP_GOTO = {
  lottery: "(function(){ if(typeof window.openLotteryHub==='function'){ window.openLotteryHub(); return true; } return false; })()",
  forge: "(function(){ try{ if(typeof window.closeLotteryHub==='function') window.closeLotteryHub(); }catch(e){} var b=document.querySelector('.nav-tab-shop'); if(typeof window.showTab==='function'&&b){ window.showTab('tab-shop', b); setTimeout(function(){ try{ if(typeof window.gotoForgeTab==='function') window.gotoForgeTab(); else if(typeof window.switchShopCat==='function') window.switchShopCat('pass'); }catch(e){} }, 350); return true; } return false; })()",
};
let _hpWv = null, _hpReady = false;
function ensureHpWv() {
  if (_hpWv) return;
  const host = $('hp-embed'); if (!host) return;
  _hpWv = document.createElement('webview');
  _hpWv.setAttribute('partition', 'persist:aram');   // 홈창(Shift+F6)과 같은 세션 — 닉네임 1회 선택이면 공유
  _hpWv.setAttribute('allowpopups', '');
  _hpWv.src = HP_URL;
  _hpWv.addEventListener('dom-ready', () => {
    _hpReady = true;
    try {   // 홈 크롬 제거 → 복권·대장간 "그 화면만" 패널에 꽉 차게(네이티브처럼)
      _hpWv.insertCSS('header,.corner-badges-left,.live-mode-bar,#my-info-bar,.nav-tabs,footer,#attend-coach{display:none!important}'
        + 'body{padding-top:4px!important}'
        + '.lh-close{display:none!important}');
    } catch (_) {}
  });
  _hpWv.addEventListener('did-stop-loading', () => { const l = $('hp-load'); if (l) l.style.display = 'none'; });
  host.appendChild(_hpWv);
}
// 🐶 복권 탭 워치독 — 허브가 닫히면 다시 열어 "복권 화면 고정"(긁기/구매확인/로봇/쓰레기통 모달 중엔 개입 안 함)
setInterval(() => {
  if (_curCat !== 'lottery' || !_hpReady || !_hpWv) return;
  try {
    _hpWv.executeJavaScript("!!document.querySelector('.lh-overlay,.scard-overlay,.trash-overlay,[class*=\"abot\"],[class*=\"buy-confirm\"]')", false)
      .then(busy => { if (!busy) hpGoto('lottery', 39); }).catch(() => {});
  } catch (_) {}
}, 1500);
function hpGoto(target, tries) {
  const js = HP_GOTO[target]; if (!js) return;
  tries = tries || 0;
  const retry = () => { if (tries < 40 && _curCat === target) setTimeout(() => hpGoto(target, tries + 1), 500); };
  if (!_hpReady) { retry(); return; }
  try { _hpWv.executeJavaScript(js, false).then(ok => { if (!ok) retry(); }).catch(retry); } catch (_) { retry(); }
}
function hpEmbedFor(cat) {
  const host = $('hp-embed'); if (!host) return;
  const emb = cat === 'lottery' || cat === 'forge';
  host.style.display = emb ? 'flex' : 'none';
  if (!emb) return;
  ensureHpWv();
  if (_hpWv) { _hpWv.style.height = '99.99%'; requestAnimationFrame(() => { if (_hpWv) _hpWv.style.height = '100%'; }); }   // 뷰포트 고착 해제(홈창 quirk)
  hpGoto(cat, 0);
}
document.querySelectorAll('.rail-btn').forEach(b => b.addEventListener('click', () => switchCat(b.dataset.cat)));

// ── 로그인(입장) + 방장 체크 ──────────────────────────────────────────────
const esel = $('s-entry-name');
esel.addEventListener('change', () => { $('s-entry-go').disabled = !esel.value; });
$('s-entry-go').addEventListener('click', () => {
  if (!esel.value) return;
  _myName = esel.value; window.api.setMyName(_myName);
  showLogged();
});
$('s-change').addEventListener('click', showLogin);
$('s-host').addEventListener('change', () => {
  _isHost = $('s-host').checked;
  window.api.setHost(_isHost);
  $('s-rail-team').style.display = _isHost ? '' : 'none';
  if (_isHost) switchCat('team'); else if (_curCat === 'team') switchCat('profile');
});

// ── ⚔️ 팀 짜기(방장 전용) — 홈페이지와 완전 연동(desktop.js 이식) ───────────
const _tbChecked = new Set(JSON.parse(localStorage.getItem('tbChecked') || '[]'));
// 티어 메타(홈 S1_TIER_META 색·순위) — 칩 배지용
const TB_TIER = {
  unranked: ['언랭', '#8a94a6', -1], bronze: ['브론즈', '#f0a040', 0], silver: ['실버', '#b8c8dc', 1], gold: ['골드', '#ffc030', 2],
  platinum: ['플래티넘', '#18dece', 3], diamond: ['다이아', '#60a0ff', 4], master: ['마스터', '#c055ff', 5], grandmaster: ['그마', '#ff4a4a', 6], challenger: ['챌린저', '#ffe040', 7],
};
const _tbNorm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
function _tbBadge(name) {   // 홈 member-chip-tier와 동일 분기: 배치 N/5 / 승급전 / 티어 NLP
  const r = _lpMap[_tbNorm(name)];
  if (!r || r.placementDone === false) return `<span class="tb-badge" style="color:#8a94a6">배치 ${(r && r.placementGames) || 0}/5</span>`;
  const t = TB_TIER[r.tier] || TB_TIER.unranked;
  if (r.promoActive) return `<span class="tb-badge" style="color:${t[1]}">승급전</span>`;
  return `<span class="tb-badge" style="color:${t[1]}">${t[0]} ${r.lp || 0}LP</span>`;
}
function tbRenderList() {
  const list = $('tb-list');
  const sorted = [..._rosterNames].sort((a, b) => {   // 홈처럼 티어→LP 높은 순
    const ra = _lpMap[_tbNorm(a)] || {}, rb = _lpMap[_tbNorm(b)] || {};
    const ta = (TB_TIER[ra.tier] || TB_TIER.unranked)[2], tb2 = (TB_TIER[rb.tier] || TB_TIER.unranked)[2];
    return tb2 - ta || (rb.lp || 0) - (ra.lp || 0) || a.localeCompare(b, 'ko');
  });
  list.innerHTML = sorted.map(n => {
    const e = n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return `<div class="tb-item${_tbChecked.has(n) ? ' on' : ''}" data-name="${e}" title="${e}"><div class="tb-check"></div><span class="tb-nm">${e}</span></div>`;   // LP 배지 제거 — 이름 온전히(사장님 요청)
  }).join('');
  tbSync();
}
{ const tc = $('tb-clear'); if (tc) tc.onclick = () => { _tbChecked.clear(); localStorage.setItem('tbChecked', '[]'); tbRenderList(); }; }   // 전체 선택 해제
// 드래그 선택(홈 initDragSelect 이식·데스크톱=마우스만): 누른 칩의 반대 상태를 목표로, 지나는 칩 전부 적용
(function tbDragSelect() {
  const list = $('tb-list');
  let drag = null;   // { target: bool, done: Set }
  const apply = chip => {
    if (!chip || !drag || drag.done.has(chip)) return;
    drag.done.add(chip);
    const name = chip.dataset.name && chip.dataset.name.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    if (!name) return;
    if (drag.target) _tbChecked.add(name); else _tbChecked.delete(name);
    chip.classList.toggle('on', drag.target);
  };
  list.addEventListener('mousedown', e => {
    const chip = e.target.closest('.tb-item'); if (!chip) return;
    e.preventDefault();
    drag = { target: !chip.classList.contains('on'), done: new Set() };
    apply(chip);
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    apply(document.elementFromPoint(e.clientX, e.clientY)?.closest('.tb-item'));
  });
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    drag = null;
    localStorage.setItem('tbChecked', JSON.stringify([..._tbChecked]));
    tbSync();
  });
})();
function tbSync() {
  const n = _tbChecked.size;
  $('tb-num').textContent = n;
  $('tb-go').disabled = n < 4;
  $('tb-go').textContent = n < 4 ? `⚔️ 팀 구성 (최소 4명 · 현재 ${n}명)` : `⚔️ 팀 구성 — ${n}명 (아이템 15초 후 발표)`;
}
function tbShow(step) {
  $('tb-pick').style.display = step === 'pick' ? '' : 'none';
  $('tb-run').style.display = step === 'run' ? '' : 'none';
  $('tb-done').style.display = step === 'done' ? '' : 'none';
  if (step !== 'error') $('tb-err').style.display = 'none';
}
$('tb-go').addEventListener('click', async () => {
  const mode = document.querySelector('input[name=tb-mode]:checked')?.value || 'balance';
  $('tb-go').disabled = true;
  const r = await window.api.tbStart([..._tbChecked], mode);
  if (!r || !r.ok) { $('tb-err').textContent = '⚠️ ' + ((r && r.err) || '시작 실패'); $('tb-err').style.display = ''; $('tb-go').disabled = false; return; }
  tbShow('run');
});
$('tb-skip').addEventListener('click', () => window.api.tbSkip());
$('tb-again').addEventListener('click', () => { tbShow('pick'); tbRenderList(); });
window.api.onTeamBuild(d => {
  if (!d) return;
  if (d.state === 'countdown') { tbShow('run'); $('tb-left').textContent = d.left; }
  else if (d.state === 'building') { $('tb-left').textContent = '0'; }
  else if (d.state === 'done') {
    tbShow('done');
    const row = (label, arr, cls) => `<div class="tbr ${cls}"><b>${label}</b><span>${arr.map(n => n.replace(/</g, '&lt;')).join(' · ')}</span></div>`;
    $('tb-result').innerHTML = row('1팀', d.teamA, 'a') + row('2팀', d.teamB, 'b') +
      (d.spectators && d.spectators.length ? row('👁 관전', d.spectators, 's') : '') +
      `<div class="tbr-ok">✅ 팀 발표 완료 — 홈페이지·오버레이 모두에 떴어요</div>`;
  }
  else if (d.state === 'error') { tbShow('pick'); $('tb-err').textContent = '⚠️ ' + d.err; $('tb-err').style.display = ''; $('tb-go').disabled = false; }
});
window.api.onVersion(v => { const e = $('s-ver'); if (e) e.textContent = v ? '버전 ' + v : ''; });

// ── 렌더(desktop.js와 동일) ──────────────────────────────────────────────────
const escH = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SYN_NAMES = { warrior: ['검을 뽑아라', '⚔️'], marksman: ['탄환 세례', '🎯'], assassin: ['그림자 주자', '🌑'], ionia: ['검무', '🌸'], shurima: ['나는 왕이다', '👑'], tank: ['강철 심장', '🛡️'], demacia: ['여명의 의지', '☀️'], bilgewater: ['해적의 보물', '🏴‍☠️'], support: ['신성한 개입', '💚'], mage: ['유레카', '🎲'], void: ['공허 균열', '🌀'] };
let _ddVer = '14.24.1';
const ddImg = champ => `https://ddragon.leagueoflegends.com/cdn/${_ddVer}/img/champion/${String(champ || '').replace(/[^A-Za-z0-9]/g, '')}.png`;
function champCard(cls, label, c) {
  if (!c) return `<div class="pf-champ"><div class="pf-champ-l">${label}</div><div class="pf-champ-empty">기록 없음</div></div>`;
  const wr = c.games ? Math.round(c.wins / c.games * 100) : 0;
  return `<div class="pf-champ"><div class="pf-champ-l ${cls}">${label}</div>`
    + `<div class="pf-champ-row"><img class="pf-cimg" src="${ddImg(c.champ)}" onerror="this.style.visibility='hidden'"><div class="pf-champ-info"><b>${escH(c.champ)}</b><small>${c.games}판 ${c.wins}승 ${c.games - c.wins}패 · ${wr}%</small></div></div></div>`;
}
async function renderProfile(silent) {
  const el = $('pf-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getProfile();
  if (!r || !r.ok) { if (!silent) el.innerHTML = `<div class="cat-empty">${escH((r && r.err) || '프로필을 불러오지 못했어요')}</div>`; return; }
  if (r.ddVer) _ddVer = r.ddVer;
  const p = r.profile, lp = p.lp, a = p.arena;
  const tc = lp ? (TB_TIER[lp.tier] || TB_TIER.unranked)[1] : TB_TIER.unranked[1];   // 티어 색(홈 S1_TIER_META)
  const lpHtml = lp
    ? `<span class="pf-tier" style="background:${tc}">${lp.tierKr}</span><span class="pf-lpn" style="color:${tc}">${lp.placementDone ? lp.lp + ' LP' : '배치 ' + lp.placementGames + '/5'}</span>${lp.promoActive ? `<span class="pf-promo">승급전 ${lp.promoWins}승 ${lp.promoLosses}패</span>` : ''}`
    : `<span class="pf-tier">배치</span><span class="pf-lpn">기록 없음</span>`;
  // LP 바(홈 s1LpBarHtml 톤) — 정규전만(배치/승급전/챌린저=무제한 제외)
  const lpBar = (lp && lp.placementDone && !lp.promoActive && lp.tier !== 'challenger')
    ? `<div class="pf-lpbar"><i style="width:${Math.min(100, lp.lp)}%;background:${tc}"></i></div>` : '';
  const form = a.form.length ? a.form.map(w => `<i class="pf-dot ${w ? 'w' : 'l'}">${w ? 'W' : 'L'}</i>`).join('') : '<span class="pf-dim">아직 경기 없음</span>';
  const syn = (p.synergy && SYN_NAMES[p.synergy.sid]) ? `<div class="pf-line"><span class="pf-k">🃏 시너지</span><span class="pf-v">${SYN_NAMES[p.synergy.sid][0]} <em>${p.synergy.tier}성</em></span></div>` : '';
  const em = p.emblem ? `<div class="pf-line"><span class="pf-k">⚒️ 강철심장</span><span class="pf-v">${p.emblem.nick ? escH(p.emblem.nick) : '+' + p.emblem.level} · 성능 ${p.emblem.power} · <em>${p.emblem.grade}</em></span></div>` : '';
  const bd = p.buddy ? `<div class="pf-line"><span class="pf-k">🧸 단짝</span><span class="pf-v">${escH(p.buddy.champion)} · 함께 ${p.buddy.count}회${p.buddy.streakCount > 1 ? ` · ${p.buddy.streakType === 'win' ? '🔥' : '💧'}${p.buddy.streakCount}` : ''}</span></div>` : '';
  el.innerHTML =
    `<div class="pf-hero"><div class="pf-name">${escH(p.name)}</div><div class="pf-lp">${lpHtml}</div>${lpBar}</div>`
    + `<div class="pf-form">${form}</div>`
    + `<div class="pf-stats"><div class="pf-s"><b>${a.wins}</b><span>승</span></div><div class="pf-s"><b>${a.losses}</b><span>패</span></div><div class="pf-s"><b class="pf-wr">${a.winrate}%</b><span>승률</span></div><div class="pf-s"><b>${a.games}</b><span>경기</span></div></div>`
    + `<div class="pf-gold">누적 <b>+${a.matchGold}G</b> · 판당 <b>+${a.avgGold}G</b>${a.mvp ? ` · 🏆 ${a.mvp}` : ''}${a.manner ? ` · 💎 ${a.manner}` : ''}</div>`
    + `<div class="pf-champs">${champCard('most', '🔥 MOST', p.champs.most)}${champCard('best', '⭐ BEST', p.champs.best)}</div>`
    + (em || syn || bd ? `<div class="pf-loadout">${em}${syn}${bd}</div>` : '');
}
// ── 📋 기록 — 홈처럼 필터(시즌2/시즌1/일반게임/막고라) + 행 클릭=상세(참가자 스탯) ──
let _rcFilter = 's2', _rcOpen = new Set();
const _fmtD = ts => { const d = new Date(ts || 0); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function _rcDetailRows(list, winner, side) {
  return list.map(p => {
    const img = p.champ ? `<img class="rc-cimg s" src="${ddImg(p.champ)}" onerror="this.style.visibility='hidden'">` : '<span class="rc-cimg s"></span>';
    const st = (p.k != null && p.champ) ? `<span class="rc-kda">${p.k}/${p.d}/${p.a}</span><span class="rc-dmg">${(p.dmg || 0).toLocaleString()}</span>` : '<span class="rc-dmg">기록 없음</span>';
    return `<div class="rc-dp ${winner === side ? 'w' : ''}">${img}<span class="rc-dp-nm">${escH(p.name)}</span>${st}</div>`;
  }).join('');
}
async function renderRecords(silent) {
  const el = $('rc-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getRecords(_rcFilter);
  if (!r || !r.ok) { if (!silent) el.innerHTML = '<div class="cat-empty">기록을 불러오지 못했어요</div>'; return; }
  if (r.ddVer) _ddVer = r.ddVer;
  const seg = [['s2', '내전'], ['normal', '일반'], ['magolla', '막고라']]
    .map(([k, l]) => `<button class="rc-seg${_rcFilter === k ? ' on' : ''}" data-rcf="${k}">${l}</button>`).join('');
  let body;
  if (!r.records.length) body = '<div class="cat-empty">기록이 아직 없어요</div>';
  else if (_rcFilter === 'magolla') {
    body = r.records.map(m => {
      const bets = m.bets.map(b => `<div class="rc-dp"><span class="rc-dp-nm">${escH(b.name)}</span><span class="rc-dmg">${escH(b.pick)} 예측 · ${b.amount}G → ${b.payout >= 0 ? '+' : ''}${b.payout}G</span></div>`).join('') || '<div class="rc-dp"><span class="rc-dmg">베팅 없음</span></div>';
      return `<div class="rc-row"><div class="rc-top"><span class="rc-res w">⚔️</span><span class="rc-mgf">${escH(m.f1)} <i>vs</i> ${escH(m.f2)}</span><span class="rc-size">승자 ${escH(m.winner)}</span><span class="rc-date">${_fmtD(m.ts)}</span></div><div class="rc-det open">${bets}</div></div>`;
    }).join('');
  } else if (_rcFilter === 'normal') {
    body = r.records.map((m, i) => {
      const open = _rcOpen.has('n' + i);
      const det = m.players.map(p => `<div class="rc-dp ${p.win ? 'w' : ''}">${p.champ ? `<img class="rc-cimg s" src="${ddImg(p.champ)}" onerror="this.style.visibility='hidden'">` : ''}<span class="rc-dp-nm">${escH(p.name)}</span><span class="rc-kda">${p.k}/${p.d}/${p.a}</span><span class="rc-dmg">${(p.dmg || 0).toLocaleString()}</span></div>`).join('');
      return `<div class="rc-row rc-click" data-rck="n${i}"><div class="rc-top"><span class="rc-res n">일반</span><span class="rc-size">${Math.round((m.gameTime || 0) / 60)}분</span><span class="rc-date">${_fmtD(m.ts)}</span><span class="rc-chev">${open ? '▴' : '▾'}</span></div><div class="rc-det${open ? ' open' : ''}">${det}</div></div>`;
    }).join('');
  } else {
    body = r.records.map((m, i) => {
      const key = 'c' + i, open = _rcOpen.has(key);
      const blueWon = m.winner === 'blue';
      const res = m.mine ? (m.won ? '<span class="rc-res w">승</span>' : '<span class="rc-res l">패</span>') : '<span class="rc-res n">관전</span>';
      const kda = m.kda ? `<span class="rc-kda">${m.kda.k}/${m.kda.d}/${m.kda.a}</span>` : '';
      const champ = m.myChamp ? `<img class="rc-cimg" src="${ddImg(m.myChamp)}" onerror="this.style.visibility='hidden'">` : '';
      const awards = [m.mvpW && `🏆 ${escH(m.mvpW)}`, m.mvpL && `⭐ ${escH(m.mvpL)}`, (m.mannerW || m.mannerL) && `💎 ${[m.mannerW, m.mannerL].filter(Boolean).map(escH).join('·')}`].filter(Boolean).join(' · ');
      const det = `<div class="rc-dt">${blueWon ? '🏆 ' : ''}1팀</div>${_rcDetailRows(m.detailA, m.winner, 'blue')}<div class="rc-dt">${!blueWon ? '🏆 ' : ''}2팀</div>${_rcDetailRows(m.detailB, m.winner, 'red')}${awards ? `<div class="rc-aw">${awards}</div>` : ''}`;
      const tA = `<span class="rc-team ${blueWon ? 'win' : ''}">${m.teamA.map(escH).join(', ')}</span>`;
      const tB = `<span class="rc-team ${!blueWon ? 'win' : ''}">${m.teamB.map(escH).join(', ')}</span>`;
      return `<div class="rc-row rc-click ${m.mine ? (m.won ? 'mine-w' : 'mine-l') : ''}" data-rck="${key}"><div class="rc-top">${champ}${res}${kda}<span class="rc-size">${m.size}:${m.size} · </span><span class="rc-date">${_fmtD(m.ts)}</span><span class="rc-chev">${open ? '▴' : '▾'}</span></div><div class="rc-teams">${tA}<span class="rc-vs">vs</span>${tB}</div><div class="rc-det${open ? ' open' : ''}">${det}</div></div>`;
    }).join('');
  }
  el.innerHTML = `<div class="rc-segs">${seg}</div>` + body;
  el.querySelectorAll('[data-rcf]').forEach(b => b.onclick = () => { _rcFilter = b.dataset.rcf; _rcOpen.clear(); renderRecords(); });
  el.querySelectorAll('.rc-click').forEach(row => row.querySelector('.rc-top').onclick = () => {
    const k = row.dataset.rck;
    if (_rcOpen.has(k)) _rcOpen.delete(k); else _rcOpen.add(k);
    row.querySelector('.rc-det').classList.toggle('open', _rcOpen.has(k));
    const ch = row.querySelector('.rc-chev'); if (ch) ch.textContent = _rcOpen.has(k) ? '▴' : '▾';
  });
}
// ── 🏆 랭킹 — 홈처럼 TOP3 히어로 + 시즌 선택(2/1 읽기전용) ──
let _rkSeason = 2;
async function renderRanking(silent) {
  const el = $('rk-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getRanking(_rkSeason);
  if (!r || !r.ok) { if (!silent) el.innerHTML = '<div class="cat-empty">랭킹 정보가 아직 없어요</div>'; return; }
  const me = r.myName;

  const heroes = r.ranking.slice(0, 3).map(p => {
    const tc = (TB_TIER[p.tier] || TB_TIER.unranked)[1];
    return `<div class="rk-hero${p.name === me ? ' mine' : ''}" style="--tc:${tc}"><div class="rk-hero-r">${['🥇', '🥈', '🥉'][p.rank - 1]}</div><div class="rk-hero-nm">${escH(p.name)}</div><div class="rk-hero-tier">${p.tierKr}</div><b class="rk-hero-lp">${p.lp} LP</b>${p.tier !== 'challenger' ? `<div class="rk-bar"><i style="width:${Math.min(100, p.lp)}%;background:${tc}"></i></div>` : ''}</div>`;
  }).join('');
  const rest = r.ranking.slice(3).map(p => {
    const tc = (TB_TIER[p.tier] || TB_TIER.unranked)[1];
    const bar = p.tier !== 'challenger' ? `<div class="rk-bar"><i style="width:${Math.min(100, p.lp)}%;background:${tc}"></i></div>` : '';
    return `<div class="rk-row${p.name === me ? ' mine' : ''}"><div class="rk-main"><span class="rk-rank"><span class="rk-num">${p.rank}</span></span><span class="rk-name">${escH(p.name)}</span><span class="rk-tier" style="color:${tc}">${p.tierKr}</span><span class="rk-lp" style="color:${tc}">${p.lp} LP</span></div>${bar}</div>`;
  }).join('');
  el.innerHTML = r.ranking.length ? `<div class="rk-heroes">${heroes}</div>${rest}` : '<div class="cat-empty">랭킹 정보가 아직 없어요</div>';
}

// ── 🛒 상점 / 🃏 가챠 / 🎫 패스 (홈 로직 = main.js IPC·store.js) ─────────────
// 🪟 커스텀 확인창(네이티브 confirm 대체 · 헥스텍 톤) → Promise<boolean>
function uiConfirm(message, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'ui-modal-overlay';
    const modal = document.createElement('div'); modal.className = 'ui-modal';
    const body = document.createElement('div'); body.className = 'ui-modal-body';
    String(message).split('\n').forEach((line, i) => { const d = document.createElement('div'); d.className = 'uim-line' + (i === 0 ? ' uim-h' : ''); d.textContent = line; body.appendChild(d); });
    const btns = document.createElement('div'); btns.className = 'ui-modal-btns';
    const cancel = document.createElement('button'); cancel.className = 'uim-cancel'; cancel.textContent = opts.cancel || '취소';
    const ok = document.createElement('button'); ok.className = 'uim-ok'; ok.textContent = opts.ok || '확인';
    if (opts.danger) ok.style.background = 'linear-gradient(180deg,#e0605a,#b8433d)';
    btns.appendChild(cancel); btns.appendChild(ok); modal.appendChild(body); modal.appendChild(btns); ov.appendChild(modal);
    document.body.appendChild(ov); ok.focus();
    const done = v => { document.removeEventListener('keydown', onKey, true); ov.remove(); resolve(v); };
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); done(true); } }
    document.addEventListener('keydown', onKey, true);
    ok.onclick = () => done(true); cancel.onclick = () => done(false);
    ov.onclick = e => { if (e.target === ov) done(false); };
  });
}

// 🔒 조작 잠금 — 다른 기기 조작 중이면 확인 후 권한 인계 + 자동 재시도
async function withCtrl(fn) {
  let r = await fn();
  if (r && r.ctrl && await uiConfirm((r.err || '🔒 다른 기기에서 조작 중이에요') + '\n이 기기에서 조작 권한을 가져올까요?\n(같은 순간 동시 조작 사고 방지용 — 보는 건 자유)', { ok: '권한 가져오기', cancel: '취소' })) {
    await window.api.takeControl();
    r = await fn();
  }
  return r;
}
function spToast(msg) {   // 사이드패널 간이 토스트
  let t = $('sp-toast');
  if (!t) { t = document.createElement('div'); t.id = 'sp-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(spToast._t); spToast._t = setTimeout(() => t.classList.remove('on'), 2600);
}
const SHOP_COMBAT = [
  { id: 's1_gamble',       name: '도박권',        desc: '승 +40 / 패 −30 LP', price: 60 },
  { id: 's1_promo_shield', name: '승급전 방어권', desc: '승급전 패배 무효',   price: 100 },
  { id: 's1_promo_win',    name: '승급전 승리권', desc: '승급전 승리 = 2승',   price: 100 },
];
const SHOP_TICKETS = [
  { id: 'stable',   name: '안정 강화권',   sub: '성공 100% · 성능 +1', price: 40,  color: '#5fbf8a' },
  { id: 'precise',  name: '정밀 강화권',   sub: '성공 60% · 성능 +3',  price: 100, color: '#e0b341' },
  { id: 'overload', name: '과부하 강화권', sub: '성공 30% · 성능 +6',  price: 250, color: '#e0685a' },
];
async function renderShop(silent) {
  const el = $('sh-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getShop();
  if (!r || !r.ok) { if (!silent) el.innerHTML = `<div class="cat-empty">${escH((r && r.err) || '상점을 불러오지 못했어요')}</div>`; return; }
  $('sh-gold').textContent = `보유 ${r.gold}G`;
  const combat = SHOP_COMBAT.map(ci => {
    const c = r.itemCounts[ci.id] || { n: 0, active: 0 };
    const own = c.n ? `<span class="sh-own">보유 ${c.n}${c.active ? ' · 켜짐' : ''}</span>` : '';
    return `<div class="sh-row"><div class="sh-info"><b>${ci.name}</b><small>${ci.desc}</small></div>${own}<button class="sh-buy" data-buy-item="${ci.id}" ${r.gold < ci.price ? 'disabled' : ''}>${ci.price}G</button></div>`;
  }).join('');
  const tickets = SHOP_TICKETS.map(t => {
    const n = r.tickets[t.id] || 0;
    return `<div class="sh-row"><span class="sh-dot" style="background:${t.color}"></span><div class="sh-info"><b>${t.name}</b><small>${t.sub}</small></div>${n ? `<span class="sh-own">보유 ${n}</span>` : ''}<button class="sh-buy" data-buy-tk="${t.id}" ${r.gold < t.price ? 'disabled' : ''}>${t.price}G</button><button class="sh-buy sh-buy5" data-buy-tk5="${t.id}" ${r.gold < t.price * 5 ? 'disabled' : ''}>×5</button></div>`;
  }).join('');
  el.innerHTML =
    `<div class="sh-sec">전투 아이템 <small>아이템 시간·인벤토리에서 활성화</small></div>${combat}`
    + `<div class="sh-sec">강화권 <small>대장간 강화용(강화는 홈페이지에서)</small></div>${tickets}`
    + `<div class="sh-row"><span class="sh-dot" style="background:#e8a33d"></span><div class="sh-info"><b>걸작의 정수</b><small>구매는 내전 만렙(LV50) 해금 — 홈페이지에서</small></div><span class="sh-own">보유 ${r.essence}</span></div>`
    + `<div class="sh-sec">바로가기</div>`
    + `<div class="sh-row"><div class="sh-info"><b>복권</b><small>실버·골드·프리즘 스크래치 긁기</small></div><button class="sh-buy" data-cat-go="lottery">이동</button></div>`
    + `<div class="sh-row"><div class="sh-info"><b>대장간</b><small>강철심장 ${r.emblems}개 보유 · 강화·걸작·판매</small></div><button class="sh-buy" data-cat-go="forge">이동</button></div>`;
  el.querySelectorAll('[data-buy-item]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const res = await withCtrl(() => window.api.itemBuy(b.dataset.buyItem));
    spToast(res && res.ok ? '구매 완료' : (res && res.err) || '구매 실패');
    renderShop(true);
  });
  const buyTk = async (type, qty, btn) => {
    btn.disabled = true;
    const res = await withCtrl(() => window.api.buyTicket(type, qty));
    if (res && res.ok) setWalletGold(res.gold);   // 상단 재화바 즉시 반영
    spToast(res && res.ok ? `구매 완료 (잔여 ${res.gold}G)` : (res && res.err) || '구매 실패');
    renderShop(true);
  };
  el.querySelectorAll('[data-buy-tk]').forEach(b => b.onclick = () => buyTk(b.dataset.buyTk, 1, b));
  el.querySelectorAll('[data-buy-tk5]').forEach(b => b.onclick = () => buyTk(b.dataset.buyTk5, 5, b));
  el.querySelectorAll('[data-cat-go]').forEach(b => b.onclick = () => switchCat(b.dataset.catGo));
}
let _gaLastResults = null;   // 마지막 뽑기 결과(재렌더 시 유지)
async function renderGacha(silent) {
  const el = $('ga-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getGacha();
  if (!r || !r.ok) { if (!silent) el.innerHTML = `<div class="cat-empty">${escH((r && r.err) || '가챠를 불러오지 못했어요')}</div>`; return; }
  $('ga-gold').textContent = `보유 ${r.gold}G`;
  const starTag = s => s === 3 ? '<em class="ga-s3">프리즘</em>' : s === 2 ? '<em class="ga-s2">골드</em>' : '<em class="ga-s1">파편</em>';
  const resHtml = _gaLastResults
    ? `<div class="ga-res">${_gaLastResults.map(x => `<span class="ga-card s${x.secret ? 'y' : x.star}">${escH(x.kr)}${x.secret ? ' 🐱' : ''} ${starTag(x.star)}</span>`).join('')}</div>` : '';
  const coll = r.champs.map(c => {
    const cd = r.cards[c.slug] || {};
    const any = (cd.s1 || 0) + (cd.s2 || 0) + (cd.s3 || 0) > 0;
    return `<div class="ga-row${any ? '' : ' none'}"><span class="ga-nm">${escH(c.kr)}</span><span class="ga-cnt"><i class="ga-s1">${cd.s1 || 0}</i><i class="ga-s2">${cd.s2 || 0}</i><i class="ga-s3">${cd.s3 || 0}</i></span></div>`;
  }).join('');
  const syn = r.synList.length ? r.synList.map(s => {
    const nm = SYN_NAMES[s.sid] ? SYN_NAMES[s.sid][0] : s.sid;
    return `<div class="ga-syn${s.active ? ' on' : ''}"><span>${escH(nm)} <em>${s.tier}성</em></span><button class="sh-buy" data-syn="${s.sid}" data-tier="${s.tier}">${s.active ? '✓ 활성' : '활성화'}</button></div>`;
  }).join('') : '<div class="sh-note">완성된 시너지가 없어요 (같은 그룹 카드를 모으면 활성화 가능)</div>';
  el.innerHTML =
    `<div class="ga-pull"><button class="ga-btn" data-pull="1" ${r.gold < 50 ? 'disabled' : ''}>1회 뽑기 <b>50G</b></button><button class="ga-btn ten" data-pull="10" ${r.gold < 450 ? 'disabled' : ''}>10연 뽑기 <b>450G</b></button></div>`
    + resHtml
    + `<div class="sh-sec">컬렉션 <small>파편 · 골드 · 프리즘${r.yuumi ? ' · 🐱 유미 보유' : ''}</small></div><div class="ga-coll">${coll}</div>`
    + `<div class="sh-sec">시너지 <small>완성된 그룹만 · 1개 활성</small></div>${syn}`;
  el.querySelectorAll('[data-pull]').forEach(b => b.onclick = async () => {
    el.querySelectorAll('[data-pull]').forEach(x => x.disabled = true);
    const res = await withCtrl(() => window.api.gachaPull(Number(b.dataset.pull)));
    if (res && res.ok) { _gaLastResults = res.results; setWalletGold(res.gold); spToast(`뽑기 완료 (잔여 ${res.gold}G)`); }
    else spToast((res && res.err) || '뽑기 실패 — 다시 시도해주세요');
    renderGacha(true);
  });
  el.querySelectorAll('[data-syn]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const res = await withCtrl(() => window.api.synergyEquip(b.dataset.syn, Number(b.dataset.tier)));
    if (!res || !res.ok) spToast((res && res.err) || '변경 실패');
    renderGacha(true);
  });
}
async function renderPass(silent) {
  const el = $('ps-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getPass();
  if (!r || !r.ok) { if (!silent) el.innerHTML = `<div class="cat-empty">${escH((r && r.err) || '패스를 불러오지 못했어요')}</div>`; return; }
  $('ps-lv').textContent = `LV ${r.curLv}/${r.maxLv}`;
  const chips = rw => {
    const c = [];
    if (rw.gold) c.push(`<span class="ps-chip gold">🪙 ${rw.gold}G</span>`);
    if (rw.tickets) for (const t in rw.tickets) { const d = SHOP_TICKETS.find(x => x.id === t); c.push(`<span class="ps-chip" style="color:${d ? d.color : '#cbd5e1'}">${d ? d.name : t} ×${rw.tickets[t]}</span>`); }
    if (rw.essence) c.push(`<span class="ps-chip ess">정수 ×${rw.essence}</span>`);
    if (rw.title) c.push(`<span class="ps-chip title">칭호 "${escH(rw.title)}"</span>`);
    return c.join('');
  };
  const rows = r.rows.map(q => {
    let btn;
    if (q.state === 'done') btn = '<span class="ps-state done">✓</span>';
    else if (q.state === 'claimable') btn = `<button class="ps-claim" data-lv="${q.lv}">받기</button>`;
    else if (q.state === 'current') btn = `<span class="ps-state prog">${q.prog ? `${q.prog[0]} / ${q.prog[1]}` : '진행 중'}</span>`;
    else btn = '<span class="ps-state lock">🔒</span>';
    return `<div class="ps-row ${q.state}${q.milestone ? ' mile' : ''}"><div class="ps-lvc">${q.icon}<b>LV${q.lv}</b></div><div class="ps-info"><b>${escH(q.name)}${q.state === 'current' ? ' <i class="ps-now">도전 중</i>' : ''}</b><small>${escH(q.desc)}</small><div class="ps-rw">${chips(q.reward)}</div></div><div class="ps-act">${btn}</div></div>`;
  }).join('');
  el.innerHTML =
    `<div class="ps-head"><div class="ps-bar"><i style="width:${Math.round(r.curLv / r.maxLv * 100)}%"></i></div><small>퀘스트를 완료해 보상을 받아요 · 한 레벨씩 순서대로</small></div>${rows}`;
  el.querySelectorAll('.ps-claim').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const res = await withCtrl(() => window.api.claimPass(Number(b.dataset.lv)));
    if (res && res.ok) {
      const p = [];
      if (res.reward.gold) p.push(`🪙${res.reward.gold}G`);
      if (res.reward.tickets) for (const t in res.reward.tickets) p.push(`강화권×${res.reward.tickets[t]}`);
      if (res.reward.essence) p.push(`정수×${res.reward.essence}`);
      if (res.reward.title) p.push(`칭호 "${res.reward.title}"`);
      if (res.reward.gold) updateWallet();   // 골드 보상 → 상단 재화바 갱신
      spToast(`LV${b.dataset.lv} 보상 수령! ${p.join(' · ')}`);
    } else spToast((res && res.err) || '수령 실패');
    renderPass(true);
  });
}

// ── 🔊 SFX(WebAudio 합성·에셋 없음) — 대장간 망치·복권 당첨 등 ────────────────
let _ac = null;
function sfx(kind) {
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    const t = _ac.currentTime, out = _ac.createGain(); out.connect(_ac.destination);
    const tone = (f, at, dur, vol, type) => { const o = _ac.createOscillator(), g = _ac.createGain(); o.type = type || 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur); o.connect(g); g.connect(out); o.start(t + at); o.stop(t + at + dur + 0.05); };
    if (kind === 'clang') {   // 금속 타격 = 노이즈 버스트(밴드패스) + 벨 배음
      out.gain.value = 0.5;
      const nb = _ac.createBuffer(1, 3000, _ac.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = _ac.createBufferSource(); src.buffer = nb;
      const bp = _ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 5;
      src.connect(bp); bp.connect(out); src.start(t);
      [1244, 1866, 3320].forEach((f, i) => tone(f, 0, 0.5 - i * 0.08, 0.09, 'sine'));
    } else if (kind === 'ok') { out.gain.value = 0.5; tone(660, 0, 0.16, 0.2); tone(880, 0.09, 0.24, 0.2); }
    else if (kind === 'fail') { out.gain.value = 0.5; tone(220, 0, 0.2, 0.22, 'sawtooth'); tone(158, 0.11, 0.3, 0.18, 'sawtooth'); }
    else if (kind === 'jackpot') { out.gain.value = 0.5; [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.32, 0.16)); }
    else if (kind === 'dud') { out.gain.value = 0.45; tone(140, 0, 0.26, 0.28, 'sine'); }
  } catch (_) {}
}

// ── 🎟 스크래치 복권 — 오버레이 네이티브 티켓 UI(확률·당첨금·기록 = main store.js = 홈 1:1 동일) ──
const LO_META = [{ icon: '🎫', tag: 'SILVER' }, { icon: '🎟️', tag: 'GOLD' }, { icon: '💎', tag: 'PRISM' }];
async function renderLottery(silent) {
  const el = $('lo-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getLottery();
  if (!r || !r.ok) { if (!silent) el.innerHTML = `<div class="cat-empty">${escH((r && r.err) || '복권을 불러오지 못했어요')}</div>`; return; }
  $('lo-gold').textContent = `보유 ${r.gold.toLocaleString()}G`;
  const pityKeyOf = { 1: 'gold', 2: 'prism' };
  const resume = r.pending ? `<button class="lo-resume" id="lo-resume"><b>🎟 긁던 복권이 있어요</b><span>${escH((['실버', '골드', '프리즘'][r.pending.tierIdx] || '') + ' 복권')} 이어하기 →</span></button>` : '';
  const cards = r.tiers.map(t => {
    const m = LO_META[t.idx] || LO_META[0];
    const free = r.free[t.idx] || 0;
    const pity = pityKeyOf[t.idx] ? r.pity[pityKeyOf[t.idx]] : 0;
    const bonus = t.idx > 0 ? (r.prizeBonus[t.idx] || 0) : 0;
    return `<div class="lo-tk t${t.idx}">
      <div class="lo-stub"><span class="lo-ic">${m.icon}</span><span class="lo-tag">${m.tag}</span></div>
      <div class="lo-mid">
        <b>${escH(t.name)}</b>
        <small>${t.cells}칸 · 같은 문양 ${t.matchCount}개 · 최대 <em>${t.top.toLocaleString()}G</em></small>
        <div class="lo-badges">${t.hasSkull ? `<span class="lo-bg skull">💀 -${t.skullPenalty}G</span>` : '<span class="lo-bg safe">해골 없음</span>'}${pity > 0 ? `<span class="lo-bg pity">🍀 +${pity}%p</span>` : ''}${bonus ? `<span class="lo-bg mw">걸작 +${bonus}G</span>` : ''}</div>
      </div>
      <div class="lo-buy">
        <button class="lo-price" data-lo-buy="${t.idx}" ${r.pending || r.gold < t.price ? 'disabled' : ''}>${t.price}G</button>
        ${free > 0 ? `<button class="lo-freebtn" data-lo-free="${t.idx}" ${r.pending ? 'disabled' : ''}>무료 ${free}장</button>` : ''}
      </div>
    </div>`;
  }).join('');
  const skullNote = r.skullRed > 0 ? `<div class="sh-note">⚒️ 장착 걸작 — 해골 등장 -${Math.round(r.skullRed * 100)}% 적용 중</div>` : '';
  el.innerHTML = resume + cards + skullNote + '<div class="sh-note">확률·당첨금·기록은 홈페이지 복권과 완전 동일 (한 번에 1장)</div>';
  el.querySelectorAll('[data-lo-buy]').forEach(b => b.onclick = () => loBuy(Number(b.dataset.loBuy), false));
  el.querySelectorAll('[data-lo-free]').forEach(b => b.onclick = () => loBuy(Number(b.dataset.loFree), true));
  const rs = $('lo-resume'); if (rs) rs.onclick = async () => { const cur = await window.api.getLottery(); if (cur && cur.ok && cur.pending) openScratch(cur.pending, true); else renderLottery(true); };
}
async function loBuy(tierIdx, useFree) {
  const res = await withCtrl(() => window.api.lotteryBuy(tierIdx, useFree));
  if (!res || !res.ok) { if (!res || !res.ctrl) spToast((res && res.err) || '구매 실패'); renderLottery(true); return; }
  openScratch(res.rec, false);
}
// 긁기 모달 — 긁기 UI만 담당(정산은 main lotteryFinish=홈 공식). 해골 카운트 규칙=홈(당첨확정 후·자동공개·복원분 제외)
function openScratch(rec, resume) {
  document.getElementById('sc-ov')?.remove();
  const cells = rec.slots.length;
  const revealed = rec.slots.map((_, i) => !!(resume && Array.isArray(rec.revealed) && rec.revealed[i]));
  let skullHits = 0, allDone = false, finished = false, anyScratch = revealed.some(Boolean);
  const win = rec.win || null;
  const matchNeed = (rec.tierIdx === 0) ? 2 : 3;
  const ov = document.createElement('div'); ov.id = 'sc-ov'; ov.className = 'sct' + rec.tierIdx;
  ov.innerHTML = `<div class="sc-card">
    <div class="sc-top"><b>${escH((['실버', '골드', '프리즘'][rec.tierIdx] || '') + ' 복권')}</b>${rec.free ? '<span class="sc-freetag">무료권</span>' : ''}${rec.pity > 0 ? `<span class="lo-pity">🍀 +${rec.pity}%p</span>` : ''}</div>
    <div class="sc-grid c${cells}">${rec.slots.map((s, i) => `<div class="sc-cell" data-i="${i}"><span class="sc-sym${s.id === 'skull' ? ' skull' : ''}">${s.emoji}<i>${s.id === 'skull' ? '💀' : (s.gold + 'G')}</i></span><canvas class="sc-cv" width="76" height="76"></canvas></div>`).join('')}
    <div class="sc-hint">긁어서 같은 문양 ${matchNeed}개를 맞추세요</div></div>
    <div class="sc-result" id="sc-result"></div>
    <div class="sc-btns">
      <button class="btn-ghost2" id="sc-cancel" style="display:${!anyScratch && !resume ? '' : 'none'}">구매 취소</button>
      <button class="btn-ghost2" id="sc-aside">보류 (나중에)</button>
      <button class="btn-ghost2 sc-danger" id="sc-discard">버리기</button>
    </div></div>`;
  document.body.appendChild(ov);
  const cellEls = [...ov.querySelectorAll('.sc-cell')];
  const card = ov.querySelector('.sc-card');
  const burst = () => { for (let i = 0; i < 18; i++) { const s = document.createElement('i'); s.className = 'sc-p'; const a = Math.random() * 6.283, d2 = 60 + Math.random() * 90; s.style.setProperty('--dx', Math.cos(a) * d2 + 'px'); s.style.setProperty('--dy', Math.sin(a) * d2 + 'px'); s.style.animationDelay = (Math.random() * 0.18) + 's'; card.appendChild(s); setTimeout(() => s.remove(), 1500); } };
  const refresh = () => {
    if ($('sc-cancel')) $('sc-cancel').style.display = (!anyScratch && !resume) ? '' : 'none';
    const done = revealed.filter(Boolean).length;
    if (!allDone && win) {
      const got = rec.slots.filter((s, i) => revealed[i] && s.id === win.id).length;
      if (got >= matchNeed) {   // 🏆 매칭 완성 — 남은 칸 자동 공개(패널티 없음) + 받기
        allDone = true;
        rec.slots.forEach((_, i) => { if (!revealed[i]) reveal(i, true); });
        showResult();
      }
    }
    if (!allDone && !win && done >= cells) { allDone = true; showResult(); }   // 꽝 = 전부 긁어야 확정
  };
  const showResult = () => {
    const pen = (rec.tierIdx === 0 ? 0 : 10) * skullHits;
    const net = (win ? win.gold : 0) - pen + (rec.emblemBonus || 0);
    if (win) { card.classList.add('winning'); burst(); sfx('jackpot'); } else sfx('dud');
    $('sc-result').innerHTML = win
      ? `<div class="sc-win">🎉 ${escH(win.name)} 당첨! <b>+${net}G</b>${pen ? ` <small>(💀 -${pen})</small>` : ''}${rec.emblemBonus ? ` <small>(걸작 +${rec.emblemBonus})</small>` : ''}${rec.pityConv ? ' <small>🍀 보정</small>' : ''}</div><button class="ps-claim" id="sc-take">받기</button>`
      : `<div class="sc-lose">꽝… 다음 기회에${pen ? ` <small>(💀 -${pen}G)</small>` : ''}</div><button class="ps-claim" id="sc-take">확인</button>`;
    $('sc-aside').style.display = 'none'; $('sc-discard').style.display = 'none'; if ($('sc-cancel')) $('sc-cancel').style.display = 'none';
    $('sc-take').onclick = async () => {
      if (finished) return; finished = true;
      const res = await withCtrl(() => window.api.lotteryFinish(skullHits));
      spToast(res && res.ok ? (res.net > 0 ? `+${res.net}G 획득!` : res.net < 0 ? `${res.net}G (해골 패널티)` : '기록 완료') : (res && res.err) || '정산 실패');
      ov.remove(); renderLottery(true);
    };
  };
  const reveal = (i, fromSkip) => {
    if (revealed[i]) return;
    revealed[i] = true;
    const cell = cellEls[i];
    cell.querySelector('.sc-cv').style.opacity = '0';
    cell.classList.add('open');
    const isSkullHit = rec.slots[i].id === 'skull' && !fromSkip && !allDone;   // 홈 revealCell 규칙
    if (isSkullHit) { skullHits++; cell.classList.add('hit'); card.classList.add('shake'); sfx('dud'); setTimeout(() => card.classList.remove('shake'), 450); }
    refresh();
  };
  // 긁기 — destination-out 지우기, 55% 지워지면 공개
  cellEls.forEach((cell, i) => {
    const cv = cell.querySelector('.sc-cv'), ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 76, 76);
    g.addColorStop(0, '#8a8f9c'); g.addColorStop(0.5, '#c9cedb'); g.addColorStop(1, '#7c8290');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 76, 76);
    ctx.fillStyle = 'rgba(40,30,14,0.45)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('긁기', 38, 42);
    if (revealed[i]) { cv.style.opacity = '0'; cell.classList.add('open'); return; }   // 이어하기 복원(패널티 없음)
    let down = false;
    const scratch = e => {
      const r2 = cv.getBoundingClientRect();
      const x = (e.clientX - r2.left) * (76 / r2.width), y = (e.clientY - r2.top) * (76 / r2.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      anyScratch = true;
      if ($('sc-cancel')) $('sc-cancel').style.display = 'none';
    };
    const check = () => {
      if (revealed[i]) return;
      const d = ctx.getImageData(0, 0, 76, 76).data;
      let clear = 0;
      for (let p = 3; p < d.length; p += 16) if (d[p] < 120) clear++;   // 4px 스텝 샘플
      if (clear / (d.length / 16) > 0.55) reveal(i, false);
    };
    cv.addEventListener('pointerdown', e => { down = true; cv.setPointerCapture(e.pointerId); scratch(e); });
    cv.addEventListener('pointermove', e => { if (down) scratch(e); });
    cv.addEventListener('pointerup', () => { down = false; check(); });
    cv.addEventListener('pointerleave', () => { if (down) { down = false; check(); } });
  });
  $('sc-cancel').onclick = async () => {
    const res = await withCtrl(() => window.api.lotteryCancel());
    spToast(res && res.ok ? '구매 취소 — 환불됐어요' : (res && res.err) || '취소 실패');
    ov.remove(); renderLottery(true);
  };
  $('sc-aside').onclick = async () => { await window.api.lotteryAside(revealed); ov.remove(); renderLottery(true); };
  $('sc-discard').onclick = async () => {
    if (!await uiConfirm('이 복권을 버릴까요?\n당첨이어도 골드를 받지 못하고, 구매비는 돌려받지 않아요.', { ok: '버리기', cancel: '취소', danger: true })) return;
    const res = await withCtrl(() => window.api.lotteryDiscard());
    spToast(res && res.ok ? '버렸어요' : (res && res.err) || '실패');
    ov.remove(); renderLottery(true);
  };
  refresh();   // 이어하기: 이미 매칭 완성 상태면 즉시 결과
}

// ── 🔨 대장간 — 오버레이 네이티브 모루 스테이지(확률·판매가·기록 = main store.js = 홈 1:1 동일) ──
const FORGE_TICKETS = [
  { id: 'stable', name: '안정', pct: '100%', color: '#5fbf8a' },
  { id: 'precise', name: '정밀', pct: '60%', color: '#e0b341' },
  { id: 'overload', name: '과부하', pct: '30%', color: '#e0685a' },
];
let _fgBusy = false;
function forgeStrike(ok) {   // 🔨 망치 스윙→임팩트(클랭+스파크+흔들림)→결과음
  return new Promise(done => {
    const st = $('fg-stage'), h = $('fg-hammer'), sp = $('fg-spark');
    if (!st || !h) { sfx(ok ? 'ok' : 'fail'); done(); return; }
    h.classList.add('swing');
    setTimeout(() => {
      sfx('clang');
      st.classList.add('shake');
      if (sp) sp.className = 'fg-spark ' + (ok ? 'good' : 'bad');
      setTimeout(() => sfx(ok ? 'ok' : 'fail'), 230);
      setTimeout(() => { h.classList.remove('swing'); st.classList.remove('shake'); if (sp) sp.className = 'fg-spark'; done(); }, 650);
    }, 330);
  });
}
async function renderForge(silent) {
  const el = $('fg-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getForge();
  if (!r || !r.ok) { if (!silent) el.innerHTML = `<div class="cat-empty">${escH((r && r.err) || '대장간을 불러오지 못했어요')}</div>`; return; }
  $('fg-gold').textContent = `보유 ${r.gold.toLocaleString()}G`;
  const eq = r.emblems.find(e => e.equipped) || null;
  const pips = em => `<span class="fg-pips">${Array.from({ length: 5 }, (_, i) => { const s = em.slots[i]; return `<i class="${s ? (s.ok ? 'ok' : 'no') : ''}"></i>`; }).join('')}</span>`;
  const stage = `<div class="fg-stage${eq ? ' has g-' + eq.grade : ''}" id="fg-stage">
      <div class="fg-spark" id="fg-spark"></div>
      <div class="fg-hammer" id="fg-hammer">🔨</div>
      ${eq ? `<div class="fg-hero">
          <div class="fg-hero-hd"><b>${escH(eq.nick || '강철심장')}</b><em class="g-${eq.grade}">${eq.grade}</em><span class="fg-eqtag">장착 중</span></div>
          <div class="fg-hero-pw"><i>성능</i><b>${eq.power}</b><span>+${eq.level}</span></div>
          ${pips(eq)}
          <div class="fg-hero-eff">${eq.hasLines ? escH(eq.effText || '효과 없음') : '걸작 미제작 — 아래 「걸작 만들기」'}</div>
        </div>` : '<div class="fg-hero empty">모루가 비어 있어요<br><small>아래 목록에서 강철심장을 장착하면 올라와요</small></div>'}
    </div>`;
  const enhance = eq ? `<div class="fg-enh">${FORGE_TICKETS.map(t => `<button class="fg-tk" data-enh="${t.id}" style="--tc:${t.color}" ${eq.locked || !(r.tickets[t.id] > 0) ? 'disabled' : ''}><b>${t.name}</b><span>${t.pct} · 보유 ${r.tickets[t.id] || 0}</span></button>`).join('')}</div>
    <div class="fg-enh"><button class="fg-tk fg-master" id="fg-reroll" ${r.essence < 1 ? 'disabled' : ''}><b>🏆 걸작 만들기</b><span>3줄 리롤 · 정수 ${r.essence}개</span></button></div>
    ${eq.locked ? '<div class="sh-note">슬롯 5칸 소진 — 이 강철심장은 더 강화할 수 없어요</div>' : ''}`
    : '';
  const list = r.emblems.length ? r.emblems.map(em => `
    <div class="fg-em${em.equipped ? ' on' : ''}">
      <div class="fg-em-hd"><b>${escH(em.nick || '강철심장 +' + em.level)}</b><em class="g-${em.grade}">${em.grade}</em><small>성능 ${em.power}</small>${em.equipped ? '<span class="fg-eqtag">장착 중</span>' : ''}</div>
      ${pips(em)}
      <div class="fg-em-eff">${em.hasLines ? escH(em.effText || '효과 없음') : '걸작 미제작 — 장착 후 걸작 만들기'}</div>
      <div class="fg-em-btns">
        ${em.equipped ? '' : `<button class="sh-buy" data-fg-eq="${em.id}">⚒️ 모루에 올리기</button>`}
        <button class="sh-buy" data-fg-nick="${em.id}">애칭</button>
        <button class="sh-buy sc-danger" data-fg-sell="${em.id}">판매 ${em.sellPrice}G</button>
      </div>
    </div>`).join('') : '<div class="cat-empty">보유한 강철심장이 없어요</div>';
  el.innerHTML = stage + enhance
    + `<div class="sh-sec">보유 강철심장 <small>${r.count}/${r.maxOwn} · 장착 1개만 효과</small></div>${list}`
    + `<div class="fg-enh"><button class="fg-tk" id="fg-buy" ${r.gold < r.basePrice || r.count >= r.maxOwn ? 'disabled' : ''}><b>+ 강철심장 구매</b><span>${r.basePrice}G</span></button></div>`
    + '<div class="sh-note">강화권·정수 구매는 상점 탭 · 확률·판매가·기록은 홈페이지 대장간과 완전 동일</div>';
  el.querySelectorAll('[data-enh]').forEach(b => b.onclick = async () => {
    if (_fgBusy) return; _fgBusy = true;
    el.querySelectorAll('.fg-tk').forEach(x => x.disabled = true);
    const res = await withCtrl(() => window.api.forgeEnhance(b.dataset.enh));
    if (res && res.ok) {
      await forgeStrike(res.result.ok);
      spToast(res.result.ok ? `✨ 강화 성공! 성능 ${res.result.power} (+${res.result.level})` : `💥 강화 실패… (슬롯 ${res.result.slotsUsed}/5)`);
    } else if (!res || !res.ctrl) spToast((res && res.err) || '강화 실패');
    _fgBusy = false;
    renderForge(true);
  });
  const rr = $('fg-reroll'); if (rr) rr.onclick = async () => {
    if (_fgBusy) return;
    if (!await uiConfirm('걸작의 정수 1개로 효과 3줄을 전부 다시 뽑을까요?\n(기존 걸작 효과는 사라져요)', { ok: '다시 뽑기', cancel: '취소' })) return;
    _fgBusy = true; rr.disabled = true;
    const res = await withCtrl(() => window.api.forgeReroll());
    if (res && res.ok) { await forgeStrike(true); spToast('🏆 걸작 완성!'); }
    else if (!res || !res.ctrl) spToast((res && res.err) || '실패');
    _fgBusy = false;
    renderForge(true);
  };
  const fb = $('fg-buy'); if (fb) fb.onclick = async () => {
    fb.disabled = true;
    const res = await withCtrl(() => window.api.forgeBuyBase());
    if (res && res.ok) { sfx('ok'); spToast('⚒️ 강철심장 획득!'); }
    else if (!res || !res.ctrl) spToast((res && res.err) || '구매 실패');
    renderForge(true);
  };
  el.querySelectorAll('[data-fg-eq]').forEach(b => b.onclick = async () => { const eqr = await withCtrl(() => window.api.emblemEquip(Number(b.dataset.fgEq))); if (eqr && !eqr.ok && eqr.err && !eqr.ctrl) spToast(eqr.err); renderForge(true); });
  el.querySelectorAll('[data-fg-sell]').forEach(b => b.onclick = async () => {
    const em = r.emblems.find(e => e.id === Number(b.dataset.fgSell));
    if (!await uiConfirm(`이 강철심장(성능 ${em ? em.power : '?'})을 ${em ? em.sellPrice : '?'}G에 팔까요?\n강화·걸작이 함께 사라져요.`, { ok: '판매', cancel: '취소', danger: true })) return;
    const res = await withCtrl(() => window.api.forgeSell(Number(b.dataset.fgSell)));
    spToast(res && res.ok ? `💰 판매 완료 +${res.refund}G` : (res && res.err) || '판매 실패');
    renderForge(true);
  });
  el.querySelectorAll('[data-fg-nick]').forEach(b => b.onclick = async () => {
    const nick = prompt('애칭 (최대 3글자, 비우면 제거)', '');
    if (nick === null) return;
    const res = await withCtrl(() => window.api.forgeNick(Number(b.dataset.fgNick), nick));
    spToast(res && res.ok ? '저장했어요' : (res && res.err) || '실패');
    renderForge(true);
  });
}

// 초기 로드: 등록 플레이어 + 로그인 상태
(async () => {
  try {
    const { names, myName, isHost, webVersion, lpMap } = await window.api.getPlayers();
    _rosterNames = names || [];
    if (lpMap) _lpMap = lpMap;
    if (webVersion) { const e = $('s-ver'); if (e) e.textContent = '버전 ' + webVersion; }
    esel.innerHTML = '<option value="">— 아이디 선택 —</option>' +
      _rosterNames.map(n => `<option value="${n.replace(/"/g, '&quot;')}"${n === myName ? ' selected' : ''}>${n}</option>`).join('');
    $('s-entry-go').disabled = !esel.value;
    _myName = myName || ''; _isHost = !!isHost;
    if (_myName) showLogged(); else showLogin();
  } catch (_) { showLogin(); }
})();
// 현재 탭만 조용히 갱신(깜빡임 없이) — 1분마다. 팀짜기 탭은 진행 방해 않게 제외
setInterval(() => { if ($('s-app').style.display !== 'none') { updateWallet(); if (_curCat !== 'team') renderCat(_curCat, true); } }, 60000);
// 복권·대장간(홈 임베드)은 여기서 소비를 감지 못하니, 그 탭에 있는 동안은 재화바를 자주 갱신(내 노드만 조회라 가벼움)
setInterval(() => { if ($('s-app').style.display !== 'none' && (_curCat === 'lottery' || _curCat === 'forge')) updateWallet(); }, 5000);

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
}
function showLogged() {
  $('s-login').style.display = 'none'; $('s-app').style.display = 'flex';
  $('s-ttl').style.display = 'none';
  $('s-me').style.display = ''; $('s-me').textContent = _myName;
  $('s-host-box').style.display = ''; $('s-host').checked = _isHost;
  $('s-change').style.display = '';
  $('s-rail-team').style.display = _isHost ? '' : 'none';
  switchCat(_isHost && _curCat === 'team' ? 'team' : 'profile');
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
}
function switchCat(cat) {
  _curCat = cat;
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
  document.querySelectorAll('.cat-view').forEach(v => { v.style.display = (v.id === 'cat-' + cat) ? 'flex' : 'none'; });
  renderCat(cat, false);
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
    return `<div class="tb-item${_tbChecked.has(n) ? ' on' : ''}" data-name="${e}"><div class="tb-check"></div><span class="tb-nm">${e}</span>${_tbBadge(n)}</div>`;
  }).join('');
  tbSync();
}
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
async function renderRecords(silent) {
  const el = $('rc-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getRecords();
  if (!r || !r.ok) { if (!silent) el.innerHTML = '<div class="cat-empty">기록을 불러오지 못했어요</div>'; return; }
  if (r.ddVer) _ddVer = r.ddVer;
  if (!r.records.length) { el.innerHTML = '<div class="cat-empty">시즌2 경기 기록이 아직 없어요</div>'; return; }
  el.innerHTML = r.records.map(m => {
    const blueWon = m.winner === 'blue';
    const res = m.mine ? (m.won ? '<span class="rc-res w">승</span>' : '<span class="rc-res l">패</span>') : '<span class="rc-res n">관전</span>';
    const kda = m.kda ? `<span class="rc-kda">${m.kda.k}/${m.kda.d}/${m.kda.a}</span>` : '';
    const champ = m.myChamp ? `<img class="rc-cimg" src="${ddImg(m.myChamp)}" onerror="this.style.visibility='hidden'">` : '';
    const d = m.ts ? new Date(m.ts) : null;   // 홈 기록처럼 날짜 표시
    const date = d ? `<span class="rc-date">${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>` : '';
    const tA = `<span class="rc-team ${blueWon ? 'win' : ''}">${m.teamA.map(escH).join(', ')}</span>`;
    const tB = `<span class="rc-team ${!blueWon ? 'win' : ''}">${m.teamB.map(escH).join(', ')}</span>`;
    return `<div class="rc-row ${m.mine ? (m.won ? 'mine-w' : 'mine-l') : ''}"><div class="rc-top">${champ}${res}${kda}<span class="rc-size">${m.size}:${m.size}${date ? ' · ' : ''}</span>${date}</div><div class="rc-teams">${tA}<span class="rc-vs">vs</span>${tB}</div></div>`;
  }).join('');
}
async function renderRanking(silent) {
  const el = $('rk-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getRanking();
  if (!r || !r.ok || !r.ranking.length) { if (!silent) el.innerHTML = '<div class="cat-empty">랭킹 정보가 아직 없어요</div>'; return; }
  const me = r.myName;
  el.innerHTML = r.ranking.map(p => {
    const medal = p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : `<span class="rk-num">${p.rank}</span>`;
    const tc = (TB_TIER[p.tier] || TB_TIER.unranked)[1];   // 티어 색(홈)
    const bar = p.tier !== 'challenger' ? `<div class="rk-bar"><i style="width:${Math.min(100, p.lp)}%;background:${tc}"></i></div>` : '';
    return `<div class="rk-row${p.name === me ? ' mine' : ''}"><div class="rk-main"><span class="rk-rank">${medal}</span><span class="rk-name">${escH(p.name)}</span><span class="rk-tier" style="color:${tc}">${p.tierKr}</span><span class="rk-lp" style="color:${tc}">${p.lp} LP</span></div>${bar}</div>`;
  }).join('');
}

// ── 🛒 상점 / 🃏 가챠 / 🎫 패스 (홈 로직 = main.js IPC·store.js) ─────────────
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
    + `<div class="sh-sec">바로가기 <small>홈페이지 그대로 열림 · 같은 계정·실시간 동기화</small></div>`
    + `<div class="sh-row"><div class="sh-info"><b>복권</b><small>실버·골드·프리즘 스크래치 긁기</small></div><button class="sh-buy" data-home="lottery">열기</button></div>`
    + `<div class="sh-row"><div class="sh-info"><b>대장간</b><small>강철심장 ${r.emblems}개 보유 · 강화(오른)·걸작·판매</small></div><button class="sh-buy" data-home="forge">열기</button></div>`;
  el.querySelectorAll('[data-buy-item]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const res = await window.api.itemBuy(b.dataset.buyItem);
    spToast(res && res.ok ? '구매 완료' : (res && res.err) || '구매 실패');
    renderShop(true);
  });
  const buyTk = async (type, qty, btn) => {
    btn.disabled = true;
    const res = await window.api.buyTicket(type, qty);
    spToast(res && res.ok ? `구매 완료 (잔여 ${res.gold}G)` : (res && res.err) || '구매 실패');
    renderShop(true);
  };
  el.querySelectorAll('[data-buy-tk]').forEach(b => b.onclick = () => buyTk(b.dataset.buyTk, 1, b));
  el.querySelectorAll('[data-buy-tk5]').forEach(b => b.onclick = () => buyTk(b.dataset.buyTk5, 5, b));
  el.querySelectorAll('[data-home]').forEach(b => b.onclick = () => { if (window.api.openHome) window.api.openHome(b.dataset.home); });
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
    const res = await window.api.gachaPull(Number(b.dataset.pull));
    if (res && res.ok) { _gaLastResults = res.results; spToast(`뽑기 완료 (잔여 ${res.gold}G)`); }
    else spToast((res && res.err) || '뽑기 실패 — 다시 시도해주세요');
    renderGacha(true);
  });
  el.querySelectorAll('[data-syn]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const res = await window.api.synergyEquip(b.dataset.syn, Number(b.dataset.tier));
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
    const res = await window.api.claimPass(Number(b.dataset.lv));
    if (res && res.ok) {
      const p = [];
      if (res.reward.gold) p.push(`🪙${res.reward.gold}G`);
      if (res.reward.tickets) for (const t in res.reward.tickets) p.push(`강화권×${res.reward.tickets[t]}`);
      if (res.reward.essence) p.push(`정수×${res.reward.essence}`);
      if (res.reward.title) p.push(`칭호 "${res.reward.title}"`);
      spToast(`LV${b.dataset.lv} 보상 수령! ${p.join(' · ')}`);
    } else spToast((res && res.err) || '수령 실패');
    renderPass(true);
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
setInterval(() => { if ($('s-app').style.display !== 'none' && _curCat !== 'team') renderCat(_curCat, true); }, 60000);

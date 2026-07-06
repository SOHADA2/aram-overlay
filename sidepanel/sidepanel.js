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
let _rosterNames = [], _myName = '', _isHost = false;
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
function tbRenderList() {
  const list = $('tb-list');
  list.innerHTML = _rosterNames.map(n => {
    const e = n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return `<label class="tb-item${_tbChecked.has(n) ? ' on' : ''}"><input type="checkbox" data-name="${e}"${_tbChecked.has(n) ? ' checked' : ''}><span>${e}</span></label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    const name = cb.dataset.name;
    if (cb.checked) _tbChecked.add(name); else _tbChecked.delete(name);
    cb.closest('.tb-item').classList.toggle('on', cb.checked);
    localStorage.setItem('tbChecked', JSON.stringify([..._tbChecked]));
    tbSync();
  }));
  tbSync();
}
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
  const lpHtml = lp
    ? `<span class="pf-tier">${lp.tierKr}</span><span class="pf-lpn">${lp.placementDone ? lp.lp + ' LP' : '배치 ' + lp.placementGames + '/5'}</span>${lp.promoActive ? '<span class="pf-promo">승급전</span>' : ''}`
    : `<span class="pf-tier">배치</span><span class="pf-lpn">기록 없음</span>`;
  const form = a.form.length ? a.form.map(w => `<i class="pf-dot ${w ? 'w' : 'l'}">${w ? 'W' : 'L'}</i>`).join('') : '<span class="pf-dim">아직 경기 없음</span>';
  const syn = (p.synergy && SYN_NAMES[p.synergy.sid]) ? `<div class="pf-line"><span class="pf-k">🃏 시너지</span><span class="pf-v">${SYN_NAMES[p.synergy.sid][1]} ${SYN_NAMES[p.synergy.sid][0]} <em>${'★'.repeat(p.synergy.tier)}</em></span></div>` : '';
  const em = p.emblem ? `<div class="pf-line"><span class="pf-k">⚒️ 강철심장</span><span class="pf-v">${p.emblem.nick ? escH(p.emblem.nick) : '+' + p.emblem.level} · 성능 ${p.emblem.power} · <em>${p.emblem.grade}</em></span></div>` : '';
  const bd = p.buddy ? `<div class="pf-line"><span class="pf-k">🧸 단짝</span><span class="pf-v">${escH(p.buddy.champion)} · 함께 ${p.buddy.count}회${p.buddy.streakCount > 1 ? ` · ${p.buddy.streakType === 'win' ? '🔥' : '💧'}${p.buddy.streakCount}` : ''}</span></div>` : '';
  el.innerHTML =
    `<div class="pf-hero"><div class="pf-name">${escH(p.name)}</div><div class="pf-lp">${lpHtml}</div></div>`
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
    const tA = `<span class="rc-team ${blueWon ? 'win' : ''}">${m.teamA.map(escH).join(', ')}</span>`;
    const tB = `<span class="rc-team ${!blueWon ? 'win' : ''}">${m.teamB.map(escH).join(', ')}</span>`;
    return `<div class="rc-row ${m.mine ? (m.won ? 'mine-w' : 'mine-l') : ''}"><div class="rc-top">${champ}${res}${kda}<span class="rc-size">${m.size}:${m.size}</span></div><div class="rc-teams">${tA}<span class="rc-vs">vs</span>${tB}</div></div>`;
  }).join('');
}
async function renderRanking(silent) {
  const el = $('rk-body'); if (!silent || !el.innerHTML.trim()) el.innerHTML = '<div class="cat-load">불러오는 중…</div>';
  const r = await window.api.getRanking();
  if (!r || !r.ok || !r.ranking.length) { if (!silent) el.innerHTML = '<div class="cat-empty">랭킹 정보가 아직 없어요</div>'; return; }
  const me = r.myName;
  el.innerHTML = r.ranking.map(p => {
    const medal = p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : `<span class="rk-num">${p.rank}</span>`;
    return `<div class="rk-row${p.name === me ? ' mine' : ''}"><span class="rk-rank">${medal}</span><span class="rk-name">${escH(p.name)}</span><span class="rk-tier">${p.tierKr}</span><span class="rk-lp">${p.lp} LP</span></div>`;
  }).join('');
}

// 초기 로드: 등록 플레이어 + 로그인 상태
(async () => {
  try {
    const { names, myName, isHost, webVersion } = await window.api.getPlayers();
    _rosterNames = names || [];
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

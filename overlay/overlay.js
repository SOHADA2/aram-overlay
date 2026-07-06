// ── 오버레이 렌더러 ─────────────────────────────────────────────────────
// 뷰 2종: (1) 팀 배정(Firebase session 기반) (2) 참가자 명단(인게임 2999 기반)
// 데이터는 메인 프로세스가 IPC로: session(팀), players(인게임명단+LP), state(게임여부), myname(내 이름)
const TIER_SHORT = { iron:'I', bronze:'B', silver:'S', gold:'G', platinum:'P', emerald:'E', diamond:'D', master:'M', grandmaster:'GM', challenger:'C' };
const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();   // LP 매칭용(공백제거+소문자)
const nn = s => String(s || '').trim().replace(/\s+/g, ' ');          // 홈페이지 normName(공백 1칸·소문자 아님)
const fbKeyOf = name => nn(name).replace(/\s+/g, '_');                // 홈페이지 투표 키
const el = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

let sessionData = null, myName = '', roster = [], lpMap = {}, inGame = false, phaseLabel = '대기';

el('close').addEventListener('click', () => window.api.hideOverlay());

let settleData = null;   // 💰 최근 정산 {settle, lpNow}
let itemData = null, _itemPhaseKey = 0, _itemSeenAt = 0, _itemBusy = false;   // 🎒 아이템 페이즈
window.api.onState(({ inGame: ig, label }) => { inGame = !!ig; phaseLabel = label || (ig ? '게임 중' : '대기'); render(); });
window.api.onPlayers(({ players, lpMap: m }) => { roster = players || []; if (m) lpMap = m; render(); });
window.api.onSession(({ session, myName: mn, lpMap: m }) => { sessionData = session || null; if (mn !== undefined) myName = mn || ''; if (m) lpMap = m; render(); });
window.api.onMyName(name => { myName = name || ''; render(); });
window.api.onSettlement(d => { settleData = d || null; render(); });
window.api.onItemPhase(d => {
  itemData = d || null;
  if (d && d.endAt !== _itemPhaseKey) { _itemPhaseKey = d.endAt; _itemSeenAt = Date.now(); }   // 새 페이즈 = 로컬 15초 시작
  render();
});
setInterval(() => { if (itemActive()) { const l = itemSecsLeft(); const e = el('it-sec'); if (e) e.textContent = l; if (l <= 0) render(); } }, 500);

function showView(v) {
  el('view-team').style.display   = v === 'team'   ? 'block' : 'none';
  el('view-item').style.display   = v === 'item'   ? 'block' : 'none';
  el('view-vote').style.display   = v === 'vote'   ? 'block' : 'none';
  el('view-settle').style.display = v === 'settle' ? 'block' : 'none';
  el('view-roster').style.display = v === 'roster' ? 'block' : 'none';
}

function myTeam() {
  if (!sessionData || !sessionData.active) return 0;
  const a = (sessionData.teamA || []).map(norm), b = (sessionData.teamB || []).map(norm), me = norm(myName);
  if (me && a.includes(me)) return 1;
  if (me && b.includes(me)) return 2;
  return 0;
}
function playerRow(name, i) {
  const me = (myName && norm(name) === norm(myName)) ? ' class="me"' : '';
  const r = lpMap[norm(name)];
  const lp = r ? `<span class="lp">${TIER_SHORT[r.tier] || '?'} ${r.lp}</span>` : '';
  return `<li${me}><span class="num">${i + 1}</span><span class="nm">${esc(name)}</span>${lp}</li>`;
}

function renderTeam() {
  const A = sessionData.teamA || [], B = sessionData.teamB || [], mt = myTeam();
  const band = el('tv-band');
  band.className = 'tv-band' + (mt === 1 ? ' t1' : mt === 2 ? ' t2' : '');
  band.innerHTML = mt === 1 ? '내 팀 · <b>🔷 1팀</b>' : mt === 2 ? '내 팀 · <b>🔶 2팀</b>' : '데스크톱 창에서 <b>내 이름</b>을 설정하세요';
  el('team1').className = 'ta-team blue' + (mt === 1 ? ' mine' : '');
  el('team2').className = 'ta-team red' + (mt === 2 ? ' mine' : '');
  el('t1-count').textContent = A.length + '명';
  el('t2-count').textContent = B.length + '명';
  el('t1-players').innerHTML = A.length ? A.map(playerRow).join('') : '<li><span class="num"></span><span class="nm" style="color:#5f6478">—</span></li>';
  el('t2-players').innerHTML = B.length ? B.map(playerRow).join('') : '<li><span class="num"></span><span class="nm" style="color:#5f6478">—</span></li>';
}

function renderRoster() {
  el('roster-h').style.display = roster.length ? 'block' : 'none';
  el('pcount').textContent = roster.length ? `${roster.length}명` : '';
  el('status').style.display = roster.length ? 'none' : 'block';
  el('players').innerHTML = roster.map(p => {
    const r = lpMap[norm(p.name)];
    const lp = r ? `<span class="lp">${TIER_SHORT[r.tier] || '?'} ${r.lp}</span>` : `<span class="lp none">—</span>`;
    return `<li class="team-${p.teamId || 0}"><span class="name">${esc(p.name)}</span><span class="champ">${esc(p.champ || '')}</span>${lp}</li>`;
  }).join('');
}

// ── 🗳️ MVP·매너왕 투표 ────────────────────────────────────────────────
// mvp/manner active·미확정 + (승패 수동선택 신선 or 이미 투표 진행) → 투표 단계. 오버레이는 votes write만(확정·저장은 라이브).
let _pendMvp = null, _pendManner = null, _voteBusy = false, _voteSig = '';
function isVoting() {
  const s = sessionData;
  if (!s || !s.mvp || !s.mvp.active || !s.manner || !s.manner.active) return false;
  if ((s.mvp.confirmed) || (s.manner.confirmed)) return false;
  const fresh = s.manualEog && s.manualEog.at && (Date.now() - s.manualEog.at < 10 * 60 * 1000);
  const anyVote = (s.mvp.teamAVotes && Object.keys(s.mvp.teamAVotes).length) || (s.mvp.teamBVotes && Object.keys(s.mvp.teamBVotes).length);
  return !!(fresh || anyVote);
}
function voteCardHtml(name, kind, picked) {
  const r = lpMap[norm(name)];
  const lp = r ? `<span class="ui-lp">${TIER_SHORT[r.tier] || '?'} ${r.lp}</span>` : '';
  const badge = kind === 'mvp' ? '🏆' : '💎';
  const on = picked ? ' on' : '';
  return `<button class="vt-cand ${kind}${on}" data-kind="${kind}" data-name="${esc(name)}"><span class="vt-badge">${badge}</span><span class="vt-nm">${esc(name)}</span>${lp}</button>`;
}
function renderVote() {
  const s = sessionData;
  const A = s.teamA || [], B = s.teamB || [];
  const mt = myTeam();                                  // 1=teamA, 2=teamB, 0=관전/비참가
  const winSide = (s.manualEog && s.manualEog.winSide) || null;   // 'blue'=1팀 / 'red'=2팀
  const banner = el('vt-banner');
  if (winSide) {
    const wt = winSide === 'blue' ? 1 : 2;
    banner.className = 'vt-banner ' + (wt === 1 ? 't1' : 't2');
    banner.innerHTML = `🏅 <b>${wt}팀 승리</b> · MVP·매너왕을 뽑아주세요`;
  } else { banner.className = 'vt-banner'; banner.innerHTML = '🗳️ <b>MVP·매너왕 투표</b>'; }

  const body = el('vt-body');
  if (mt === 0) { body.innerHTML = `<div class="vt-note">관전자·미참가자는 투표할 수 없어요.<br>결과가 나오면 표시됩니다.</div>`; renderVoteProgress(); return; }

  const team = mt === 1 ? 'teamA' : 'teamB';
  const myKey = fbKeyOf(myName);
  const myMvp = s.mvp[team + 'Votes'] && s.mvp[team + 'Votes'][myKey];
  const myManner = s.manner[team + 'Votes'] && s.manner[team + 'Votes'][myKey];

  if (myMvp && myManner) {   // 이미 투표함 → 결과 + 다시선택
    body.innerHTML =
      `<div class="vt-done"><div class="vt-done-h">✅ 투표 완료</div>` +
      `<div class="vt-done-row"><span>🏆 MVP</span><b>${esc(myMvp)}</b></div>` +
      `<div class="vt-done-row"><span>💎 매너왕</span><b>${esc(myManner)}</b></div>` +
      `<button id="vt-redo" class="ui-btn-ghost">↩ 다시 선택</button></div>`;
    el('vt-redo').onclick = async () => { if (_voteBusy) return; _voteBusy = true; _pendMvp = _pendManner = null; await window.api.voteClear(); _voteBusy = false; };
    renderVoteProgress(); return;
  }

  // 미투표 — MVP(상대팀) + 매너왕(우리팀·본인 제외)
  const opp = mt === 1 ? B : A;
  const mine = (mt === 1 ? A : B).filter(x => nn(x) !== nn(myName));
  body.innerHTML =
    `<div class="vt-sec"><div class="vt-sec-h t-red">🏆 MVP — 상대팀 최고의 활약</div><div class="vt-cands">${opp.map(x => voteCardHtml(x, 'mvp', nn(x) === nn(_pendMvp))).join('') || '<div class="vt-note">상대팀 없음</div>'}</div></div>` +
    `<div class="vt-sec"><div class="vt-sec-h t-blue">💎 매너왕 — 우리팀 매너</div><div class="vt-cands">${mine.map(x => voteCardHtml(x, 'manner', nn(x) === nn(_pendManner))).join('') || '<div class="vt-note">후보 없음</div>'}</div></div>` +
    `<button id="vt-cast" class="ui-btn-gold" ${(_pendMvp && _pendManner) ? '' : 'disabled'}>${(_pendMvp && _pendManner) ? '투표 확정' : 'MVP·매너왕을 각각 골라주세요'}</button>`;

  body.querySelectorAll('.vt-cand').forEach(btn => btn.onclick = () => {
    const name = btn.dataset.name, kind = btn.dataset.kind;
    if (kind === 'mvp') _pendMvp = (nn(_pendMvp) === nn(name)) ? null : name;
    else _pendManner = (nn(_pendManner) === nn(name)) ? null : name;
    renderVote();
  });
  const cast = el('vt-cast');
  if (cast) cast.onclick = async () => {
    if (_voteBusy || !_pendMvp || !_pendManner) return;
    _voteBusy = true; cast.disabled = true; cast.textContent = '전송 중…';
    const r = await window.api.voteCast(_pendMvp, _pendManner);
    _voteBusy = false;
    if (!r || !r.ok) { cast.disabled = false; cast.textContent = '⚠️ ' + ((r && r.err) || '전송 실패 · 다시'); }
    else { _pendMvp = _pendManner = null; }   // session 폴링이 곧 "투표 완료" 화면으로 갱신
  };
  renderVoteProgress();
}
function renderVoteProgress() {
  const s = sessionData, A = s.teamA || [], B = s.teamB || [];
  const done = (team, name) => !!(s.mvp[team + 'Votes'] && s.mvp[team + 'Votes'][fbKeyOf(name)]);
  const chip = (team, name) => `<span class="vt-chip ${done(team, name) ? 'ok' : ''}">${done(team, name) ? '✅' : '⏳'} ${esc(name)}</span>`;
  el('vt-progress').innerHTML =
    `<div class="vt-prow"><span class="t-blue">1팀</span>${A.map(n => chip('teamA', n)).join('')}</div>` +
    `<div class="vt-prow"><span class="t-red">2팀</span>${B.map(n => chip('teamB', n)).join('')}</div>`;
}

// ── 💰 정산 뷰 ──────────────────────────────────────────────────────────
// lastSettlement 페이로드(winners/losers/s1LpBefore/tierChanges/mvp·manner) + main이 준 현재 LP(lpNow)로 요약 표시.
const TIER_KR = { unranked:'언랭', iron:'아이언', bronze:'브론즈', silver:'실버', gold:'골드', platinum:'플래', emerald:'에메', diamond:'다이아', master:'마스터', grandmaster:'그마', challenger:'챌' };
function seenSettles() { try { return (localStorage.getItem('ovSeenSettle') || '').split(',').filter(Boolean); } catch (_) { return []; } }
function markSettleSeen(key) { try { const a = seenSettles().filter(x => x !== key); a.push(key); localStorage.setItem('ovSeenSettle', a.slice(-50).join(',')); } catch (_) {} }
function settleActive() {
  const d = settleData; if (!d || !d.settle) return false;
  const s = d.settle;
  if (!s.publishedAt || Date.now() - s.publishedAt > 10 * 60 * 1000) return false;
  if (s.matchKey && seenSettles().includes(s.matchKey)) return false;   // 이미 확인함
  return !!(s.winners && s.losers);
}
function lpDeltaHtml(name) {
  const s = settleData.settle, before = (s.s1LpBefore || {})[nn(name)], now = (settleData.lpNow || {})[nn(name)];
  if (before && before.placementDone === false) return `<span class="st-lp dim">배치 ${(before.placementGames || 0) + 1}/5</span>`;
  if (before && before.promoActive) return `<span class="st-lp dim">승급전</span>`;
  if (!before || !now) return `<span class="st-lp dim">—</span>`;
  const d = (now.lp || 0) - (before.lp || 0);
  const tierMoved = before.tier && now.tier && before.tier !== now.tier;
  const tierTxt = tierMoved ? ` <span class="st-tier">${TIER_KR[before.tier] || before.tier}→${TIER_KR[now.tier] || now.tier}</span>` : '';
  if (d === 0 && !tierMoved) return `<span class="st-lp zero">±0</span>`;
  const cls = d > 0 ? 'plus' : d < 0 ? 'minus' : 'zero';
  const sign = d > 0 ? '+' : '';
  return `<span class="st-lp ${cls}">${sign}${d} LP</span>${tierTxt}`;
}
function settleTeamHtml(names, isWin, badgeMap) {
  const rows = (names || []).map(name => {
    const me = (myName && nn(name) === nn(myName)) ? ' me' : '';
    const b = badgeMap[nn(name)] || '';
    return `<li class="${me.trim()}"><span class="st-nm">${esc(name)}${b}</span>${lpDeltaHtml(name)}</li>`;
  }).join('');
  return `<div class="st-team ${isWin ? 'win' : 'lose'}"><div class="st-team-h">${isWin ? '🏆 승리' : '패배'}</div><ul>${rows}</ul></div>`;
}
function renderSettle() {
  const s = settleData.settle;
  const winA = (s.winners || []).some(n => (sessionData && (sessionData.teamA || [])).some(x => nn(x) === nn(n)));   // 승자가 1팀인지
  el('st-banner').className = 'st-banner ' + (winA ? 't1' : 't2');
  el('st-banner').innerHTML = `🏁 <b>${winA ? '1팀' : '2팀'} 승리</b> · 정산 결과`;

  // 수상자 배지 맵 + 상단 어워드
  const badge = {};
  const add = (name, b) => { if (name) badge[nn(name)] = (badge[nn(name)] || '') + b; };
  add(s.mvpWinner, ' 🏆'); add(s.mvpLoser, ' ⭐'); add(s.mannerWinner, ' 💎'); add(s.mannerLoser, ' 💎');
  const aw = [];
  if (s.mvpWinner) aw.push(`<span class="st-aw"><b>🏆 MVP</b> ${esc(s.mvpWinner)}</span>`);
  if (s.mvpLoser) aw.push(`<span class="st-aw"><b>⭐ SVP</b> ${esc(s.mvpLoser)}</span>`);
  if (s.mannerWinner || s.mannerLoser) aw.push(`<span class="st-aw"><b>💎 매너</b> ${esc([s.mannerWinner, s.mannerLoser].filter(Boolean).join(', '))}</span>`);
  el('st-awards').innerHTML = aw.join('');

  el('st-teams').innerHTML = settleTeamHtml(s.winners, true, badge) + settleTeamHtml(s.losers, false, badge);
  el('st-close').onclick = () => { if (s.matchKey) markSettleSeen(s.matchKey); settleData = null; render(); };
}

// ── 🎒 아이템 사용(팀 구성 직전 15초) ────────────────────────────────────
// 홈페이지에서 미리 산 전투 아이템을 여기서 활성화. items_s2 토글(main.js가 상호배제·조건 검증·Firebase write).
const COMBAT_ITEMS = [
  { id: 's1_gamble',       name: '도박권',        ic: '🎲', desc: '승 +40 / 패 −30 LP' },
  { id: 's1_lp2x',         name: 'LP 2배권',      ic: '⚡', desc: '승리 시 획득 LP 2배' },
  { id: 's1_promo_shield', name: '승급전 방어권', ic: '🛡️', desc: '승급전 패배 무효' },
  { id: 's1_promo_win',    name: '승급전 승리권', ic: '⚔️', desc: '승급전 승리 = 2승' },
];
function itemActive() { return !!(itemData && itemSecsLeft() > 0); }
function itemSecsLeft() { return Math.max(0, 15 - Math.floor((Date.now() - _itemSeenAt) / 1000)); }
function _myItems() { return (itemData && itemData.gold && itemData.gold.data && itemData.gold.data.items_s2) || []; }
function renderItem() {
  el('it-sec').textContent = itemSecsLeft();
  const items = _myItems();
  const cnt = id => items.filter(it => it && it.id === id).length;
  const on = id => items.some(it => it && it.id === id && it.active);
  el('it-body').innerHTML = COMBAT_ITEMS.map(ci => {
    const owned = cnt(ci.id), act = on(ci.id);
    const cls = owned ? (act ? 'on' : 'own') : 'empty';
    const st = owned ? (act ? '✓ 켜짐' : '켜기') : '미보유';
    return `<button class="it-chip ${cls}" data-id="${ci.id}" ${owned ? '' : 'disabled'}>`
      + `<span class="it-ic">${ci.ic}</span>`
      + `<span class="it-info"><b>${ci.name}${owned > 1 ? ` <em>×${owned}</em>` : ''}</b><small>${ci.desc}</small></span>`
      + `<span class="it-st">${st}</span></button>`;
  }).join('');
  el('it-body').querySelectorAll('.it-chip:not([disabled])').forEach(b => b.onclick = async () => {
    if (_itemBusy) return; _itemBusy = true; b.classList.add('busy');
    el('it-err').style.display = 'none';
    const r = await window.api.itemToggle(b.dataset.id);
    _itemBusy = false; b.classList.remove('busy');
    if (!r || !r.ok) { el('it-err').textContent = '⚠️ ' + ((r && r.err) || '실패'); el('it-err').style.display = ''; }
    else {   // 낙관적 로컬 반영(다음 폴링이 확정) — 같은 id/충돌 끄고 이 id 하나 켬
      const wasOn = on(b.dataset.id);
      const conflict = { s1_gamble: ['s1_lp2x'], s1_lp2x: ['s1_gamble'], s1_promo_shield: ['s1_promo_win'], s1_promo_win: ['s1_promo_shield'] }[b.dataset.id] || [];
      const off = new Set([b.dataset.id, ...conflict]);
      items.forEach(it => { if (off.has(it.id)) it.active = false; });
      if (!wasOn) { const t = items.find(it => it.id === b.dataset.id); if (t) t.active = true; }
      renderItem();
    }
  });
}

function render() {
  if (itemActive()) { renderItem(); showView('item'); el('phase').textContent = '아이템'; return; }
  if (settleActive()) { renderSettle(); showView('settle'); el('phase').textContent = '정산'; return; }
  const hasTeams = sessionData && sessionData.active && (((sessionData.teamA || []).length) || ((sessionData.teamB || []).length));
  if (hasTeams && isVoting()) {
    // 팀이 바뀌면 선택 초기화(다음 경기 투표)
    const sig = (sessionData.teamsFormedAt || 0) + ':' + (sessionData.manualEog && sessionData.manualEog.at || 0);
    if (sig !== _voteSig) { _voteSig = sig; _pendMvp = _pendManner = null; }
    renderVote(); showView('vote'); el('phase').textContent = '투표';
  } else if (hasTeams) { renderTeam(); showView('team'); el('phase').textContent = phaseLabel === '미리보기' ? '미리보기' : '팀 배정'; }
  else { renderRoster(); showView('roster'); el('phase').textContent = phaseLabel; }
}
render();

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
let itemData = null, _itemPhaseKey = 0, _itemSeenAt = 0, _itemBusy = false, _itOpen = new Set();   // 🎒 아이템 페이즈(_itOpen=펼친 아코디언)
window.api.onState(({ inGame: ig, label }) => { inGame = !!ig; phaseLabel = label || (ig ? '게임 중' : '대기'); render(); });
window.api.onPlayers(({ players, lpMap: m }) => { roster = players || []; if (m) lpMap = m; render(); });
window.api.onSession(({ session, myName: mn, lpMap: m }) => { sessionData = session || null; if (mn !== undefined) myName = mn || ''; if (m) lpMap = m; render(); });
window.api.onMyName(name => { myName = name || ''; render(); });
window.api.onDocked(v => { document.body.classList.toggle('docked', !!v); });   // 🖥️ 도킹 중=각진 모서리
window.api.onSettlement(d => { settleData = d || null; render(); });
window.api.onItemPhase(d => {
  itemData = d || null;
  if (d && d.endAt !== _itemPhaseKey) { _itemPhaseKey = d.endAt; _itemSeenAt = Date.now(); _itOpen.clear(); }   // 새 페이즈 = 로컬 15초 시작(아코디언 초기화)
  render();
});
setInterval(() => { if (itemActive()) { const l = itemSecsLeft(); const e = el('it-sec'); if (e) e.textContent = l; if (l <= 0) render(); } }, 500);

function showView(v) {
  el('view-team').style.display   = v === 'team'   ? 'flex'  : 'none';
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
  band.innerHTML = mt === 1 ? '<span class="tv-lead">내가 들어갈 팀</span><b class="tv-team">🔷 1팀</b>'
    : mt === 2 ? '<span class="tv-lead">내가 들어갈 팀</span><b class="tv-team">🔶 2팀</b>'
    : '데스크톱 창에서 <b>내 이름</b>을 설정하세요';
  el('team1').className = 'ta-team blue' + (mt === 1 ? ' mine' : mt === 2 ? ' dim' : '');
  el('team2').className = 'ta-team red' + (mt === 2 ? ' mine' : mt === 1 ? ' dim' : '');
  el('t1-count').textContent = A.length + '명';
  el('t2-count').textContent = B.length + '명';
  el('t1-players').innerHTML = A.length ? A.map(playerRow).join('') : '<li><span class="num"></span><span class="nm" style="color:#5f6478">—</span></li>';
  el('t2-players').innerHTML = B.length ? B.map(playerRow).join('') : '<li><span class="num"></span><span class="nm" style="color:#5f6478">—</span></li>';
}

function renderRoster() {
  const has = roster.length;
  el('roster-h').style.display = has ? 'block' : 'none';
  el('pcount').textContent = has ? `${roster.length}명` : '';
  el('status').style.display = has ? 'none' : 'block';
  el('players').innerHTML = roster.map(p => {
    const r = lpMap[norm(p.name)];
    const lp = r ? `<span class="lp">${TIER_SHORT[r.tier] || '?'} ${r.lp}</span>` : `<span class="lp none">—</span>`;
    return `<li class="team-${p.teamId || 0}"><span class="name">${esc(p.name)}</span><span class="champ">${esc(p.champ || '')}</span>${lp}</li>`;
  }).join('');
  // 🆕 대기 중(인게임 명단 없음)엔 내 LP 요약 + 시즌 랭킹으로 채움
  const wi = el('waiting-info');
  if (!has) { wi.style.display = 'block'; loadWaitingInfo(); } else { wi.style.display = 'none'; }
}
// ── 대기 화면 정보(내 LP·폼 + 시즌 랭킹 미리보기) ──────────────────────────
let _wLoaded = 0, _wData = null;
async function loadWaitingInfo() {
  const now = Date.now();
  if (_wData && now - _wLoaded < 45000) { renderWaitingInfo(); return; }   // 45초 캐시
  _wLoaded = now;
  const [pr, rk] = await Promise.all([
    window.api.getProfile().catch(() => null),
    window.api.getRanking().catch(() => null),
  ]);
  _wData = { pr, rk };
  renderWaitingInfo();
}
function renderWaitingInfo() {
  const wi = el('waiting-info'); if (!wi || !_wData) return;
  const pr = _wData.pr && _wData.pr.ok ? _wData.pr.profile : null;
  const rk = _wData.rk && _wData.rk.ok ? _wData.rk.ranking : null;
  let html = '';
  if (pr) {
    const lp = pr.lp, a = pr.arena;
    const lpTxt = lp ? (lp.placementDone ? `${lp.tierKr} · ${lp.lp} LP` : `배치 ${lp.placementGames}/5`) : '배치 전';
    const form = (a.form || []).slice(-8).map(w => `<i class="wi-dot ${w ? 'w' : 'l'}"></i>`).join('') || '<span class="wi-dim">경기 없음</span>';
    html += `<div class="wi-me"><div class="wi-me-top"><span class="wi-me-nm">${esc(pr.name)}</span><span class="wi-me-lp">${esc(lpTxt)}</span></div>`
      + `<div class="wi-me-sub"><span>${a.wins}승 ${a.losses}패 · ${a.winrate}%</span><span class="wi-form">${form}</span></div></div>`;
  }
  if (rk && rk.length) {
    const rows = rk.slice(0, 6).map(p => {
      const medal = p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : `<b>${p.rank}</b>`;
      const me = (myName && norm(p.name) === norm(myName)) ? ' me' : '';
      return `<div class="wi-rk-row${me}"><span class="wi-rk-r">${medal}</span><span class="wi-rk-nm">${esc(p.name)}</span><span class="wi-rk-lp">${p.lp} LP</span></div>`;
    }).join('');
    html += `<div class="wi-sec-h">🏆 이번 시즌 랭킹</div><div class="wi-rk">${rows}</div>`;
  }
  wi.innerHTML = html || '<div class="wi-dim" style="text-align:center;padding:10px;">데스크톱에서 아이디를 설정하면<br>내 정보가 여기 떠요</div>';
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
// 홈페이지 아이템 페이즈 pill과 동일한 전투 아이템 3종(구매/활성화). LP2배권은 릴레이 전용이라 여기 없음.
const COMBAT_ITEMS = [
  { id: 's1_gamble',       name: '도박권',        ic: '🎲', desc: '승 +40 / 패 −30 LP', price: 60 },
  { id: 's1_promo_shield', name: '승급전 방어권', ic: '🛡️', desc: '승급전 패배 무효',   price: 100 },
  { id: 's1_promo_win',    name: '승급전 승리권', ic: '⚔️', desc: '승급전 승리 = 2승',   price: 100 },
];
// 가챠 시너지 11종 — 카드 소유(champCards_s2)로 2★/3★ 판정. sid/멤버/효과는 홈 GACHA_SYNERGY_GROUPS와 동일.
const SYN_PROC = { 2: 30, 3: 50 };   // 발동 확률 (2★ 30% / 3★ 50%)
const SYN_GROUPS = [
  { sid: 'warrior',    name: '검을 뽑아라',  ic: '⚔️',  members: ['DrMundo', 'Gangplank', 'Yasuo'], effType: 'win_lp', v2: 2, v3: 3, cond: '킬 8+' },
  { sid: 'marksman',   name: '탄환 세례',   ic: '🎯',  members: ['Akshan', 'Jhin', 'Vayne'], effType: 'win_lp', v2: 2, v3: 3, cond: '딜량 25,000+' },
  { sid: 'assassin',   name: '그림자 주자', ic: '🌑',  members: ['Fizz', 'Khazix', 'Naafiri'], effType: 'win_lp', v2: 2, v3: 3, cond: '킬 6+ & 데스 4+' },
  { sid: 'ionia',      name: '검무',        ic: '🌸',  members: ['Jhin', 'Yasuo'], effType: 'win_lp', v2: 1, v3: 2, cond: 'KDA 4.0+' },
  { sid: 'shurima',    name: '나는 왕이다', ic: '👑',  members: ['Akshan', 'Amumu', 'Naafiri', 'Rammus'], effType: 'win_lp', v2: 3, v3: 4, cond: '킬+어시 23+' },
  { sid: 'tank',       name: '강철 심장',   ic: '🛡️', members: ['Amumu', 'Malphite', 'Poppy', 'Rammus'], effType: 'lp_block', v2: 2, v3: 3, special: 'unbreakable', goldV2: 40, goldV3: 40, cond: '데스 8+' },
  { sid: 'demacia',    name: '여명의 의지', ic: '☀️',  members: ['Morgana', 'Poppy', 'Vayne'], effType: 'lp_block', v2: 2, v3: 3, cond: 'KDA 2.2+' },
  { sid: 'bilgewater', name: '해적의 보물', ic: '🏴‍☠️', members: ['Fizz', 'Gangplank'], effType: 'win_gold', v2: 40, v3: 60, cond: '골드 14,000+' },
  { sid: 'support',    name: '신성한 개입', ic: '💚',  members: ['Lulu', 'Morgana'], effType: 'win_gold', v2: 40, v3: 60, lossV2: 15, lossV3: 25, cond: '어시 15+' },
  { sid: 'mage',       name: '유레카',      ic: '🎲',  members: ['Brand', 'Malzahar', 'Mel'], effType: 'risk_win', v2: 5, v3: 6, lossV: 6, cond: '딜량 25,000+' },
  { sid: 'void',       name: '공허 균열',   ic: '🌀',  members: ['Khazix', 'Malzahar'], effType: 'risk_block', failV2: 6, failV3: 10 },
];
// 시너지 효과 문구 (홈 _synEffTxt 이식) — 전체 설명
function synEffTxt(g, tier) {
  const proc = SYN_PROC[tier] || 30, v = tier === 3 ? g.v3 : g.v2;
  switch (g.effType) {
    case 'win_lp':   return `${g.cond ? g.cond + ' 달성 후 ' : ''}승리 시 ${proc}% 확률로 LP +${v} 추가 획득`;
    case 'lp_block': { const cp = g.cond ? `${g.cond} · ` : ''; if (g.special === 'unbreakable') { const gl = tier === 3 ? g.goldV3 : g.goldV2; return `${cp}패배해도 ${proc}% 확률로 LP를 ${v} 덜 잃고 골드 +${gl}G`; } return `${cp}패배해도 ${proc}% 확률로 LP를 ${v} 덜 잃음`; }
    case 'win_gold': { const cp = g.cond ? `${g.cond} 달성 후 ` : ''; const lg = g.lossV2 != null ? (tier === 3 ? g.lossV3 : g.lossV2) : 0; return `${cp}승리 시 ${proc}% 확률로 골드 +${v}${lg ? ` · 패배 시 위로금 +${lg}G(무조건)` : ''}`; }
    case 'risk_win':  return `[양날의 검] 승리 시 ${g.cond ? g.cond + ' 달성하면 ' : ''}${proc}% 확률 LP +${v} · 패배 시 조건없이 ${proc}% 확률 LP −${g.lossV}`;
    case 'risk_block': { const f = tier === 3 ? g.failV3 : g.failV2; return `[도박] 패배 시 ${proc}% 확률로 잃을 LP 전부 방어 · 실패하면 LP −${f} 추가 손실 (승리 시 효과 없음)`; }
  }
  return '';
}
// 시너지 효과 짧은 요약 (아코디언 접힘 상태 한 줄)
function synEffShort(g, tier) {
  const v = tier === 3 ? g.v3 : g.v2;
  switch (g.effType) {
    case 'win_lp':   return `승리 LP +${v}`;
    case 'lp_block': return `패배 방어 LP ${v}${g.special === 'unbreakable' ? ' +골드' : ''}`;
    case 'win_gold': return `승리 골드 +${v}${g.lossV2 != null ? ' +위로금' : ''}`;
    case 'risk_win': return `LP +${v} / 패배 −${g.lossV}`;
    case 'risk_block': return `패배 LP 전액 방어 / 실패 −${tier === 3 ? g.failV3 : g.failV2}`;
  }
  return '';
}
const _TPOW = { stable: 1, precise: 3, overload: 6 };
const _emLevel = em => (em.slots || []).filter(s => s && s.ok).length;
const _emPower = em => (em.slots || []).reduce((s, x) => s + (x && x.ok ? (_TPOW[x.t] || 0) : 0), 0);
const _emGrade = p => p >= 25 ? '프리즘' : p >= 10 ? '골드' : p >= 1 ? '실버' : '기본';
// 🔨 강철심장 걸작 효과 정의 (홈 EMBLEM_EFFECTS 이식 — 표시용)
const EMBLEM_EFFECTS = {
  matchG:   { icon: '🪙', name: '경기 골드', color: '#cbd5e1', base: 5,  cap: 0,  fmt: v => `+${v}G` },
  winG:     { icon: '🏆', name: '승리 골드', color: '#ffd24a', base: 8,  cap: 0,  fmt: v => `+${v}G` },
  attend:   { icon: '📅', name: '출석 골드', color: '#34d399', base: 15, cap: 0,  fmt: v => `+${v}G` },
  mvpG:     { icon: '⭐', name: 'MVP 골드',  color: '#a78bfa', base: 15, cap: 0,  fmt: v => `+${v}G` },
  magollaG: { icon: '🎰', name: '막고라 배당', color: '#f472b6', base: 5, cap: 60, fmt: v => `+${v}%` },
  winLP:    { icon: '⚡', name: '승리 LP',   color: '#60a5fa', base: 2, cap: 6, fmt: v => `+${v}LP` },
  lossLP:   { icon: '🛡️', name: '패배 방어', color: '#7dd3fc', base: 2, cap: 6, fmt: v => `-${v}LP` },
  lottoTkt: { icon: '🎫', name: '해골 감소', color: '#7dd3fc', base: 1, cap: 1, fmt: v => `-${Math.round(v * 100)}%` },
  yuumiCut: { icon: '🐱', name: '유미 파견', color: '#c4b5fd', base: 4, cap: 30, perCap: 10, fmt: v => `-${v}분` },
  yuumiCool:{ icon: '💤', name: '유미 휴식', color: '#a5b4fc', base: 4, cap: 30, perCap: 10, fmt: v => `-${v}분` },
};
const _LOTTO_PER = 0.70 / 3, _EM_LPK = 0.025, _EM_LPCAP = 0.70;
function emPerLine(eid, power) {
  const d = EMBLEM_EFFECTS[eid]; if (!d) return 0;
  if (eid === 'lottoTkt') return _LOTTO_PER;
  if (eid === 'winLP' || eid === 'lossLP') return d.base;   // 효과량 고정(성능은 발동확률에)
  const v = Math.round(d.base * (1 + power * 0.1));
  return d.perCap ? Math.min(d.perCap, v) : v;
}
function emLpChance(power) { return power > 0 ? Math.min(_EM_LPCAP, power * _EM_LPK) : 0; }
// 걸작 최종 효과(줄×성능 합산) — 홈 emblemEffectsOf 이식
const _LOTTO_SKULL_CAP = 0.70;
function emblemEff(em) {
  const power = _emPower(em), mult = 1 + power * 0.1;
  const lines = Array.isArray(em && em.lines) ? em.lines : [];
  const eff = {};
  for (const eid of Object.keys(EMBLEM_EFFECTS)) {
    const cnt = lines.filter(l => l === eid).length, d = EMBLEM_EFFECTS[eid];
    if (!cnt) { eff[eid] = 0; continue; }
    if (eid === 'lottoTkt') { eff[eid] = Math.min(_LOTTO_SKULL_CAP, cnt * _LOTTO_PER); continue; }
    if (eid === 'winLP' || eid === 'lossLP') { eff[eid] = Math.min(d.cap, cnt * d.base); continue; }
    const per = d.perCap ? Math.min(d.perCap, Math.round(d.base * mult)) : Math.round(d.base * mult);
    let v = cnt * per; if (d.cap && v > d.cap) v = d.cap;
    eff[eid] = v;
  }
  return { power, eff };
}
// 걸작 효과 설명 — 이름 + 값 (아이콘 남발 X · 홈 _qibEmEffTxt 톤). 예: "해골 감소 -23% · 막고라 배당 +9%"
function emEffText(em) {
  const { power, eff } = emblemEff(em);
  const lpc = Math.round(emLpChance(power) * 100);
  const parts = Object.keys(EMBLEM_EFFECTS).filter(eid => eff[eid] > 0).map(eid => {
    const d = EMBLEM_EFFECTS[eid];
    let s = `${d.name} ${d.fmt(eff[eid])}`;
    if (eid === 'winLP' || eid === 'lossLP') s += ` (발동 ${lpc}%)`;
    return s;
  });
  return parts.length ? parts.join(' · ') : '걸작 미제작 (효과 없음)';
}
// 걸작 줄 효과 목록 HTML (홈 _emEffLines 이식)
function emEffLinesHtml(em) {
  const pw = _emPower(em), lpc = Math.round(emLpChance(pw) * 100);
  const lines = Array.isArray(em && em.lines) ? em.lines.filter(eid => EMBLEM_EFFECTS[eid]) : [];
  if (!lines.length) return `<div class="it-eff-empty">걸작 미제작 · 홈페이지 대장간에서 제작</div>`;
  return lines.map(eid => {
    const ef = EMBLEM_EFFECTS[eid], per = emPerLine(eid, pw);
    const pct = (eid === 'winLP' || eid === 'lossLP') ? `<span class="it-eff-pct">발동 ${lpc}%</span>` : '';
    return `<div class="it-eff-row"><span class="it-eff-nm">${ef.icon} ${esc(ef.name)}</span>${pct}<span class="it-eff-v" style="color:${ef.color}">${ef.fmt(per)}</span></div>`;
  }).join('');
}

function itemActive() { return !!(itemData && itemSecsLeft() > 0); }
// 절대 종료시각(endAt) 기준 = 우측 사이드패널(방장) 카운트다운과 동일 소스 → 같은 숫자로 동기화. 방장은 같은 기기라 정확 일치.
function itemSecsLeft() { return itemData ? Math.max(0, Math.min(15, Math.ceil((itemData.endAt - Date.now()) / 1000))) : 0; }
function _gd() { return (itemData && itemData.gold && itemData.gold.data) || {}; }
function _eqEmblemId(d) {   // 현재 장착 강철심장 id(명시적 장착 없으면 성능 1위=레거시 자동장착)
  const arr = (Array.isArray(d.emblems_s2) ? d.emblems_s2 : []).filter(Boolean);
  if (d.emblemEquipped_s2 != null) return d.emblemEquipped_s2;
  const top = arr.slice().sort((a, b) => _emPower(b) - _emPower(a))[0];
  return top ? top.id : null;
}
// 아코디언 1칸 HTML — 접힘(아이콘+이름+짧은효과+상태) / 펼침(효과 상세 + 액션 버튼)
function accHtml(akey, ic, title, short, badge, effHtml, btnHtml) {
  const open = _itOpen.has(akey) ? ' open' : '';
  return `<div class="it-acc${open}" data-akey="${akey}">`
    + `<div class="it-achd" data-k="${akey}"><span class="it-ic">${ic}</span>`
    + `<span class="it-info"><b>${title}</b><small>${esc(short)}</small></span>${badge}<span class="it-chev">▾</span></div>`
    + `<div class="it-acbody">${effHtml}${btnHtml}</div></div>`;
}
function toggleAcc(k) {
  if (_itOpen.has(k)) _itOpen.delete(k); else _itOpen.add(k);
  const acc = el('it-body').querySelector(`.it-acc[data-akey="${k}"]`);
  if (acc) acc.classList.toggle('open', _itOpen.has(k));
}
// 큰 틀 아코디언 1칸(강철심장·시너지 섹션) — 접힘=현재 장착/활성 요약 / 펼침=바꿀 목록
function secAcc(akey, ic, title, summary, bodyHtml) {
  const open = _itOpen.has(akey) ? ' open' : '';
  return `<div class="it-acc it-sec-acc${open}" data-akey="${akey}">`
    + `<div class="it-achd" data-k="${akey}"><span class="it-ic">${ic}</span>`
    + `<span class="it-info"><b>${title}</b><small>${esc(summary)}</small></span><span class="it-chev">▾</span></div>`
    + `<div class="it-acbody it-picks">${bodyHtml}</div></div>`;
}
function renderItem() {
  el('it-sec').textContent = itemSecsLeft();
  const d = _gd();
  const items = Array.isArray(d.items_s2) ? d.items_s2 : [];
  const cnt = id => items.filter(it => it && it.id === id).length;
  const on  = id => items.some(it => it && it.id === id && it.active);

  // ① 전투 아이템(보유=활성화 토글 / 미보유=구매)
  const itemsHtml = COMBAT_ITEMS.map(ci => {
    const owned = cnt(ci.id), act = on(ci.id), akey = `item:${ci.id}`;
    const badge = owned ? (act ? '<span class="it-badge on">✓ 켜짐</span>' : '<span class="it-badge own">보유</span>') : `<span class="it-badge buy">${ci.price}G</span>`;
    const btn = owned
      ? `<button class="it-act ${act ? 'act-on' : ''}" data-act="toggle" data-id="${ci.id}">${act ? '✓ 활성화됨 (탭해서 끄기)' : '활성화하기'}</button>`
      : `<button class="it-act act-buy" data-act="buy" data-id="${ci.id}">${ci.price}G 구매하기</button>`;
    const eff = `<div class="it-eff"><div class="it-eff-row"><span class="it-eff-nm">효과</span><span class="it-eff-v">${esc(ci.desc)}</span></div></div>`;
    return accHtml(akey, ci.ic, `${esc(ci.name)}${owned > 1 ? ` ×${owned}` : ''}`, ci.desc, badge, eff, btn);
  }).join('');

  // ② 강철심장 = 큰 틀 아코디언 1칸(접힘=장착 요약 / 펼침=바꿀 목록)
  const emblems = (Array.isArray(d.emblems_s2) ? d.emblems_s2 : []).filter(Boolean).slice().sort((a, b) => _emPower(b) - _emPower(a));
  const eqId = _eqEmblemId(d);
  const eqEm = emblems.find(e => e.id === eqId);
  const emSummary = eqEm ? `${eqEm.nick ? esc(eqEm.nick) : '+' + _emLevel(eqEm)} · 성능 ${_emPower(eqEm)} · ${_emGrade(_emPower(eqEm))}` : (emblems.length ? '장착 안 함 — 탭해서 선택' : '보유 없음');
  const emBody = emblems.length ? emblems.map(em => {
    const p = _emPower(em), lv = _emLevel(em), g = _emGrade(p), eq = em.id === eqId;
    return `<div class="it-pick${eq ? ' on' : ''}"><div class="it-pick-row">`
      + `<div class="it-pick-main"><b>${em.nick ? esc(em.nick) : '강철심장 +' + lv} <em class="g-${g}">${g}</em></b><small>성능 ${p} · Lv${lv}</small></div>`
      + `<button class="it-pick-btn${eq ? ' on' : ''}" data-act="emblem" data-id="${em.id}">${eq ? '✓ 장착' : '장착'}</button></div>`
      + `<div class="it-pick-eff">${esc(emEffText(em))}</div></div>`;
  }).join('') : '<div class="it-empty">보유한 강철심장이 없어요</div>';
  const emHtml = secAcc('sec:emblem', '⚒️', '강철심장', emSummary, emBody);

  // ③ 시너지 = 큰 틀 아코디언 1칸(접힘=활성 요약 / 펼침=카드 완성분 목록)
  const cards = d.champCards_s2 || {};
  const ownsTier = (g, t) => g.members.every(s => { const c = cards[s] || {}; return t === 3 ? (c.s3 || 0) >= 1 : ((c.s2 || 0) >= 1 || (c.s3 || 0) >= 1); });
  const asyn = d.activeSynergy_s2 || null;
  const synList = SYN_GROUPS.map(g => { const t = ownsTier(g, 3) ? 3 : ownsTier(g, 2) ? 2 : 0; return t ? { g, t } : null; }).filter(Boolean);
  const activeG = asyn ? SYN_GROUPS.find(g => g.sid === asyn.sid) : null;
  const synSummary = activeG ? `${activeG.name} ${asyn.tier}성` : (synList.length ? '활성화 안 함 — 탭해서 선택' : '완성된 시너지 없음');
  const synBody = synList.length ? synList.map(({ g, t }) => {
    const act = asyn && asyn.sid === g.sid && asyn.tier === t;
    return `<div class="it-pick${act ? ' on' : ''}"><div class="it-pick-row">`
      + `<div class="it-pick-main"><b>${esc(g.name)} ${t}성</b></div>`
      + `<button class="it-pick-btn${act ? ' on' : ''}" data-act="synergy" data-sid="${g.sid}" data-tier="${t}">${act ? '✓ 활성' : '활성화'}</button></div>`
      + `<div class="it-pick-eff">${esc(synEffTxt(g, t))}</div></div>`;
  }).join('') : '<div class="it-empty">활성화할 시너지가 없어요 (카드 미완성)</div>';
  const synHtml = secAcc('sec:synergy', '🃏', '시너지', synSummary, synBody);

  el('it-body').innerHTML = `<div class="it-sec-h">🎒 전투 아이템</div>${itemsHtml}${emHtml}${synHtml}`;
  el('it-body').querySelectorAll('.it-achd').forEach(h => h.onclick = () => toggleAcc(h.dataset.k));
  el('it-body').querySelectorAll('.it-act, .it-pick-btn').forEach(b => b.onclick = (e) => { e.stopPropagation(); onItemAction(b); });
}

async function onItemAction(b) {
  if (_itemBusy) return; _itemBusy = true; b.classList.add('busy');
  el('it-err').style.display = 'none';
  const d = _gd(), act = b.dataset.act;
  let r;
  try {
    if (act === 'toggle') r = await window.api.itemToggle(b.dataset.id);
    else if (act === 'buy') r = await window.api.itemBuy(b.dataset.id);
    else if (act === 'emblem') { const clicked = Number(b.dataset.id), cur = _eqEmblemId(d); r = await window.api.emblemEquip(clicked === cur ? null : clicked); if (r && r.ok) d.emblemEquipped_s2 = (clicked === cur ? null : clicked); }
    else if (act === 'synergy') { const sid = b.dataset.sid, t = Number(b.dataset.tier); r = await window.api.synergyEquip(sid, t); if (r && r.ok) { const cur = d.activeSynergy_s2; d.activeSynergy_s2 = (cur && cur.sid === sid && cur.tier === t) ? null : { sid, tier: t }; } }
  } catch (e) { r = { ok: false, err: String((e && e.message) || e) }; }
  _itemBusy = false; b.classList.remove('busy');
  if (!r || !r.ok) { el('it-err').textContent = '⚠️ ' + ((r && r.err) || '실패'); el('it-err').style.display = ''; return; }
  // 낙관적 로컬 반영(다음 3초 폴링이 확정)
  if (act === 'toggle') {
    const items = Array.isArray(d.items_s2) ? d.items_s2 : [];
    const wasOn = items.some(it => it && it.id === b.dataset.id && it.active);
    const conflict = { s1_gamble: ['s1_lp2x'], s1_lp2x: ['s1_gamble'], s1_promo_shield: ['s1_promo_win'], s1_promo_win: ['s1_promo_shield'] }[b.dataset.id] || [];
    const off = new Set([b.dataset.id, ...conflict]);
    items.forEach(it => { if (off.has(it.id)) it.active = false; });
    if (!wasOn) { const t = items.find(it => it.id === b.dataset.id); if (t) t.active = true; }
  } else if (act === 'buy') {
    if (!Array.isArray(d.items_s2)) d.items_s2 = [];
    d.items_s2.push({ id: b.dataset.id, active: false });
  }
  renderItem();
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

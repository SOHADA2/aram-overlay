// ── 오버레이 렌더러 ─────────────────────────────────────────────────────
// 뷰 2종: (1) 팀 배정(Firebase session 기반) (2) 참가자 명단(인게임 2999 기반)
// 데이터는 메인 프로세스가 IPC로: session(팀), players(인게임명단+LP), state(게임여부), myname(내 이름)
const TIER_SHORT = { iron:'I', bronze:'B', silver:'S', gold:'G', platinum:'P', emerald:'E', diamond:'D', master:'M', grandmaster:'GM', challenger:'C' };
const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();   // LP 매칭용(공백제거+소문자)
const nn = s => String(s || '').trim().replace(/\s+/g, ' ');          // 홈페이지 normName(공백 1칸·소문자 아님)
const fbKeyOf = name => nn(name).replace(/\s+/g, '_');                // 홈페이지 투표 키
const el = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

let sessionData = null, myName = '', roster = [], lpMap = {}, inGame = false, phaseLabel = '대기', myIsHost = false;
let _gamePlayed = false, _lastFormedSeen = 0;   // 🏁 이번 팀결성으로 게임이 이미 진행됐는지 — 게임 후엔 '팀 배정'으로 되돌아가지 않고 '정산 대기'로 (다음 팀결성 때 리셋)

el('close').addEventListener('click', () => window.api.hideOverlay());

let settleData = null;   // 💰 최근 정산 {settle, lpNow}
let itemData = null, _itemPhaseKey = 0, _itemSeenAt = 0, _itemBusy = false, _itOpen = new Set();   // 🎒 아이템 페이즈(_itOpen=펼친 아코디언)
window.api.onState(({ inGame: ig, label }) => { const was = inGame; inGame = !!ig; if (inGame && !was) _gamePlayed = true; phaseLabel = label || (ig ? '게임 중' : '대기'); render(); });
window.api.onPlayers(({ players, lpMap: m }) => { roster = players || []; if (m) lpMap = m; render(); });
window.api.onSession(({ session, myName: mn, lpMap: m, isHost }) => { sessionData = session || null; const f = (session && session.teamsFormedAt) || 0; if (f && f !== _lastFormedSeen) { _lastFormedSeen = f; _gamePlayed = false; } if (mn !== undefined) myName = mn || ''; if (m) lpMap = m; if (isHost !== undefined) myIsHost = !!isHost; render(); });
window.api.onMyName(name => { myName = name || ''; render(); });
window.api.onDocked(v => { document.body.classList.toggle('docked', !!v); });   // 🖥️ 도킹 중=각진 모서리
window.api.onSettlement(d => { settleData = d || null; render(); });
let myStats = null;   // 🎮 인게임 — 오늘 전적·연승
window.api.onMystats(d => { myStats = d || null; if (inGame) render(); });
let lobbyData = null;   // 🛠️ 방장이 팀 구성 준비 중(참가자 고르는 중)
window.api.onLobby(d => { lobbyData = d || null; render(); });
let magollaData = null;   // 🥊 막고라 진행 중(배팅/정산은 홈페이지)
window.api.onMagolla && window.api.onMagolla(d => { magollaData = (d && d.matchId) ? d : null; render(); });
window.api.onItemPhase(d => {
  itemData = d || null;
  if (d && d.endAt !== _itemPhaseKey) { _itemPhaseKey = d.endAt; _itemSeenAt = Date.now(); _itOpen.clear(); }   // 새 페이즈 = 로컬 15초 시작(아코디언 초기화)
  render();
});
setInterval(() => { if (itemActive()) { const l = itemSecsLeft(); const e = el('it-sec'); if (e) e.textContent = l; updateItemBar(l); if (l <= 0) render(); } }, 500);

function showView(v) {
  el('view-team').style.display   = v === 'team'   ? 'flex'  : 'none';
  el('view-item').style.display   = v === 'item'   ? 'block' : 'none';
  el('view-vote').style.display   = v === 'vote'   ? 'block' : 'none';
  el('view-settle').style.display = v === 'settle' ? 'block' : 'none';
  el('view-roster').style.display = v === 'roster' ? 'block' : 'none';
  el('view-ingame').style.display = v === 'ingame' ? 'block' : 'none';
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

// 🛠️ 방장 팀 구성 준비 중 안내(대기 화면) — 홈페이지 /lobby와 동일. 방장 본인은 제외(자기 UI).
function _lobbyBanner() {
  const L = lobbyData;
  if (!L || !L.at || myIsHost) return null;
  const age = Date.now() - L.at;
  if (L.state === 'cancelled' && age < 7000)
    return '<span class="lobby-pulse cancel"></span>❌ 팀 결성이 취소됐어요<br><span class="status-sub">방장이 다시 준비하면 여기에 떠요.</span>';
  if (L.state === 'preparing' && age < 30 * 60 * 1000) {
    const parts = Array.isArray(L.participants) ? L.participants : [];
    const who = esc(L.by || '방장');
    const meIn = myName && parts.some(n => nn(n) === nn(myName));
    const sub = meIn
      ? '<b style="color:#0AC8B9">✅ 나를 선택했어요</b> · 잠시만 기다려주세요'
      : `대기 중이에요 · ${parts.length}명 선택됨`;
    return `<span class="lobby-pulse"></span>🛠️ ${who}님이 팀을 짜는 중이에요<br><span class="status-sub">${sub}</span>`;
  }
  return null;
}
// 🥊 막고라 진행 중 안내(대기 화면) — 배팅/정산은 홈페이지(우측 내 정보 패널)에서
function _magollaBanner() {
  const m = magollaData;
  if (!m || !m.matchId) return null;
  const f1 = esc(m.fighter1 || '?'), f2 = esc(m.fighter2 || '?');
  const meFighter = myName && (nn(m.fighter1) === nn(myName) || nn(m.fighter2) === nn(myName));
  const st = m.status === 'settled' ? '정산 완료' : m.status === 'closed' ? '배팅 마감' : '배팅 중';
  const sub = meFighter ? '⚔️ 내가 파이터예요 · 최선을 다해요!' : '우측 「내 정보」 패널에서 배팅해요';
  return `<span class="lobby-pulse mg"></span>🥊 막고라 · <b style="color:#ff9a8a">${f1}</b> vs <b style="color:#ff9a8a">${f2}</b><br><span class="status-sub">${st} · ${sub}</span>`;
}
function renderRoster() {
  const has = roster.length;
  el('roster-h').style.display = has ? 'block' : 'none';
  el('pcount').textContent = has ? `${roster.length}명` : '';
  el('status').style.display = has ? 'none' : 'block';
  const lobHtml = has ? null : (_magollaBanner() || _lobbyBanner());
  el('status').classList.toggle('lobby', !!lobHtml);
  if (!has) el('status').innerHTML = lobHtml || (_gamePlayed
    ? '🏁 경기 종료<br><span class="status-sub">정산을 기다리는 중이에요.<br>잠시 후 투표·정산이 자동으로 떠요.</span>'
    : '⚔️ 팀짜기 대기 중<br><span class="status-sub">방장이 팀을 짜거나 게임을 시작하면<br>여기에 자동으로 떠요.</span>');
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
  const pending = A.filter(n => !done('teamA', n)).length + B.filter(n => !done('teamB', n)).length;
  el('vt-progress').innerHTML =
    `<div class="vt-prow"><span class="t-blue">1팀</span>${A.map(n => chip('teamA', n)).join('')}</div>` +
    `<div class="vt-prow"><span class="t-red">2팀</span>${B.map(n => chip('teamB', n)).join('')}</div>` +
    (myIsHost ? `<button id="vt-force" class="ui-btn-ghost vt-force">⏭️ 정산 마감${pending ? ` · 미투표 ${pending}명 무시` : ''}</button><div class="vt-force-hint">방장 전용 · 정산창이 안 뜰 때 눌러요</div>` : '');
  if (myIsHost) {
    const fb = el('vt-force');
    if (fb) fb.onclick = async () => {
      if (fb.disabled) return;
      const t0 = fb.textContent; fb.disabled = true; fb.textContent = '정산 발행 중…';
      const r = await window.api.forceSettle();
      if (r && r.ok) { fb.textContent = '✅ 정산 발행 요청됨 — 곧 정산창이 떠요'; }
      else { fb.textContent = '⚠️ ' + ((r && r.err) || '실패'); setTimeout(() => { fb.disabled = false; fb.textContent = t0; }, 2800); }
    };
  }
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
// 🎒 사용 아이템 칩(정산창 이름 표시용)
const SETTLE_ITEM_LABELS = {
  s1_gamble:       { ic: '🎲', name: '도박권' },
  s1_promo_win:    { ic: '⚔️', name: '승급전 승리권' },
  s1_promo_shield: { ic: '🛡️', name: '승급전 방어권' },
  s1_lp2x:         { ic: '✨', name: 'LP 2배권' },
};
function settleItemChips(name) {
  const items = (settleData.procs && settleData.procs.items && settleData.procs.items[nn(name)]) || [];
  const chips = items.filter(id => SETTLE_ITEM_LABELS[id]).map(id => `<span class="st-item" title="${SETTLE_ITEM_LABELS[id].name}">${SETTLE_ITEM_LABELS[id].ic}</span>`).join('');
  return chips ? `<span class="st-items">${chips}</span>` : '';
}
// 💰 각자 총 획득 골드 — 홈 showMatchSummary playerRow와 동일 합산(기본 승15/패5·quest·MVP/매너50·시너지·강철심장. S2=뉴비 OFF)
function settleGold(name, isWin) {
  const s = settleData.settle, k = nn(name);
  let gold;
  if (s.questEvent) gold = isWin ? (s.questEvent.bonusGold || 0) : 0;
  else gold = isWin ? 15 : 5;
  const isMvp = k === nn(s.mvpWinner || '') || k === nn(s.mvpLoser || '');
  if (isMvp) gold += 50;
  if (k === nn(s.mannerWinner || '') || k === nn(s.mannerLoser || '')) gold += 50;
  const pr = settleData.procs || {};
  const se = pr.syn && pr.syn[k];
  if (se && se.goldDelta) gold += se.goldDelta;
  const em = pr.em && pr.em[k];
  if (em) { let eg = (em.matchG || 0) + (isWin ? (em.winG || 0) : 0); if (isMvp) eg += (em.mvpG || 0); gold += eg; }
  return gold;
}
function settleTeamHtml(names, isWin, badgeMap) {
  const rows = (names || []).map(name => {
    const me = (myName && nn(name) === nn(myName)) ? ' me' : '';
    const b = badgeMap[nn(name)] || '';
    return `<li class="${me.trim()}"><span class="st-nm">${esc(name)}${b}${settleItemChips(name)}</span>${lpDeltaHtml(name)}<span class="st-gold">+${settleGold(name, isWin)}G</span></li>`;
  }).join('');
  return `<div class="st-team ${isWin ? 'win' : 'lose'}"><div class="st-team-h">${isWin ? '🏆 승리' : '패배'}</div><ul>${rows}</ul></div>`;
}
// 💥 이번 판 발동 효과 — 시너지(홈 _synColl 이식). 발동=전원 공개 / 미발동·역효과=본인만
function _settleSynProc(name, isWin) {
  const se = settleData.procs && settleData.procs.syn && settleData.procs.syn[nn(name)];
  if (!se || !se.sid) return null;
  const g = SYN_GROUPS.find(x => x.sid === se.sid);
  if (!g) return null;
  const t = se.tier === 3 ? 3 : 2, v = t === 3 ? g.v3 : g.v2, proc = !!se.procced;
  let fired = false, backfire = false, relevant = false, fx = '';
  switch (g.effType) {
    case 'win_lp':   relevant = isWin; if (proc && isWin) { fired = true; fx = `승리 LP +${v}`; } break;
    case 'win_gold': relevant = isWin || (g.lossV2 != null); if (proc && se.goldDelta) { fired = true; fx = isWin ? `골드 +${se.goldDelta}G` : `위로금 +${se.goldDelta}G`; } break;
    case 'lp_block': relevant = !isWin; if (proc && !isWin) { const p = [`LP ${v} 방어`]; if (se.goldDelta) p.push(`위로금 +${se.goldDelta}G`); fired = true; fx = p.join(' · '); } break;
    case 'risk_win': relevant = true; if (proc && isWin) { fired = true; fx = `LP +${v}`; } else if (proc && !isWin) { backfire = true; fx = `LP -${g.lossV}`; } break;
    case 'risk_block': relevant = !isWin; if (!isWin && proc) { fired = true; fx = '손실 전액 방어'; } else if (!isWin && !proc) { backfire = true; fx = `LP -${t === 3 ? g.failV3 : g.failV2}`; } break;
  }
  const isMe = myName && nn(name) === nn(myName);
  if (fired) return { name, ic: g.ic, label: g.name, fx, miss: false };
  if (isMe && (relevant || backfire)) {
    const msg = backfire ? `역효과 ${fx}` : (se.condFail && g.cond) ? `${g.cond} 미달 — 미발동` : '발동 실패';
    return { name, ic: g.ic, label: g.name, fx: msg, miss: true };
  }
  return null;
}
// 💥 강철심장 걸작 발동(홈 emblemSnap 이식) — LP/골드
function _settleEmProc(name, isWin) {
  const em = settleData.procs && settleData.procs.em && settleData.procs.em[nn(name)];
  if (!em) return null;
  const s = settleData.settle;
  const items = (settleData.procs.items && settleData.procs.items[nn(name)]) || [];
  const s1item = items.find(e => typeof e === 'string' && e.startsWith('s1_'));
  const before = (s.s1LpBefore || {})[nn(name)];
  const suppress = (s1item === 's1_gamble') || (before && (before.placementDone === false || before.promoActive));   // 도박권·배치·승급전은 LP 발동 제외(홈과 동일)
  const parts = [];
  if (isWin && em.winLpProc && em.winLP && !suppress) parts.push(`승리 LP +${em.winLP}`);
  if (!isWin && em.lossLpProc && em.lossLP && !suppress) parts.push(`LP ${em.lossLP} 방어`);
  const isMvp = nn(name) === nn(s.mvpWinner || '') || nn(name) === nn(s.mvpLoser || '');
  let eg = (em.matchG || 0) + (isWin ? (em.winG || 0) : 0);
  if (isMvp) eg += (em.mvpG || 0);
  if (eg) parts.push(`골드 +${eg}G`);
  if (!parts.length) return null;
  return { name, ic: '🔨', label: '강철심장', fx: parts.join(' · '), miss: false };
}
function _settleProcsHtml() {
  if (!settleData.procs) return '';
  const s = settleData.settle, rows = [];
  const collect = (names, isWin) => (names || []).forEach(n => {
    const sp = _settleSynProc(n, isWin); if (sp) rows.push(sp);
    const ep = _settleEmProc(n, isWin); if (ep) rows.push(ep);
  });
  collect(s.winners, true); collect(s.losers, false);
  if (!rows.length) return '';
  const body = rows.map(r => `<div class="st-proc${r.miss ? ' miss' : ''}"><span class="st-proc-nm">${esc(r.name)}</span><span class="st-proc-mid">${r.ic} ${esc(r.label)}</span><span class="st-proc-fx">${esc(r.fx)}</span></div>`).join('');
  return `<div class="st-procs-h">⚡ 이번 판 발동 효과</div>${body}`;
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
  el('st-procs').innerHTML = _settleProcsHtml();
  el('st-close').onclick = () => { if (s.matchKey) markSettleSeen(s.matchKey); settleData = null; render(); };
}

// ── 🎒 아이템 사용(팀 구성 직전 15초) ────────────────────────────────────
// 홈페이지에서 미리 산 전투 아이템을 여기서 활성화. items_s2 토글(main.js가 상호배제·조건 검증·Firebase write).
// 홈페이지 아이템 페이즈 pill과 동일한 전투 아이템 3종(구매/활성화).
const COMBAT_ITEMS = [
  { id: 's1_gamble',       name: '도박권',        ic: '🎲', desc: '승 +40 / 패 −30 LP', price: 60 },
  { id: 's1_promo_shield', name: '승급전 방어권', ic: '🛡️', desc: '승급전 패배 무효',   price: 100 },
  { id: 's1_promo_win',    name: '승급전 승리권', ic: '⚔️', desc: '승급전 승리 = 2승',   price: 100 },
];
// LP 2배권 = 릴레이/단짝 보상 전용(구매 불가) — 보유자에게만 표시(홈 인벤토리 활성화와 동일 기능)
const LP2X_ITEM = { id: 's1_lp2x', name: 'LP 2배권', ic: '✨', desc: '승리 LP 2배 (보상 아이템)', price: 0 };
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
// ⏳ 실제로 줄어드는 시간 바 — 남은 비율(연속값)로 폭, 5초 이하 긴박(빨강)
function updateItemBar(secs) {
  const bar = el('it-bar'); if (!bar || !itemData) return;
  const frac = Math.max(0, Math.min(1, (itemData.endAt - Date.now()) / 15000));
  bar.style.width = (frac * 100) + '%';
  const urgent = secs <= 5;
  bar.classList.toggle('urgent', urgent);
  const t = bar.closest('.it-timer'); if (t) t.classList.toggle('urgent', urgent);
}
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
async function ovCtrl(fn) {
  let r = await fn();
  if (r && r.ctrl && await uiConfirm((r.err || '🔒 다른 기기에서 조작 중이에요') + '\n이 기기에서 조작 권한을 가져올까요?', { ok: '권한 가져오기', cancel: '취소' })) {
    await window.api.takeControl();
    r = await fn();
  }
  return r;
}
function _gd() { return (itemData && itemData.gold && itemData.gold.data) || {}; }
function _eqEmblemId(d) {   // 현재 장착 강철심장 id(명시적 장착 없으면 성능 1위=레거시 자동장착)
  const arr = (Array.isArray(d.emblems_s2) ? d.emblems_s2 : []).filter(Boolean);
  if (d.emblemEquipped_s2 != null) return d.emblemEquipped_s2;
  const top = arr.slice().sort((a, b) => _emPower(b) - _emPower(a))[0];
  return top ? top.id : null;
}
// 아코디언 1칸 HTML — 접힘(아이콘+이름+짧은효과+상태) / 펼침(효과 상세 + 액션 버튼)
function accHtml(akey, title, short, badge, effHtml, btnHtml) {
  const open = _itOpen.has(akey) ? ' open' : '';
  return `<div class="it-acc${open}" data-akey="${akey}">`
    + `<div class="it-achd" data-k="${akey}">`
    + `<span class="it-info"><b>${title}</b><small>${esc(short)}</small></span>${badge}<span class="it-chev">▾</span></div>`
    + `<div class="it-acbody">${effHtml}${btnHtml}</div></div>`;
}
function toggleAcc(k) {
  if (_itOpen.has(k)) _itOpen.delete(k); else _itOpen.add(k);
  const acc = el('it-body').querySelector(`.it-acc[data-akey="${k}"]`);
  if (acc) acc.classList.toggle('open', _itOpen.has(k));
}
// 큰 틀 아코디언 1칸(강철심장·시너지 섹션) — 접힘=현재 장착/활성 요약 / 펼침=바꿀 목록
function secAcc(akey, title, summary, effText, bodyHtml) {
  const open = _itOpen.has(akey) ? ' open' : '';
  const eff = effText ? `<span class="it-sec-eff">${esc(effText)}</span>` : '';
  return `<div class="it-acc it-sec-acc${open}" data-akey="${akey}">`
    + `<div class="it-achd" data-k="${akey}">`
    + `<span class="it-info"><b>${title}</b><small>${esc(summary)}</small>${eff}</span><span class="it-chev">▾</span></div>`
    + `<div class="it-acbody it-picks">${bodyHtml}</div></div>`;
}
function renderItem() {
  el('it-sec').textContent = itemSecsLeft();
  updateItemBar(itemSecsLeft());
  const d = _gd();
  const items = Array.isArray(d.items_s2) ? d.items_s2 : [];
  const cnt = id => items.filter(it => it && it.id === id).length;
  const on  = id => items.some(it => it && it.id === id && it.active);

  // ① 전투 아이템(보유=활성화 토글 / 미보유=구매) — LP2배권은 보유자에게만(구매 없음)
  const itemList = cnt(LP2X_ITEM.id) ? [...COMBAT_ITEMS, LP2X_ITEM] : COMBAT_ITEMS;
  const itemsHtml = itemList.map(ci => {
    const owned = cnt(ci.id), act = on(ci.id), akey = `item:${ci.id}`;
    const badge = owned ? (act ? '<span class="it-badge on">✓ 켜짐</span>' : '<span class="it-badge own">보유</span>') : `<span class="it-badge buy">${ci.price}G</span>`;
    const btn = owned
      ? `<button class="it-act ${act ? 'act-on' : ''}" data-act="toggle" data-id="${ci.id}">${act ? '✓ 활성화됨 (탭해서 끄기)' : '활성화하기'}</button>`
      : `<button class="it-act act-buy" data-act="buy" data-id="${ci.id}">${ci.price}G 구매하기</button>`;
    const eff = `<div class="it-eff"><div class="it-eff-row"><span class="it-eff-nm">효과</span><span class="it-eff-v">${esc(ci.desc)}</span></div></div>`;
    return accHtml(akey, `${esc(ci.name)}${owned > 1 ? ` ×${owned}` : ''}`, ci.desc, badge, eff, btn);
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
  const emHtml = secAcc('sec:emblem', '강철심장', emSummary, eqEm ? emEffText(eqEm) : '', emBody);

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
  const synHtml = secAcc('sec:synergy', '시너지', synSummary, activeG ? synEffShort(activeG, asyn.tier) : '', synBody);

  el('it-body').innerHTML = `<div class="it-sec-h">전투 아이템</div>${itemsHtml}${emHtml}${synHtml}`;
  el('it-body').querySelectorAll('.it-achd').forEach(h => h.onclick = () => toggleAcc(h.dataset.k));
  el('it-body').querySelectorAll('.it-act, .it-pick-btn').forEach(b => b.onclick = (e) => { e.stopPropagation(); onItemAction(b); });
}

async function onItemAction(b) {
  if (_itemBusy) return; _itemBusy = true; b.classList.add('busy');
  el('it-err').style.display = 'none';
  const d = _gd(), act = b.dataset.act;
  let r;
  try {
    if (act === 'toggle') r = await ovCtrl(() => window.api.itemToggle(b.dataset.id));
    else if (act === 'buy') r = await ovCtrl(() => window.api.itemBuy(b.dataset.id));
    else if (act === 'emblem') { const clicked = Number(b.dataset.id), cur = _eqEmblemId(d); r = await ovCtrl(() => window.api.emblemEquip(clicked === cur ? null : clicked)); if (r && r.ok) d.emblemEquipped_s2 = (clicked === cur ? null : clicked); }
    else if (act === 'synergy') { const sid = b.dataset.sid, t = Number(b.dataset.tier); r = await ovCtrl(() => window.api.synergyEquip(sid, t)); if (r && r.ok) { const cur = d.activeSynergy_s2; d.activeSynergy_s2 = (cur && cur.sid === sid && cur.tier === t) ? null : { sid, tier: t }; } }
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

// ── 🎮 인게임 뷰 (전투 중) — 내 빌드 + 이기면/지면 LP 동기부여 ──
const LP_WIN = 20, LP_LOSS = 14, LP_CAP = 100, GMB_WIN = 40, GMB_LOSS = 30;
function _myLpState() {
  const detail = (itemData && itemData.lp) || {};   // 팀빌드 때 박제된 내 LP 상세(placement/promo)
  const basic = lpMap[nn(myName)] || {};
  return {
    tier: detail.tier || basic.tier || '',
    lp: (detail.lp != null ? detail.lp : (basic.lp != null ? basic.lp : 0)),
    placementDone: detail.placementDone,
    placementGames: detail.placementGames || 0,
    promoActive: !!detail.promoActive,
    promoWins: detail.promoWins || 0,
    promoLosses: detail.promoLosses || 0,
  };
}
function renderIngame() {
  const d = _gd();
  const st = _myLpState();
  const items = Array.isArray(d.items_s2) ? d.items_s2 : [];
  const on = id => items.some(it => it && it.id === id && it.active);
  const tierKr = TIER_KR[st.tier] || st.tier || '—';

  // ⬆️ 승급/강등 컨텍스트 — 챌린저=상한 없음 / 플래+ 0 미만=이전 티어 75LP 강등(홈 S1_NO_DEMOTE 규칙)
  const isChall = st.tier === 'challenger';
  const DEMOTE_TIERS = ['platinum', 'diamond', 'master', 'grandmaster', 'challenger'];   // 강등 있는 티어(브/실/골=0 바닥)
  const PREV_TIER = { platinum: 'gold', diamond: 'platinum', master: 'diamond', grandmaster: 'master', challenger: 'grandmaster' };
  let promoCtx;
  if (st.placementDone === false) promoCtx = `배치 ${st.placementGames}/5`;
  else if (st.promoActive) promoCtx = `⚔️ 승급전 ${st.promoWins}승 ${st.promoLosses}패`;
  else if (isChall) promoCtx = '정점 · LP 상한 없음';
  else promoCtx = (st.lp <= 15 && DEMOTE_TIERS.includes(st.tier)) ? `⚠️ 강등 위험 · 승급까지 ${LP_CAP - st.lp}` : `승급까지 ${LP_CAP - st.lp} LP`;

  // 🔥 오늘 전적·연승 (경기 전 기준)
  let todayHtml = '';
  if (myStats) {
    const parts = [];
    if (myStats.todayW || myStats.todayL) parts.push(`오늘 <b>${myStats.todayW}승 ${myStats.todayL}패</b>`);
    if (myStats.streakType && myStats.streakCount >= 2) parts.push(myStats.streakType === 'win' ? `🔥 <b class="ig-win">${myStats.streakCount}연승</b>` : `❄️ <b class="ig-lose">${myStats.streakCount}연패</b>`);
    if (parts.length) todayHtml = `<div class="ig-today">${parts.join(' · ')}</div>`;
  }

  // 이기면 / 지면 — 배치·승급전·정규전 분기
  let winB, winSub, lossB, lossSub, lpBar = '';
  if (st.placementDone === false) {
    winB = '배치 1승'; winSub = `${st.placementGames + 1}/5 판`;
    lossB = '배치 1패'; lossSub = `${st.placementGames + 1}/5 판`;
  } else if (st.promoActive) {
    winB = '승급 1승'; winSub = `${st.promoWins + 1}승 · 2승이면 승급 🔥`;
    lossB = '승급 1패'; lossSub = `${st.promoLosses + 1}패 · 2패면 실패`;
  } else {
    const gamble = on('s1_gamble'), lp2x = on('s1_lp2x');
    const wLp = gamble ? GMB_WIN : (lp2x ? LP_WIN * 2 : LP_WIN);
    const lLp = gamble ? GMB_LOSS : LP_LOSS;
    if (isChall) {   // 챌린저: LP 무제한(캡·승급전 없음), 0 미만=그마 75 강등
      winB = `+${wLp} LP`; winSub = `→ ${st.lp + wLp} LP`;
    } else {
      const winTo = Math.min(LP_CAP, st.lp + wLp);
      winB = `+${wLp} LP`; winSub = winTo >= LP_CAP ? '🔥 승급전 진입!' : `→ ${winTo} LP`;
      lpBar = `<div class="ig-lpbar-track"><div class="ig-lpbar" style="width:${Math.min(100, st.lp)}%"></div></div>`;
    }
    lossB = `−${lLp} LP`;
    if (st.lp - lLp < 0 && DEMOTE_TIERS.includes(st.tier)) lossSub = `⚠️ ${TIER_KR[PREV_TIER[st.tier]] || ''} 강등 (75 LP)`;
    else lossSub = `→ ${Math.max(0, st.lp - lLp)} LP`;
  }

  // 내 빌드 — 장착 강철심장 · 활성 시너지 · 활성 아이템
  const emblems = (Array.isArray(d.emblems_s2) ? d.emblems_s2 : []).filter(Boolean).slice().sort((a, b) => _emPower(b) - _emPower(a));
  const eqEm = emblems.find(e => e.id === _eqEmblemId(d));
  const asyn = d.activeSynergy_s2 || null;
  const activeG = asyn ? SYN_GROUPS.find(g => g.sid === asyn.sid) : null;
  const rows = [];
  const actItems = items.filter(it => it && it.active && SETTLE_ITEM_LABELS[it.id]);
  if (actItems.length) rows.push(`<div class="ig-items">${actItems.map(it => `<span class="ig-item">${SETTLE_ITEM_LABELS[it.id].ic} ${SETTLE_ITEM_LABELS[it.id].name}</span>`).join('')}</div>`);
  if (eqEm) rows.push(`<div class="ig-build"><div class="ig-build-nm">${eqEm.nick ? esc(eqEm.nick) : '강철심장 +' + _emLevel(eqEm)} · ${_emGrade(_emPower(eqEm))}</div><div class="ig-build-eff">${esc(emEffText(eqEm))}</div></div>`);
  if (activeG) rows.push(`<div class="ig-build"><div class="ig-build-nm">${esc(activeG.name)} ${asyn.tier}성</div><div class="ig-build-eff">${esc(synEffShort(activeG, asyn.tier))}</div></div>`);
  const buildHtml = rows.length ? `<div class="ig-sec">내 빌드</div>${rows.join('')}` : '<div class="ig-empty">이번 판 장착한 빌드가 없어요</div>';

  // 🎯 이번 판 목표 — 활성 시너지 발동 조건
  let goalHtml = '';
  if (activeG) {
    const proc = SYN_PROC[asyn.tier] || 30;
    const head = activeG.cond ? `${activeG.cond} 달성` : activeG.name;
    goalHtml = `<div class="ig-goal"><span class="ig-goal-ic">🎯</span><div class="ig-goal-tx"><b>이번 판 목표 · ${esc(head)}</b><span>${esc(activeG.name)} ${esc(synEffShort(activeG, asyn.tier))} · 발동 ${proc}%</span></div></div>`;
  }

  el('ig-body').innerHTML =
    `<div class="ig-lp"><span class="ig-tier">${tierKr}</span><b class="ig-lpnum">${st.lp} LP</b><span class="ig-promoctx">${promoCtx}</span></div>${lpBar}`
    + todayHtml
    + `<div class="ig-outs"><div class="ig-out win"><span class="ig-out-lbl">이기면</span><b>${winB}</b><span class="ig-out-sub">${winSub}</span></div>`
    + `<div class="ig-out lose"><span class="ig-out-lbl">지면</span><b>${lossB}</b><span class="ig-out-sub">${lossSub}</span></div></div>`
    + goalHtml
    + buildHtml;
}
function render() {
  if (itemActive()) { renderItem(); showView('item'); el('phase').textContent = '아이템'; return; }
  if (settleActive()) { renderSettle(); showView('settle'); el('phase').textContent = '정산'; return; }
  const hasTeams = sessionData && sessionData.active && (((sessionData.teamA || []).length) || ((sessionData.teamB || []).length));
  if (hasTeams && isVoting()) {   // 🗳️ 투표=경기 종료 신호 → 인게임보다 우선(끝난 순간 확실히 뜨게)
    // 팀이 바뀌면 선택 초기화(다음 경기 투표)
    const sig = (sessionData.teamsFormedAt || 0) + ':' + (sessionData.manualEog && sessionData.manualEog.at || 0);
    if (sig !== _voteSig) { _voteSig = sig; _pendMvp = _pendManner = null; }
    renderVote(); showView('vote'); el('phase').textContent = '투표'; return;
  }
  if (inGame) { renderIngame(); showView('ingame'); el('phase').textContent = '게임 중'; return; }   // 🎮 전투 중=내 빌드+승패 LP(팀 명단 숨김)
  if (hasTeams && !_gamePlayed) { renderTeam(); showView('team'); el('phase').textContent = phaseLabel === '미리보기' ? '미리보기' : '팀 배정'; return; }   // 팀 결성 직후~게임 전만 '팀 배정'
  renderRoster(); showView('roster'); el('phase').textContent = _gamePlayed ? '정산 대기' : phaseLabel;   // 게임 후엔 '팀 배정'으로 안 돌아가고 정산 대기(투표·정산 뜨면 위에서 가로챔)
}
render();

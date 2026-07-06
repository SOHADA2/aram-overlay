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

window.api.onState(({ inGame: ig, label }) => { inGame = !!ig; phaseLabel = label || (ig ? '게임 중' : '대기'); render(); });
window.api.onPlayers(({ players, lpMap: m }) => { roster = players || []; if (m) lpMap = m; render(); });
window.api.onSession(({ session, myName: mn, lpMap: m }) => { sessionData = session || null; if (mn !== undefined) myName = mn || ''; if (m) lpMap = m; render(); });
window.api.onMyName(name => { myName = name || ''; render(); });

function showView(v) {
  el('view-team').style.display   = v === 'team'   ? 'block' : 'none';
  el('view-vote').style.display   = v === 'vote'   ? 'block' : 'none';
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

function render() {
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

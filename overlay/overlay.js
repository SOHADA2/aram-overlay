// ── 오버레이 렌더러 ─────────────────────────────────────────────────────
// 뷰 2종: (1) 팀 배정(Firebase session 기반) (2) 참가자 명단(인게임 2999 기반)
// 데이터는 메인 프로세스가 IPC로: session(팀), players(인게임명단+LP), state(게임여부), myname(내 이름)
const TIER_SHORT = { iron:'I', bronze:'B', silver:'S', gold:'G', platinum:'P', emerald:'E', diamond:'D', master:'M', grandmaster:'GM', challenger:'C' };
const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const el = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

let sessionData = null, myName = '', roster = [], lpMap = {}, inGame = false, phaseLabel = '대기';

el('close').addEventListener('click', () => window.api.hideOverlay());

window.api.onState(({ inGame: ig, label }) => { inGame = !!ig; phaseLabel = label || (ig ? '게임 중' : '대기'); render(); });
window.api.onPlayers(({ players, lpMap: m }) => { roster = players || []; if (m) lpMap = m; render(); });
window.api.onSession(({ session, myName: mn, lpMap: m }) => { sessionData = session || null; if (mn !== undefined) myName = mn || ''; if (m) lpMap = m; render(); });
window.api.onMyName(name => { myName = name || ''; render(); });

function showView(v) { el('view-team').style.display = v === 'team' ? 'block' : 'none'; el('view-roster').style.display = v === 'roster' ? 'block' : 'none'; }
function lpBadge(name) { const r = lpMap[norm(name)]; return r ? `<span class="lp">${TIER_SHORT[r.tier] || '?'} ${r.lp}</span>` : ''; }
function nameLi(name) { const me = (myName && norm(name) === norm(myName)) ? ' class="me"' : ''; return `<li${me}>${esc(name)}${lpBadge(name)}</li>`; }

function myTeam() {
  if (!sessionData || !sessionData.active) return 0;
  const a = (sessionData.teamA || []).map(norm), b = (sessionData.teamB || []).map(norm), me = norm(myName);
  if (me && a.includes(me)) return 1;
  if (me && b.includes(me)) return 2;
  return 0;
}

function renderTeam() {
  const A = sessionData.teamA || [], B = sessionData.teamB || [], mt = myTeam();
  const mine = el('tv-mine'), badge = el('tv-badge');
  const size = sessionData.teamSize || A.length || '?';
  let ours, theirs;
  if (mt === 2) { mine.classList.add('t2'); badge.textContent = '🔴 2팀'; ours = B; theirs = A; el('tv-ours-h').textContent = '같은 편 (2팀)'; el('tv-theirs-h').textContent = '상대 (1팀)'; }
  else if (mt === 1) { mine.classList.remove('t2'); badge.textContent = '🔵 1팀'; ours = A; theirs = B; el('tv-ours-h').textContent = '같은 편 (1팀)'; el('tv-theirs-h').textContent = '상대 (2팀)'; }
  else { mine.classList.remove('t2'); badge.textContent = '팀 배정'; ours = A; theirs = B; el('tv-ours-h').textContent = '1팀'; el('tv-theirs-h').textContent = '2팀'; }
  el('tv-sub').textContent = (mt ? '내 팀' : '내 이름 미설정 — 데스크톱 창에서 설정') + ` · ${size}:${size}`;
  el('tv-ours').innerHTML = ours.map(nameLi).join('');
  el('tv-theirs').innerHTML = theirs.map(nameLi).join('');
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

function render() {
  const hasTeams = sessionData && sessionData.active && (((sessionData.teamA || []).length) || ((sessionData.teamB || []).length));
  if (hasTeams) { renderTeam(); showView('team'); el('phase').textContent = phaseLabel === '미리보기' ? '미리보기' : '팀 배정'; }
  else { renderRoster(); showView('roster'); el('phase').textContent = phaseLabel; }
}
render();

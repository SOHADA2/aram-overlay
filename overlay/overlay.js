// ── 오버레이 렌더러 ─────────────────────────────────────────────────────
// 데이터는 메인 프로세스가 IPC로 보내줌(window.api): players(명단+LP맵), state(게임 여부)
const TIER_SHORT = { iron:'I', bronze:'B', silver:'S', gold:'G', platinum:'P', emerald:'E', diamond:'D', master:'M', grandmaster:'GM', challenger:'C' };
const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const el = id => document.getElementById(id);
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

el('close').addEventListener('click', () => window.api.hideOverlay());

window.api.onState(({ inGame }) => {
  el('phase').textContent = inGame ? '게임 중' : '대기';
  if (!inGame) { el('players').innerHTML = ''; el('pcount').textContent = ''; el('status').style.display = 'block'; }
});

window.api.onPlayers(({ players, lpMap }) => {
  players = players || []; lpMap = lpMap || {};
  el('pcount').textContent = players.length ? `${players.length}명` : '';
  el('status').style.display = players.length ? 'none' : 'block';
  el('players').innerHTML = players.map(p => {
    const rec = lpMap[norm(p.name)];
    const lp = rec ? `<span class="lp">${TIER_SHORT[rec.tier] || '?'} ${rec.lp}</span>` : `<span class="lp none">—</span>`;
    return `<li class="team-${p.teamId || 0}"><span class="name">${escapeHtml(p.name)}</span><span class="champ">${escapeHtml(p.champ || '')}</span>${lp}</li>`;
  }).join('');
});

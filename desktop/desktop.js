// ── 데스크톱 창 ─────────────────────────────────────────────────────────
document.getElementById('open-web').addEventListener('click', () => window.api.openWeb());
document.getElementById('preview').addEventListener('click', () => window.api.previewOverlay());
document.getElementById('preview-team').addEventListener('click', () => window.api.previewSession());
document.getElementById('home-overlay').addEventListener('click', () => window.api.homeToggle());

// 롤 게임 상태
window.api.onState(({ inGame }) => {
  const b = document.getElementById('game-state');
  if (inGame) { b.textContent = '게임 중 ✅'; b.classList.add('on'); }
  else { b.textContent = '감지 대기'; b.classList.remove('on'); }
});

// 내 이름 선택 — 홈페이지 등록 플레이어 목록에서
const sel = document.getElementById('myname');
sel.addEventListener('change', () => window.api.setMyName(sel.value));
(async () => {
  try {
    const { names, myName } = await window.api.getPlayers();
    sel.innerHTML = '<option value="">— 선택 —</option>' + names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
    if (myName) sel.value = myName;
  } catch (_) {}
})();

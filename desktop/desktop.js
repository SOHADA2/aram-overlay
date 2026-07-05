document.getElementById('open-web').addEventListener('click', () => window.api.openWeb());
window.api.onState(({ inGame }) => {
  const b = document.getElementById('game-state');
  if (inGame) { b.textContent = '게임 중 ✅'; b.classList.add('on'); }
  else { b.textContent = '감지 대기'; b.classList.remove('on'); }
});

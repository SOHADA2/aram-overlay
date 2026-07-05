// ── 데스크톱(로그인/홈) — 입장(ID 선택) → 방장 체크 ──────────────────────
const $ = id => document.getElementById(id);

$('open-web').addEventListener('click', () => window.api.openWeb());
$('preview-team').addEventListener('click', () => window.api.previewSession());
$('home-overlay').addEventListener('click', () => window.api.homeToggle());

// 롤 게임 상태
window.api.onState(({ inGame }) => {
  const b = $('game-state');
  if (inGame) { b.textContent = '게임 중 ✅'; b.classList.add('on'); }
  else { b.textContent = '감지 대기'; b.classList.remove('on'); }
});

// 뷰 전환
function showEntry() { $('entry').style.display = 'flex'; $('home').style.display = 'none'; }
function showHome(name, isHost) {
  $('entry').style.display = 'none'; $('home').style.display = 'flex';
  $('me-name').textContent = name;
  $('is-host').checked = !!isHost;
  $('host-box').classList.toggle('on', !!isHost);
}

// 로그인(입장) 셀렉트
const esel = $('entry-name');
esel.addEventListener('change', () => { $('entry-go').disabled = !esel.value; });
$('entry-go').addEventListener('click', () => {
  if (!esel.value) return;
  window.api.setMyName(esel.value);
  showHome(esel.value, $('is-host').checked);
});
$('change-name').addEventListener('click', showEntry);

// 방장 체크
$('is-host').addEventListener('change', () => {
  const on = $('is-host').checked;
  window.api.setHost(on);
  $('host-box').classList.toggle('on', on);
});

// 초기 로드: 등록 플레이어 목록 + 현재 설정
(async () => {
  try {
    const { names, myName, isHost } = await window.api.getPlayers();
    esel.innerHTML = '<option value="">— 아이디 선택 —</option>' +
      names.map(n => `<option value="${n.replace(/"/g, '&quot;')}"${n === myName ? ' selected' : ''}>${n}</option>`).join('');
    $('entry-go').disabled = !esel.value;
    if (myName) showHome(myName, isHost); else showEntry();
  } catch (_) { showEntry(); }
})();

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

// 🔖 홈페이지 버전 표시(로그인·홈 양쪽) — 항상 홈페이지와 동일
function setVersion(v) {
  const t = v ? '버전 ' + v : '';
  const a = $('ver-entry'), b = $('ver-home');
  if (a) a.textContent = t;
  if (b) b.textContent = t;
}
window.api.onVersion(setVersion);

// 뷰 전환
function showEntry() { $('entry').style.display = 'flex'; $('home').style.display = 'none'; $('teambuild').style.display = 'none'; }
function showHome(name, isHost) {
  $('entry').style.display = 'none'; $('home').style.display = 'flex'; $('teambuild').style.display = 'none';
  $('me-name').textContent = name;
  $('is-host').checked = !!isHost;
  $('host-box').classList.toggle('on', !!isHost);
  $('tb-open').style.display = isHost ? '' : 'none';
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
  $('tb-open').style.display = on ? '' : 'none';
});

// ── ⚔️ 팀 짜기(방장 전용) — 홈페이지와 완전 연동 ─────────────────────────
let _rosterNames = [];   // 등록 플레이어 전체(초기 로드에서 채움)
const _tbChecked = new Set(JSON.parse(localStorage.getItem('tbChecked') || '[]'));   // 지난 참가자 기억

function tbRenderList() {
  const list = $('tb-list');
  list.innerHTML = _rosterNames.map(n => {
    const esc = n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return `<label class="tb-item${_tbChecked.has(n) ? ' on' : ''}"><input type="checkbox" data-name="${esc}"${_tbChecked.has(n) ? ' checked' : ''}><span>${esc}</span></label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    const name = cb.dataset.name;   // dataset은 HTML 엔티티가 이미 디코딩된 원본 이름
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
function tbShow(step) {   // 'pick' | 'run' | 'done'
  $('tb-pick').style.display = step === 'pick' ? '' : 'none';
  $('tb-run').style.display = step === 'run' ? '' : 'none';
  $('tb-done').style.display = step === 'done' ? '' : 'none';
  if (step !== 'error') $('tb-err').style.display = 'none';
}
$('tb-open').addEventListener('click', () => { $('home').style.display = 'none'; $('teambuild').style.display = 'flex'; tbShow('pick'); tbRenderList(); });
$('tb-back').addEventListener('click', () => { $('teambuild').style.display = 'none'; $('home').style.display = 'flex'; });
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
    $('tb-result').innerHTML =
      row('1팀', d.teamA, 'a') + row('2팀', d.teamB, 'b') +
      (d.spectators && d.spectators.length ? row('👁 관전', d.spectators, 's') : '') +
      `<div class="tbr-ok">✅ 팀 발표 완료 — 홈페이지·오버레이 모두에 떴어요</div>`;
  }
  else if (d.state === 'error') { tbShow('pick'); $('tb-err').textContent = '⚠️ ' + d.err; $('tb-err').style.display = ''; $('tb-go').disabled = false; }
});

// 초기 로드: 등록 플레이어 목록 + 현재 설정
(async () => {
  try {
    const { names, myName, isHost, webVersion } = await window.api.getPlayers();
    _rosterNames = names;
    setVersion(webVersion);
    esel.innerHTML = '<option value="">— 아이디 선택 —</option>' +
      names.map(n => `<option value="${n.replace(/"/g, '&quot;')}"${n === myName ? ' selected' : ''}>${n}</option>`).join('');
    $('entry-go').disabled = !esel.value;
    if (myName) showHome(myName, isHost); else showEntry();
  } catch (_) { showEntry(); }
})();

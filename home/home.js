const wv = document.getElementById('wv');
const loading = document.getElementById('loading');

document.getElementById('close').addEventListener('click', () => window.api.homeClose());
document.getElementById('reload').addEventListener('click', () => { try { wv.reload(); } catch (_) {} });

// webview 로딩 상태 → 로딩 문구 숨김
wv.addEventListener('did-stop-loading', () => { loading.style.display = 'none'; });
wv.addEventListener('did-fail-load', (e) => {
  if (e.errorCode && e.errorCode !== -3) loading.textContent = '불러오기 실패 — ⟳ 로 다시 시도 (' + e.errorCode + ')';
});

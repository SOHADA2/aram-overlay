const wv = document.getElementById('wv');
const loading = document.getElementById('loading');

document.getElementById('close').addEventListener('click', () => window.api.homeClose());
document.getElementById('reload').addEventListener('click', () => { try { wv.reload(); } catch (_) {} });

// webview 로딩 상태 → 로딩 문구 숨김
wv.addEventListener('did-stop-loading', () => { loading.style.display = 'none'; });
wv.addEventListener('did-fail-load', (e) => {
  if (e.errorCode && e.errorCode !== -3) loading.textContent = '불러오기 실패 — ⟳ 로 다시 시도 (' + e.errorCode + ')';
});

// 🛒 딥링크 — 사이드패널 「복권/대장간 열기」 → 홈페이지 함수를 그대로 호출(로직 복제 0 = 데이터 100% 동일)
const GOTO_JS = {
  lottery: "(function(){ if(typeof window.openLotteryHub==='function'){ window.openLotteryHub(); return true; } return false; })()",
  forge: "(function(){ var b=document.querySelector('.nav-tab-shop'); if(typeof window.showTab==='function'&&b){ window.showTab('tab-shop', b); setTimeout(function(){ try{ if(typeof window.gotoForgeTab==='function') window.gotoForgeTab(); else if(typeof window.switchShopCat==='function') window.switchShopCat('pass'); }catch(e){} }, 350); return true; } return false; })()",
  shop: "(function(){ var b=document.querySelector('.nav-tab-shop'); if(typeof window.showTab==='function'&&b){ window.showTab('tab-shop', b); return true; } return false; })()",
};
let _wvReady = false;
wv.addEventListener('dom-ready', () => { _wvReady = true; });
function gotoHome(target, tries) {   // 홈페이지 부팅이 느릴 수 있어 성공할 때까지 재시도(최대 ~20초)
  const js = GOTO_JS[target]; if (!js) return;
  tries = tries || 0;
  const retry = () => { if (tries < 40) setTimeout(() => gotoHome(target, tries + 1), 500); };
  if (!_wvReady) { retry(); return; }
  try { wv.executeJavaScript(js, false).then(ok => { if (!ok) retry(); }).catch(retry); } catch (_) { retry(); }
}
if (window.api.onHomeGoto) window.api.onHomeGoto(t => gotoHome(t));

// 🎨 목업 모드 — 브라우저에서 sidepanel.html 직접 열면(window.api 없음) 샘플 데이터로 디자인 확인.
//   실제 앱(preload로 window.api 존재)에선 아무 것도 안 함. sidepanel.js보다 먼저 로드.
(function () {
  if (window.api) return;

  const cb = {};
  const PROFILE = { name: '애긔반달곰', lp: { tierKr: '골드', lp: 76, placementDone: true, promoActive: false, placementGames: 0 }, arena: { games: 36, wins: 18, losses: 18, winrate: 50, form: [true, false, false, true, true, false, true, false, false, true], matchGold: 1910, avgGold: 53, mvp: 3, manner: 1 }, champs: { most: { champ: 'Yone', games: 12, wins: 7 }, best: { champ: 'Khazix', games: 5, wins: 4 } }, emblem: { nick: '해골', level: 2, power: 7, grade: '실버' }, synergy: { sid: 'void', tier: 2 }, buddy: { champion: 'Yone', count: 5, streakType: 'loss', streakCount: 1 } };
  const RANK = [{ rank: 1, name: '맹독 벌꿀오소리', tierKr: '골드', lp: 80 }, { rank: 2, name: '애긔반달곰', tierKr: '골드', lp: 76 }, { rank: 3, name: '울퉁쓰', tierKr: '골드', lp: 75 }, { rank: 4, name: '나랑듀오해듀오', tierKr: '골드', lp: 75 }, { rank: 5, name: '신규회원임', tierKr: '골드', lp: 40 }, { rank: 6, name: 'ap렉사이서폿', tierKr: '다이아', lp: 12 }];
  const RECORDS = [
    { ts: 3, date: '07-06', teamA: ['울퉁쓰', '애긔반달곰', '신규회원임'], teamB: ['ap렉사이서폿', '맹독 벌꿀오소리', '나랑듀오해듀오'], winner: 'blue', size: 3, mine: true, won: true, myChamp: 'Yone', kda: { k: 8, d: 2, a: 11 } },
    { ts: 2, date: '07-06', teamA: ['ap렉사이서폿', '애긔반달곰'], teamB: ['울퉁쓰', '맹독 벌꿀오소리'], winner: 'red', size: 2, mine: true, won: false, myChamp: 'Khazix', kda: { k: 3, d: 7, a: 5 } },
    { ts: 1, date: '07-05', teamA: ['울퉁쓰', '신규회원임'], teamB: ['ap렉사이서폿', '나랑듀오해듀오'], winner: 'blue', size: 2, mine: false, won: null, myChamp: null, kda: null },
  ];

  window.api = new Proxy({}, { get(_, k) {
    if (typeof k !== 'string') return undefined;
    if (k.startsWith('on')) return fn => { cb[k] = fn; };
    if (k === 'getPlayers') return async () => ({ names: ['애긔반달곰', '울퉁쓰', 'ap렉사이서폿', '맹독 벌꿀오소리', '신규회원임', '나랑듀오해듀오'], myName: '애긔반달곰', isHost: true, webVersion: 'v2.45.566' });
    if (k === 'getProfile') return async () => ({ ok: true, ddVer: '14.24.1', profile: PROFILE });
    if (k === 'getRanking') return async () => ({ ok: true, ranking: RANK, myName: '애긔반달곰' });
    if (k === 'getRecords') return async () => ({ ok: true, ddVer: '14.24.1', records: RECORDS, myName: '애긔반달곰' });
    return async () => ({ ok: true });
  } });

  window.addEventListener('load', () => {
    const st = document.createElement('style');
    st.textContent = `html{background:#060d14;}
      #mockbar{position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;gap:6px;align-items:center;padding:7px 10px;background:#0c1520;border-bottom:1px solid #24323f;font:12px 'Noto Sans KR',sans-serif;}
      #mockbar .lbl{color:#6f8296;font-size:10px;letter-spacing:1px;margin-right:2px;}
      #mockbar button{padding:5px 11px;border:1px solid #33475a;background:#132030;color:#cfd8e3;border-radius:6px;cursor:pointer;font:inherit;}
      #mockbar button:hover{border-color:#C8AA6E;color:#F0E6D2;}
      #mockbar button.on{background:#C8AA6E;color:#1a1206;border-color:#C8AA6E;font-weight:700;}
      body{padding-top:46px!important;display:flex;justify-content:center;}
      #panel{width:392px!important;height:calc(100vh - 62px)!important;margin:8px auto!important;flex:none;}`;
    document.head.appendChild(st);
    const bar = document.createElement('div'); bar.id = 'mockbar';
    bar.innerHTML = '<span class="lbl">목업</span><button id="mk-logged" class="on">로그인됨(방장)</button><button id="mk-login">로그인 화면</button><span style="margin-left:auto;color:#6f8296;font-size:10px">← 좌측 레일로 프로필/기록/랭킹 전환</span>';
    document.body.appendChild(bar);
    const login = document.getElementById('s-login'), app = document.getElementById('s-app');
    document.getElementById('mk-login').onclick = e => { setOn(e.target); login.style.display = 'flex'; app.style.display = 'none'; };
    document.getElementById('mk-logged').onclick = e => { setOn(e.target); login.style.display = 'none'; app.style.display = 'flex'; };
    function setOn(b) { bar.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }
  });
})();

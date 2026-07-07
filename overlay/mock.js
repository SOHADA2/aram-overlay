// 🎨 목업 모드 — 브라우저에서 overlay.html을 직접 열면(=window.api 없음) 샘플 데이터로 디자인 확인.
//   실제 앱(Electron·preload로 window.api 존재)에선 이 파일이 아무 것도 안 함(맨 앞 return).
//   overlay.js보다 먼저 로드되어야 함(overlay.html에서 순서 보장). 뷰 전환 = 상단 목업 바.
(function () {
  if (window.api) return;   // 실제 앱 → 목업 비활성

  const cb = {};
  const LPMAP = { '애긔반달곰': { tier: 'gold', lp: 76 }, '울퉁쓰': { tier: 'gold', lp: 75 }, '신규회원임': { tier: 'gold', lp: 40 }, 'ap렉사이서폿': { tier: 'diamond', lp: 12 }, '맹독벌꿀오소리': { tier: 'gold', lp: 80 }, '나랑듀오해듀오': { tier: 'gold', lp: 75 } };
  const TEAM = { active: true, teamSize: 3, mode: 'balance', teamsFormedAt: 1, mvp: { active: true }, manner: { active: true }, teamA: ['울퉁쓰', '애긔반달곰', '신규회원임'], teamB: ['ap렉사이서폿', '맹독 벌꿀오소리', '나랑듀오해듀오'] };
  const ITEM_GOLD = { items_s2: [{ id: 's1_gamble', active: false }], emblemEquipped_s2: 1,
    emblems_s2: [{ id: 1, nick: '해골', slots: [{ t: 'stable', ok: true }, { t: 'overload', ok: true }], lines: ['lottoTkt', 'magollaG'] }, { id: 2, slots: [{ t: 'precise', ok: true }], lines: ['winG'] }],
    champCards_s2: { Khazix: { s2: 1 }, Malzahar: { s3: 1 }, Fizz: { s2: 1 }, Gangplank: { s3: 1 }, Amumu: { s2: 1 }, Rammus: { s2: 1 }, Poppy: { s2: 1 }, Malphite: { s2: 1 } }, activeSynergy_s2: { sid: 'void', tier: 2 } };
  const ROSTER = [{ name: '울퉁쓰', champ: 'Orianna', teamId: 100 }, { name: '애긔반달곰', champ: 'Aatrox', teamId: 100 }, { name: '신규회원임', champ: 'Aurora', teamId: 100 }, { name: 'ap렉사이서폿', champ: 'Garen', teamId: 200 }, { name: '맹독 벌꿀오소리', champ: 'Nasus', teamId: 200 }, { name: '나랑듀오해듀오', champ: 'Seraphine', teamId: 200 }];
  const PROFILE = { name: '애긔반달곰', lp: { tierKr: '골드', lp: 76, placementDone: true, promoActive: false, placementGames: 0 }, arena: { games: 36, wins: 18, losses: 18, winrate: 50, form: [true, false, false, true, true, false, true, false, false, true], matchGold: 1910, avgGold: 53, mvp: 3, manner: 1 }, champs: { most: { champ: 'Yone', games: 12, wins: 7 }, best: { champ: 'Khazix', games: 5, wins: 4 } }, emblem: { nick: '해골', level: 2, power: 7, grade: '실버' }, synergy: { sid: 'void', tier: 2 }, buddy: { champion: 'Yone', count: 5, streakType: 'loss', streakCount: 1 } };
  const RANK = [{ rank: 1, name: '맹독 벌꿀오소리', tierKr: '골드', lp: 80 }, { rank: 2, name: '애긔반달곰', tierKr: '골드', lp: 76 }, { rank: 3, name: '울퉁쓰', tierKr: '골드', lp: 75 }, { rank: 4, name: '나랑듀오해듀오', tierKr: '골드', lp: 75 }, { rank: 5, name: '신규회원임', tierKr: '골드', lp: 40 }, { rank: 6, name: 'ap렉사이서폿', tierKr: '다이아', lp: 12 }];
  const VOTE = Object.assign({}, TEAM, { mvp: { active: true, teamAVotes: {}, teamBVotes: {} }, manner: { active: true, teamAVotes: {}, teamBVotes: {} }, manualEog: { at: Date.now(), winSide: 'blue' } });
  const SETTLE = { settle: { publishedAt: Date.now(), matchKey: 'm' + Date.now(), winners: TEAM.teamA, losers: TEAM.teamB, mvpWinner: '애긔반달곰', mvpLoser: 'ap렉사이서폿', mannerWinner: '신규회원임',
    s1LpBefore: { '애긔반달곰': { tier: 'gold', lp: 56, placementDone: true }, '울퉁쓰': { tier: 'gold', lp: 55 }, '신규회원임': { tier: 'silver', lp: 95 }, 'ap렉사이서폿': { tier: 'diamond', lp: 42 }, '맹독 벌꿀오소리': { tier: 'gold', lp: 94 }, '나랑듀오해듀오': { tier: 'gold', lp: 89 } } },
    lpNow: { '애긔반달곰': { tier: 'gold', lp: 76 }, '울퉁쓰': { tier: 'gold', lp: 75 }, '신규회원임': { tier: 'gold', lp: 0 }, 'ap렉사이서폿': { tier: 'diamond', lp: 28 }, '맹독 벌꿀오소리': { tier: 'gold', lp: 80 }, '나랑듀오해듀오': { tier: 'gold', lp: 75 } },
    procs: {
      syn: { '애긔반달곰': { sid: 'marksman', tier: 2, procced: false }, '울퉁쓰': { sid: 'bilgewater', tier: 2, procced: true, goldDelta: 40 }, 'ap렉사이서폿': { sid: 'void', tier: 2, procced: true } },
      em: { '애긔반달곰': { winLpProc: true, winLP: 3, matchG: 5, winG: 8, mvpG: 15 }, '맹독 벌꿀오소리': { lossLpProc: true, lossLP: 2, matchG: 5 } },
      items: { '울퉁쓰': ['s1_gamble'], 'ap렉사이서폿': ['s1_promo_shield'], '신규회원임': ['s1_lp2x'] },
    } };

  window.api = new Proxy({}, { get(_, k) {
    if (typeof k !== 'string') return undefined;
    if (k.startsWith('on')) return fn => { cb[k] = fn; };
    if (k === 'getProfile') return async () => ({ ok: true, ddVer: '14.24.1', profile: PROFILE });
    if (k === 'getRanking') return async () => ({ ok: true, ranking: RANK, myName: '애긔반달곰' });
    if (k === 'getRecords') return async () => ({ ok: true, records: [], myName: '애긔반달곰' });
    return async () => ({ ok: true });   // 그 외(itemToggle 등)=성공 스텁
  } });

  const clr = () => { cb.onItemPhase && cb.onItemPhase(null); cb.onSettlement && cb.onSettlement(null); };   // 아이템·정산 초기화(우선순위 낮은 뷰 보이게)
  const scenarios = {
    team() { clr(); cb.onSession({ session: TEAM, myName: '애긔반달곰', lpMap: LPMAP }); cb.onState({ inGame: false, label: '팀 배정' }); },
    item() { cb.onSettlement && cb.onSettlement(null); cb.onState({ inGame: false, label: '아이템' }); cb.onItemPhase({ gold: { key: 'k', data: JSON.parse(JSON.stringify(ITEM_GOLD)) }, lp: { placementDone: true, promoActive: false }, endAt: Date.now() + 15000 }); },
    ingame() { cb.onSettlement && cb.onSettlement(null); cb.onSession({ session: null, myName: '애긔반달곰', lpMap: LPMAP }); const g = JSON.parse(JSON.stringify(ITEM_GOLD)); g.items_s2 = [{ id: 's1_gamble', active: true }]; cb.onItemPhase({ gold: { key: 'k', data: g }, lp: { tier: 'gold', lp: 76, placementDone: true, promoActive: false }, endAt: Date.now() - 1000 }); cb.onState({ inGame: true, label: '게임 중' }); },
    waiting() { clr(); cb.onSession({ session: null, myName: '애긔반달곰', lpMap: LPMAP }); cb.onPlayers({ players: [], lpMap: LPMAP }); cb.onState({ inGame: false, label: '대기' }); },
    roster() { clr(); cb.onSession({ session: null, myName: '애긔반달곰', lpMap: LPMAP }); cb.onPlayers({ players: ROSTER, lpMap: LPMAP }); cb.onState({ inGame: false, label: '명단' }); },
    vote() { clr(); cb.onSession({ session: VOTE, myName: '애긔반달곰', lpMap: LPMAP }); cb.onState({ inGame: false, label: '게임 종료' }); },
    settle() { cb.onItemPhase && cb.onItemPhase(null); cb.onSession({ session: TEAM, myName: '애긔반달곰', lpMap: LPMAP }); cb.onSettlement(JSON.parse(JSON.stringify(SETTLE))); },
  };
  const LABELS = { team: '팀 배정', item: '아이템', ingame: '게임 중', waiting: '대기', roster: '명단', vote: '투표', settle: '정산' };

  window.addEventListener('load', () => {
    const st = document.createElement('style');
    st.textContent = `html{background:#060d14;}
      #mockbar{position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;gap:6px;align-items:center;padding:7px 10px;background:#0c1520;border-bottom:1px solid #24323f;font:12px 'Noto Sans KR',sans-serif;}
      #mockbar .lbl{color:#6f8296;font-size:10px;letter-spacing:1px;margin-right:2px;}
      #mockbar button{padding:5px 11px;border:1px solid #33475a;background:#132030;color:#cfd8e3;border-radius:6px;cursor:pointer;font:inherit;}
      #mockbar button:hover{border-color:#C8AA6E;color:#F0E6D2;}
      #mockbar button.on{background:#C8AA6E;color:#1a1206;border-color:#C8AA6E;font-weight:700;}
      #mockbar label{margin-left:auto;color:#8aa;font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer;}
      body{padding-top:46px!important;display:flex;justify-content:center;}
      #panel{width:392px!important;height:calc(100vh - 62px)!important;margin:8px auto!important;flex:none;}`;
    document.head.appendChild(st);
    const bar = document.createElement('div'); bar.id = 'mockbar';
    bar.innerHTML = '<span class="lbl">목업</span>' + Object.keys(scenarios).map(k => `<button data-s="${k}">${LABELS[k]}</button>`).join('') + '<label><input type="checkbox" id="mk-dock"> 도킹(각진)</label>';
    document.body.appendChild(bar);
    bar.querySelectorAll('button').forEach(b => b.onclick = () => { bar.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); scenarios[b.dataset.s](); });
    document.getElementById('mk-dock').onchange = e => document.body.classList.toggle('docked', e.target.checked);
    const def = bar.querySelector('[data-s=team]'); def.classList.add('on'); scenarios.team();
  });
})();

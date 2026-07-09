// 🎨 목업 모드 — 브라우저에서 sidepanel.html 직접 열면(window.api 없음) 샘플 데이터로 디자인 확인.
//   실제 앱(preload로 window.api 존재)에선 아무 것도 안 함. sidepanel.js보다 먼저 로드.
(function () {
  if (window.api) return;

  const cb = {};
  const PROFILE = { name: '애긔반달곰', lp: { tier: 'gold', tierKr: '골드', lp: 76, placementDone: true, promoActive: false, placementGames: 0, promoWins: 0, promoLosses: 0 }, arena: { games: 36, wins: 18, losses: 18, winrate: 50, form: [true, false, false, true, true, false, true, false, false, true], matchGold: 1910, avgGold: 53, mvp: 3, manner: 1 }, champs: { most: { champ: 'Yone', games: 12, wins: 7 }, best: { champ: 'Khazix', games: 5, wins: 4 } }, emblem: { nick: '해골', level: 2, power: 7, grade: '실버' }, synergy: { sid: 'void', tier: 2 }, buddy: { champion: 'Yone', count: 5, streakType: 'loss', streakCount: 1 } };
  const RANK = [{ rank: 1, name: '맹독 벌꿀오소리', tier: 'gold', tierKr: '골드', lp: 80 }, { rank: 2, name: '애긔반달곰', tier: 'gold', tierKr: '골드', lp: 76 }, { rank: 3, name: '울퉁쓰', tier: 'gold', tierKr: '골드', lp: 75 }, { rank: 4, name: '나랑듀오해듀오', tier: 'gold', tierKr: '골드', lp: 75 }, { rank: 5, name: '신규회원임', tier: 'silver', tierKr: '실버', lp: 40 }, { rank: 6, name: 'ap렉사이서폿', tier: 'diamond', tierKr: '다이아', lp: 12 }];
  const RECORDS = [
    { kind: "custom", ts: Date.now()-3600e3, teamA: ["울퉁쓰", "애긔반달곰", "신규회원임"], teamB: ["ap렉사이서폿", "맹독 벌꿀오소리", "나랑듀오해듀오"], winner: "blue", size: 3, mine: true, won: true, myChamp: "Yone", kda: { k: 8, d: 2, a: 11 },
      mvpW: "애긔반달곰", mvpL: "ap렉사이서폿", mannerW: "신규회원임", mannerL: null,
      detailA: [{ name: "울퉁쓰", champ: "Vex", k: 5, d: 4, a: 9, dmg: 21000, cs: 30 }, { name: "애긔반달곰", champ: "Yone", k: 8, d: 2, a: 11, dmg: 34000, cs: 45 }, { name: "신규회원임", champ: "Lux", k: 2, d: 5, a: 14, dmg: 18000, cs: 22 }],
      detailB: [{ name: "ap렉사이서폿", champ: "Khazix", k: 7, d: 6, a: 4, dmg: 28000, cs: 38 }, { name: "맹독 벌꿀오소리", champ: "Teemo", k: 3, d: 7, a: 6, dmg: 15000, cs: 28 }, { name: "나랑듀오해듀오", champ: "Gwen", k: 4, d: 6, a: 5, dmg: 19000, cs: 33 }] },
  ];
  const NORMALS = [{ kind: "normal", ts: Date.now()-7200e3, winSide: "blue", gameTime: 1260, players: [{ name: "애긔반달곰", champ: "Yone", k: 9, d: 3, a: 7, dmg: 31000, cs: 40, win: true }, { name: "울퉁쓰", champ: "Vex", k: 4, d: 5, a: 8, dmg: 17000, cs: 25, win: false }] }];
  const MAGOLLA = [{ kind: "magolla", ts: Date.now()-86400e3, f1: "울퉁쓰", f2: "맹독 벌꿀오소리", winner: "울퉁쓰", cond: "tower", bets: [{ name: "애긔반달곰", pick: "울퉁쓰", amount: 50, payout: 60 }, { name: "신규회원임", pick: "맹독 벌꿀오소리", amount: 30, payout: -30 }] }];

  window.api = new Proxy({}, { get(_, k) {
    if (typeof k !== 'string') return undefined;
    if (k.startsWith('on')) return fn => { cb[k] = fn; };
    if (k === 'getPlayers') return async () => ({ names: ['애긔반달곰', '울퉁쓰', 'ap렉사이서폿', '맹독 벌꿀오소리', '신규회원임', '나랑듀오해듀오'], myName: '애긔반달곰', isHost: true, webVersion: 'v2.45.566',
      lpMap: { '애긔반달곰': { tier: 'gold', lp: 76, placementDone: true }, '울퉁쓰': { tier: 'gold', lp: 75, placementDone: true }, 'ap렉사이서폿': { tier: 'diamond', lp: 12, placementDone: true, promoActive: true }, '맹독벌꿀오소리': { tier: 'gold', lp: 80, placementDone: true }, '신규회원임': { tier: 'silver', lp: 40, placementDone: true }, '나랑듀오해듀오': { placementDone: false, placementGames: 3 } } });
    if (k === 'getProfile') return async () => ({ ok: true, ddVer: '14.24.1', profile: PROFILE });
    if (k === 'getWallet') return async () => ({ ok: true, gold: 1240, claw: 3, arena: 120 });
    if (k === 'getShop') return async () => ({ ok: true, gold: 1240, itemCounts: { s1_gamble: { n: 1, active: 1 } }, tickets: { stable: 3, precise: 1 }, essence: 2, emblems: 4, essMax: true, essPrice: 250, essLevelCap: 50 });
    if (k === 'buyEssence') return async () => ({ ok: true, gold: 990 });
    if (k === 'getGacha') return async () => ({ ok: true, gold: 1240, yuumi: true,
      champs: [{ slug: 'Akshan', kr: '아크샨' }, { slug: 'Amumu', kr: '아무무' }, { slug: 'Brand', kr: '브랜드' }, { slug: 'DrMundo', kr: '문도 박사' }, { slug: 'Fizz', kr: '피즈' }, { slug: 'Gangplank', kr: '갱플랭크' }, { slug: 'Jhin', kr: '진' }, { slug: 'Khazix', kr: '카직스' }, { slug: 'Lulu', kr: '룰루' }, { slug: 'Malphite', kr: '말파이트' }, { slug: 'Malzahar', kr: '말자하' }, { slug: 'Mel', kr: '멜' }, { slug: 'Morgana', kr: '모르가나' }, { slug: 'Naafiri', kr: '나피리' }, { slug: 'Poppy', kr: '뽀삐' }, { slug: 'Rammus', kr: '람머스' }, { slug: 'Vayne', kr: '베인' }, { slug: 'Yasuo', kr: '야스오' }],
      cards: { Khazix: { s1: 4, s2: 1 }, Malzahar: { s1: 2, s3: 1 }, Yasuo: { s1: 7, s2: 2 }, Jhin: { s1: 3, s2: 1 } },
      synList: [{ sid: 'void', tier: 2, active: true }, { sid: 'ionia', tier: 2, active: false }] });
    if (k === 'gachaPull') return async () => ({ ok: true, gold: 1190, results: [{ slug: 'Vayne', kr: '베인', star: 1 }] });
    if (k === 'getPass') return async () => ({ ok: true, curLv: 4, maxLv: 25, rows: [
      { lv: 1, icon: '🎯', name: '첫 걸음', desc: '경기 1회 참여', milestone: false, state: 'done', prog: null, reward: { tickets: { stable: 2 } } },
      { lv: 2, icon: '🏆', name: '첫 승리', desc: '승리 1회', milestone: false, state: 'done', prog: null, reward: { gold: 80 } },
      { lv: 3, icon: '🗡️', name: '딜러 입문', desc: '한 판 딜량 10,000+', milestone: false, state: 'done', prog: null, reward: { tickets: { stable: 2 } } },
      { lv: 4, icon: '⚔️', name: '3경기 참전', desc: '경기 3회 참여', milestone: false, state: 'done', prog: null, reward: { gold: 100 } },
      { lv: 5, icon: '⭐', name: '킬 사냥꾼', desc: '한 판 킬 6+', milestone: true, state: 'claimable', prog: null, reward: { essence: 2 } },
      { lv: 6, icon: '💪', name: '신뢰의 동료', desc: '한 판 어시 8+', milestone: false, state: 'locked', prog: null, reward: { tickets: { precise: 1 } } },
      { lv: 7, icon: '🛡️', name: '살아남기', desc: '한 판 데스 5이하 + 승리', milestone: false, state: 'locked', prog: null, reward: { gold: 120 } },
      { lv: 25, icon: '👑', name: '시즌의 정점', desc: '킬+어시 합 25+', milestone: true, state: 'locked', prog: null, reward: { gold: 500, title: '증바람의 증인' } },
    ] });
    if (k === 'claimPass') return async () => ({ ok: true, reward: { essence: 2 } });
    if (k === 'getLottery') return async () => ({ ok: true, gold: 1240,
      tiers: [{ idx: 0, name: '실버 복권', price: 70, cells: 4, matchCount: 2, skullPenalty: 0, hasSkull: false, top: 670 }, { idx: 1, name: '골드 복권', price: 200, cells: 6, matchCount: 3, skullPenalty: 10, hasSkull: true, top: 5200 }, { idx: 2, name: '프리즘 복권', price: 400, cells: 7, matchCount: 3, skullPenalty: 10, hasSkull: true, top: 8580 }],
      free: { 0: 1, 1: 0, 2: 0 }, pity: { gold: 4.5, prism: 0 }, pending: null, skullRed: 0.47, prizeBonus: { 1: 14, 2: 14 } });
    if (k === 'lotteryBuy') return async (tierIdx) => ({ ok: true, rec: { tierIdx: 1, free: false, emblemBonus: 14, pity: 4.5, pityConv: false, revealed: [],
      win: { id: 'clover', emoji: '🍀', name: '클로버', gold: 320 },
      slots: [{ id: 'sword', emoji: '⚔️', name: '검', gold: 440 }, { id: 'clover', emoji: '🍀', name: '클로버', gold: 320 }, { id: 'skull', emoji: '💀', name: '해골', gold: 0 }, { id: 'clover', emoji: '🍀', name: '클로버', gold: 320 }, { id: 'moon', emoji: '🌙', name: '달', gold: 600 }, { id: 'clover', emoji: '🍀', name: '클로버', gold: 320 }] } });
    if (k === 'lotteryFinish') return async () => ({ ok: true, net: 324, winGold: 320, skullPenalty: 10 });
    if (k === 'getForge') return async () => ({ ok: true, gold: 1240, count: 2, maxOwn: 15, basePrice: 150, tickets: { stable: 3, precise: 1, overload: 0 }, essence: 2,
      emblems: [
        { id: 1, nick: '해골', equipped: true, level: 2, power: 7, grade: '실버', slots: [{ t: 'stable', ok: true }, { t: 'overload', ok: true }, { t: 'precise', ok: false }], slotsUsed: 3, locked: false, hasLines: true, effText: '막고라 배당 +9% · 해골 감소 -23%', sellPrice: 269 },
        { id: 2, nick: null, equipped: false, level: 1, power: 3, grade: '실버', slots: [{ t: 'precise', ok: true }], slotsUsed: 1, locked: false, hasLines: false, effText: '', sellPrice: 128 },
      ] });
    if (k === 'forgeEnhance') return async () => ({ ok: true, result: { ok: Math.random() < 0.6, type: 'stable', level: 3, power: 8, slotsUsed: 4, locked: false } });
    if (k === 'forgeReroll') return async () => ({ ok: true, lines: ['winG', 'attend', 'lottoTkt'] });
    if (k === 'getRanking') return async () => ({ ok: true, ranking: RANK, myName: '애긔반달곰' });
    if (k === 'getRecords') return async (f) => ({ ok: true, ddVer: '14.24.1', filter: f, records: f === 'normal' ? NORMALS : f === 'magolla' ? MAGOLLA : f === 's1' ? [] : RECORDS, myName: '애긔반달곰' });
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

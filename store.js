// ── 🛒🃏🎫 상점/가챠/패스 로직 — 홈페이지(index.html) 1:1 이식 ───────────────
//   순수 계산만(쓰기는 main.js IPC가). 상수·공식이 홈과 갈라지면 데이터가 오염되므로
//   수정 시 반드시 홈 원본과 대조: EMBLEM_TICKETS(L10554)·gachaRollStar(L37797)·
//   doGachaPull(L37839)·S1_PASS_QUESTS(L12637)·S2_PASS_QUESTS/REWARDS(L21448)·calcS1PassStats(L21329)
const normName = s => String(s || '').trim().replace(/\s+/g, ' ');

// ⚒️ 강화권 (홈 EMBLEM_TICKETS)
const EMBLEM_TICKETS = {
  stable:   { id: 'stable',   name: '안정 강화권',   chance: 1.00, power: 1, price: 40,  color: '#5fbf8a' },
  precise:  { id: 'precise',  name: '정밀 강화권',   chance: 0.60, power: 3, price: 100, color: '#e0b341' },
  overload: { id: 'overload', name: '과부하 강화권', chance: 0.30, power: 6, price: 250, color: '#e0685a' },
};
const EMBLEM_TICKET_ORDER = ['stable', 'precise', 'overload'];
const EMBLEM_ESSENCE_PRICE = 250;   // 걸작의 정수(홈 EMBLEM_REROLL_PRICE) — 구매는 내전 만렙 게이트라 오버레이 미지원(표시만)

// 💸 골드 지출 로그 (홈 _spendLogUpd — goldSpendLog_s2 최근 250건)
function spendLogUpd(data, kind, label, amount) {
  const cur = Array.isArray(data && data.goldSpendLog_s2) ? data.goldSpendLog_s2 : [];
  return { goldSpendLog_s2: [...cur.slice(-249), { at: Date.now(), k: kind, l: String(label || '').slice(0, 40), amt: amount }] };
}

// 🃏 가챠 (홈 GACHA_CHAMPS 18종 + 유미 + 확률)
const GACHA_CHAMPS = [
  { slug: 'Akshan', kr: '아크샨' }, { slug: 'Amumu', kr: '아무무' }, { slug: 'Brand', kr: '브랜드' },
  { slug: 'DrMundo', kr: '문도 박사' }, { slug: 'Fizz', kr: '피즈' }, { slug: 'Gangplank', kr: '갱플랭크' },
  { slug: 'Jhin', kr: '진' }, { slug: 'Khazix', kr: '카직스' }, { slug: 'Lulu', kr: '룰루' },
  { slug: 'Malphite', kr: '말파이트' }, { slug: 'Malzahar', kr: '말자하' }, { slug: 'Mel', kr: '멜' },
  { slug: 'Morgana', kr: '모르가나' }, { slug: 'Naafiri', kr: '나피리' }, { slug: 'Poppy', kr: '뽀삐' },
  { slug: 'Rammus', kr: '람머스' }, { slug: 'Vayne', kr: '베인' }, { slug: 'Yasuo', kr: '야스오' },
];
const YUUMI_PULL_RATE = 0.005;   // 시크릿 유미 0.5% (미보유 시 1회)
function gachaRollStar() {
  const r = Math.random();
  if (r < 0.03) return 3;   // 3% 프리즘
  if (r < 0.13) return 2;   // 10% 골드
  return 1;                 // 87% 파편
}
// 뽑기 1회분 결과+쓰기 페이로드 생성 (홈 doGachaPull과 동일 — 쓰기는 호출부가)
function gachaPull(data, times) {
  const cost = times === 1 ? 50 : 450;
  const cards = JSON.parse(JSON.stringify(data.champCards_s2 || {}));
  const log = JSON.parse(JSON.stringify(data.champCardLog_s2 || {}));
  const results = [];
  let gotYuumi = false;
  const alreadyYuumi = !!data.secretYuumi_s2;
  for (let i = 0; i < times; i++) {
    if (!alreadyYuumi && !gotYuumi && Math.random() < YUUMI_PULL_RATE) {
      gotYuumi = true;
      results.push({ slug: 'Yuumi', kr: '유미', star: 3, secret: true });
      continue;
    }
    const c = GACHA_CHAMPS[Math.floor(Math.random() * GACHA_CHAMPS.length)];
    const s = gachaRollStar();
    const prev = cards[c.slug] || { s1: 0, s2: 0, s3: 0 };
    cards[c.slug] = { ...prev, ['s' + s]: (prev['s' + s] || 0) + 1 };
    log[c.slug] = { ...(log[c.slug] || {}), ['e' + s]: true };
    results.push({ slug: c.slug, kr: c.kr, star: s });
  }
  const gachaLog = Array.isArray(data.gachaLog_s2) ? data.gachaLog_s2.slice() : [];
  gachaLog.push({ ts: Date.now(), op: 'pull', times, cost, pulls: results.map(r => ({ slug: r.slug, star: r.star, ...(r.secret ? { secret: true } : {}) })) });
  const upd = {
    goldSpent_s2: (data.goldSpent_s2 || 0) + cost,
    gachaSpent_s2: (data.gachaSpent_s2 || 0) + cost,
    gachaLog_s2: gachaLog,
    champCards_s2: cards,
    champCardLog_s2: log,
  };
  if (data.champCardsBaseline_s2 === undefined) upd.champCardsBaseline_s2 = data.champCards_s2 || null;   // 최초 1회 박제(재구성 시작점)
  if (gotYuumi) upd.secretYuumi_s2 = true;
  return { cost, results, upd };
}

// 🎫 시즌2 퀘스트 패스 (홈 S1_PASS_QUESTS + LV10 교체 + S2_PASS_REWARDS)
const S2_PASS_MAX_LEVEL = 25;
const S2_PASS_QUESTS = [
  { lv: 1,  icon: '🎯', name: '첫 걸음',       desc: '경기 1회 참여',           check: s => s.games >= 1,        prog: s => [Math.min(s.games, 1), 1] },
  { lv: 2,  icon: '🏆', name: '첫 승리',       desc: '승리 1회',                check: s => s.wins >= 1,         prog: s => [Math.min(s.wins, 1), 1] },
  { lv: 3,  icon: '🗡️', name: '딜러 입문',     desc: '한 판 딜량 10,000+',      check: s => s.maxDamage >= 10000, prog: s => [Math.min(s.maxDamage, 10000).toLocaleString(), '10,000'] },
  { lv: 4,  icon: '⚔️', name: '3경기 참전',    desc: '경기 3회 참여',           check: s => s.games >= 3,        prog: s => [Math.min(s.games, 3), 3] },
  { lv: 5,  icon: '⭐', name: '킬 사냥꾼',     desc: '한 판 킬 6+',             check: s => s.maxKills >= 6,     prog: s => [Math.min(s.maxKills, 6), 6], milestone: true },
  { lv: 6,  icon: '💪', name: '신뢰의 동료',   desc: '한 판 어시 8+',           check: s => s.maxAssists >= 8,   prog: s => [Math.min(s.maxAssists, 8), 8] },
  { lv: 7,  icon: '🛡️', name: '살아남기',      desc: '한 판 데스 5이하 + 승리', check: s => s.lowDeathWin5,      prog: null },
  { lv: 8,  icon: '💥', name: '딜 견습생',     desc: '한 판 딜량 25,000+',      check: s => s.maxDamage >= 25000, prog: s => [Math.min(s.maxDamage, 25000).toLocaleString(), '25,000'] },
  { lv: 9,  icon: '🎯', name: 'KDA 3.0',      desc: '한 판 KDA 3.0+',          check: s => s.maxKda >= 3,       prog: s => [Math.min(s.maxKda, 3).toFixed(1), '3.0'] },
  { lv: 10, icon: '💥', name: '멀티 학살',     desc: '한 판 킬+어시 합 15+',    check: s => s.maxKa >= 15,       prog: s => [Math.min(s.maxKa, 15), 15], milestone: true },
  { lv: 11, icon: '🏅', name: 'MVP/SVP 등극', desc: 'MVP 또는 SVP 선정',       check: s => s.mvpCount >= 1,     prog: s => [Math.min(s.mvpCount, 1), 1] },
  { lv: 12, icon: '🤝', name: '매너왕',        desc: '매너왕 선정',             check: s => s.mannerCount >= 1,  prog: s => [Math.min(s.mannerCount, 1), 1] },
  { lv: 13, icon: '🔗', name: '2연승',         desc: '2연승 달성',              check: s => s.maxWinStreak >= 2, prog: s => [Math.min(s.maxWinStreak, 2), 2] },
  { lv: 14, icon: '💣', name: '킬 폭발',       desc: '한 판 킬 10+',            check: s => s.maxKills >= 10,    prog: s => [Math.min(s.maxKills, 10), 10] },
  { lv: 15, icon: '⭐', name: '대폭딜러',      desc: '한 판 딜량 40,000+',      check: s => s.maxDamage >= 40000, prog: s => [Math.min(s.maxDamage, 40000).toLocaleString(), '40,000'], milestone: true },
  { lv: 16, icon: '🌈', name: '어시 마스터',   desc: '한 판 어시 13+',          check: s => s.maxAssists >= 13,  prog: s => [Math.min(s.maxAssists, 13), 13] },
  { lv: 17, icon: '🌟', name: 'KDA 4.0 클럽', desc: '한 판 KDA 4.0+',          check: s => s.maxKda >= 4,       prog: s => [Math.min(s.maxKda, 4).toFixed(1), '4.0'] },
  { lv: 18, icon: '🌱', name: 'CS 장인',       desc: '한 판 CS 50+',            check: s => s.maxCs >= 50,       prog: s => [Math.min(s.maxCs, 50), 50] },
  { lv: 19, icon: '🔥', name: '3연승',         desc: '3연승 달성',              check: s => s.maxWinStreak >= 3, prog: s => [Math.min(s.maxWinStreak, 3), 3] },
  { lv: 20, icon: '⭐', name: '딜량 폭격기',   desc: '한 판 딜량 60,000+',      check: s => s.maxDamage >= 60000, prog: s => [Math.min(s.maxDamage, 60000).toLocaleString(), '60,000'], milestone: true },
  { lv: 21, icon: '🌊', name: '어시 폭발',     desc: '한 판 어시 18+',          check: s => s.maxAssists >= 18,  prog: s => [Math.min(s.maxAssists, 18), 18] },
  { lv: 22, icon: '⚡', name: '킬 머신',       desc: '한 판 킬 12+',            check: s => s.maxKills >= 12,    prog: s => [Math.min(s.maxKills, 12), 12] },
  { lv: 23, icon: '💎', name: 'KDA 5.0 클럽', desc: '한 판 KDA 5.0+',          check: s => s.maxKda >= 5,       prog: s => [Math.min(s.maxKda, 5).toFixed(1), '5.0'] },
  { lv: 24, icon: '🎖️', name: '콤보 마스터',   desc: '킬+어시 합 20+',          check: s => s.maxKa >= 20,       prog: s => [Math.min(s.maxKa, 20), 20] },
  { lv: 25, icon: '👑', name: '시즌의 정점',   desc: '킬+어시 합 25+',          check: s => s.maxKa >= 25,       prog: s => [Math.min(s.maxKa, 25), 25], milestone: true },
];
const S2_PASS_REWARDS = {
  1: { tickets: { stable: 2 } }, 2: { gold: 80 }, 3: { tickets: { stable: 2 } }, 4: { gold: 100 }, 5: { essence: 2 },
  6: { tickets: { precise: 1 } }, 7: { gold: 120 }, 8: { tickets: { stable: 3 } }, 9: { gold: 150 }, 10: { tickets: { precise: 2 }, essence: 1 },
  11: { gold: 150 }, 12: { tickets: { precise: 1 } }, 13: { gold: 180 }, 14: { tickets: { stable: 3 } }, 15: { essence: 3 },
  16: { gold: 200 }, 17: { tickets: { precise: 2 } }, 18: { gold: 220 }, 19: { tickets: { overload: 1 } }, 20: { essence: 3, gold: 200 },
  21: { gold: 250 }, 22: { tickets: { precise: 3 } }, 23: { gold: 280 }, 24: { tickets: { overload: 1 } }, 25: { gold: 500, title: '증바람의 증인' },
};
function s2PassReward(lv) { return S2_PASS_REWARDS[lv] || { gold: 80 }; }
function s2PassClaimTs(claimed, level) { const v = claimed && claimed[level]; if (!v) return null; return (typeof v === 'number' && v > 1e12) ? v : 0; }
function s2PassAfterTs(claimed, level) { if (level <= 1) return 0; const ts = s2PassClaimTs(claimed, level - 1); return ts !== null ? ts : 0; }
function s2PassCurrentLevel(claimed) { if (!claimed) return 0; let lv = 0; for (let i = 1; i <= S2_PASS_MAX_LEVEL; i++) { if (claimed[i]) lv = i; else break; } return lv; }

// 홈 _normalMatchMember — 일반게임 소환사명 → 등록 팀원 이름
function normalMatchMember(summonerName, players) {
  const sn = normName(summonerName || ''); if (!sn) return null;
  const snNo = sn.replace(/\s/g, '');
  let p = players.find(x => normName(x.name) === sn) || players.find(x => normName(x.name).replace(/\s/g, '') === snNo);
  if (p) return p.name;
  p = players.find(x => x.riotId && normName(String(x.riotId).split('#')[0]) === sn)
    || players.find(x => x.riotId && normName(String(x.riotId).split('#')[0]).replace(/\s/g, '') === snNo);
  return p ? p.name : null;
}

// 홈 calcS1PassStats(season=2) 이식 — 내전(matches) + 일반게임(normalMatches) 통합
function calcS2PassStats(name, afterTs, matches, normalMatches, players) {
  const key = normName(name);
  const all = Object.values(matches || {}).filter(m => m && (m.season ?? 0) === 2 && (m.timestamp || 0) >= afterTs);
  const myMatches = all
    .filter(m => (m.teamA || []).some(n => normName(n) === key) || (m.teamB || []).some(n => normName(n) === key))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  let games = 0, wins = 0, losses = 0;
  let maxKills = 0, maxAssists = 0, maxDamage = 0, maxCs = 0, maxKda = 0, maxKa = 0;
  let lowDeathWin5 = false, mvpCount = 0, mannerCount = 0, gambleWinS1 = 0;
  const statGames = myMatches.map(m => {
    const inA = (m.teamA || []).some(n => normName(n) === key);
    return { ts: m.timestamp || 0, won: (m.winner === 'blue' && inA) || (m.winner === 'red' && !inA), p: (m.participants && m.participants[key]) || null };
  });
  for (const m of Object.values(normalMatches || {})) {   // 일반게임 통합(퀘스트는 게임 종류 무관)
    if (!m || !Array.isArray(m.players) || (m.season ?? 0) !== 2 || (m.ts || 0) < afterTs) continue;
    const pl = m.players.find(x => normName(normalMatchMember(x.summonerName, players) || '') === key);
    if (!pl) continue;
    statGames.push({ ts: m.ts || 0, won: !!pl.isWin, p: { kills: pl.kills || 0, deaths: pl.deaths || 0, assists: pl.assists || 0, damage: pl.damage || 0, cs: pl.cs || 0 } });
  }
  statGames.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  let curStreak = 0, maxWinStreak = 0;
  for (const g of statGames) {
    games++;
    if (g.won) { wins++; curStreak++; if (curStreak > maxWinStreak) maxWinStreak = curStreak; }
    else { losses++; curStreak = 0; }
    const p = g.p;
    if (p) {
      const k = p.kills || 0, d = p.deaths || 0, a = p.assists || 0, dmg = p.damage || 0, cs = p.cs || 0;
      if (k > maxKills) maxKills = k;
      if (a > maxAssists) maxAssists = a;
      if (dmg > maxDamage) maxDamage = dmg;
      if (cs > maxCs) maxCs = cs;
      if (k + a > maxKa) maxKa = k + a;
      const kda = d === 0 ? (k + a) : (k + a) / d;
      if (kda > maxKda) maxKda = kda;
      if (g.won && d <= 5) lowDeathWin5 = true;
    }
  }
  for (const m of myMatches) {   // 내전 전용(아이템·MVP·매너)
    const inA = (m.teamA || []).some(n => normName(n) === key);
    const won = (m.winner === 'blue' && inA) || (m.winner === 'red' && !inA);
    const effects = (m.itemEffects && m.itemEffects[key]) || [];
    if (effects.includes('s1_gamble') && won) gambleWinS1++;
    if (normName(m.mvpWinner || '') === key || normName(m.mvpLoser || '') === key) mvpCount++;
    if (normName(m.mannerWinner || '') === key || normName(m.mannerLoser || '') === key || normName(m.mannerKing || '') === key) mannerCount++;
  }
  return { games, wins, losses, maxKills, maxAssists, maxDamage, maxCs, maxKda, maxKa, lowDeathWin5, maxWinStreak, mvpCount, mannerCount, gambleWinS1 };
}

// 패스 화면용 rows(직렬화 가능) — check/prog는 여기서 평가해 결과만 반환
function computePassRows(name, data, matches, normalMatches, players) {
  const claimed = (data && data.passQuestClaimed_s2) || {};
  const curLv = s2PassCurrentLevel(claimed);
  const allDone = curLv >= S2_PASS_MAX_LEVEL;
  const activeLv = curLv + 1;
  const activeStats = !allDone ? calcS2PassStats(name, s2PassAfterTs(claimed, activeLv), matches, normalMatches, players) : null;
  const rows = S2_PASS_QUESTS.map(q => {
    const isClaimed = !!claimed[q.lv];
    const isCurrent = !allDone && q.lv === activeLv;
    const met = isCurrent && !!q.check(activeStats);
    return {
      lv: q.lv, icon: q.icon, name: q.name, desc: q.desc, milestone: !!q.milestone,
      state: isClaimed ? 'done' : met ? 'claimable' : isCurrent ? 'current' : 'locked',
      prog: (isCurrent && !met && q.prog) ? q.prog(activeStats) : null,
      reward: s2PassReward(q.lv),
    };
  });
  return { curLv, maxLv: S2_PASS_MAX_LEVEL, rows };
}

// 패스 수령 검증+쓰기 페이로드 (홈 claimS2PassLevel과 동일 규칙)
function passClaim(name, data, level, matches, normalMatches, players) {
  const claimed = { ...((data && data.passQuestClaimed_s2) || {}) };
  if (claimed[level]) return { err: '이미 수령한 레벨이에요' };
  if (level > 1 && !claimed[level - 1]) return { err: '이전 레벨을 먼저 수령하세요' };
  const q = S2_PASS_QUESTS.find(x => x.lv === level);
  if (!q) return { err: '없는 레벨이에요' };
  const stats = calcS2PassStats(name, s2PassAfterTs(claimed, level), matches, normalMatches, players);
  if (!q.check(stats)) return { err: '아직 퀘스트를 완료하지 않았어요' };
  const reward = s2PassReward(level);
  claimed[level] = Date.now();
  const upd = { passQuestClaimed_s2: claimed };
  if (reward.gold) upd.passGold_s2 = (data.passGold_s2 ?? 0) + reward.gold;
  if (reward.tickets) {
    const tk = { ...((data.emblemTickets_s2) || {}) };
    for (const t in reward.tickets) tk[t] = (tk[t] || 0) + reward.tickets[t];
    upd.emblemTickets_s2 = tk;
  }
  if (reward.essence) upd.emblemEssence_s2 = (data.emblemEssence_s2 || 0) + reward.essence;
  if (reward.title) upd.passTitle_s2 = reward.title;
  return { reward, upd };
}

// ═══ 🔷 시즌2 플레이어 레벨(내전 만렙 LV50) — 홈 PLV_XP(L11111)·plvLevelFromXp(L11117)·_plvMaxReached(L11120) 이식 ═══
//   정수 상점 구매 해금 판정용. XP는 매치 파생(저장X). 내전(matches)+일반게임(normalMatches) 통합.
const PLV_XP = { game: 10, win: 6, award: 4, kda3: 3, kda5: 6 };   // 판수 / 승 / MVP·매너 / KDA3+ / KDA5+
const PLV_MAX_LEVEL = 50, PLV_BASE_NEED = 12, PLV_NEED_STEP = 0.5;
const plvNeed = i => Math.round(PLV_BASE_NEED + (i - 1) * PLV_NEED_STEP);   // 레벨 i→i+1 요구 XP
const plvCumXp = L => { let s = 0; for (let i = 1; i < L; i++) s += plvNeed(i); return s; };   // 레벨 L 도달 누적 XP
function plvLevelFromXp(xp) { let L = 1; while (L < PLV_MAX_LEVEL && (xp || 0) >= plvCumXp(L + 1)) L++; return L; }
function calcPlayerXp(name, matches, normalMatches, players) {
  if (!name) return 0;
  const nnv = normName(name);
  const plist = Array.isArray(players) ? players : [];
  let xp = 0;
  for (const m of Object.values(matches || {})) {
    if ((m.season || 0) !== 2) continue;
    const inA = (m.teamA || []).some(p => normName(p) === nnv), inB = (m.teamB || []).some(p => normName(p) === nnv);
    if (!inA && !inB) continue;
    xp += PLV_XP.game;
    const won = (m.winner === 'blue' && inA) || (m.winner === 'red' && inB);
    if (won) xp += PLV_XP.win;
    if ([m.mvpWinner, m.mvpLoser, m.mannerWinner, m.mannerLoser, m.mannerKing].some(x => x && normName(x) === nnv)) xp += PLV_XP.award;
    const pd = m.participants && m.participants[nnv];
    if (pd) { const kda = ((pd.kills || 0) + (pd.assists || 0)) / Math.max(1, pd.deaths || 0);
      if (kda >= 5) xp += PLV_XP.kda5; else if (kda >= 3) xp += PLV_XP.kda3; }
  }
  for (const m of Object.values(normalMatches || {})) {   // 일반게임(증바람) XP — 내전과 동일(경기·승리·KDA). 소환사명→팀원 매핑 위해 players 필요
    if (!m || !Array.isArray(m.players) || (m.season || 0) !== 2) continue;
    const pl = m.players.find(x => normName(normalMatchMember(x.summonerName, plist) || '') === nnv);
    if (!pl) continue;
    xp += PLV_XP.game;
    if (pl.isWin) xp += PLV_XP.win;
    const kda = ((pl.kills || 0) + (pl.assists || 0)) / Math.max(1, pl.deaths || 0);
    if (kda >= 5) xp += PLV_XP.kda5; else if (kda >= 3) xp += PLV_XP.kda3;
  }
  return xp;
}
function plvMaxReached(name, matches, normalMatches, players) { return plvLevelFromXp(calcPlayerXp(name, matches, normalMatches, players)) >= PLV_MAX_LEVEL; }

// ═══ 🔨 대장간(강철심장) — 홈 이식(emblemEnhance L10843·emblemMasterReroll L10773·emblemSell L10896·emblemBuyBase L10731) ═══
const EMBLEM_SLOTS = 5, EMBLEM_LINES = 3, EMBLEM_BASE_PRICE = 150, EMBLEM_MAX_OWN = 15;
const EMBLEM_EFFECT_POOL = ['matchG', 'winG', 'attend', 'mvpG', 'magollaG', 'winLP', 'lossLP', 'lottoTkt', 'yuumiCut', 'yuumiCool'];
// 효과 정의(홈 EMBLEM_EFFECTS L10634 — base/cap/perCap·표기)
const EMBLEM_FX = {
  matchG:   { name: '경기 골드',   base: 5,  cap: 0,  fmt: v => `+${v}G` },
  winG:     { name: '승리 골드',   base: 8,  cap: 0,  fmt: v => `+${v}G` },
  attend:   { name: '출석 골드',   base: 15, cap: 0,  fmt: v => `+${v}G` },
  mvpG:     { name: 'MVP 골드',    base: 15, cap: 0,  fmt: v => `+${v}G` },
  magollaG: { name: '막고라 배당', base: 5,  cap: 60, fmt: v => `+${v}%` },
  winLP:    { name: '승리 LP',     base: 2,  cap: 6,  fmt: v => `+${v}LP` },
  lossLP:   { name: '패배 방어',   base: 2,  cap: 6,  fmt: v => `-${v}LP` },
  lottoTkt: { name: '해골 감소',   base: 1,  cap: 1,  fmt: v => `-${Math.round(v * 100)}%` },
  yuumiCut:  { name: '유미 파견',  base: 4,  cap: 30, perCap: 10, fmt: v => `-${v}분` },
  yuumiCool: { name: '유미 휴식',  base: 4,  cap: 30, perCap: 10, fmt: v => `-${v}분` },
};
const LOTTO_SKULL_CAP = 0.70, LOTTO_SKULL_PER_LINE = 0.70 / 3;
function getEmblems(data) {
  data = data || {};
  const arr = data.emblems_s2;
  if (Array.isArray(arr)) return arr.filter(Boolean);
  const single = data.emblem_s2;
  if (single) return [{ id: 1, slots: single.slots || [], createdAt: single.createdAt || 0 }];
  return [];
}
function getEquippedId(data) {
  const arr = getEmblems(data); if (!arr.length) return null;
  const eq = (data || {}).emblemEquipped_s2;
  if (eq != null && arr.some(e => e.id === eq)) return eq;
  if (eq === null) return null;
  return arr[0].id;
}
function emblemLevel(em) { return em && em.slots ? em.slots.filter(s => s.ok).length : 0; }
function emblemPower(em) { return em && em.slots ? em.slots.reduce((a, s) => a + (s.ok ? (EMBLEM_TICKETS[s.t] ? EMBLEM_TICKETS[s.t].power : 0) : 0), 0) : 0; }
function emblemSlotsUsed(em) { return em && em.slots ? em.slots.length : 0; }
function emblemLocked(em) { return emblemSlotsUsed(em) >= EMBLEM_SLOTS; }
function emblemGrade(power) { return power <= 0 ? '미강화' : power < 10 ? '실버' : power < 25 ? '골드' : '프리즘'; }
function emblemNextId(arr) { return arr.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1; }
function emblemSellPrice(em) {
  if (!em || !em.slots) return 0;
  const invested = em.slots.reduce((a, s) => a + (EMBLEM_TICKETS[s.t] ? EMBLEM_TICKETS[s.t].price : 0), 0);
  const power = emblemPower(em);
  return Math.round(EMBLEM_BASE_PRICE * 0.5 + invested * 0.35 + power * power * 2);
}
function emblemRollLines() { return Array.from({ length: EMBLEM_LINES }, () => EMBLEM_EFFECT_POOL[Math.floor(Math.random() * EMBLEM_EFFECT_POOL.length)]); }
// 효과 합산(홈 emblemEffectsOf L10685) + 줄 텍스트("해골 감소 -23% · …")
function emblemEffectsOf(em) {
  const power = emblemPower(em), mult = 1 + power * 0.1;
  const lines = Array.isArray(em && em.lines) ? em.lines : [];
  const eff = {};
  for (const eid of EMBLEM_EFFECT_POOL) {
    const cnt = lines.filter(l => l === eid).length;
    const d = EMBLEM_FX[eid];
    if (eid === 'lottoTkt') { eff[eid] = cnt ? Math.min(LOTTO_SKULL_CAP, cnt * LOTTO_SKULL_PER_LINE) : 0; continue; }
    if (eid === 'winLP' || eid === 'lossLP') { eff[eid] = cnt ? Math.min(d.cap, cnt * d.base) : 0; continue; }
    const per = cnt ? (d.perCap ? Math.min(d.perCap, Math.round(d.base * mult)) : Math.round(d.base * mult)) : 0;
    let v = cnt * per;
    if (d.cap && v > d.cap) v = d.cap;
    eff[eid] = v;
  }
  return { power, eff };
}
function emblemEffText(em) {
  const { eff } = emblemEffectsOf(em);
  const parts = EMBLEM_EFFECT_POOL.filter(eid => eff[eid] > 0).map(eid => `${EMBLEM_FX[eid].name} ${EMBLEM_FX[eid].fmt(eff[eid])}`);
  return parts.length ? parts.join(' · ') : '';
}
function purchaseLogAppend(data, item, extra) {
  const entry = { ts: Date.now(), id: item.id, name: item.name, price: item.price };
  if (extra) Object.assign(entry, extra);
  return [...(data.purchaseLog_s2 || []), entry];
}
// 강화(장착품만·성공/실패 무관 슬롯 소모) → {err}|{upd,result}
function forgeEnhance(data, type) {
  const def = EMBLEM_TICKETS[type]; if (!def) return { err: '알 수 없는 강화권' };
  const arr = getEmblems(data), eqId = getEquippedId(data);
  const em = arr.find(e => e.id === eqId);
  if (!em) return { err: '강철심장을 먼저 장착하세요' };
  if (emblemLocked(em)) return { err: '강화 슬롯이 모두 소진됐어요 (5/5)' };
  const tickets = { stable: 0, precise: 0, overload: 0, ...(data.emblemTickets_s2 || {}) };
  if ((tickets[type] || 0) < 1) return { err: `${def.name}이 없어요` };
  const ok = Math.random() < def.chance;
  const slots = [...(em.slots || []), { t: type, ok }];
  const newArr = arr.map(e => e.id === eqId ? { ...e, slots } : e);
  tickets[type] -= 1;
  const newEm = { ...em, slots };
  return {
    upd: { emblems_s2: newArr, emblem_s2: null, emblemEquipped_s2: eqId, emblemTickets_s2: tickets },
    result: { ok, type, level: emblemLevel(newEm), power: emblemPower(newEm), slotsUsed: emblemSlotsUsed(newEm), locked: emblemLocked(newEm) },
  };
}
// 걸작 만들기(정수 1 소모·3줄 리롤·중복 허용 균등)
function forgeReroll(data) {
  const arr = getEmblems(data), eqId = getEquippedId(data);
  const em = arr.find(e => e.id === eqId);
  if (!em) return { err: '강철심장을 먼저 장착하세요' };
  const essence = data.emblemEssence_s2 || 0;
  if (essence < 1) return { err: '걸작의 정수가 없어요' };
  const newLines = emblemRollLines();
  const newArr = arr.map(e => e.id === eqId ? { ...e, lines: newLines } : e);
  return { upd: { emblems_s2: newArr, emblem_s2: null, emblemEquipped_s2: eqId, emblemEssence_s2: essence - 1 }, lines: newLines };
}
// 구매(150G·최대 15·첫 구매 자동 장착) — 골드 검증은 호출부(availableGoldS2)
function forgeBuyBase(data) {
  const arr = getEmblems(data);
  if (arr.length >= EMBLEM_MAX_OWN) return { err: `강철심장은 최대 ${EMBLEM_MAX_OWN}개까지 보유할 수 있어요` };
  const newId = emblemNextId(arr);
  const newArr = [...arr, { id: newId, slots: [], lines: [], createdAt: Date.now() }];
  const curEquipped = getEquippedId(data);
  return { price: EMBLEM_BASE_PRICE, upd: {
    emblems_s2: newArr, emblem_s2: null,
    emblemEquipped_s2: (curEquipped != null) ? curEquipped : newId,
    goldSpent_s2: (data.goldSpent_s2 ?? 0) + EMBLEM_BASE_PRICE,
    ...spendLogUpd(data, 'emblem_base', '강철심장 구매', EMBLEM_BASE_PRICE),
  } };
}
// 판매(환급=emblemSellG_s2 누적·purchaseLog 기록·장착품 팔면 재장착)
function forgeSell(data, id) {
  const arr = getEmblems(data);
  const em = (id != null) ? arr.find(e => e.id === id) : arr.find(e => e.id === getEquippedId(data));
  if (!em) return { err: '판매할 강철심장이 없어요' };
  const refund = emblemSellPrice(em);
  const newArr = arr.filter(e => e.id !== em.id);
  const upd = {
    emblems_s2: newArr, emblem_s2: null,
    emblemSellG_s2: (data.emblemSellG_s2 ?? 0) + refund,
    purchaseLog_s2: purchaseLogAppend(data, { id: 'emblem_sell', name: `강철심장 판매 (성능 ${emblemPower(em)})`, price: refund }, { type: 'sell' }),
  };
  if (getEquippedId(data) === em.id) upd.emblemEquipped_s2 = newArr.length ? newArr[0].id : null;
  return { refund, upd };
}
// 애칭(≤3자·빈값=null)
function forgeNick(data, id, nick) {
  const arr = getEmblems(data);
  if (!arr.some(e => e.id === id)) return { err: '없는 강철심장이에요' };
  const nk = [...String(nick || '').trim()].slice(0, 3).join('');
  return { upd: { emblems_s2: arr.map(e => e.id === id ? { ...e, nick: nk || null } : e) } };
}
// 무효 걸작 줄 자동 치유(홈 _healEmblemLines) — 변경 있을 때만 upd 반환
function forgeHealUpd(data) {
  const arr = getEmblems(data); if (!arr.length) return null;
  const sanitize = lines => {
    if (!Array.isArray(lines) || lines.length === 0) return [];
    return Array.from({ length: EMBLEM_LINES }, (_, i) => EMBLEM_FX[lines[i]] ? lines[i] : EMBLEM_EFFECT_POOL[Math.floor(Math.random() * EMBLEM_EFFECT_POOL.length)]);
  };
  let changed = false;
  const fixed = arr.map(e => {
    const fl = sanitize(e.lines);
    if (JSON.stringify(fl) !== JSON.stringify(e.lines || [])) { changed = true; return { ...e, lines: fl }; }
    return e;
  });
  return changed ? { emblems_s2: fixed } : null;
}
// 대장간 화면용 직렬화 데이터
function computeForgeView(data) {
  const eqId = getEquippedId(data);
  const emblems = getEmblems(data).map(e => ({
    id: e.id, nick: e.nick || null, equipped: e.id === eqId,
    level: emblemLevel(e), power: emblemPower(e), grade: emblemGrade(emblemPower(e)),
    slots: (e.slots || []).map(s => ({ t: s.t, ok: !!s.ok })), slotsUsed: emblemSlotsUsed(e), locked: emblemLocked(e),
    hasLines: Array.isArray(e.lines) && e.lines.length > 0, effText: emblemEffText(e), sellPrice: emblemSellPrice(e),
  }));
  return { emblems, count: emblems.length, maxOwn: EMBLEM_MAX_OWN, basePrice: EMBLEM_BASE_PRICE,
    tickets: { stable: 0, precise: 0, overload: 0, ...(data.emblemTickets_s2 || {}) }, essence: data.emblemEssence_s2 || 0 };
}

// ═══ 🎟 스크래치 복권 — 홈 이식(SCRATCH_TIERS L27235·rollScratch L27309·_rollScratchPity L27284·buyItem scratch_tier L30691) ═══
const SCRATCH_SKULL = { id: 'skull', emoji: '💀', name: '해골', gold: 0 };
const SCRATCH_TIERS = [
  { idx: 0, id: 'scratch_normal', name: '실버 복권', price: 70, cells: 4, skulls: 0, skullAppear: 0, skullPenalty: 0, matchCount: 2,
    symbols: [
      { id: 'clover', emoji: '🍀', name: '클로버', gold: 65, appear: 16 },
      { id: 'snowflake', emoji: '❄️', name: '눈꽃', gold: 65, appear: 14 },
      { id: 'flame', emoji: '🔥', name: '불꽃', gold: 75, appear: 13 },
      { id: 'sword', emoji: '⚔️', name: '검', gold: 80, appear: 12 },
      { id: 'lightning', emoji: '⚡', name: '번개', gold: 85, appear: 11 },
      { id: 'moon', emoji: '🌙', name: '달', gold: 100, appear: 9 },
      { id: 'shield', emoji: '🛡️', name: '방패', gold: 135, appear: 8 },
      { id: 'star', emoji: '⭐', name: '별', gold: 220, appear: 7 },
      { id: 'gem', emoji: '💠', name: '보석', gold: 310, appear: 5 },
      { id: 'diamond', emoji: '💎', name: '다이아', gold: 425, appear: 5 },
      { id: 'crown', emoji: '👑', name: '왕관', gold: 670, appear: 3 },
    ] },
  { idx: 1, id: 'scratch_advanced', name: '골드 복권', price: 200, cells: 6, skulls: 1, skullAppear: 20, skullPenalty: 10, matchCount: 3,
    symbols: [
      { id: 'clover', emoji: '🍀', name: '클로버', gold: 320, appear: 30 },
      { id: 'sword', emoji: '⚔️', name: '검', gold: 440, appear: 22 },
      { id: 'moon', emoji: '🌙', name: '달', gold: 600, appear: 18 },
      { id: 'shield', emoji: '🛡️', name: '방패', gold: 870, appear: 13 },
      { id: 'star', emoji: '⭐', name: '별', gold: 1450, appear: 9 },
      { id: 'diamond', emoji: '💎', name: '다이아', gold: 2950, appear: 5 },
      { id: 'crown', emoji: '👑', name: '왕관', gold: 5200, appear: 3 },
    ] },
  { idx: 2, id: 'scratch_premium', name: '프리즘 복권', price: 400, cells: 7, skulls: 2, skullAppear: 40, skullPenalty: 10, matchCount: 3,
    symbols: [
      { id: 'clover', emoji: '🍀', name: '클로버', gold: 690, appear: 28 },
      { id: 'sword', emoji: '⚔️', name: '검', gold: 910, appear: 22 },
      { id: 'moon', emoji: '🌙', name: '달', gold: 1250, appear: 18 },
      { id: 'shield', emoji: '🛡️', name: '방패', gold: 1890, appear: 13 },
      { id: 'star', emoji: '⭐', name: '별', gold: 3090, appear: 10 },
      { id: 'diamond', emoji: '💎', name: '다이아', gold: 6000, appear: 6 },
      { id: 'crown', emoji: '👑', name: '왕관', gold: 8580, appear: 3 },
    ] },
];
const LOTTERY_PITY_CAP = 20;
const LOTTERY_PITY_KEY = { 1: 'gold', 2: 'prism' };
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// 홈 rollScratch 1:1 — data=내 gold 데이터(장착 걸작의 해골 감소 반영)
function rollScratch(tierIdx, data) {
  const tier = SCRATCH_TIERS[tierIdx] || SCRATCH_TIERS[0];
  const { symbols, cells } = tier;
  let skullAppear = tier.skullAppear || 0;
  if (skullAppear > 0) {   // 🛡️ 강철심장 "해골 감소" — 장착 걸작 줄수 기반(홈 L27314)
    try {
      const em = getEmblems(data).find(e => e.id === getEquippedId(data));
      const red = em ? (emblemEffectsOf(em).eff.lottoTkt || 0) : 0;
      if (red > 0) skullAppear = Math.round(skullAppear * (1 - red));
    } catch (_) {}
  }
  const matchCount = tier.matchCount || 2;
  const totalSymAppear = symbols.reduce((s, x) => s + x.appear, 0);
  const totalAll = totalSymAppear + skullAppear;
  const pickWeighted = (pool) => {
    const total = pool.reduce((s, x) => s + x.appear, 0);
    const r = Math.random() * total;
    let cumul = 0;
    for (const sym of pool) { cumul += sym.appear; if (r < cumul) return sym; }
    return pool[pool.length - 1];
  };
  const symArr = []; let skullCount = 0;
  for (let i = 0; i < cells; i++) {
    const r = Math.random() * totalAll;
    if (r < totalSymAppear) {
      let cumul = 0, picked = symbols[symbols.length - 1];
      for (const sym of symbols) { cumul += sym.appear; if (r < cumul) { picked = sym; break; } }
      symArr.push(picked);
    } else skullCount++;
  }
  {   // cap = matchCount
    const cap = matchCount;
    const cnt = {};
    for (let i = 0; i < symArr.length; i++) {
      const sid = symArr[i].id;
      cnt[sid] = (cnt[sid] || 0) + 1;
      if (cnt[sid] > cap) {
        const candidates = symbols.filter(s => (cnt[s.id] || 0) < cap);
        if (candidates.length) {
          const repl = pickWeighted(candidates);
          cnt[sid]--; cnt[repl.id] = (cnt[repl.id] || 0) + 1; symArr[i] = repl;
        }
      }
    }
  }
  {   // 다중 매칭 방지 — 가장 가치 큰 심볼만 winner
    const cnt = {};
    for (const s of symArr) cnt[s.id] = (cnt[s.id] || 0) + 1;
    const matched = Object.keys(cnt).filter(id => cnt[id] >= matchCount);
    if (matched.length > 1) {
      const winnerId = matched.reduce((best, id) => {
        const sym = symbols.find(s => s.id === id);
        const bestSym = best ? symbols.find(s => s.id === best) : null;
        return !bestSym || sym.gold > bestSym.gold ? id : best;
      }, null);
      for (const dupId of matched) {
        if (dupId === winnerId) continue;
        const cap2 = matchCount - 1;
        const candidates = symbols.filter(s => s.id !== winnerId && (cnt[s.id] || 0) < cap2);
        if (!candidates.length) continue;
        const swapIdx = symArr.findIndex(s => s.id === dupId);
        if (swapIdx < 0) continue;
        const repl = pickWeighted(candidates);
        cnt[dupId]--; cnt[repl.id] = (cnt[repl.id] || 0) + 1; symArr[swapIdx] = repl;
      }
    }
  }
  const counts = {};
  for (const s of symArr) counts[s.id] = (counts[s.id] || 0) + 1;
  let winSym = null;
  for (const [id, cnt] of Object.entries(counts)) {
    if (cnt >= matchCount) {
      const sym = symbols.find(s => s.id === id);
      if (sym && (!winSym || sym.gold > winSym.gold)) winSym = sym;
    }
  }
  let slots;
  if (winSym) {   // 쪼는 맛 — 당첨 심볼 1개는 마지막 셀 고정
    const winInst = symArr.filter(s => s.id === winSym.id);
    const otherInst = shuffle([...symArr.filter(s => s.id !== winSym.id), ...Array(skullCount).fill(SCRATCH_SKULL)]);
    const winPos = new Set([cells - 1]);
    const earlyPos = shuffle([...Array(cells - 1).keys()]);
    for (let i = 0; i < winInst.length - 1; i++) winPos.add(earlyPos[i]);
    slots = new Array(cells);
    let oi = 0;
    for (let i = 0; i < cells; i++) slots[i] = winPos.has(i) ? winSym : otherInst[oi++];
  } else {
    slots = shuffle([...symArr, ...Array(skullCount).fill(SCRATCH_SKULL)]);
  }
  return { slots, win: winSym, tier };
}
// 🍀 불운 스택 적용 롤(홈 _rollScratchPity 1:1) — 골드·프리즘만·꽝+1/해골+0.5/당첨=0/상한20
function rollScratchPity(tierIdx, data) {
  let result = rollScratch(tierIdx, data);
  const k = LOTTERY_PITY_KEY[tierIdx];
  if (!k) return { result };
  const pityAll = { ...((data || {}).lotteryPity_s2 || {}) };
  const prev = Math.min(LOTTERY_PITY_CAP, +pityAll[k] || 0);
  if (!result.win && prev > 0 && Math.random() * 100 < prev) {
    for (let i = 0; i < 60; i++) { const rr = rollScratch(tierIdx, data); if (rr.win) { result = rr; result.pityConv = true; break; } }
  }
  const skulls = (result.slots || []).reduce((n, s) => n + (s && s.id === 'skull' ? 1 : 0), 0);
  pityAll[k] = result.win ? 0 : Math.min(LOTTERY_PITY_CAP, prev + 1 + skulls * 0.5);
  result.pity = prev;
  return { result, pityPatch: pityAll, pityPrev: prev, pityKey: k };
}
// 당첨 보너스(홈 _myLottoPrizeBonus) — 실버 차단·해골감소 줄 보유 시 성능 비례(줄당 min(30,성능)×줄수)
function lottoPrizeBonus(data, tierIdx) {
  if (tierIdx === 0) return 0;
  const em = getEmblems(data).find(e => e.id === getEquippedId(data)); if (!em) return 0;
  const lines = Array.isArray(em.lines) ? em.lines : [];
  const cnt = lines.filter(l => l === 'lottoTkt').length;
  if (!cnt) return 0;
  const power = emblemPower(em);
  return power > 0 ? Math.min(30, Math.round(power * 1)) * cnt : 0;
}
// 구매(유료/무료) — 홈 buyItem scratch_tier 분기 1:1. 골드 검증은 호출부. → {err}|{rec, upd}
function lotteryBuy(data, tierIdx, useFree) {
  const tier = SCRATCH_TIERS[tierIdx]; if (!tier) return { err: '없는 복권이에요' };
  if (data.pendingScratch_s2 && Array.isArray(data.pendingScratch_s2.slots)) return { err: '진행 중인 복권이 있어요 — 이어서 긁어주세요' };
  if (useFree) {
    const ft = { ...(data.freeScratch_s2 || {}) };
    if (!(ft[tierIdx] > 0)) return { err: '무료권이 없어요' };
    ft[tierIdx] = Math.max(0, (ft[tierIdx] || 0) - 1);
    const pt = rollScratchPity(tierIdx, data);
    const rec = { tierIdx, slots: pt.result.slots, win: pt.result.win || null, free: true, emblemBonus: 0, toolId: null, revealed: [], at: Date.now(),
      pity: pt.result.pity || 0, pityConv: !!pt.result.pityConv, pityPrev: pt.pityPrev ?? null, pityKey: pt.pityKey || null };   // pity*=오버레이 추가 필드(취소/이력용·홈 무해)
    return { rec, upd: { freeScratch_s2: ft, ...(pt.pityPatch ? { lotteryPity_s2: pt.pityPatch } : {}), pendingScratch_s2: rec } };
  }
  const pt = rollScratchPity(tierIdx, data);
  const bonus = pt.result.win ? lottoPrizeBonus(data, tierIdx) : 0;
  const rec = { tierIdx, slots: pt.result.slots, win: pt.result.win || null, free: false, emblemBonus: bonus, toolId: null, revealed: [], at: Date.now(),
    pity: pt.result.pity || 0, pityConv: !!pt.result.pityConv, pityPrev: pt.pityPrev ?? null, pityKey: pt.pityKey || null };
  return { rec, price: tier.price, upd: {
    goldSpent_s2: (data.goldSpent_s2 ?? 0) + tier.price,
    ...(pt.pityPatch ? { lotteryPity_s2: pt.pityPatch } : {}),
    pendingScratch_s2: rec,
  } };
}
const _dateKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// 완료 — 홈 onComplete/finishReveal 1:1: history.gold = winGold − skullPenalty + emblemBonus
function lotteryFinish(data, rec, revealedSkulls) {
  const tier = SCRATCH_TIERS[rec.tierIdx] || SCRATCH_TIERS[0];
  const winGold = rec.win ? rec.win.gold : 0;
  const skullPenalty = (tier.skullPenalty || 0) * (revealedSkulls || 0);
  const net = winGold - skullPenalty + (rec.emblemBonus || 0);
  const entry = { ts: Date.now(), date: _dateKey(), scratch: true, tierIdx: rec.tierIdx, win: rec.win ? rec.win.id : null,
    gold: net, season: 2,
    ...(rec.free ? { free: true } : {}),
    ...(rec.emblemBonus ? { emblemBonus: rec.emblemBonus } : {}),
    ...(rec.pity ? { pity: rec.pity } : {}), ...(rec.pityConv ? { pityConv: true } : {}) };
  return { net, winGold, skullPenalty, upd: { pendingScratch_s2: null, lotteryHistory: [...(data.lotteryHistory || []), entry] } };
}
// 취소(한 획도 안 긁음) — 유료=환불·무료=1장 반환·pity 원복
function lotteryCancel(data, rec) {
  const tier = SCRATCH_TIERS[rec.tierIdx] || SCRATCH_TIERS[0];
  const upd = { pendingScratch_s2: null };
  if (rec.free) { const ft = { ...(data.freeScratch_s2 || {}) }; ft[rec.tierIdx] = (ft[rec.tierIdx] || 0) + 1; upd.freeScratch_s2 = ft; }
  else upd.goldSpent_s2 = Math.max(0, (data.goldSpent_s2 ?? 0) - tier.price);
  if (rec.pityKey != null && rec.pityPrev != null) { const p2 = { ...(data.lotteryPity_s2 || {}) }; p2[rec.pityKey] = rec.pityPrev; upd.lotteryPity_s2 = p2; }
  return { upd };
}
// 버리기 — 당첨이어도 gold 0·구매비/무료권 반환 없음
function lotteryDiscard(data, rec) {
  const entry = { ts: Date.now(), date: _dateKey(), scratch: true, tierIdx: rec.tierIdx, win: null, gold: 0, discarded: true, season: 2, ...(rec.free ? { free: true } : {}) };
  return { upd: { pendingScratch_s2: null, lotteryHistory: [...(data.lotteryHistory || []), entry] } };
}
function lotteryView(data) {
  const pity = data.lotteryPity_s2 || {};
  const em = getEmblems(data).find(e => e.id === getEquippedId(data));
  const skullRed = em ? (emblemEffectsOf(em).eff.lottoTkt || 0) : 0;
  return {
    tiers: SCRATCH_TIERS.map(t => ({ idx: t.idx, name: t.name, price: t.price, cells: t.cells, matchCount: t.matchCount, skullPenalty: t.skullPenalty, hasSkull: t.skullAppear > 0, top: t.symbols[t.symbols.length - 1].gold })),
    free: { 0: 0, 1: 0, 2: 0, ...(data.freeScratch_s2 || {}) },
    pity: { gold: Math.min(LOTTERY_PITY_CAP, +pity.gold || 0), prism: Math.min(LOTTERY_PITY_CAP, +pity.prism || 0) },
    pending: (data.pendingScratch_s2 && Array.isArray(data.pendingScratch_s2.slots)) ? data.pendingScratch_s2 : null,
    skullRed, prizeBonus: { 1: lottoPrizeBonus(data, 1), 2: lottoPrizeBonus(data, 2) },
  };
}

module.exports = { EMBLEM_TICKETS, EMBLEM_TICKET_ORDER, EMBLEM_ESSENCE_PRICE, spendLogUpd, GACHA_CHAMPS, gachaPull, S2_PASS_MAX_LEVEL, computePassRows, passClaim,
  PLV_MAX_LEVEL, calcPlayerXp, plvLevelFromXp, plvMaxReached,
  getEmblems, getEquippedId, emblemEffectsOf, forgeEnhance, forgeReroll, forgeBuyBase, forgeSell, forgeNick, forgeHealUpd, computeForgeView,
  SCRATCH_TIERS, rollScratch, lotteryBuy, lotteryFinish, lotteryCancel, lotteryDiscard, lotteryView };

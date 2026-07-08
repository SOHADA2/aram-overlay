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

module.exports = { EMBLEM_TICKETS, EMBLEM_TICKET_ORDER, EMBLEM_ESSENCE_PRICE, spendLogUpd, GACHA_CHAMPS, gachaPull, S2_PASS_MAX_LEVEL, computePassRows, passClaim };

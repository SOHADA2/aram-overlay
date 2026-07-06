// ── 프로필/기록/랭킹 계산 (홈페이지 프로필 정보 이식·시즌2) ──────────────────
// 원자료: matches(전체)·내 gold 노드·season2/players. 렌더러(데스크톱)가 이걸 받아 세로 카테고리로 표시.
const { normName } = require('./teams');
const { calcGoldFromMatchesS2 } = require('./gold');

const TIER_ORDER = { unranked: 0, iron: 0, bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5, master: 6, grandmaster: 7, challenger: 8 };
const TIER_KR = { unranked: '배치', iron: '아이언', bronze: '브론즈', silver: '실버', gold: '골드', platinum: '플래', diamond: '다이아', master: '마스터', grandmaster: '그마', challenger: '챌린저' };
const _TPOW = { stable: 1, precise: 3, overload: 6 };

const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
const emLevel = em => (em.slots || []).filter(s => s && s.ok).length;
const emPower = em => (em.slots || []).reduce((s, x) => s + (x && x.ok ? (_TPOW[x.t] || 0) : 0), 0);
const emGrade = p => p >= 25 ? '프리즘' : p >= 10 ? '골드' : p >= 1 ? '실버' : '기본';

function lpOf(name, lpAll) {
  if (!lpAll) return null;
  const me = normName(name);
  for (const k in lpAll) { const d = lpAll[k]; if (d && normName(d.name || k) === me) return d; }
  return null;
}

// 내 시즌2 매치 통계(승/패/폼/챔프/MVP/매너)
function matchStats(name, matches) {
  const me = normName(name);
  const list = matches ? Object.values(matches) : [];
  let games = 0, wins = 0, mvp = 0, manner = 0;
  const form = [];           // {ts, won}
  const champ = {};          // {champ:{games,wins}}
  for (const m of list) {
    if (!m || (m.season ?? 0) !== 2) continue;
    const inA = (m.teamA || []).some(n => normName(n) === me);
    const inB = (m.teamB || []).some(n => normName(n) === me);
    if (m.mvpWinner && normName(m.mvpWinner) === me) mvp++;
    if (m.mvpLoser && normName(m.mvpLoser) === me) mvp++;
    if (m.mannerWinner && normName(m.mannerWinner) === me) manner++;
    if (m.mannerLoser && normName(m.mannerLoser) === me) manner++;
    if (!inA && !inB) continue;
    const won = (m.winner === 'blue' && inA) || (m.winner === 'red' && inB);
    games++; if (won) wins++;
    form.push({ ts: m.timestamp || 0, won });
    const p = m.participants && m.participants[me];
    const c = p && p.champion;
    if (c) { (champ[c] = champ[c] || { games: 0, wins: 0 }).games++; if (won) champ[c].wins++; }
  }
  form.sort((a, b) => b.ts - a.ts);
  const champArr = Object.entries(champ).map(([c, v]) => ({ champ: c, games: v.games, wins: v.wins }));
  const most = champArr.slice().sort((a, b) => b.games - a.games)[0] || null;
  const best = champArr.filter(c => c.games >= 2).sort((a, b) => (b.wins / b.games) - (a.wins / a.games) || b.games - a.games)[0] || most;
  return { games, wins, losses: games - wins, mvp, manner, form: form.slice(0, 10).map(f => f.won), most, best };
}

function computeProfile(name, gold, matches, lpAll) {
  const st = matchStats(name, matches);
  const matchGold = calcGoldFromMatchesS2(name, matches);
  const lp = lpOf(name, lpAll);
  // 강철심장(장착)
  let emblem = null;
  const arr = (gold && Array.isArray(gold.emblems_s2) ? gold.emblems_s2 : []).filter(Boolean);
  if (arr.length) {
    const eqId = (gold.emblemEquipped_s2 != null) ? gold.emblemEquipped_s2 : arr.slice().sort((a, b) => emPower(b) - emPower(a))[0].id;
    const em = arr.find(e => e.id === eqId) || arr[0];
    const p = emPower(em);
    emblem = { nick: em.nick || null, level: emLevel(em), power: p, grade: emGrade(p) };
  }
  // 단짝
  let buddy = null;
  const b = gold && gold.buddy_s2;
  if (b && b.champion) {
    const stk = gold.buddyStreak_s2 || null;
    buddy = { champion: b.champion, count: num(b.pulls), streakType: stk && stk.type || null, streakCount: stk ? num(stk.count) : 0 };
  }
  return {
    name,
    lp: lp ? { tier: lp.tier || 'unranked', tierKr: TIER_KR[lp.tier] || '배치', lp: num(lp.lp), placementDone: lp.placementDone !== false, promoActive: !!lp.promoActive, placementGames: num(lp.placementGames), placementWins: num(lp.placementWins) } : null,
    arena: { games: st.games, wins: st.wins, losses: st.losses, winrate: st.games ? Math.round(st.wins / st.games * 100) : 0, form: st.form, matchGold, avgGold: st.games ? Math.round(matchGold / st.games) : 0, mvp: st.mvp, manner: st.manner },
    champs: { most: st.most, best: st.best },
    emblem,
    synergy: (gold && gold.activeSynergy_s2) || null,
    buddy,
  };
}

// 최근 시즌2 경기 기록 (내 참여 여부 표시)
function computeRecords(name, matches, limit = 24) {
  const me = normName(name);
  const list = (matches ? Object.values(matches) : []).filter(m => m && (m.season ?? 0) === 2 && (m.teamA || m.teamB));
  list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return list.slice(0, limit).map(m => {
    const inA = (m.teamA || []).some(n => normName(n) === me);
    const inB = (m.teamB || []).some(n => normName(n) === me);
    const mine = inA || inB;
    const won = mine ? ((m.winner === 'blue' && inA) || (m.winner === 'red' && inB)) : null;
    const p = m.participants && m.participants[me];
    return {
      ts: m.timestamp || 0, date: m.date || '',
      teamA: m.teamA || [], teamB: m.teamB || [], winner: m.winner || '',
      size: (m.teamA || []).length, mine, won,
      myChamp: p && p.champion || null,
      kda: p ? { k: num(p.kills), d: num(p.deaths), a: num(p.assists) } : null,
    };
  });
}

// LP 랭킹 (티어→LP 순)
function computeRanking(lpAll, limit = 60) {
  if (!lpAll) return [];
  const rows = Object.entries(lpAll).map(([k, d]) => ({ name: (d && d.name) || k, tier: (d && d.tier) || 'unranked', lp: num(d && d.lp), games: num(d && d.placementGames) }))
    .filter(r => r.name);
  rows.sort((a, b) => (TIER_ORDER[b.tier] || 0) - (TIER_ORDER[a.tier] || 0) || b.lp - a.lp);
  return rows.slice(0, limit).map((r, i) => ({ rank: i + 1, name: r.name, tier: r.tier, tierKr: TIER_KR[r.tier] || '배치', lp: r.lp }));
}

module.exports = { computeProfile, computeRecords, computeRanking };

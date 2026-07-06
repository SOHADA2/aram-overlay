// ── 시즌2 골드 계산 (홈페이지 calcPlayerGoldEarned S2 이식) ───────────────────
// 아이템 구매 시 "살 수 있는 골드"를 검증하기 위한 계산. 홈페이지 getMyGold() = calcPlayerGoldEarned - goldSpent_s2.
// S2에선 매치 골드(calcGoldFromMatches)만 matches 스캔이 필요하고 나머지는 전부 gold 노드 필드 합.
// ⚠️ S2에서 0인 소스(뉴비 보너스=S2 OFF·업적=S0·릴레이=S1·비밀퀘=S2 OFF·결혼=죽은이벤트·S1식 패스=S2 미사용)는
//    생략(0). 생략분은 항상 "적게" 잡히므로 초과구매를 절대 허용하지 않음(보수적·안전). S2 패스 골드는 passGold_s2로 포함.
const { normName } = require('./teams');

const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;

// 홈페이지 calcGoldFromMatches(name, 2) 1:1 이식 — S2 매치만, 뉴비 보너스 없음
function calcGoldFromMatchesS2(name, matches) {
  const key = normName(name);
  let gold = 0;
  const arr = matches ? Object.values(matches) : [];
  for (const m of arr) {
    if (!m || (m.season ?? 0) !== 2) continue;
    const inA = (m.teamA || []).some(n => normName(n) === key);
    const inB = (m.teamB || []).some(n => normName(n) === key);
    const goldVer  = m.goldVersion || 1;
    const mvpGold  = 50;                       // GOLD_MVP == GOLD_MVP_LEGACY == 50
    const specGold = goldVer >= 2 ? 50 : 15;   // GOLD_SPECTATOR_CORRECT / LEGACY
    // 관전자 예측 골드(팀 밖)
    if (m.spectatorPicks && m.spectatorPicks[key]) {
      const sp = m.spectatorPicks[key];
      if (sp.betAmount != null) gold += num(sp.payout);
      else if (sp.correct) gold += specGold;
    } else if (m.spectatorName === key && m.spectatorCorrect) {
      gold += specGold;
    }
    if (!inA && !inB) continue;
    const won = (m.winner === 'blue' && inA) || (m.winner === 'red' && inB);
    if (m.synergyEffects) { const e = m.synergyEffects[key]; if (e && e.goldDelta) gold += num(e.goldDelta); }
    if (m.questEvent) { gold += won ? num(m.questEvent.bonusGold) : 0; continue; }
    gold += won ? 15 : 5;                       // GOLD_WIN / GOLD_LOSE
    if (m.mvp        && normName(m.mvp)        === key) gold += mvpGold;
    if (m.mvpWinner  && normName(m.mvpWinner)  === key) gold += mvpGold;
    if (m.mvpLoser   && normName(m.mvpLoser)   === key) gold += mvpGold;
    if (m.mannerKing   && normName(m.mannerKing)   === key) gold += 50;   // GOLD_MANNER
    if (m.mannerWinner && normName(m.mannerWinner) === key) gold += 50;
    if (m.mannerLoser  && normName(m.mannerLoser)  === key) gold += 50;
    // S2 = 뉴비 보너스 없음
  }
  return gold;
}

function lotteryGoldS2(data) {
  if (!Array.isArray(data.lotteryHistory)) return 0;
  const raw = data.lotteryHistory.reduce((s, h) => s + (((h && (h.season ?? 1)) === 2) ? num(h.gold) : 0), 0);
  return raw - num(data.lotteryNormalRollbackG_s2) - num(data.lotteryRollbackG_s2);
}

// 살 수 있는 골드(= 홈 getMyGold, S2) — matches 필요
function availableGoldS2(name, data, matches) {
  if (!data) return 0;
  const earned =
      calcGoldFromMatchesS2(name, matches)
    + num(data.goldBonusLegacy_s2 ?? data.goldBonus_s2)
    + (Array.isArray(data.attendanceHistory_s2) ? data.attendanceHistory_s2.reduce((s, h) => s + num(h && h.gold), 0) : 0)
    + lotteryGoldS2(data)
    + (num(data.witnessGold_s2_master) || num(data.witnessGold_s2)) + num(data.witnessGold_s2_gm) + num(data.witnessGold_s2_ch)
    + (Array.isArray(data.magollaHistory_s2) ? data.magollaHistory_s2.reduce((s, e) => s + num(e && e.delta), 0) : 0)
    + num(data.mailGold_s2) + num(data.trashGold_s2) + num(data.resellGold_s2)
    + num(data.emblemSellG_s2) + num(data.passGold_s2) + num(data.buddyGold_s2) + num(data.autoBotGold_s2);
  return Math.max(0, earned - num(data.goldSpent_s2));
}

module.exports = { availableGoldS2, calcGoldFromMatchesS2 };

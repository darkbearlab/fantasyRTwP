/**
 * 經驗值與隊伍等級（SPEC_SLICE6 §3）：經驗值只來自擊殺；隊伍共用一個等級。純函式。
 */
import { ECONOMY } from './data/economy';
import type { RunState } from './runState';

/** 一次擊殺的經驗值（精英隊長乘倍率） */
export function xpForKill(enemy: string, captain: boolean): number {
  const X = ECONOMY.xp;
  const base = X.perEnemy[enemy] ?? X.default;
  return Math.round(base * (captain ? X.captainMult : 1));
}

/** mult：這場敵人的強度倍率（ECONOMY.xp.scaleWithEnemy 開著時乘上） */
export function xpForKills(killed: { enemy: string; captain: boolean }[], mult = 1): number {
  const m = ECONOMY.xp.scaleWithEnemy ? mult : 1;
  return Math.round(killed.reduce((a, k) => a + xpForKill(k.enemy, k.captain), 0) * m);
}

/** 敵人強度倍率（和 enemyDef 的層數成長相同） */
export function enemyStrength(layer: number): number {
  return 1 + ECONOMY.layerScaling * Math.max(0, layer - 1);
}

/** 隊伍等級帶來的基本成長倍率（最大生命、造成傷害） */
export function levelGrowth(level: number | undefined): number {
  return 1 + ECONOMY.xp.perLevelGrowth * Math.max(0, (level ?? 1) - 1);
}

/** 從 level 升到下一級需要的經驗值 */
export function xpToNext(level: number): number {
  const T = ECONOMY.xp.toNext;
  return T.base + T.perLevel * (level - 1);
}

/** 加經驗值（原地修改 run）：回傳升了幾級，並累加到 pendingLevelUps */
export function gainXp(run: RunState, amount: number): number {
  run.level ??= 1;
  run.xp = (run.xp ?? 0) + amount;
  let ups = 0;
  while (run.xp >= xpToNext(run.level)) {
    run.xp -= xpToNext(run.level);
    run.level++;
    ups++;
  }
  run.pendingLevelUps = (run.pendingLevelUps ?? 0) + ups;
  // 每級的基本成長：英雄記住目前的隊伍等級（maxHpOf 會用）；生命上限變高時，現有生命一起加上增加的量
  if (ups > 0)
    for (const h of run.party) {
      if (!h || h.dead) continue;
      const before = levelGrowth(h.level);
      h.level = run.level;
      h.hp = Math.round((h.hp * levelGrowth(h.level)) / before);
    }
  return ups;
}

/** 下一個要選的升級是升到第幾級（還有 pending 次時） */
export function nextLevelUpTo(run: RunState): number {
  return (run.level ?? 1) - (run.pendingLevelUps ?? 0) + 1;
}

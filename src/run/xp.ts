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

export function xpForKills(killed: { enemy: string; captain: boolean }[]): number {
  return killed.reduce((a, k) => a + xpForKill(k.enemy, k.captain), 0);
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
  return ups;
}

/** 下一個要選的升級是升到第幾級（還有 pending 次時） */
export function nextLevelUpTo(run: RunState): number {
  return (run.level ?? 1) - (run.pendingLevelUps ?? 0) + 1;
}

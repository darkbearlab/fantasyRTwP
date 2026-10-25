import type { Rng } from './rng';
import type { HitRule } from './data/hit';
import { LEGACY_HIT_RULE } from './data/hit';

export type HitResult = 'miss' | 'hit' | 'crit';

export const CRIT_MULT = 1.5;

/** SPEC §6.2：roll = d100 + accuracy − defense；rule＝命中門檻（data/hit.ts） */
export function rollHit(rng: Rng, accuracy: number, defense: number, rule: HitRule = LEGACY_HIT_RULE): { roll: number; result: HitResult } {
  const roll = rng.int(1, 100) + accuracy - defense;
  return { roll, result: hitFromRoll(roll, rule) };
}

export function hitFromRoll(roll: number, rule: HitRule = LEGACY_HIT_RULE): HitResult {
  if (roll < rule.missBelow) return 'miss';
  if (roll < rule.critAt) return 'hit';
  return 'crit';
}

/** SPEC §6.3：護甲固定減免，但最多減免 75% */
export function applyArmor(dmg: number, armor: number): number {
  return Math.max(1, Math.round(Math.max(dmg - armor, Math.ceil(dmg * 0.25))));
}

/** random(min, max) × 倍率（尚未扣護甲） */
export function rollDamage(rng: Rng, range: readonly [number, number], mult: number): number {
  return rng.int(range[0], range[1]) * mult;
}

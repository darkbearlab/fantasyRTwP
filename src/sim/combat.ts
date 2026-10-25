import type { Rng } from './rng';
import { HIT_RULE } from './data/hit';

export type HitResult = 'miss' | 'hit' | 'crit';

export const CRIT_MULT = 1.5;

/** SPEC §6.2：roll = d100 + accuracy − defense */
export function rollHit(rng: Rng, accuracy: number, defense: number): { roll: number; result: HitResult } {
  const roll = rng.int(1, 100) + accuracy - defense;
  return { roll, result: hitFromRoll(roll) };
}

export function hitFromRoll(roll: number): HitResult {
  if (roll < HIT_RULE.missBelow) return 'miss';
  if (roll < HIT_RULE.critAt) return 'hit';
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

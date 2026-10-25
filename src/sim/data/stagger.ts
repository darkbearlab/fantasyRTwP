/**
 * 失衡值（SPEC_STAGGER，Alan 2026-10-25）：只用在沉穩節奏。全部是佔位數值（§10）。
 * 每次命中累積「傷害 × 倍率 ＋ 定額」，到上限就暈眩、歸零；暈眩秒數每個單位固定。
 */
import type { UnitDef } from './types';
import { enemyRank } from './enemies';

export const STAGGER = {
  /** 失衡上限的預設：最大生命 × hpRatio（UnitDef.poise 可另外指定） */
  hpRatio: 0.6,
  /** 頭目、精英的上限倍率（頭目生命本來就高，先維持 1） */
  rankMult: { normal: 1, elite: 1, boss: 1 },
  /** 打破時暈眩幾秒（UnitDef.staggerStun 可另外指定） */
  stunSec: { normal: 1.5, elite: 1, boss: 2, hero: 1 },
  /** 脫離交戰後幾秒退完（從滿的退到 0） */
  decaySec: 3,
  /** 暈眩恢復後，和剛才暈眩一樣長的時間內，累積到的失衡值乘這個 */
  afterStunMult: 0.5,
  /** 衝擊屬性的攻擊（鈍器、聖鎚、火球的爆風）失衡倍率 */
  bluntMult: 1.5,
  /** 打斷成功時的失衡定額（§10：待確認，先 0） */
  interruptFlat: 0,
  /** 擊退撞到牆的失衡定額 */
  wallFlat: 15,
  /** 舊資料只有暈眩秒數（道具、觸發效果的 stun）時，每 1 秒換算成多少失衡 */
  perStunSec: 20,
  /** 升級「堅定」：受到的失衡乘這個 */
  steadfastMult: 0.7,
};

/** 失衡上限 */
export function poiseOf(def: UnitDef, maxHp: number): number {
  if (def.poise !== undefined) return def.poise;
  const mult = def.team === 'hero' ? 1 : STAGGER.rankMult[enemyRank(def)];
  return Math.max(1, Math.round(maxHp * STAGGER.hpRatio * mult));
}

/** 失衡打破時的暈眩秒數 */
export function staggerStunOf(def: UnitDef): number {
  if (def.staggerStun !== undefined) return def.staggerStun;
  return def.team === 'hero' ? STAGGER.stunSec.hero : STAGGER.stunSec[enemyRank(def)];
}

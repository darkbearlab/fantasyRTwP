/**
 * 隨從（Alan 2026-10-23）：跟著英雄的小兵。英雄只指揮自己，隨從完全自動：
 * 跟著主人走、被牽繩拉回來、看到敵人就自己打；只擋敵人的路，不擋自己人。
 * 死了就沒了；不會補充、不會補血（生命跨戰鬥延續）。之後死靈法師、德魯伊等職業也用同一套掛在英雄身上。
 * 數值先比照敵人的小兵（一般敵人在沉穩節奏下生命減半，隨從也一樣）。
 */
import { DELIBERATE_PACE } from './deliberate';
import { ENEMIES } from './enemies';
import type { UnitDef } from './types';

export const FOLLOWER_RULES = {
  /** 離主人超過這麼遠就放下手邊的事，跑回主人身邊（m） */
  leash: 7,
  /** 主人附近多遠內的敵人會去打（m） */
  aggro: 6,
  /** 沒事時跟在主人身邊多遠（m） */
  followDist: 2,
  /** 多久想一次（秒） */
  thinkInterval: 0.4,
};

/** 由敵人的小兵改成我方的隨從：隊伍、名字、外觀字母換掉，其餘數值照抄 */
function fromEnemy(id: string, enemyId: string, name: string, patch: Partial<UnitDef> = {}): UnitDef {
  const e = ENEMIES[enemyId];
  return {
    ...e,
    id,
    name,
    team: 'hero',
    ai: undefined,
    targeting: undefined,
    skills: [],
    maxHp: Math.max(1, Math.round(e.maxHp * DELIBERATE_PACE.enemyHpMult)),
    ...patch,
  };
}

export const FOLLOWERS: Record<string, UnitDef> = {
  /** 劍兵：比照敵人的劍兵，出手略快 */
  fSword: fromEnemy('fSword', 'raider', '劍兵', { windup: 0.38, recovery: 0.65 }),
  /** 盾兵：比照敵人的盾兵 */
  fShield: fromEnemy('fShield', 'shieldbearer', '盾兵'),
  /** 槍兵：比照敵人的劍兵，攻擊距離略長 */
  fSpear: fromEnemy('fSpear', 'raider', '槍兵', { range: 0.8 }),
  /** 弓兵：比照敵人的弓手 */
  fArcher: fromEnemy('fArcher', 'archer', '弓兵'),
};

/** 號召戰旗抽的兵種 */
export const RALLY_POOL = ['fSword', 'fShield', 'fSpear', 'fArcher'];

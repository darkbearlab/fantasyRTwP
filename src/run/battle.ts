/**
 * 遠征 ↔ 戰鬥的介面（SPEC_SLICE2 §10.2）：由 RunState 建立 World、把戰鬥結果寫回。
 */
import { ENEMIES } from '../sim/data/enemies';
import { MAPS } from '../sim/data/maps';
import type { Personality, UnitDef } from '../sim/data/types';
import type { SimConfig } from '../sim/simConfig';
import type { UnitSpawn } from '../sim/world';
import { World } from '../sim/world';
import { ECONOMY } from './data/economy';
import type { EncounterDef } from './data/encounters';
import { ENCOUNTERS } from './data/encounters';
import type { RunState } from './runState';
import { livingHeroes } from './runState';
import { deriveSeed } from './seed';
import { heroDef } from './upgrades';

/** 敵人數值隨層數成長；隊長另外強化 */
export function enemyDef(enemyId: string, layer: number, captain = false): UnitDef {
  const base = ENEMIES[enemyId];
  if (!base) throw new Error(`未知的敵人：${enemyId}`);
  const s = 1 + ECONOMY.layerScaling * Math.max(0, layer - 1);
  const c = ECONOMY.captain;
  const hpMult = s * (captain ? c.hpMult : 1);
  const dmgMult = s * (captain ? c.damageMult : 1);
  return {
    ...base,
    name: captain ? `隊長${base.name}` : base.name,
    maxHp: Math.round(base.maxHp * hpMult),
    damageMult: (base.damageMult ?? 1) * dmgMult,
    radius: base.radius + (captain ? c.radiusBonus : 0),
    damage: [...base.damage] as [number, number],
    skills: [...base.skills],
  };
}

/** 戰鬥種子由遠征種子＋節點＋遭遇推導，整趟遠征可以重現 */
export function battleSeed(run: RunState): number {
  if (run.phase.kind !== 'battle') throw new Error('目前不在戰鬥階段');
  return deriveSeed(run.seed, 'battle', run.phase.nodeId, run.phase.encounterId);
}

export function currentEncounter(run: RunState): EncounterDef {
  if (run.phase.kind !== 'battle') throw new Error('目前不在戰鬥階段');
  return ENCOUNTERS[run.phase.encounterId];
}

/** 由遠征狀態建立戰鬥：帶入存活英雄的目前生命、強化與性格 */
export function createBattleFromRun(run: RunState, config?: Partial<SimConfig>, seed = battleSeed(run)): World {
  const enc = currentEncounter(run);
  const map = MAPS[enc.map];
  if (!map) throw new Error(`未知的地圖：${enc.map}`);
  const layer = run.phase.kind === 'battle' ? run.map.nodes[run.phase.nodeId].layer : 1;
  const spawns: UnitSpawn[] = [];
  // 出生位置依存活英雄數量排列；heroSlot 沿用隊伍欄位，數字鍵不會錯位
  livingHeroes(run).forEach(({ slot, hero }, i) => {
    const def = heroDef(hero, run.nextBattleBuff);
    spawns.push({ defId: hero.classId, def, pos: map.heroSpawns[i % map.heroSpawns.length], heroSlot: slot, hp: hero.hp, personality: hero.personality });
  });
  for (const e of enc.enemies) spawns.push({ defId: e.enemy, def: enemyDef(e.enemy, layer, e.captain), pos: { x: e.x, y: e.y } });
  return new World({ seed, map, spawns, config });
}

export interface BattleOutcome {
  won: boolean;
  time: number;
  heroes: { slot: number; hp: number; dead: boolean; kills: number; damageDealt: number; damageTaken: number; personality?: Personality }[];
}

export function battleOutcomeFromWorld(world: World): BattleOutcome {
  return {
    won: world.result === 'hero',
    time: world.time,
    heroes: world.units
      .filter((u) => u.team === 'hero')
      .map((u) => ({ slot: u.heroSlot, hp: u.hp, dead: u.dead, kills: u.stats.kills, damageDealt: u.stats.damageDealt, damageTaken: u.stats.damageTaken, personality: u.personality })),
  };
}

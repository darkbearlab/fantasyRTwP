/**
 * 遠征 ↔ 戰鬥的介面（SPEC_SLICE2 §10.2）：由 RunState 建立 World、把戰鬥結果寫回。
 */
import { ENEMIES } from '../sim/data/enemies';
import { HORDE_CONFIG, HORDE_ENEMY_HP } from '../sim/data/horde';
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
import type { LevelTier } from './levelGen';
import { generateLevel } from './levelGen';
import { generateDeliberateLevel } from './deliberateLevelGen';
import type { MapDef } from '../sim/data/types';
import type { RunStyle } from './data/levels';
import { deliberateConfig } from '../sim/data/deliberate';
import { ACTIVE_SKILL_OVERRIDE } from '../sim/data/passives';
import { CLASSES } from '../sim/data/classes';
import { DEFAULT_SIM_CONFIG } from '../sim/simConfig';
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

/** 沉穩節奏：職業唯一的主動技能（預設是專用技能，ACTIVE_SKILL_OVERRIDE 列出例外） */
export function activeSkillOf(classId: string): string {
  return ACTIVE_SKILL_OVERRIDE[classId] ?? CLASSES[classId].signature;
}

/** 怪群模式：精英與頭目的生命下降（雜兵、巢穴不變） */
export function hordeEnemyDef(def: UnitDef): UnitDef {
  if (def.tier === 'fodder' || def.ai === 'nest') return def;
  const mult = HORDE_ENEMY_HP.bossMult[def.id] ?? HORDE_ENEMY_HP.eliteMult;
  return { ...def, maxHp: Math.max(1, Math.round(def.maxHp * mult)) };
}

/** 戰鬥種子由遠征種子＋節點＋遭遇推導，整趟遠征可以重現 */
export function battleSeed(run: RunState): number {
  if (run.phase.kind !== 'battle') throw new Error('目前不在戰鬥階段');
  return deriveSeed(run.seed, 'battle', run.phase.nodeId, run.phase.encounterId);
}

export function currentEncounter(run: RunState): EncounterDef {
  if (run.phase.kind !== 'battle') throw new Error('目前不在戰鬥階段');
  return encounterFor(run, run.phase.nodeId, run.phase.encounterId);
}

/** 大型關卡的遭遇編號：level:<節點類型>（每個節點各自生成一張關卡） */
export const LEVEL_PREFIX = 'level:';
/** 沉穩節奏的生成關卡：dlevel:<節點類型>（SPEC_SLICE5 §15.3） */
export const DLEVEL_PREFIX = 'dlevel:';

export function levelEncounterId(tier: LevelTier): string {
  return `${LEVEL_PREFIX}${tier}`;
}

export function deliberateLevelId(tier: LevelTier): string {
  return `${DLEVEL_PREFIX}${tier}`;
}

/** 這個遭遇編號是程序生成的關卡嗎（兩種模式都算） */
export function isGeneratedEncounter(id: string): boolean {
  return id.startsWith(LEVEL_PREFIX) || id.startsWith(DLEVEL_PREFIX);
}

/** 遠征的戰鬥形式（舊紀錄沒有 style，視為戰術戰鬥） */
export function runStyle(run: RunState): RunStyle {
  return run.style ?? 'tactical';
}

const levelCache = new Map<string, EncounterDef>();

/** 依遭遇編號取得遭遇；大型關卡依「遠征種子＋節點」生成（同一趟遠征每次都一樣） */
export function encounterFor(run: RunState, nodeId: number, encounterId: string): EncounterDef {
  if (!isGeneratedEncounter(encounterId)) return ENCOUNTERS[encounterId];
  const dlevel = encounterId.startsWith(DLEVEL_PREFIX);
  const tier = encounterId.slice(dlevel ? DLEVEL_PREFIX.length : LEVEL_PREFIX.length) as LevelTier;
  const layer = run.map.nodes[nodeId].layer;
  const seed = deriveSeed(run.seed, 'level', nodeId, encounterId);
  const key = `${encounterId}:${seed}:${layer}`;
  let enc = levelCache.get(key);
  if (!enc) {
    enc = dlevel ? generateDeliberateLevel(seed, { tier, layer }) : generateLevel(seed, { tier, layer });
    if (levelCache.size > 32) levelCache.clear();
    levelCache.set(key, enc);
  }
  return enc;
}

/** 遭遇使用的地圖（生成的關卡自帶地圖） */
export function mapOf(enc: EncounterDef): MapDef {
  const map = enc.mapDef ?? MAPS[enc.map];
  if (!map) throw new Error(`未知的地圖：${enc.map}`);
  return map;
}


/** 由遠征狀態建立戰鬥：帶入存活英雄的目前生命、強化與性格 */
export function createBattleFromRun(run: RunState, config?: Partial<SimConfig>, seed = battleSeed(run)): World {
  const enc = currentEncounter(run);
  const map = mapOf(enc);
  // 頭目戰的數值是為最後一層設計的，不再套用層數成長（大型關卡的頭目關卡也一樣）
  const layer = enc.tier === 'boss' ? 1 : run.phase.kind === 'battle' ? run.map.nodes[run.phase.nodeId].layer : 1;
  const spawns: UnitSpawn[] = [];
  // 出生位置依存活英雄數量排列；heroSlot 沿用隊伍欄位，數字鍵不會錯位
  const deliberate = runStyle(run) === 'deliberate' && !enc.horde;
  livingHeroes(run).forEach(({ slot, hero }, i) => {
    let def = heroDef(hero, run.nextBattleBuff);
    // 沉穩節奏（SPEC_SLICE5 §2）：每名英雄只有一招主動技能
    if (deliberate) def = { ...def, skills: [activeSkillOf(hero.classId)] };
    spawns.push({ defId: hero.classId, def, pos: map.heroSpawns[i % map.heroSpawns.length], heroSlot: slot, hp: hero.hp, personality: hero.personality });
  });
  // 怪群模式：地圖與遭遇的生成點合併，戰鬥模式自動設成 horde，精英與頭目生命下降
  const horde = enc.horde ? { ...enc.horde, spawners: [...(map.spawners ?? []), ...enc.horde.spawners] } : undefined;
  const scaled = (id: string, captain?: boolean) => (horde ? hordeEnemyDef(enemyDef(id, layer, captain)) : enemyDef(id, layer, captain));
  // 沉穩節奏：同小隊一起警覺；舊的手工遭遇沒有小隊，全部算同一隊（看到一名就全體進攻）
  for (const e of enc.enemies) spawns.push({ defId: e.enemy, def: scaled(e.enemy, e.captain), pos: { x: e.x, y: e.y }, squad: e.squad ?? 'main' });
  // 沉穩節奏（SPEC_SLICE5）：小地圖遭遇套用變慢的設定
  const cfg = horde ? { ...config, ...HORDE_CONFIG } : runStyle(run) === 'deliberate' ? { ...config, ...deliberateConfig({ ...DEFAULT_SIM_CONFIG, ...config }) } : config;
  // 戰鬥中召喚的援軍也套用層數成長
  return new World({ seed, map, spawns, config: cfg, enemyDefFor: (id, captain) => scaled(id, captain), horde, fog: enc.fog });
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

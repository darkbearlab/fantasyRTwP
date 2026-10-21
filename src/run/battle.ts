/**
 * 遠征 ↔ 戰鬥的介面（SPEC_SLICE2 §10.2）：由 RunState 建立 World、把戰鬥結果寫回。
 */
import { ENEMIES, enemyRank } from '../sim/data/enemies';
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
import type { DeliberateTier } from './data/deliberateLevels';
import { generateLevel } from './levelGen';
import { generateDeliberateLevel } from './deliberateLevelGen';
import { generateTemplateLevel } from './templateLevelGen';
import { FBB_LEVELS, fieldLookFor } from './data/fbbLevels';
import { bossEncounter, fieldEncounter, townEncounter } from './fbbLevel';
import { tilePrefabs } from './tilePrefabRegistry';
import { SKIRMISH } from '../sim/data/skirmish';
import type { Edge, ExitRequest } from './templateLevelGen';
import { ROUTE_MAP } from './data/routeMap';
import { directionTo, neighbors } from './routeMap';
import type { MapDef } from '../sim/data/types';
import type { RunStyle } from './data/levels';
import { LEVELS } from './data/levels';
import { DELIBERATE_PACE, deliberateConfig } from '../sim/data/deliberate';
import { deliberateSkillsOf } from './loadout';
import { DEFAULT_SIM_CONFIG } from '../sim/simConfig';
import { heroDef, heroPassives } from './upgrades';

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
    rank: captain ? 'elite' : base.rank,
    maxHp: Math.round(base.maxHp * hpMult),
    damageMult: (base.damageMult ?? 1) * dmgMult,
    radius: base.radius + (captain ? c.radiusBonus : 0),
    damage: [...base.damage] as [number, number],
    skills: [...base.skills],
  };
}

export { activeSkillOf } from './loadout';

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
  const node = run.map.nodes[nodeId];
  // FTL 式路線圖：每次造訪重新生成；被主力佔領或冠軍戰另外生成
  const ph = run.phase.kind === 'battle' && run.phase.nodeId === nodeId ? run.phase : null;
  const visit = ph?.visit ?? 1;
  const mods = ph?.mods ?? {};
  const layer = node.layer + levelBonus(mods);
  // 第一次造訪、沒有修飾時種子和以前一樣
  const extra = [visit > 1 ? `v${visit}` : '', mods.force ? 'force' : '', mods.champion ? 'champion' : ''].filter(Boolean);
  const seed = deriveSeed(run.seed, 'level', nodeId, encounterId, ...extra);
  const key = `${encounterId}:${seed}:${layer}`;
  let enc = levelCache.get(key);
  if (!enc) {
    const fbb = dlevel && LEVELS.deliberateGenerator === 'fbb' && !FBB_LEVELS.templateTiers.includes(tier);
    if (fbb) {
      // finalbossblues 地形：前幾層是城內（首都突圍），後面是野外
      const o = { tier: tier as DeliberateTier, layer, ...exitsFor(run, nodeId), budgetMult: mods.force ? ROUTE_MAP.force.budgetMult : undefined, captainEnemy: mods.champion ? ROUTE_MAP.champion.enemy : undefined };
      enc =
        tier === 'boss'
          ? bossEncounter(seed, { ...o, look: fieldLookFor(node.layer) })
          : node.layer <= FBB_LEVELS.townUntilLayer
            ? townEncounter(seed, { ...o, prefabs: tilePrefabs() })
            : fieldEncounter(seed, { ...o, look: fieldLookFor(node.layer) });
    } else if (dlevel && LEVELS.deliberateGenerator !== 'classic') {
      // 出口制（SPEC_SLICE6 §2）：一個下一層節點一個出口，依路線圖由左到右排
      enc = generateTemplateLevel(seed, { tier, layer, ...exitsFor(run, nodeId), budgetMult: mods.force ? ROUTE_MAP.force.budgetMult : undefined, captainEnemy: mods.champion ? ROUTE_MAP.champion.enemy : undefined });
    } else enc = dlevel ? generateDeliberateLevel(seed, { tier, layer }) : generateLevel(seed, { tier, layer });
    if (levelCache.size > 32) levelCache.clear();
    levelCache.set(key, enc);
  }
  return enc;
}

/** 敵人層數加成：被主力佔領的節點、冠軍戰 */
export function levelBonus(mods: { force?: boolean; champion?: boolean }): number {
  return (mods.force ? ROUTE_MAP.force.layerBonus : 0) + (mods.champion ? ROUTE_MAP.champion.layerBonus : 0);
}

/**
 * 出口與入口（SPEC_SLICE6 §2、§4）：一個相鄰節點一個出口，放在它在路線圖上的方向（下一層＝上、前一層＝下、同層＝左右）；
 * 從哪個節點來，出生點就在那一側。單向路線圖只有往下一層的出口。
 */
function exitsFor(run: RunState, nodeId: number): { exits: ExitRequest[]; entry: Edge } {
  const map = run.map;
  const ids = run.overworld ? neighbors(map, nodeId) : map.nodes[nodeId].next;
  // 最後的頭目戰沒有出口：打倒頭目就結束遠征
  const exits = (map.nodes[nodeId].type === 'boss' ? [] : ids)
    .map((id) => map.nodes[id])
    .sort((a, b) => a.layer - b.layer || a.index - b.index)
    .map((n) => ({ id: `node:${n.id}`, label: n.type, edge: directionTo(map, nodeId, n.id) }));
  const prev = run.path.length >= 2 ? run.path[run.path.length - 2] : null;
  const entry: Edge = prev !== null && prev !== nodeId && ids.includes(prev) ? directionTo(map, nodeId, prev) : 'bottom';
  return { exits, entry };
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
  const layer = enc.tier === 'boss' ? 1 : run.phase.kind === 'battle' ? run.map.nodes[run.phase.nodeId].layer + levelBonus(run.phase.mods ?? {}) : 1;
  const spawns: UnitSpawn[] = [];
  // 出生位置依存活英雄數量排列；heroSlot 沿用隊伍欄位，數字鍵不會錯位
  const deliberate = runStyle(run) === 'deliberate' && !enc.horde;
  livingHeroes(run).forEach(({ slot, hero }, i) => {
    let def = heroDef(hero, run.nextBattleBuff);
    // 沉穩節奏（SPEC_SLICE5 §2）：每名英雄只有一招主動技能
    // 有技能循環的職業帶齊循環的每一招（技能鈕只顯示目前這一招，SPEC_SLICE5 §16）
    if (deliberate) def = { ...def, skills: deliberateSkillsOf(hero.classId) };
    spawns.push({ defId: hero.classId, def, pos: map.heroSpawns[i % map.heroSpawns.length], heroSlot: slot, hp: hero.hp, personality: hero.personality, items: hero.items, passives: deliberate ? heroPassives(hero) : undefined });
  });
  // 怪群模式：地圖與遭遇的生成點合併，戰鬥模式自動設成 horde，精英與頭目生命下降
  const horde = enc.horde ? { ...enc.horde, spawners: [...(map.spawners ?? []), ...enc.horde.spawners] } : undefined;
  // 沉穩節奏（Alan 2026-10-21：太泥濘）：一般敵人生命減半，精英隊長與頭目不變
  const lighter = (d: UnitDef): UnitDef => (deliberate && enemyRank(d) === 'normal' ? { ...d, maxHp: Math.max(1, Math.round(d.maxHp * DELIBERATE_PACE.enemyHpMult)) } : d);
  const scaled = (id: string, captain?: boolean) => (horde ? hordeEnemyDef(enemyDef(id, layer, captain)) : lighter(enemyDef(id, layer, captain)));
  // 沉穩節奏：同小隊一起警覺；舊的手工遭遇沒有小隊，全部算同一隊（看到一名就全體進攻）
  for (const e of enc.enemies) spawns.push({ defId: e.enemy, def: scaled(e.enemy, e.captain), pos: { x: e.x, y: e.y }, squad: e.squad ?? 'main', facing: e.facing });
  // 沉穩節奏（SPEC_SLICE5）：小地圖遭遇套用變慢的設定
  const cfg = horde ? { ...config, ...HORDE_CONFIG } : runStyle(run) === 'deliberate' ? { ...config, ...deliberateConfig({ ...DEFAULT_SIM_CONFIG, ...config }) } : config;
  // 戰鬥中召喚的援軍也套用層數成長
  // Alan：沉穩節奏的所有關卡都有戰爭迷霧（舊的手工遭遇也是）
  // 小衝突導演（Alan 2026-10-21）：沉穩節奏的 finalbossblues 程序生成地圖，探索途中一直有小波次湧上來
  const skirmish = deliberate && map.art && enc.tier !== 'boss' ? { def: SKIRMISH, layer } : undefined;
  return new World({ seed, map, spawns, config: cfg, enemyDefFor: (id, captain) => scaled(id, captain), horde, fog: enc.fog || deliberate, skirmish, bag: deliberate ? (run.bag ?? []) : [] });
}

export interface BattleOutcome {
  won: boolean;
  /** 戰後包包裡剩下的消耗品（戰鬥中可能用掉） */
  bag?: string[];
  /** 從哪個出口離開＝下一個節點（出口制） */
  exitNodeId?: number;
  /** 被打倒的敵人（經驗值用） */
  killed?: { enemy: string; captain: boolean }[];
  time: number;
  heroes: { slot: number; hp: number; dead: boolean; kills: number; damageDealt: number; damageTaken: number; personality?: Personality }[];
}

export function battleOutcomeFromWorld(world: World): BattleOutcome {
  const m = world.exitId?.match(/^node:(\d+)$/);
  return {
    won: world.result === 'hero',
    exitNodeId: m ? Number(m[1]) : undefined,
    killed: world.units.filter((u) => u.team === 'enemy' && u.dead).map((u) => ({ enemy: u.def.id, captain: u.def.rank === 'elite' })),
    time: world.time,
    bag: [...world.bag],
    heroes: world.units
      .filter((u) => u.team === 'hero')
      .map((u) => ({ slot: u.heroSlot, hp: u.hp, dead: u.dead, kills: u.stats.kills, damageDealt: u.stats.damageDealt, damageTaken: u.stats.damageTaken, personality: u.personality })),
  };
}

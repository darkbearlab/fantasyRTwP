/**
 * 敵方陣營（SPEC_CAMPAIGN）：每一章的敵人從哪一個陣營出。
 * 據點的雜兵與鐵砧、升級池、小波次、精英隊長、頭目都在這裡；生成器只讀這份資料，換章節只換陣營。
 * empire＝第 1 章原本的帝國叛軍（數值和以前一樣）；orcs＝第 2 章「荒野」的獸人部落（Alan 2026-10-21 同意提案）。全部佔位。
 */
import type { SkirmishEnemy } from '../../sim/data/skirmish';
import { SKIRMISH } from '../../sim/data/skirmish';
import type { PoolEntry } from './levelPools';
import { LEVEL_POOLS } from './levelPools';
import { DELIBERATE_LEVELS } from './deliberateLevels';

export interface FactionSite {
  grunts: { enemy: string; weight: number }[];
  /** 鐵砧（站在開口正中、不參與升級） */
  anvil?: string;
  /** 營地裡另外放一根（例：戰鬥圖騰） */
  totem?: string;
}

export interface FactionDef {
  id: string;
  name: string;
  sites: { lookout: FactionSite; camp: FactionSite; checkpoint: FactionSite };
  /** 升級池（據點的 upgradePool 名稱 → 敵人池） */
  pools: Record<string, PoolEntry[]>;
  /** 小衝突導演的波次 */
  skirmish: SkirmishEnemy[];
  /** 精英關卡的隊長候選 */
  captainPool: string[];
  /** 頭目、護衛、頭目房的樣式與名稱；圖騰：頭目房四根石柱換成這個敵人 */
  boss: { enemy: string; escorts: string[]; arena: 'camp' | 'clearing'; place: string; totem?: string };
}

const EMPIRE_GRUNTS = [
  { enemy: 'raider', weight: 3 },
  { enemy: 'axeman', weight: 2 },
  { enemy: 'archer', weight: 3 },
];

const ORC_GRUNTS = [
  { enemy: 'orcWarrior', weight: 3 },
  { enemy: 'goblin', weight: 3 },
  { enemy: 'goblinSlinger', weight: 2 },
];

/**
 * 第 1 章「首都突圍」（SPEC_SLICE7 §6，Alan）：開局只有兩人，敵人要是兩人隊伍可以快速解決的程度。
 * 輕裝快速離開王城，路上打的是還在掠奪的小兵：以劍兵、斧兵、弓手為主，少放盾兵（營地沒有鐵砧、池子裡盾兵權重降低）。
 */
const RAID_POOLS: Record<string, PoolEntry[]> = {
  ...LEVEL_POOLS,
  melee: [
    { enemy: 'raider', weight: 4, minLayer: 1, cost: 1 },
    { enemy: 'axeman', weight: 3, minLayer: 1, cost: 1 },
    ...LEVEL_POOLS.melee.map((e) => (e.enemy === 'shieldbearer' ? { ...e, weight: 1 } : e)),
  ],
  mixed: [
    { enemy: 'raider', weight: 4, minLayer: 1, cost: 1 },
    { enemy: 'axeman', weight: 3, minLayer: 1, cost: 1 },
    ...LEVEL_POOLS.mixed.map((e) => (e.enemy === 'shieldbearer' ? { ...e, weight: 1 } : e)),
  ],
};

export const FACTIONS: Record<string, FactionDef> = {
  empireRaid: {
    id: 'empireRaid',
    name: '帝國叛軍（掠奪中的小兵）',
    sites: {
      lookout: { grunts: [{ enemy: 'archer', weight: 1 }] },
      camp: { grunts: EMPIRE_GRUNTS },
      checkpoint: { grunts: EMPIRE_GRUNTS, anvil: 'shieldbearer' },
    },
    pools: RAID_POOLS,
    skirmish: SKIRMISH.pool,
    captainPool: DELIBERATE_LEVELS.captainPool,
    boss: { enemy: DELIBERATE_LEVELS.boss.enemy, escorts: DELIBERATE_LEVELS.boss.escorts, arena: 'camp', place: '戰爭領主的營地' },
  },
  empire: {
    id: 'empire',
    name: '帝國叛軍',
    sites: {
      lookout: { grunts: [{ enemy: 'archer', weight: 1 }] },
      camp: { grunts: EMPIRE_GRUNTS, anvil: 'shieldbearer' },
      checkpoint: { grunts: EMPIRE_GRUNTS, anvil: 'shieldbearer' },
    },
    pools: LEVEL_POOLS,
    skirmish: SKIRMISH.pool,
    captainPool: DELIBERATE_LEVELS.captainPool,
    boss: { enemy: DELIBERATE_LEVELS.boss.enemy, escorts: DELIBERATE_LEVELS.boss.escorts, arena: 'camp', place: '戰爭領主的營地' },
  },
  orcs: {
    id: 'orcs',
    name: '獸人部落',
    sites: {
      lookout: { grunts: [{ enemy: 'goblinSlinger', weight: 1 }] },
      camp: { grunts: ORC_GRUNTS, anvil: 'ogre', totem: 'warTotem' },
      checkpoint: { grunts: ORC_GRUNTS, anvil: 'ogre' },
    },
    // 雜兵（獸人戰士、哥布林、投石手）不會被升級成彼此；只有薩滿、伏兵、食人魔是升級目標，點數比雜兵貴
    pools: {
      ranged: [
        { enemy: 'goblinSlinger', weight: 3, minLayer: 1, cost: 2 },
        { enemy: 'orcShaman', weight: 2, minLayer: 1, cost: 3 },
      ],
      mixed: [
        { enemy: 'goblin', weight: 3, minLayer: 1, cost: 1 },
        { enemy: 'orcWarrior', weight: 3, minLayer: 1, cost: 2 },
        { enemy: 'goblinSlinger', weight: 2, minLayer: 1, cost: 2 },
        { enemy: 'orcShaman', weight: 1, minLayer: 1, cost: 3 },
        { enemy: 'lurker', weight: 2, minLayer: 1, cost: 3 },
        { enemy: 'ogre', weight: 1, minLayer: 3, cost: 4 },
      ],
    },
    skirmish: [
      { enemy: 'goblin', weight: 5, minLayer: 1, seconds: 2.5 },
      { enemy: 'orcWarrior', weight: 3, minLayer: 1, seconds: 5 },
      { enemy: 'goblinSlinger', weight: 2, minLayer: 1, seconds: 5 },
      { enemy: 'orcShaman', weight: 1, minLayer: 2, seconds: 6 },
    ],
    captainPool: ['ogre', 'orcWarrior', 'lurker'],
    boss: { enemy: 'orcChief', escorts: ['orcWarrior', 'orcWarrior'], arena: 'clearing', place: '獸人酋長的林中空地', totem: 'warTotem' },
  },
};

export function factionOf(id: string | undefined): FactionDef {
  return FACTIONS[id ?? 'empire'] ?? FACTIONS.empire;
}

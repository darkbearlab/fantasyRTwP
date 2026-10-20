/**
 * 沉穩節奏的遠征關卡（SPEC_SLICE5 §15.3，v0.4）：大小維持 48 × 48、保留迷霧，內容重新設計——
 * 少數敵人分成小隊，配置在正面、側翼、草叢埋伏、門後與後方。全部是佔位數值。
 * 生成邏輯見 src/run/deliberateLevelGen.ts。
 */
import type { EncounterTier } from './encounters';

export type DeliberateTier = Exclude<EncounterTier, 'horde'>;

/** 小隊的配置方式 */
export type SquadPlacement = 'front' | 'flank' | 'ambush' | 'behindDoor' | 'rear';

export const DELIBERATE_LEVELS = {
  width: 48,
  height: 48,
  /** 中間的隔牆：缺口寬度、缺口數量、缺口裝門的機率 */
  gapWidth: 5,
  gaps: [1, 2] as [number, number],
  doorChance: 0.5,
  /** 精英與頭目關卡：主要缺口是上鎖的鐵柵門，要拉第一區的絞盤 */
  leverTiers: ['elite', 'boss'] as DeliberateTier[],
  /** 石頭：每多少平方公尺一顆、尺寸 */
  rockDensity: 90,
  rockSizes: [1, 1.5, 2, 2, 3] as number[],
  /** 每區的草叢、淺水、矮籬數量 */
  terrain: { brush: [1, 3], shallow: [0, 1], hedge: [1, 2] } as Record<'brush' | 'shallow' | 'hedge', [number, number]>,
  /** 敵人點數預算＝base＋每層 perLayer；人數上限（SPEC_SLICE5 §5：一場 3～8 名） */
  budget: {
    battle: { base: 6, perLayer: 1.2 },
    elite: { base: 9, perLayer: 1.4 },
    boss: { base: 6, perLayer: 0 },
    event: { base: 5, perLayer: 1 },
  } as Record<DeliberateTier, { base: number; perLayer: number }>,
  minEnemies: 3,
  maxEnemies: 8,
  /** 可出現的敵人：點數與解鎖層數（屍僕只作為召喚物，不在名單裡） */
  pool: [
    { enemy: 'shieldbearer', cost: 2, minLayer: 1, weight: 3 },
    { enemy: 'archer', cost: 2, minLayer: 1, weight: 3 },
    { enemy: 'assassin', cost: 2, minLayer: 1, weight: 2 },
    { enemy: 'exploder', cost: 1, minLayer: 1, weight: 2 },
    { enemy: 'charger', cost: 3, minLayer: 2, weight: 2 },
    { enemy: 'bomber', cost: 2, minLayer: 2, weight: 2 },
    { enemy: 'hooker', cost: 2, minLayer: 2, weight: 2 },
    { enemy: 'priest', cost: 2, minLayer: 3, weight: 1 },
    { enemy: 'lurker', cost: 2, minLayer: 3, weight: 1 },
    { enemy: 'summoner', cost: 3, minLayer: 4, weight: 1 },
  ],
  /** 每個小隊的人數 */
  squadSize: [2, 3] as [number, number],
  /** 小隊成員散開的半徑 */
  squadSpread: 1.6,
  /** 遠程／支援型敵人（優先放在後方） */
  backliners: ['archer', 'bomber', 'priest', 'summoner'],
  /** 喜歡埋伏在草叢裡的敵人 */
  ambushers: ['lurker', 'assassin'],
  /** 第一區的小隊離出生點至少多遠（公尺） */
  minSpawnDistance: 13,
  /** 精英關卡：其中一個小隊有隊長 */
  captainPool: ['shieldbearer', 'charger', 'assassin'],
  /** 頭目關卡：第二區中央的頭目與護衛 */
  boss: { enemy: 'warlord', escorts: ['shieldbearer', 'shieldbearer'] },
  themeNames: ['荒廢哨站', '幽暗谷地', '古戰場', '霧林', '斷崖小徑'],
  maxAttempts: 30,
};

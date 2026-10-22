/**
 * 探索獎勵（Alan 2026-10-22：第 3～5 章的室內地圖放寶箱、地上的道具、祭壇，獎勵探索）。
 * 數量、位置、內容的權重都在這裡；放置與抽內容在 src/run/treasure.ts。
 */
import type { ShrineKind } from '../../sim/data/types';

export const TREASURE = {
  /** 每張地圖的寶箱數量 [最少, 最多] */
  chests: [2, 3] as [number, number],
  /** 地上的道具數量 */
  pickups: [1, 2] as [number, number],
  /** 有祭壇的機率（最多一座） */
  shrineChance: 0.7,
  /** 離出生點至少幾格（走的距離）：要走進去探索才拿得到 */
  minDistance: 10,
  /** 獎勵彼此至少隔幾格 */
  spacing: 7,
  /** 離出口至少幾格 */
  exitClearance: 4,
  /** 寶箱內容的權重 */
  chestWeights: { item: 3, heal: 2, consumable: 3, xp: 2 } as Record<'item' | 'heal' | 'consumable' | 'xp', number>,
  /** 地上道具內容的權重 */
  pickupWeights: { consumable: 3, heal: 1, gold: 2 } as Record<'consumable' | 'heal' | 'gold', number>,
  /** 寶箱的裝備是稀有的機率 */
  rareChance: 0.3,
  /** 回血：全隊回復最大生命的比例（寶箱、地上） */
  healPct: { chest: 0.35, pickup: 0.2 },
  /** 經驗值（再乘這一層的敵人強度） */
  xpBase: 25,
  /** 地上的金幣 [最少, 最多] */
  gold: [15, 30] as [number, number],
  /** 包包滿了時，消耗品換成多少金幣 */
  consumableGold: 15,
  /** 祭壇的種類與權重 */
  shrineWeights: { might: 3, stone: 2, eagle: 2, swift: 2, renewal: 2 } as Record<ShrineKind, number>,
};

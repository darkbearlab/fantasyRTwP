/**
 * 生怪磚的敵人池子（SPEC_SLICE6 §1）：每個池子是一份敵人清單＋權重＋最早出現的層數＋點數。
 * 整關另有點數預算上限（DELIBERATE_LEVELS.budget），避免敵人爆量。全部是佔位數值。
 */
export interface PoolEntry {
  enemy: string;
  weight: number;
  minLayer: number;
  /** 點數（算進整關預算） */
  cost: number;
}

export const LEVEL_POOLS: Record<string, PoolEntry[]> = {
  /** 近戰前排 */
  melee: [
    { enemy: 'shieldbearer', weight: 3, minLayer: 1, cost: 2 },
    { enemy: 'exploder', weight: 2, minLayer: 1, cost: 1 },
    { enemy: 'charger', weight: 2, minLayer: 2, cost: 3 },
    { enemy: 'hooker', weight: 2, minLayer: 2, cost: 2 },
  ],
  /** 遠程與支援 */
  ranged: [
    { enemy: 'archer', weight: 3, minLayer: 1, cost: 2 },
    { enemy: 'bomber', weight: 2, minLayer: 2, cost: 2 },
    { enemy: 'priest', weight: 1, minLayer: 3, cost: 2 },
    { enemy: 'summoner', weight: 1, minLayer: 4, cost: 3 },
  ],
  /** 埋伏（躲在草叢裡） */
  ambush: [
    { enemy: 'assassin', weight: 3, minLayer: 1, cost: 2 },
    { enemy: 'lurker', weight: 2, minLayer: 3, cost: 2 },
  ],
  /** 混合 */
  mixed: [
    { enemy: 'shieldbearer', weight: 3, minLayer: 1, cost: 2 },
    { enemy: 'archer', weight: 3, minLayer: 1, cost: 2 },
    { enemy: 'assassin', weight: 2, minLayer: 1, cost: 2 },
    { enemy: 'exploder', weight: 2, minLayer: 1, cost: 1 },
    { enemy: 'charger', weight: 2, minLayer: 2, cost: 3 },
    { enemy: 'bomber', weight: 2, minLayer: 2, cost: 2 },
    { enemy: 'hooker', weight: 2, minLayer: 2, cost: 2 },
    { enemy: 'priest', weight: 1, minLayer: 3, cost: 2 },
    { enemy: 'lurker', weight: 1, minLayer: 3, cost: 2 },
    { enemy: 'summoner', weight: 1, minLayer: 4, cost: 3 },
  ],
  /** 頭目的護衛（不算預算） */
  escort: [{ enemy: 'shieldbearer', weight: 1, minLayer: 1, cost: 0 }],
};

/** 模板關卡的版面（SPEC_SLICE6 §1）：每種關卡幾 × 幾個區塊、必備哪些模板 */
export const TEMPLATE_LEVELS = {
  /** 一個區塊幾公尺 */
  chunk: 16,
  /** 章節主題（目前只有地城；戶外關卡暫時也用地城） */
  theme: 'dungeon',
  layouts: {
    battle: { w: 3, h: 3, required: [] as string[] },
    elite: { w: 3, h: 3, required: ['elite'] },
    boss: { w: 3, h: 3, required: ['boss'] },
    event: { w: 3, h: 3, required: [] as string[] },
  },
  /** 一般關卡放一塊大型景點（feature）的機率 */
  featureChance: 0.35,
  /** 模板旋轉、鏡像 */
  allowRotate: true,
  /** 區塊之間不通時，在交界打開的通道寬度（公尺） */
  carveWidth: 4,
  placeNames: ['地下墓穴', '崩塌地窖', '舊水道', '禁閉牢房', '廢棄礦道'],
  maxAttempts: 30,
};

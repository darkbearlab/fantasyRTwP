/**
 * 遭遇組合（SPEC_SLICE2 §7.2）：使用的地圖、敵人與出生位置、難度。
 * 依「節點類型＋層數」從池中抽選；數值隨層數成長在 run/battle.ts 處理。
 */
export type EncounterTier = 'battle' | 'elite' | 'boss' | 'event';

export interface EncounterEnemy {
  enemy: string;
  x: number;
  y: number;
  /** 精英隊長（生命 ×2.5、傷害 ×1.4、體型稍大） */
  captain?: boolean;
}

export interface EncounterDef {
  id: string;
  name: string;
  map: string;
  tier: EncounterTier;
  /** 可出現的層數範圍（含） */
  minLayer: number;
  maxLayer: number;
  /** 顯示用難度等級 1–5 */
  difficulty: number;
  enemies: EncounterEnemy[];
}

export const ENCOUNTERS: Record<string, EncounterDef> = {
  // ── 隘口 arena01 ──
  passScouts: {
    id: 'passScouts', name: '隘口斥候', map: 'arena01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [
      { enemy: 'brute', x: 31.5, y: 11 },
      { enemy: 'brute', x: 31.5, y: 13.5 },
      { enemy: 'archer', x: 35, y: 9.5 },
      { enemy: 'skirmisher', x: 34, y: 17 },
    ],
  },
  passHold: {
    id: 'passHold', name: '隘口之戰', map: 'arena01', tier: 'battle', minLayer: 2, maxLayer: 7, difficulty: 2,
    enemies: [
      { enemy: 'brute', x: 31.5, y: 10.5 },
      { enemy: 'brute', x: 31.5, y: 12.5 },
      { enemy: 'brute', x: 32, y: 14.5 },
      { enemy: 'skirmisher', x: 34, y: 17 },
      { enemy: 'archer', x: 35, y: 9.5 },
      { enemy: 'archer', x: 35, y: 15 },
      { enemy: 'caster', x: 37, y: 12.5 },
    ],
  },
  passCaptain: {
    id: 'passCaptain', name: '隘口守將', map: 'arena01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 3,
    enemies: [
      { enemy: 'brute', x: 31.5, y: 12, captain: true },
      { enemy: 'brute', x: 31.5, y: 9.5 },
      { enemy: 'brute', x: 32, y: 14.5 },
      { enemy: 'archer', x: 35, y: 9.5 },
      { enemy: 'archer', x: 35, y: 15 },
    ],
  },
  // ── 事件遭遇 ──
  ambush: {
    id: 'ambush', name: '埋伏', map: 'arena01', tier: 'event', minLayer: 1, maxLayer: 8, difficulty: 2,
    enemies: [
      { enemy: 'skirmisher', x: 30, y: 17 },
      { enemy: 'skirmisher', x: 30, y: 7 },
      { enemy: 'brute', x: 31.5, y: 12 },
      { enemy: 'archer', x: 35, y: 12 },
    ],
  },
  nightRaid: {
    id: 'nightRaid', name: '夜襲', map: 'arena01', tier: 'event', minLayer: 1, maxLayer: 8, difficulty: 2,
    enemies: [
      { enemy: 'archer', x: 34, y: 8 },
      { enemy: 'archer', x: 34, y: 16 },
      { enemy: 'skirmisher', x: 32, y: 17 },
      { enemy: 'brute', x: 31.5, y: 12 },
      { enemy: 'brute', x: 32, y: 10 },
    ],
  },
  // ── 頭目（第 4 階段換成王座廳與戰爭領主）──
  bossPlaceholder: {
    id: 'bossPlaceholder', name: '戰爭領主', map: 'arena01', tier: 'boss', minLayer: 1, maxLayer: 99, difficulty: 5,
    enemies: [
      { enemy: 'brute', x: 32, y: 12, captain: true },
      { enemy: 'brute', x: 31.5, y: 9.5 },
      { enemy: 'brute', x: 31.5, y: 14.5 },
      { enemy: 'archer', x: 35, y: 9.5 },
      { enemy: 'archer', x: 35, y: 15 },
    ],
  },
};

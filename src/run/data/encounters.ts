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

const E = (enemy: string, x: number, y: number, captain = false): EncounterEnemy => ({ enemy, x, y, captain: captain || undefined });

const list: EncounterDef[] = [
  // ── 一般戰鬥：前期（4–5 名）──
  { id: 'passScouts', name: '隘口斥候', map: 'arena01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('brute', 31.5, 11), E('brute', 31.5, 13.5), E('archer', 35, 9.5), E('skirmisher', 34, 17)] },
  { id: 'forestAmbush', name: '林間伏兵', map: 'forest01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('brute', 30, 10), E('brute', 30, 14), E('archer', 35, 12), E('skirmisher', 33, 21)] },
  { id: 'ruinsScavengers', name: '廢墟拾荒者', map: 'ruins01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('skirmisher', 31, 3), E('skirmisher', 26, 20), E('brute', 22, 12), E('brute', 30, 12), E('archer', 36, 12)] },
  { id: 'marshRaiders', name: '沼澤掠奪者', map: 'marsh01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('brute', 30, 10), E('brute', 30, 14), E('archer', 30, 7), E('skirmisher', 30, 20.5)] },
  { id: 'hillOutpost', name: '丘陵哨站', map: 'hill01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('archer', 27, 8), E('archer', 30, 16), E('brute', 24, 12), E('brute', 23.5, 9), E('skirmisher', 36, 12)] },
  // ── 中期（5–6 名）──
  { id: 'bridgeFlank', name: '石橋夾擊', map: 'bridge01', tier: 'battle', minLayer: 2, maxLayer: 5, difficulty: 2,
    enemies: [E('brute', 25, 11), E('brute', 25, 13.5), E('archer', 30, 9), E('archer', 30, 15), E('skirmisher', 3, 2.5), E('skirmisher', 3, 21.5)] },
  { id: 'forestBand', name: '林地戰團', map: 'forest01', tier: 'battle', minLayer: 2, maxLayer: 5, difficulty: 2,
    enemies: [E('brute', 29, 10), E('brute', 29, 14), E('archer', 34, 7), E('archer', 34, 17), E('caster', 37, 12)] },
  { id: 'marshVillage', name: '沼澤村落', map: 'marsh01', tier: 'battle', minLayer: 2, maxLayer: 5, difficulty: 2,
    enemies: [E('brute', 27, 9.5), E('brute', 27, 14.5), E('archer', 30, 9), E('archer', 30, 15), E('caster', 37, 12), E('skirmisher', 38, 3)] },
  // ── 後期（6–7 名）──
  { id: 'passHold', name: '隘口之戰', map: 'arena01', tier: 'battle', minLayer: 4, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 31.5, 10.5), E('brute', 31.5, 12.5), E('brute', 32, 14.5), E('skirmisher', 34, 17), E('archer', 35, 9.5), E('archer', 35, 15), E('caster', 37, 12.5)] },
  { id: 'ruinsGarrison', name: '廢墟守軍', map: 'ruins01', tier: 'battle', minLayer: 4, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 22, 10), E('brute', 22, 14), E('archer', 18, 8.5), E('archer', 30, 17), E('caster', 34, 12), E('skirmisher', 31, 2.5)] },
  { id: 'bridgeSiege', name: '斷橋', map: 'bridge01', tier: 'battle', minLayer: 4, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 25, 10.5), E('brute', 25, 12.5), E('brute', 26, 14.5), E('archer', 31, 8), E('archer', 31, 16), E('caster', 35, 12), E('skirmisher', 3, 21.5)] },
  { id: 'hillGarrison', name: '高地守軍', map: 'hill01', tier: 'battle', minLayer: 4, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 23.5, 10), E('brute', 23.5, 14), E('brute', 30, 8), E('archer', 28, 7.5), E('archer', 31, 12), E('archer', 28, 16.5), E('caster', 30.5, 10)] },
  // ── 精英：一般組合＋1 名隊長 ──
  { id: 'passCaptain', name: '隘口守將', map: 'arena01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 31.5, 12, true), E('brute', 31.5, 9.5), E('brute', 32, 14.5), E('archer', 35, 9.5), E('archer', 35, 15)] },
  { id: 'forestCaptain', name: '獵頭隊長', map: 'forest01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 3,
    enemies: [E('skirmisher', 32, 12, true), E('brute', 29, 10), E('brute', 29, 14), E('archer', 35, 12)] },
  { id: 'ruinsCaptain', name: '廢墟祭司', map: 'ruins01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 4,
    enemies: [E('caster', 22, 12, true), E('brute', 18, 10), E('brute', 18, 14), E('archer', 30, 7), E('archer', 30, 17)] },
  { id: 'bridgeCaptain', name: '橋頭神射手', map: 'bridge01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 4,
    enemies: [E('archer', 30, 12, true), E('brute', 25, 11), E('brute', 25, 13.5), E('archer', 31, 7), E('skirmisher', 3, 2.5)] },
  { id: 'marshCaptain', name: '沼澤巫師', map: 'marsh01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 3,
    enemies: [E('caster', 33, 12, true), E('brute', 27, 10), E('brute', 27, 14), E('archer', 30, 7.5), E('skirmisher', 30, 20.5)] },
  { id: 'hillCaptain', name: '哨站隊長', map: 'hill01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 4,
    enemies: [E('archer', 30, 11, true), E('brute', 23.5, 10), E('brute', 23.5, 14), E('archer', 27, 7.5), E('skirmisher', 36, 11)] },
  // ── 頭目 ──
  { id: 'warlord', name: '戰爭領主', map: 'boss01', tier: 'boss', minLayer: 1, maxLayer: 99, difficulty: 5,
    enemies: [E('warlord', 33, 12), E('brute', 30.5, 9.5), E('brute', 30.5, 14.5), E('archer', 35, 6.5), E('archer', 35, 17.5)] },
  // ── 事件遭遇 ──
  { id: 'ambush', name: '埋伏', map: 'forest01', tier: 'event', minLayer: 1, maxLayer: 99, difficulty: 2,
    enemies: [E('skirmisher', 30, 19), E('skirmisher', 30, 5), E('brute', 28, 12), E('archer', 35, 12)] },
  { id: 'nightRaid', name: '夜襲', map: 'ruins01', tier: 'event', minLayer: 1, maxLayer: 99, difficulty: 2,
    enemies: [E('archer', 30, 7), E('archer', 30, 17), E('skirmisher', 31, 2.5), E('brute', 22, 12), E('brute', 27, 12)] },
];

export const ENCOUNTERS: Record<string, EncounterDef> = Object.fromEntries(list.map((e) => [e.id, e]));

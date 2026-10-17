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
  // ── 一般戰鬥：前期（3 名；Alan 決定一般戰鬥 3–5 名）──
  { id: 'passScouts', name: '隘口斥候', map: 'arena01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('brute', 37.8, 24), E('archer', 42, 21.5), E('skirmisher', 40.8, 29)] },
  { id: 'forestAmbush', name: '林間伏兵', map: 'forest01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('brute', 36, 24), E('archer', 42, 24), E('skirmisher', 39.6, 33)] },
  { id: 'ruinsScavengers', name: '廢墟拾荒者', map: 'ruins01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('skirmisher', 37.2, 15), E('brute', 26.4, 24), E('archer', 43.2, 24)] },
  { id: 'marshRaiders', name: '沼澤掠奪者', map: 'marsh01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('brute', 36, 24), E('archer', 36, 19), E('skirmisher', 36, 32.5)] },
  { id: 'hillOutpost', name: '丘陵哨站', map: 'hill01', tier: 'battle', minLayer: 1, maxLayer: 3, difficulty: 1,
    enemies: [E('archer', 32.4, 20), E('brute', 28.8, 24), E('skirmisher', 43.2, 24)] },
  // ── 中期（4 名）──
  { id: 'bridgeFlank', name: '石橋夾擊', map: 'bridge01', tier: 'battle', minLayer: 2, maxLayer: 5, difficulty: 2,
    enemies: [E('brute', 30, 24), E('archer', 36, 21), E('archer', 36, 27), E('skirmisher', 3.6, 14.5)] },
  { id: 'forestBand', name: '林地戰團', map: 'forest01', tier: 'battle', minLayer: 2, maxLayer: 5, difficulty: 2,
    enemies: [E('brute', 34.8, 22), E('brute', 34.8, 26), E('archer', 40.8, 24), E('caster', 44.4, 24)] },
  { id: 'marshVillage', name: '沼澤村落', map: 'marsh01', tier: 'battle', minLayer: 2, maxLayer: 5, difficulty: 2,
    enemies: [E('brute', 32.4, 24), E('archer', 36, 21), E('caster', 44.4, 24), E('skirmisher', 45.6, 15)] },
  { id: 'forestStalkers', name: '林間潛行者', map: 'forest01', tier: 'battle', minLayer: 2, maxLayer: 5, difficulty: 2,
    enemies: [E('brute', 34.8, 22), E('brute', 34.8, 26), E('archer', 40.8, 24), E('lurker', 30.6, 33)] },
  { id: 'marshAmbush', name: '沼澤伏擊', map: 'marsh01', tier: 'battle', minLayer: 2, maxLayer: 5, difficulty: 2,
    enemies: [E('brute', 32.4, 24), E('bomber', 38.4, 24), E('lurker', 36, 33), E('lurker', 45, 15)] },
  // ── 後期（5 名）──
  { id: 'passHold', name: '隘口之戰', map: 'arena01', tier: 'battle', minLayer: 4, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 37.8, 22.5), E('brute', 37.8, 25.5), E('archer', 42, 21.5), E('archer', 42, 27), E('caster', 44.4, 24.5)] },
  { id: 'ruinsGarrison', name: '廢墟守軍', map: 'ruins01', tier: 'battle', minLayer: 4, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 26.4, 22), E('brute', 26.4, 26), E('archer', 36, 29), E('caster', 40.8, 24), E('skirmisher', 37.2, 14.5)] },
  { id: 'bridgeSiege', name: '斷橋', map: 'bridge01', tier: 'battle', minLayer: 4, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 30, 22.5), E('brute', 30, 25.5), E('archer', 37.2, 20), E('caster', 42, 24), E('skirmisher', 3.6, 33.5)] },
  { id: 'hillGarrison', name: '高地守軍', map: 'hill01', tier: 'battle', minLayer: 4, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 28.2, 22), E('brute', 28.2, 26), E('archer', 33.6, 19.5), E('archer', 33.6, 28.5), E('caster', 36.6, 22)] },
  { id: 'hillSiege', name: '攻上丘陵', map: 'hill01', tier: 'battle', minLayer: 3, maxLayer: 6, difficulty: 3,
    enemies: [E('siege', 28.2, 24), E('bomber', 33.6, 20), E('bomber', 33.6, 28), E('archer', 36.6, 24), E('lurker', 43.2, 24)] },
  { id: 'passSiege', name: '攻城隊', map: 'arena01', tier: 'battle', minLayer: 4, maxLayer: 7, difficulty: 3,
    enemies: [E('siege', 37.8, 23), E('siege', 37.8, 25.5), E('bomber', 42, 24), E('archer', 42, 21.5), E('lurker', 46.2, 34.5)] },
  // ── 精英：4 名（含 1 名隊長）──
  { id: 'passCaptain', name: '隘口守將', map: 'arena01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 3,
    enemies: [E('brute', 37.8, 24, true), E('brute', 37.8, 21.5), E('archer', 42, 21.5), E('archer', 42, 27)] },
  { id: 'forestCaptain', name: '獵頭隊長', map: 'forest01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 3,
    enemies: [E('skirmisher', 38.4, 24, true), E('brute', 34.8, 22), E('brute', 34.8, 26), E('archer', 42, 24)] },
  { id: 'ruinsCaptain', name: '廢墟祭司', map: 'ruins01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 4,
    enemies: [E('caster', 26.4, 24, true), E('brute', 21.6, 22), E('brute', 21.6, 26), E('archer', 36, 19)] },
  { id: 'bridgeCaptain', name: '橋頭神射手', map: 'bridge01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 4,
    enemies: [E('archer', 36, 24, true), E('brute', 30, 23), E('brute', 30, 25.5), E('skirmisher', 3.6, 14.5)] },
  { id: 'marshCaptain', name: '沼澤巫師', map: 'marsh01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 3,
    enemies: [E('caster', 39.6, 24, true), E('brute', 32.4, 22), E('brute', 32.4, 26), E('archer', 36, 19.5)] },
  { id: 'hillCaptain', name: '哨站隊長', map: 'hill01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 4,
    enemies: [E('archer', 36, 23, true), E('brute', 28.2, 22), E('brute', 28.2, 26), E('skirmisher', 43.2, 23)] },
  { id: 'siegeCaptain', name: '破城隊長', map: 'bridge01', tier: 'elite', minLayer: 3, maxLayer: 7, difficulty: 4,
    enemies: [E('siege', 30, 24, true), E('brute', 30, 22), E('bomber', 37.2, 21), E('bomber', 37.2, 27)] },
  // ── 頭目 ──
  { id: 'warlord', name: '戰爭領主', map: 'boss01', tier: 'boss', minLayer: 1, maxLayer: 99, difficulty: 5,
    enemies: [E('warlord', 39.6, 24), E('brute', 36.6, 21.5), E('brute', 36.6, 26.5), E('archer', 42, 18.5), E('archer', 42, 29.5)] },
  // ── 事件遭遇 ──
  { id: 'ambush', name: '埋伏', map: 'forest01', tier: 'event', minLayer: 1, maxLayer: 99, difficulty: 2,
    enemies: [E('skirmisher', 36, 31), E('skirmisher', 36, 17), E('archer', 42, 24)] },
  { id: 'nightRaid', name: '夜襲', map: 'ruins01', tier: 'event', minLayer: 1, maxLayer: 99, difficulty: 2,
    enemies: [E('archer', 36, 19), E('skirmisher', 37.2, 14.5), E('brute', 26.4, 24)] },
];

export const ENCOUNTERS: Record<string, EncounterDef> = Object.fromEntries(list.map((e) => [e.id, e]));

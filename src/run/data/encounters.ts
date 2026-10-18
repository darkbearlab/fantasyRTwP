/**
 * 遭遇組合（SPEC_SLICE2 §7.2）：使用的地圖、敵人與出生位置、難度。
 * 依「節點類型＋層數」從池中抽選；數值隨層數成長在 run/battle.ts 處理。
 */
import type { HordeSetup } from '../../sim/data/types';

/** horde：怪群試作（SPEC_SLICE4），只出現在快速戰鬥，不進遠征的遭遇池 */
export type EncounterTier = 'battle' | 'elite' | 'boss' | 'event' | 'horde';

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
  /** 怪群模式：生成點、波次與勝利目標（地圖的 spawners 會一併加入） */
  horde?: HordeSetup;
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
  // ── 怪群試作（SPEC_SLICE4）：先在現有地圖上驗證波次與效能 ──
  { id: 'hordePass', name: '怪群試作：隘口', map: 'arena01', tier: 'horde', minLayer: 1, maxLayer: 99, difficulty: 3,
    enemies: [],
    horde: {
      spawners: [
        { id: 'east', x: 42, y: 24, radius: 2.5 },
        { id: 'north', x: 36, y: 4, radius: 2 },
        { id: 'south', x: 36, y: 44, radius: 2 },
        { id: 'nestNE', x: 44, y: 8, radius: 2, nest: true },
        { id: 'nestSE', x: 44, y: 40, radius: 2, nest: true },
        { id: 'rear', x: 3, y: 40, radius: 1.5 },
      ],
      waves: [
        { id: 'w1', trigger: { type: 'start' }, spawns: [{ spawner: 'east', enemy: 'thrall', count: 10 }] },
        { id: 'w2', trigger: { type: 'time', t: 12 }, spawns: [{ spawner: 'north', enemy: 'skitter', count: 5 }, { spawner: 'south', enemy: 'skitter', count: 5 }] },
        { id: 'w3', trigger: { type: 'remaining', count: 6, after: 'w2' },
          spawns: [{ spawner: 'east', enemy: 'thrall', count: 10 }, { spawner: 'east', enemy: 'slinger', count: 4 }, { spawner: 'east', enemy: 'brute', count: 1 }] },
        { id: 'w4', trigger: { type: 'area', rect: { x: 26, y: 0, w: 22, h: 48 } }, spawns: [{ spawner: 'rear', enemy: 'skitter', count: 6 }] },
        { id: 'nests', trigger: { type: 'time', t: 20 }, repeat: { interval: 15, times: 2 },
          spawns: [{ spawner: 'nestNE', enemy: 'thrall', count: 4 }, { spawner: 'nestSE', enemy: 'thrall', count: 4 }] },
      ],
      objective: { type: 'clear' },
    } },
  // 摩瑞亞試作（SPEC_SLICE4 §5、§6）：96 × 96 m、四個區域之字形推進、戰爭迷霧、自動出怪、抵達東北角出口
  { id: 'hordeMoria', name: '怪群試作：深淵礦坑', map: 'horde01', tier: 'horde', minLayer: 1, maxLayer: 99, difficulty: 4,
    enemies: [],
    horde: {
      fog: true,
      spawners: [
        { id: 'galleryN', x: 38, y: 30, radius: 2.5 },
        { id: 'galleryE', x: 46, y: 58, radius: 2 },
        { id: 'startN', x: 8, y: 32, radius: 2 },
        { id: 'nestN', x: 66, y: 28, radius: 2, nest: true },
        { id: 'nestS', x: 64, y: 60, radius: 2, nest: true },
        { id: 'hallW', x: 55, y: 70, radius: 2 },
        { id: 'trollDen', x: 66, y: 40, radius: 1 },
        { id: 'finalS', x: 92, y: 60, radius: 2 },
        { id: 'finalN', x: 82, y: 22, radius: 2 },
        { id: 'pursuit', x: 70, y: 86, radius: 2.5 },
      ],
      // 自動出怪：小群（3–5 隻）從隊伍周圍的迷霧裡四面八方冒出來；越深入壓力越高
      director: {
        enemies: [{ enemy: 'thrall', weight: 6 }, { enemy: 'skitter', weight: 3 }, { enemy: 'slinger', weight: 1 }],
        packSize: [3, 5],
        spawnDistance: [12, 18],
        cooldown: 3,
        nearbyRadius: 16,
        maxAlive: 45,
        cycle: { buildUp: 20, peak: 10, relax: 10 },
        stages: [
          { trigger: { type: 'time', t: 3 }, low: 3, high: 7, budget: 20 },
          { trigger: { type: 'area', rect: { x: 25, y: 0, w: 25, h: 96 } }, low: 4, high: 10, budget: 35 },
          { trigger: { type: 'area', rect: { x: 51, y: 0, w: 23, h: 96 } }, low: 5, high: 12, budget: 40 },
          { trigger: { type: 'area', rect: { x: 75, y: 0, w: 21, h: 96 } }, low: 6, high: 14 },
        ],
      },
      // 寫好的橋段：小群分多點出現、背後偷襲、巢穴、巨怪、終段追兵
      waves: [
        { id: '長廊', trigger: { type: 'area', rect: { x: 25, y: 0, w: 25, h: 96 } },
          spawns: [{ spawner: 'galleryN', enemy: 'thrall', count: 3 }, { spawner: 'galleryE', enemy: 'thrall', count: 3 }, { spawner: 'galleryE', enemy: 'slinger', count: 2 }] },
        { id: '背後', trigger: { type: 'area', rect: { x: 25, y: 0, w: 25, h: 45 } },
          spawns: [{ spawner: 'startN', enemy: 'skitter', count: 4 }, { spawner: 'galleryN', enemy: 'brute', count: 2 }] },
        { id: '巢穴', trigger: { type: 'area', rect: { x: 51, y: 0, w: 23, h: 96 } }, repeat: { interval: 8, times: 4 },
          spawns: [{ spawner: 'nestN', enemy: 'thrall', count: 3 }, { spawner: 'nestS', enemy: 'thrall', count: 3 }] },
        { id: '巨怪', trigger: { type: 'area', rect: { x: 51, y: 0, w: 23, h: 96 } },
          spawns: [{ spawner: 'trollDen', enemy: 'warlord', count: 1 }, { spawner: 'hallW', enemy: 'thrall', count: 4 }] },
        // 絞盤（SPEC_SLICE4 §15.1）：拉下打開往終段的鐵柵門，但聲音引來一波敵人
        { id: '警報', trigger: { type: 'interact', id: 'lever3' },
          spawns: [{ spawner: 'hallW', enemy: 'thrall', count: 5 }, { spawner: 'pursuit', enemy: 'skitter', count: 3 }] },
        { id: '攔截', trigger: { type: 'area', rect: { x: 75, y: 0, w: 21, h: 96 } },
          spawns: [{ spawner: 'finalN', enemy: 'slinger', count: 3 }, { spawner: 'finalN', enemy: 'siege', count: 1 }] },
        { id: '追兵', trigger: { type: 'area', rect: { x: 75, y: 0, w: 21, h: 96 } }, repeat: { interval: 9, times: -1 },
          spawns: [{ spawner: 'pursuit', enemy: 'thrall', count: 3 }, { spawner: 'pursuit', enemy: 'skitter', count: 2 }] },
      ],
      objective: { type: 'exit', rect: { x: 86, y: 0, w: 10, h: 9 } },
    } },
  // ── 事件遭遇 ──
  { id: 'ambush', name: '埋伏', map: 'forest01', tier: 'event', minLayer: 1, maxLayer: 99, difficulty: 2,
    enemies: [E('skirmisher', 36, 31), E('skirmisher', 36, 17), E('archer', 42, 24)] },
  { id: 'nightRaid', name: '夜襲', map: 'ruins01', tier: 'event', minLayer: 1, maxLayer: 99, difficulty: 2,
    enemies: [E('archer', 36, 19), E('skirmisher', 37.2, 14.5), E('brute', 26.4, 24)] },
];

export const ENCOUNTERS: Record<string, EncounterDef> = Object.fromEntries(list.map((e) => [e.id, e]));

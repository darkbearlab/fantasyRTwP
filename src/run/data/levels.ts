/**
 * 遠征的大型關卡（Alan：主要遠征改成深淵礦坑那種大型關卡）：程序生成的數值與規則。全部是佔位數值。
 * 每個路線圖節點依「遠征種子＋節點」生成一張關卡（同一趟遠征可以重現），見 src/run/levelGen.ts。
 */
import type { EncounterTier } from './encounters';

export type LevelTheme = 'mine' | 'wild';

export interface LevelSize {
  width: number;
  height: number;
  /** 之字形的區域數（區域之間是有缺口的牆） */
  zones: number;
}

export const LEVELS = {
  /** 遠征的戰鬥形式：horde＝大型關卡（預設）；tactical＝切片 2／3 的小地圖戰術戰鬥 */
  expeditionStyle: 'horde' as 'horde' | 'tactical',
  /** 各節點類型的關卡大小 */
  size: {
    battle: { width: 72, height: 72, zones: 3 },
    elite: { width: 80, height: 72, zones: 3 },
    boss: { width: 96, height: 80, zones: 4 },
    event: { width: 56, height: 56, zones: 2 },
  } as Record<Exclude<EncounterTier, 'horde'>, LevelSize>,
  /** 主題：決定名稱與地形物件（mine：礦坑，較少水與草；wild：荒野） */
  themes: ['mine', 'wild'] as LevelTheme[],
  themeNames: { mine: ['廢棄礦坑', '深淵坑道', '古礦井'], wild: ['荒原', '枯林', '亂石谷'] } as Record<LevelTheme, string[]>,
  /** 區域之間的缺口寬度（公尺）、缺口離地圖邊緣的距離範圍 */
  gapWidth: 5,
  gapMargin: [3, 8] as [number, number],
  /** 區域內的橫向半牆（讓路線更曲折）：機率、留下的開口寬度 */
  innerWallChance: 0.6,
  innerWallOpening: 7,
  /** 缺口裝門的機率；精英與頭目關卡另外有一道上鎖的門＋絞盤 */
  doorChance: 0.35,
  leverTiers: ['elite', 'boss'] as EncounterTier[],
  /** 石頭：每多少平方公尺一顆、尺寸 */
  rockDensity: 110,
  rockSizes: [1, 1.5, 2, 2, 3] as number[],
  /** 地形：每個區域的草叢、淺水、矮籬數量範圍（依主題） */
  terrain: {
    mine: { brush: [0, 1], shallow: [0, 1], hedge: [1, 2] },
    wild: { brush: [2, 3], shallow: [0, 1], hedge: [0, 2] },
  } as Record<LevelTheme, Record<'brush' | 'shallow' | 'hedge', [number, number]>>,
  /** 出口範圍（公尺） */
  exitSize: 8,
  /** 每個區域的生成點數量；第 2 區起放巢穴的機率 */
  spawnersPerZone: 3,
  nestChance: 0.45,
  /** 生成點離區域入口至少多遠 */
  spawnerMinDistance: 10,
  /** 進入區域時的波次：雜兵數量＝base＋每層 perLayer；精英數量＝依節點類型＋每 eliteEveryLayers 層多 1 名 */
  zoneFodder: { base: 6, perLayer: 1 },
  zoneElites: { battle: 1, elite: 2, boss: 2, event: 1 } as Record<Exclude<EncounterTier, 'horde'>, number>,
  eliteEveryLayers: 3,
  /** 可出現的精英（依層數解鎖） */
  elitePool: [
    { enemy: 'brute', minLayer: 1 },
    { enemy: 'archer', minLayer: 1 },
    { enemy: 'skirmisher', minLayer: 1 },
    { enemy: 'caster', minLayer: 2 },
    { enemy: 'bomber', minLayer: 3 },
    { enemy: 'lurker', minLayer: 3 },
    { enemy: 'siege', minLayer: 4 },
  ],
  /** 精英關卡：中間區域的隊長（從這些敵人挑） */
  captainPool: ['brute', 'skirmisher', 'caster', 'archer'],
  /** 頭目關卡：最後一區的頭目與護衛 */
  boss: { enemy: 'warlord', escorts: [{ enemy: 'brute', count: 2 }, { enemy: 'thrall', count: 6 }] },
  /** 巢穴關卡的重複波次：間隔秒數、次數、每次每巢幾隻 */
  nestWave: { interval: 9, times: 3, count: 3 },
  /** 終段追兵（出口關卡）：間隔秒數、每次幾隻 */
  pursuit: { interval: 10, thrall: 3, skitter: 2 },
  /** 自動出怪：每個區域一個階段；目標數量隨區域與層數提高 */
  director: {
    enemies: [{ enemy: 'thrall', weight: 6 }, { enemy: 'skitter', weight: 3 }, { enemy: 'slinger', weight: 1 }],
    packSize: [3, 5] as [number, number],
    spawnDistance: [12, 18] as [number, number],
    cooldown: 3,
    nearbyRadius: 16,
    maxAlive: 40,
    cycle: { buildUp: 20, peak: 10, relax: 10 },
    low: { base: 3, perZone: 1, perLayer: 0.4 },
    high: { base: 6, perZone: 2, perLayer: 0.8 },
    budget: { base: 18, perZone: 8, perLayer: 2 },
  },
  /** 生成失敗（走不到出口）時重試幾次 */
  maxAttempts: 30,
};

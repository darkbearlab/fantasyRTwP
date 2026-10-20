/**
 * finalbossblues 地形的程序生成地圖（野外 fieldGen、城內 townGen）→ 戰鬥用的遭遇與地圖（MapDef）。
 *
 * 座標：生成器用畫面方向的格子（gx 往右、gy 往下，W × H）；戰鬥世界是 +x 朝畫面上方、+y 朝畫面右方
 * （projection.ts 的 ortho rotation 90），所以格子 (gx, gy) ＝ 世界格 (H − 1 − gy, gx)，地圖寬（x 方向）＝ H、高（y 方向）＝ W。
 * 邊的名稱兩邊一致：格子的上緣（gy＝0）＝世界 x 最大＝top。
 *
 * 擋路：牆、石柱、房子（擋視線）；樹幹、石頭、倒木、營火、木箱、路燈、水井（只擋路）；密林依 FIELD.forest.blocksSight。
 * 生成結果原封不動放在 mapDef.art，畫面層照它拼圖塊。
 */
import type { MapDef, Rect } from '../sim/data/types';
import type { Vec } from '../sim/math';
import type { DeliberateTier } from './data/deliberateLevels';
import { DELIBERATE_LEVELS } from './data/deliberateLevels';
import type { EncounterEnemy } from './data/encounters';
import { FIELD, PREFABS } from './data/prefabs';
import type { MapEdge } from './edgeLayout';
import type { Facing, FieldLevel } from './fieldGen';
import { generateField } from './fieldGen';
import type { GeneratedLevel } from './levelGen';
import { levelDifficulty } from './levelGen';
import { mergeCells } from './templateLevelGen';
import type { TilePrefab } from './tilePrefab';
import type { TownLevel } from './townGen';
import { generateTown } from './townGen';

export type FbbLook = 'summer' | 'fallDusk' | 'winterOvercast' | 'townNight';

export type FbbArt = { kind: 'fbbField'; look: FbbLook; level: FieldLevel } | { kind: 'fbbTown'; look: FbbLook; level: TownLevel };

export interface FbbLevelOptions {
  tier: DeliberateTier;
  layer: number;
  exits: { id: string; label?: string; edge?: MapEdge }[];
  entry?: MapEdge;
  /** 被主力佔領的節點：升級點數倍率 */
  budgetMult?: number;
  /** 冠軍戰：精英隊長換成這個敵人 */
  captainEnemy?: string;
  look?: FbbLook;
}

/** 生成格子 → 世界格（左下角）；中心再加 0.5 */
export function gridToWorld(gx: number, gy: number, H: number): Vec {
  return { x: H - 1 - gy, y: gx };
}

/** 面向（畫面方向）→ 世界角度：上＝+x、右＝+y */
export function facingAngle(f: Facing): number {
  return f === 'up' ? 0 : f === 'down' ? Math.PI : f === 'right' ? Math.PI / 2 : -Math.PI / 2;
}

/** 擋路格 → 世界的障礙物長方形（'#' 擋視線、'o' 只擋路） */
function obstaclesFrom(cells: Map<string, '#' | 'o'>, W: number, H: number): Rect[] {
  // 世界格陣列：grid[wy][wx]，wx 0..H−1、wy 0..W−1
  const grid: string[][] = Array.from({ length: W }, () => new Array<string>(H).fill('.'));
  for (const [k, c] of cells) {
    const [gx, gy] = k.split(',').map(Number);
    const w = gridToWorld(gx, gy, H);
    grid[w.y][w.x] = c;
  }
  return [...mergeCells(grid, (c) => c === '#'), ...mergeCells(grid, (c) => c === 'o').map((r) => ({ ...r, blocksSight: false }))];
}

function exitDefs(list: { id: string; label?: string; edge: MapEdge; x: number; y: number; w: number; h: number }[], H: number) {
  return list.map((e) => ({ id: e.id, label: e.label, edge: e.edge, x: H - (e.y + e.h), y: e.x, w: e.h, h: e.w }));
}

function enemiesFrom(list: { enemy: string; x: number; y: number; squad: string; facing: Facing; captain?: boolean }[], H: number): EncounterEnemy[] {
  return list.map((e) => {
    const w = gridToWorld(e.x, e.y, H);
    return { enemy: e.enemy, x: w.x + 0.5, y: w.y + 0.5, squad: e.squad, captain: e.captain, facing: facingAngle(e.facing) };
  });
}

function wrap(seed: number, kind: 'field' | 'town', opts: FbbLevelOptions, W: number, H: number, mapDef: Omit<MapDef, 'id' | 'name' | 'width' | 'height' | 'enemySpawns'>, enemies: EncounterEnemy[], place: string): GeneratedLevel {
  const id = `${kind}_${seed >>> 0}`;
  const tier = opts.tier;
  const label = tier === 'boss' ? '最終決戰' : tier === 'elite' ? '精英' : tier === 'event' ? '突發' : '遭遇';
  return {
    id,
    name: `${place}（${label}）`,
    map: id,
    mapDef: { id, name: place, width: H, height: W, enemySpawns: [], exitLock: tier === 'elite' || opts.captainEnemy ? 'captain' : undefined, ...mapDef },
    tier,
    minLayer: opts.layer,
    maxLayer: opts.layer,
    difficulty: levelDifficulty(tier, opts.layer),
    enemies,
    fog: true,
  };
}

const edgeOf = (e: { edge?: MapEdge }): MapEdge => e.edge ?? 'top';

/** 野外戰鬥地圖 */
export function fieldEncounter(seed: number, opts: FbbLevelOptions): GeneratedLevel {
  const lv = generateField(seed, {
    tier: opts.tier,
    layer: opts.layer,
    exits: opts.exits.map((e) => ({ ...e, edge: edgeOf(e) })),
    entry: opts.entry,
    upgradeMult: opts.budgetMult,
    captainEnemy: opts.captainEnemy,
    captainPool: DELIBERATE_LEVELS.captainPool,
  });
  const { w: W, h: H } = lv;
  const cells = new Map<string, '#' | 'o'>();
  for (const [x, y] of lv.walls) cells.set(`${x},${y}`, '#');
  for (const [x, y] of lv.forest) cells.set(`${x},${y}`, FIELD.forest.blocksSight ? '#' : 'o');
  for (const p of lv.props) {
    const def = PREFABS[p.prefab];
    for (const [dx, dy] of def.blocks) {
      const k = `${p.x + dx},${p.y + dy}`;
      if (cells.get(k) !== '#') cells.set(k, def.blocksSight ? '#' : 'o');
    }
  }
  const heroSpawns = lv.heroSpawns.map((p) => {
    const w = gridToWorld(p.x, p.y, H);
    return { x: w.x + 0.5, y: w.y + 0.5 };
  });
  const art: FbbArt = { kind: 'fbbField', look: opts.look ?? 'summer', level: lv };
  return wrap(
    seed,
    'field',
    opts,
    W,
    H,
    { obstacles: obstaclesFrom(cells, W, H), heroSpawns, exits: lv.exits.length ? exitDefs(lv.exits, H) : undefined, landmarks: { cameraStart: heroSpawns[0] }, art },
    enemiesFrom(lv.enemies, H),
    '荒野',
  );
}

/** 城內戰鬥地圖（首都突圍） */
export function townEncounter(seed: number, opts: FbbLevelOptions & { prefabs?: TilePrefab[] }): GeneratedLevel {
  const lv = generateTown(seed, {
    tier: opts.tier,
    layer: opts.layer,
    exits: opts.exits.map((e) => ({ ...e, edge: edgeOf(e) })),
    entry: opts.entry,
    upgradeMult: opts.budgetMult,
    captainEnemy: opts.captainEnemy,
    captainPool: DELIBERATE_LEVELS.captainPool,
    prefabs: opts.prefabs,
  });
  const { w: W, h: H } = lv;
  const cells = new Map<string, '#' | 'o'>();
  for (const [x, y] of lv.blocked) cells.set(`${x},${y}`, 'o');
  for (const [x, y] of lv.sightBlocked) cells.set(`${x},${y}`, '#');
  const heroSpawns = lv.heroSpawns.map((p) => {
    const w = gridToWorld(p.x, p.y, H);
    return { x: w.x + 0.5, y: w.y + 0.5 };
  });
  const art: FbbArt = { kind: 'fbbTown', look: opts.look ?? 'townNight', level: lv };
  return wrap(
    seed,
    'town',
    opts,
    W,
    H,
    { obstacles: obstaclesFrom(cells, W, H), heroSpawns, exits: lv.exits.length ? exitDefs(lv.exits, H) : undefined, landmarks: { cameraStart: heroSpawns[0] }, art },
    enemiesFrom(lv.enemies, H),
    '燃燒的王都',
  );
}

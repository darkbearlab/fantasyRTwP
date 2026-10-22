/**
 * 探索獎勵的放置與內容（Alan 2026-10-22）：在生成好的室內地圖上放寶箱、地上的道具、祭壇。純函式，種子決定。
 * - 位置：出生點走得到、走的距離夠遠的地面；寶箱和道具靠牆（角落、死路優先），祭壇放在比較開闊的地方。
 * - 內容：裝備、回血、消耗品、經驗值、金幣（權重在 data/treasure.ts）。
 * 座標是生成器的格子（gx 往右、gy 往下）。
 */
import { CONSUMABLE_DROP } from './consumables';
import { TREASURE } from './data/treasure';
import { rollItem } from './items';
import { enemyStrength } from './xp';
import { Rng } from '../sim/rng';
import type { LootDef, ShrineKind } from '../sim/data/types';

export interface TreasureSpot {
  kind: 'chest' | 'pickup' | 'shrine';
  x: number;
  y: number;
  loot?: LootDef;
  shrine?: ShrineKind;
}

export interface TreasureInput {
  /** 一列一字串；'.' 是可以放東西的地面，'#' 是牆，其他（門、高台…）可以走但不放 */
  grid: string[];
  spawn: { x: number; y: number };
  exits: { x: number; y: number; w: number; h: number }[];
  /** 不能放的格子（擋路的物件、敵人站的位置） */
  taken: Set<string>;
  layer: number;
}

function pick<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][];
  let x = rng.range(0, entries.reduce((a, [, w]) => a + w, 0));
  for (const [k, w] of entries) if ((x -= w) < 0) return k;
  return entries[0][0];
}

/** 寶箱或地上道具的內容 */
export function rollLoot(rng: Rng, kind: 'chest' | 'pickup', layer: number): LootDef {
  const T = TREASURE;
  const what = kind === 'chest' ? pick(rng, T.chestWeights) : pick(rng, T.pickupWeights);
  switch (what) {
    case 'item':
      return { kind: 'item', id: rollItem(rng, T.rareChance) };
    case 'heal':
      return { kind: 'heal', pct: T.healPct[kind] };
    case 'consumable':
      return { kind: 'consumable', id: pick(rng, CONSUMABLE_DROP.weights), gold: T.consumableGold };
    case 'xp':
      return { kind: 'xp', amount: Math.round(T.xpBase * enemyStrength(layer)) };
    default:
      return { kind: 'gold', amount: rng.int(T.gold[0], T.gold[1]) };
  }
}

type Cand = { x: number; y: number; d: number; walls: number };

export function placeTreasure(seed: number, input: TreasureInput): TreasureSpot[] {
  const T = TREASURE;
  const rng = new Rng(seed);
  const { grid } = input;
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? grid[y][x] : '#');
  const wall = (x: number, y: number) => at(x, y) === '#';
  // 從出生點走的距離（4 方向）
  const dist = new Map<string, number>();
  const q: [number, number][] = [[input.spawn.x, input.spawn.y]];
  dist.set(`${input.spawn.x},${input.spawn.y}`, 0);
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    const d = dist.get(`${x},${y}`)!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const k = `${x + dx},${y + dy}`;
      if (wall(x + dx, y + dy) || dist.has(k)) continue;
      dist.set(k, d + 1);
      q.push([x + dx, y + dy]);
    }
  }
  const nearExit = (x: number, y: number) =>
    input.exits.some((e) => x >= e.x - T.exitClearance && x < e.x + e.w + T.exitClearance && y >= e.y - T.exitClearance && y < e.y + e.h + T.exitClearance);
  const wallsAround = (x: number, y: number) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && wall(x + dx, y + dy)) n++;
    return n;
  };
  const cands: Cand[] = [];
  for (const [k, d] of dist) {
    const [x, y] = k.split(',').map(Number);
    if (at(x, y) !== '.' || d < T.minDistance || input.taken.has(k) || nearExit(x, y)) continue;
    cands.push({ x, y, d, walls: wallsAround(x, y) });
  }
  const chosen: TreasureSpot[] = [];
  const farEnough = (x: number, y: number) => chosen.every((c) => Math.abs(c.x - x) + Math.abs(c.y - y) >= T.spacing);
  const take = (list: Cand[], score: (c: Cand) => number, n: number, make: (c: Cand) => TreasureSpot) => {
    const sorted = list.map((c) => ({ c, s: score(c) + rng.range(0, 6) })).sort((a, b) => b.s - a.s);
    for (const { c } of sorted) {
      if (n <= 0) break;
      if (!farEnough(c.x, c.y)) continue;
      chosen.push(make(c));
      n--;
    }
  };
  // 寶箱：靠牆，越深、越像角落越好
  const againstWall = cands.filter((c) => c.walls >= 3);
  take(againstWall, (c) => c.d * 0.5 + c.walls * 2, rng.int(T.chests[0], T.chests[1]), (c) => ({ kind: 'chest', x: c.x, y: c.y, loot: rollLoot(rng, 'chest', input.layer) }));
  // 祭壇：周圍開闊（不貼牆）
  if (rng.chance(T.shrineChance)) {
    take(
      cands.filter((c) => c.walls === 0),
      (c) => c.d * 0.3,
      1,
      (c) => ({ kind: 'shrine', x: c.x, y: c.y, shrine: pick(rng, T.shrineWeights) }),
    );
  }
  // 地上的道具：靠牆就好，不一定很深
  take(againstWall, (c) => c.d * 0.2 + c.walls, rng.int(T.pickups[0], T.pickups[1]), (c) => ({ kind: 'pickup', x: c.x, y: c.y, loot: rollLoot(rng, 'pickup', input.layer) }));
  return chosen;
}

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WALL_JOINS } from '../src/run/data/prefabs';
import { generateField } from '../src/run/fieldGen';
import type { FieldOptions } from '../src/run/fieldGen';
import { parseTilePrefab } from '../src/run/tilePrefab';
import { generateTown } from '../src/run/townGen';

const exits: FieldOptions['exits'] = [
  { id: 'a', edge: 'top' },
  { id: 'b', edge: 'top' },
  { id: 'c', edge: 'left' },
];
const PF_DIR = join(__dirname, '..', 'src', 'run', 'data', 'tilePrefabs');
const prefabs = readdirSync(PF_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseTilePrefab(f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(PF_DIR, f), 'utf-8'))));

/** 從第一個出生點走得到的格 */
function reach(w: number, h: number, blocked: Set<string>, from: { x: number; y: number }) {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [[from.x, from.y]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const k = `${x + dx},${y + dy}`;
      if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      q.push([x + dx, y + dy]);
    }
  }
  return seen;
}

describe('野外地圖生成', () => {
  const seeds = [1, 42, 99];
  it('同一個種子產生同一張圖', () => {
    expect(generateField(42, { tier: 'battle', layer: 3, exits })).toEqual(generateField(42, { tier: 'battle', layer: 3, exits }));
  });
  it('石牆接法都有圖、據點開口朝路、出口與敵人走得到', () => {
    for (const seed of seeds) {
      const lv = generateField(seed, { tier: 'battle', layer: 3, exits });
      const walls = new Set(lv.walls.map(([x, y]) => `${x},${y}`));
      for (const [x, y] of lv.walls) {
        const key = (walls.has(`${x},${y - 1}`) ? 'U' : '') + (walls.has(`${x},${y + 1}`) ? 'D' : '') + (walls.has(`${x - 1},${y}`) ? 'L' : '') + (walls.has(`${x + 1},${y}`) ? 'R' : '');
        expect(WALL_JOINS).toContain(key);
      }
      expect(lv.sites.filter((s) => s.kind === 'checkpoint')).toHaveLength(1);
      expect(lv.sites.filter((s) => s.kind === 'lookout').length).toBeGreaterThanOrEqual(2);
      // 據點開口前方第一格不是牆
      for (const s of lv.sites.filter((s) => s.kind !== 'checkpoint')) {
        const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[s.facing];
        expect(s.cells.some(([x, y]) => !walls.has(`${x + dx},${y + dy}`))).toBe(true);
      }
      // 擋路格：牆、密林、預製件的擋路格
      const blocked = new Set([...walls, ...lv.forest.map(([x, y]) => `${x},${y}`)]);
      const seen = reach(lv.w, lv.h, blocked, lv.heroSpawns[0]);
      for (const e of lv.exits) expect(seen.has(`${e.x + 1},${e.y + 1}`)).toBe(true);
      expect(lv.enemies.length).toBeGreaterThanOrEqual(6);
    }
  });
  it('生怪格數量前後期差不多，後期強敵比較多', () => {
    const grunts = new Set(['shieldbearer', 'archer', 'exploder']);
    const share = (layer: number) => {
      let n = 0;
      let g = 0;
      for (const seed of seeds) {
        const lv = generateField(seed, { tier: 'battle', layer, exits });
        n += lv.enemies.length;
        g += lv.enemies.filter((e) => grunts.has(e.enemy)).length;
      }
      return { n, g: g / n };
    };
    const early = share(1);
    const late = share(9);
    expect(Math.abs(early.n - late.n)).toBeLessThanOrEqual(3);
    expect(late.g).toBeLessThan(early.g);
  });
});

describe('手工預製件', () => {
  it('讀得到 Alan 的房屋做例：只擋物件層有圖的格，門口不擋', () => {
    const house = prefabs.find((p) => p.id === '房屋_做例01')!;
    expect(house.kind).toBe('house');
    expect([house.w, house.h]).toEqual([9, 8]);
    const blocks = new Set(house.blockCells.map(([x, y]) => `${x},${y}`));
    expect(house.doorCells).toEqual([
      [4, 7],
      [5, 7],
    ]);
    for (const [x, y] of house.doorCells) expect(blocks.has(`${x},${y}`)).toBe(false);
    expect(blocks.has('8,7')).toBe(false);
    expect(blocks.has('1,1')).toBe(true);
    expect(prefabs.find((p) => p.id === '水井')?.kind).toBe('well');
  });
  it('看不懂的格子會報錯', () => {
    expect(() => parseTilePrefab('壞掉', { format: 'tilebench-prefab/1', sheetCols: 115, w: 1, h: 1, layers: { objects: [['abc']] } })).toThrow();
  });
});

describe('城內地圖生成', () => {
  it('同一個種子產生同一張圖；房子不重疊、門口與出口走得到', () => {
    const opts = { tier: 'battle' as const, layer: 3, exits, prefabs };
    expect(generateTown(7, opts)).toEqual(generateTown(7, opts));
    for (const seed of [1, 42, 2024]) {
      const lv = generateTown(seed, opts);
      expect(lv.houses.length).toBeGreaterThanOrEqual(12);
      const area = new Set<string>();
      for (const h of lv.houses)
        for (let y = h.y; y < h.y + h.h; y++)
          for (let x = h.x; x < h.x + h.w; x++) {
            expect(area.has(`${x},${y}`)).toBe(false);
            area.add(`${x},${y}`);
          }
      const blocked = new Set(lv.blocked.map(([x, y]) => `${x},${y}`));
      const seen = reach(lv.w, lv.h, blocked, lv.heroSpawns[0]);
      for (const e of lv.exits) expect(seen.has(`${e.x + 1},${e.y + 1}`)).toBe(true);
      for (const e of lv.enemies) expect(seen.has(`${e.x},${e.y}`)).toBe(true);
      // 房子擋視線
      expect(lv.sightBlocked.length).toBeGreaterThan(100);
    }
  });
});

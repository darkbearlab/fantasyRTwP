import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/sim/data/maps';
import { findPath } from '../src/sim/nav/astar';
import { NavGrid } from '../src/sim/nav/grid';
import { lineWalkable, smoothPath } from '../src/sim/nav/smooth';
import { Rng } from '../src/sim/rng';

const map = MAPS.arena01;
const grid = NavGrid.fromMap(map, 0.5, 0.4);

describe('尋路（SPEC §8）', () => {
  it('路徑不穿牆；平滑後每段都沒有遮擋', () => {
    const rng = new Rng(99);
    let tested = 0;
    while (tested < 60) {
      const a = { x: rng.range(0, map.width), y: rng.range(0, map.height) };
      const b = { x: rng.range(0, map.width), y: rng.range(0, map.height) };
      if (!grid.isWalkable(a) || !grid.isWalkable(b)) continue;
      const raw = findPath(grid, a, b);
      expect(raw).not.toBeNull();
      for (const p of raw!) expect(grid.isWalkable(p)).toBe(true);
      // 原始路徑相鄰點之間也不穿牆
      let prev = a;
      for (const p of raw!) {
        expect(lineWalkable(grid, prev, p)).toBe(true);
        prev = p;
      }
      const smooth = smoothPath(grid, a, raw!);
      prev = a;
      for (const p of smooth) {
        expect(lineWalkable(grid, prev, p)).toBe(true);
        prev = p;
      }
      expect(smooth.length).toBeLessThanOrEqual(raw!.length);
      const last = smooth[smooth.length - 1];
      expect(Math.hypot(last.x - b.x, last.y - b.y)).toBeLessThan(1e-9);
      tested++;
    }
  });

  it('從英雄區到敵人區的最短路走隘口', () => {
    const path = findPath(grid, { x: 5, y: 12 }, { x: 35, y: 12 })!;
    const crossing = path.find((p) => p.x > 19 && p.x < 21)!;
    expect(crossing.y).toBeGreaterThan(10.5);
    expect(crossing.y).toBeLessThan(13.5);
  });

  it('禁止斜穿牆角', () => {
    // 柱子 (12,6)-(13.5,7.5) 的角落附近，路徑相鄰點不可斜切障礙
    const path = findPath(grid, { x: 11, y: 5 }, { x: 14.5, y: 8.5 })!;
    let prev = { x: 11, y: 5 };
    for (const p of path) {
      expect(lineWalkable(grid, prev, p)).toBe(true);
      prev = p;
    }
  });
});

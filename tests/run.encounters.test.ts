import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/sim/data/enemies';
import { MAPS } from '../src/sim/data/maps';
import { findPath } from '../src/sim/nav/astar';
import { NavGrid } from '../src/sim/nav/grid';
import { ENCOUNTERS } from '../src/run/data/encounters';
import { pickEncounter } from '../src/run/progression';
import { createRun } from '../src/run/runState';

describe('遭遇資料（SPEC_SLICE2 §7）', () => {
  it('所有地圖（含切片 3 的 marsh01、hill01）都有被使用', () => {
    const maps = new Set(Object.values(ENCOUNTERS).map((e) => e.map));
    for (const m of ['arena01', 'forest01', 'ruins01', 'bridge01', 'boss01', 'marsh01', 'hill01']) expect(maps.has(m), m).toBe(true);
  });

  it('所有敵人位置可走、可以走到英雄出生點；一般戰鬥 3–5 名、精英 4–5 名', () => {
    for (const e of Object.values(ENCOUNTERS)) {
      const map = MAPS[e.map];
      const g = NavGrid.fromMap(map, 0.5, 0.5);
      for (const u of e.enemies) {
        expect(ENEMIES[u.enemy], `${e.id} ${u.enemy}`).toBeDefined();
        expect(g.isWalkable(u), `${e.id} (${u.x},${u.y})`).toBe(true);
        expect(findPath(g, u, map.heroSpawns[0]), `${e.id} (${u.x},${u.y})`).not.toBeNull();
      }
      if (e.tier === 'battle') expect(e.enemies.length, e.id).toBeGreaterThanOrEqual(3);
      if (e.tier === 'elite') expect(e.enemies.length, e.id).toBeGreaterThanOrEqual(4);
      expect(e.enemies.length, e.id).toBeLessThanOrEqual(5);
      if (e.tier === 'elite') expect(e.enemies.filter((x) => x.captain).length).toBe(1);
    }
  });

  it('每一層、每種戰鬥節點都抽得到遭遇', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = createRun(seed);
      for (const n of r.map.nodes) if (n.type === 'battle' || n.type === 'elite' || n.type === 'boss') expect(() => pickEncounter(r, n)).not.toThrow();
    }
  });
});

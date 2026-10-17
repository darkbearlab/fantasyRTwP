import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/sim/data/maps';
import { canSeeCircle } from '../src/sim/los';
import { NavGrid } from '../src/sim/nav/grid';
import { Rng } from '../src/sim/rng';

const map = MAPS.arena01;
const sight = NavGrid.fromMap(map, 0.5, 0);
const walk = NavGrid.fromMap(map, 0.5, 0.4);

describe('視線（SPEC §9）', () => {
  it('對稱性：隨機 200 組位置 canSee(A,B) === canSee(B,A)', () => {
    const rng = new Rng(2024);
    let visible = 0;
    let n = 0;
    while (n < 200) {
      const a = { x: rng.range(0, map.width), y: rng.range(0, map.height) };
      const b = { x: rng.range(0, map.width), y: rng.range(0, map.height) };
      if (!walk.isWalkable(a) || !walk.isWalkable(b)) continue;
      const ab = canSeeCircle(sight, a, 0.4, b, 0.4);
      const ba = canSeeCircle(sight, b, 0.4, a, 0.4);
      expect(ab).toBe(ba);
      if (ab) visible++;
      n++;
    }
    // 樣本中應同時有可見與不可見的情況
    expect(visible).toBeGreaterThan(10);
    expect(visible).toBeLessThan(190);
  });

  it('牆會遮擋視線；隘口可以看穿', () => {
    expect(canSeeCircle(sight, { x: 19.2, y: 17 }, 0.4, { x: 28.8, y: 17 }, 0.4)).toBe(false);
    expect(canSeeCircle(sight, { x: 19.2, y: 24 }, 0.4, { x: 28.8, y: 24 }, 0.4)).toBe(true);
  });
});

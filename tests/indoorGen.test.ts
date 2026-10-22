import { describe, expect, it } from 'vitest';
import { generateIndoor } from '../src/run/indoorGen';
import type { IndoorLevel, IndoorTheme } from '../src/run/indoorGen';
import { ENEMIES } from '../src/sim/data/enemies';

const OPTS = {
  layer: 3,
  entry: 'bottom' as const,
  exits: [
    { id: 'a', edge: 'top' as const },
    { id: 'b', edge: 'left' as const },
    { id: 'c', edge: 'right' as const },
  ],
};

/** 出生點走得到的格子 */
function reach(lv: IndoorLevel): Set<string> {
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < lv.w && y < lv.h && lv.grid[y][x] !== '#';
  const s = lv.heroSpawns[0];
  const seen = new Set([`${s.x},${s.y}`]);
  const st = [[s.x, s.y]];
  while (st.length) {
    const [x, y] = st.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && open(x + dx, y + dy)) {
        seen.add(k);
        st.push([x + dx, y + dy]);
      }
    }
  }
  return seen;
}

describe('第 3～5 章的室內地圖生成（SPEC_CAMPAIGN §6）', () => {
  for (const theme of ['temple', 'cave', 'castle'] as IndoorTheme[])
    it(`${theme}：出生點走得到每個出口與每名敵人；敵人都有資料；同種子結果一樣`, () => {
      for (const seed of [1, 2, 3, 42, 99]) {
        const lv = generateIndoor(theme, seed, OPTS);
        expect(lv.grid).toHaveLength(lv.h);
        const r = reach(lv);
        for (const e of lv.exits) expect(r.has(`${e.x},${e.y}`), `${theme} ${seed} 出口 ${e.id}`).toBe(true);
        for (const e of lv.enemies) {
          expect(ENEMIES[e.enemy], e.enemy).toBeDefined();
          expect(r.has(`${e.x},${e.y}`), `${theme} ${seed} ${e.enemy}`).toBe(true);
        }
        expect(lv.heroSpawns).toHaveLength(4);
      }
      expect(JSON.stringify(generateIndoor(theme, 7, OPTS))).toBe(JSON.stringify(generateIndoor(theme, 7, OPTS)));
    });

  it('密道：沒有 1 格寬的縫（1 m 的角色走得過）', () => {
    for (const seed of [1, 2, 3]) {
      const lv = generateIndoor('cave', seed, OPTS);
      const open = (x: number, y: number) => lv.grid[y]?.[x] !== undefined && lv.grid[y][x] !== '#';
      for (let y = 1; y < lv.h - 1; y++)
        for (let x = 1; x < lv.w - 1; x++) {
          if (!open(x, y)) continue;
          expect(!open(x - 1, y) && !open(x + 1, y), `${seed} (${x},${y}) 橫向縫`).toBe(false);
        }
    }
  });

  it('試煉地城：入口房以外的房間都有試煉；門不會連成長條', () => {
    const lv = generateIndoor('temple', 42, OPTS);
    expect(lv.rooms.filter((r) => r.role === 'entry')).toHaveLength(1);
    expect(lv.rooms.every((r) => r.role !== '')).toBe(true);
    for (const row of lv.grid) expect(row).not.toMatch(/DDDD/);
  });

  it('魔王城：左右對稱（不算出口與入口附近）、兩道城門、二樓高台', () => {
    const lv = generateIndoor('castle', 5, { layer: 3, entry: 'bottom', exits: [{ id: 'a', edge: 'top' }] });
    for (let y = 4; y < lv.h - 4; y++) {
      const row = lv.grid[y].replace(/D/g, '.');
      // 中軸在第 23、24 格之間
      expect(row, `第 ${y} 列`).toBe([...row].reverse().join(''));
    }
    expect(lv.rooms.filter((r) => r.role === 'gate')).toHaveLength(2);
    expect(lv.grid.some((r) => r.includes('^'))).toBe(true);
  });
});

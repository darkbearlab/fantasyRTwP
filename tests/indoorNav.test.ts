/**
 * 室內地圖走得通（Alan 2026-10-22 回報：第 3 章的小房間擺了擋路的基座，尋路死掉、隊伍進不了房間）。
 * - 每一格角色站得住的地面都要從出生點走得到（用和戰鬥一樣的導航格、角色半徑）
 * - 第一次生成就要通過（不是靠重試蒙混過去）
 * - 房間裡擋路的物件不放在入口正對的通道上
 */
import { describe, expect, it } from 'vitest';
import { indoorEncounter, navOk } from '../src/run/fbbLevel';
import { generateIndoor } from '../src/run/indoorGen';
import type { IndoorLevel } from '../src/run/indoorGen';

const exits = [
  { id: 'a', edge: 'top' as const },
  { id: 'b', edge: 'bottom' as const },
  { id: 'c', edge: 'left' as const },
];

describe('室內地圖走得通', () => {
  for (const theme of ['temple', 'cave', 'castle'] as const)
    it(`${theme}：第一次生成就通過導航檢查（含每一格地面）`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const e = indoorEncounter(seed, { tier: 'battle', layer: 3, exits, entry: 'bottom', theme, treasure: true });
        expect(navOk(e), `${theme} ${seed}`).toBe(true);
        expect(e.id, `${theme} ${seed} 需要重試`).toBe(`indoor_${seed}`);
      }
    });

  it('試煉地城：擋路的物件不在房間入口正對的通道上', () => {
    const BLOCK = new Set(['statue', 'bookshelf']);
    for (let seed = 1; seed <= 30; seed++) {
      const lv: IndoorLevel = generateIndoor('temple', seed, { layer: 3, exits, entry: 'bottom' });
      const open = (x: number, y: number) => (lv.grid[y]?.[x] ?? '#') !== '#';
      for (const r of lv.rooms) {
        // 入口：房間外圈的開口（擺設之前的書架格也算牆，所以用書架以外的物件檢查）
        const cols = new Set<number>();
        const rows = new Set<number>();
        for (let x = r.x; x < r.x + r.w; x++) if (open(x, r.y - 1) || open(x, r.y + r.h)) cols.add(x);
        for (let y = r.y; y < r.y + r.h; y++) if (open(r.x - 1, y) || open(r.x + r.w, y)) rows.add(y);
        for (const p of lv.props) {
          if (!BLOCK.has(p.kind)) continue;
          if (p.x < r.x || p.x >= r.x + r.w || p.y < r.y || p.y >= r.y + r.h) continue;
          for (let dy = 0; dy < (p.h ?? 1); dy++)
            for (let dx = 0; dx < (p.w ?? 1); dx++) {
              expect(cols.has(p.x + dx), `${seed} ${p.kind} 擋住直向通道`).toBe(false);
              expect(rows.has(p.y + dy), `${seed} ${p.kind} 擋住橫向通道`).toBe(false);
            }
        }
      }
    }
  });
});

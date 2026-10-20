import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/run/data/templates';
import { LEVEL_POOLS, TEMPLATE_LEVELS } from '../src/run/data/levelPools';
import { DELIBERATE_LEVELS } from '../src/run/data/deliberateLevels';
import { assemble, generateTemplateLevel, mergeCells, mirrorRows, rotateRows } from '../src/run/templateLevelGen';
import { floodFrom } from '../src/run/levelGen';
import { NavGrid } from '../src/sim/nav/grid';
import { Rng } from '../src/sim/rng';
import { ENEMIES } from '../src/sim/data/enemies';
import type { DeliberateTier } from '../src/run/data/deliberateLevels';

const LEGEND = new Set([...'.#o"~=WDSEBR123456789']);
const TIERS: DeliberateTier[] = ['battle', 'elite', 'boss', 'event'];

describe('關卡模板（SPEC_SLICE6 §1）', () => {
  it('每塊模板的大小、圖例、生怪磚設定都正確', () => {
    for (const t of TEMPLATES) {
      const C = TEMPLATE_LEVELS.chunk;
      expect(t.rows.length, t.id).toBe(C * t.size[1]);
      for (const r of t.rows) expect(r.length, t.id).toBe(C * t.size[0]);
      const chars = new Set(t.rows.join(''));
      for (const c of chars) expect(LEGEND.has(c), `${t.id} 有不認得的字元 ${c}`).toBe(true);
      const digits = [...chars].filter((c) => /[1-9]/.test(c));
      expect(digits.sort(), t.id).toEqual(Object.keys(t.spawns).sort());
      for (const s of Object.values(t.spawns)) {
        expect(LEVEL_POOLS[s.pool], `${t.id} 的池子 ${s.pool}`).toBeDefined();
        expect(s.count[0]).toBeLessThanOrEqual(s.count[1]);
      }
      if (t.tags.includes('start')) expect(chars.has('S'), t.id).toBe(true);
      if (t.tags.includes('boss')) expect(chars.has('B') && chars.has('R'), t.id).toBe(true);
    }
    for (const list of Object.values(LEVEL_POOLS)) for (const e of list) expect(ENEMIES[e.enemy], e.enemy).toBeDefined();
  });

  it('旋轉與鏡像：寬高互換、轉四次回到原樣', () => {
    const rows = ['ab', 'cd', 'ef'];
    expect(rotateRows(rows)).toEqual(['eca', 'fdb']);
    expect(rotateRows(rotateRows(rotateRows(rotateRows(rows))))).toEqual(rows);
    expect(mirrorRows(rows)).toEqual(['ba', 'dc', 'fe']);
  });

  it('牆合併成長方形：面積相同', () => {
    const g = ['##..', '##..', '.###'].map((r) => [...r]);
    const rects = mergeCells(g, (c) => c === '#');
    expect(rects.reduce((a, r) => a + r.w * r.h, 0)).toBe(7);
  });

  it('拼接：起點在最左一欄、必備模板一定出現、格子全部填滿', () => {
    for (const tier of TIERS) {
      for (let s = 1; s <= 30; s++) {
        const a = assemble(new Rng(s * 977), tier);
        if (!a) continue;
        const L = TEMPLATE_LEVELS.layouts[tier];
        const covered = a.placements.reduce((n, p) => n + p.sw * p.sh, 0);
        expect(covered).toBe(L.w * L.h);
        const start = a.placements.find((p) => p.tpl.tags.includes('start'))!;
        expect(start.cx).toBe(0);
        for (const tag of L.required) expect(a.placements.some((p) => p.tpl.tags.includes(tag)), `${tier} 必備 ${tag}`).toBe(true);
      }
    }
  });

  it('生成：每種關卡、每層都生得出來；決定論；敵人數量與預算；出生點走得到每一名敵人', () => {
    for (const tier of TIERS) {
      for (const layer of [1, 4, 8]) {
        for (let s = 1; s <= 6; s++) {
          const seed = s * 7919 + layer;
          const lv = generateTemplateLevel(seed, { tier, layer });
          expect(generateTemplateLevel(seed, { tier, layer })).toEqual(lv);
          const m = lv.mapDef;
          expect(m.width).toBe(TEMPLATE_LEVELS.layouts[tier].w * TEMPLATE_LEVELS.chunk);
          const normal = lv.enemies.filter((e) => e.squad !== 'boss');
          expect(lv.enemies.length).toBeGreaterThanOrEqual(DELIBERATE_LEVELS.minEnemies);
          expect(normal.length).toBeLessThanOrEqual(DELIBERATE_LEVELS.maxEnemies);
          if (tier === 'elite') expect(lv.enemies.some((e) => e.captain)).toBe(true);
          if (tier === 'boss') expect(lv.enemies.some((e) => e.enemy === DELIBERATE_LEVELS.boss.enemy)).toBe(true);
          const nav = new NavGrid(m.width, m.height, 0.5, 0.55, m.obstacles);
          const reach = floodFrom(nav, m.heroSpawns[0]);
          for (const e of lv.enemies) {
            const c = nav.cellOf(e);
            expect(reach[c.cy * nav.cols + c.cx], `${tier} L${layer} s${s} ${e.enemy}`).toBe(1);
          }
        }
      }
    }
    // 生成上百張關卡：CI 的機器比較慢，放寬時間
  }, 30000);
});

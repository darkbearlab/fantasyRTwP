import { describe, expect, it } from 'vitest';
import { createBattleFromRun } from '../src/run/battle';
import { DELIBERATE_LEVELS } from '../src/run/data/deliberateLevels';
import { generateDeliberateLevel } from '../src/run/deliberateLevelGen';
import { floodFrom } from '../src/run/levelGen';
import { chooseNode, pickEncounter } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import { NavGrid } from '../src/sim/nav/grid';

describe('沉穩節奏的生成關卡（SPEC_SLICE5 §15.3）', () => {
  it('48 × 48、迷霧、敵人分成小隊，出生點走得到每一名敵人', () => {
    for (const tier of ['battle', 'elite', 'event', 'boss'] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const layer = 1 + (seed % 6);
        const lv = generateDeliberateLevel(seed * 7919, { tier, layer });
        const m = lv.mapDef;
        expect(m.width).toBe(DELIBERATE_LEVELS.width);
        expect(m.height).toBe(DELIBERATE_LEVELS.height);
        expect(lv.fog).toBe(true);
        expect(lv.horde).toBeUndefined();
        const regular = lv.enemies.filter((e) => e.squad !== 'boss');
        expect(regular.length).toBeGreaterThanOrEqual(tier === 'boss' ? 1 : DELIBERATE_LEVELS.minEnemies);
        expect(regular.length).toBeLessThanOrEqual(DELIBERATE_LEVELS.maxEnemies);
        expect(lv.enemies.every((e) => !!e.squad)).toBe(true);
        if (tier === 'boss') expect(lv.enemies.some((e) => e.enemy === 'warlord')).toBe(true);
        if (tier === 'elite') expect(lv.enemies.some((e) => e.captain)).toBe(true);
        // 門全開時，出生點走得到每一名敵人
        const grid = new NavGrid(m.width, m.height, 0.5, 0.55, m.obstacles);
        const reach = floodFrom(grid, m.landmarks!.cameraStart);
        for (const e of lv.enemies) {
          const c = grid.cellOf(e);
          expect(reach[c.cy * grid.cols + c.cx]).toBe(1);
        }
        // 屍僕只作為召喚物
        expect(lv.enemies.some((e) => e.enemy === 'minion' || e.enemy === 'thrall')).toBe(false);
      }
    }
  });

  it('同樣的種子得到同樣的關卡；不同種子配置不同', () => {
    const a = generateDeliberateLevel(42, { tier: 'battle', layer: 3 });
    const b = generateDeliberateLevel(42, { tier: 'battle', layer: 3 });
    const c = generateDeliberateLevel(43, { tier: 'battle', layer: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.enemies)).not.toBe(JSON.stringify(c.enemies));
  });

  it('沉穩節奏的遠征使用生成關卡：迷霧開啟、敵人帶小隊', () => {
    const r = createRun(5);
    const first = r.map.nodes[r.map.layers[0][0]];
    expect(pickEncounter(r, first).startsWith('dlevel:')).toBe(true);
    const w = createBattleFromRun(chooseNode(r, first.id));
    expect(w.vision).not.toBeNull();
    expect(w.fogActive).toBe(true);
    expect(w.enemies().every((e) => !!e.squad)).toBe(true);
    expect(w.map.width).toBe(48);
  });
});

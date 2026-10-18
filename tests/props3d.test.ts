import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/sim/data/maps';
import { PROP_META, PROPS3D, obstacleUsesProp, planProps } from '../src/game/render/props3dPlan';

describe('props3d 地形物件擺放（只是外觀）', () => {
  it('設定檔裡用到的物件都有素材資料', () => {
    const O = PROPS3D.obstacle;
    const used = [...Object.values(O.pools).flat(), ...Object.values(O.mapPools).flatMap((p) => Object.values(p).flat()), PROPS3D.hedge.prop, PROPS3D.brush.prop];
    for (const id of used) expect(PROP_META[id], id).toBeDefined();
  });

  it('決定論：同一張地圖每次擺放都一樣', () => {
    for (const m of Object.values(MAPS)) expect(JSON.stringify(planProps(m))).toBe(JSON.stringify(planProps(m)));
  });

  it('小型方形障礙物各換成一個物件；長條的牆、深水、懸崖不換', () => {
    for (const m of Object.values(MAPS)) {
      const plan = planProps(m).filter((p) => p.kind === 'obstacle');
      const want = m.obstacles.filter((r) => obstacleUsesProp(m, r)).length;
      expect(plan.length, m.id).toBe(want);
      for (const p of plan) {
        const r = m.obstacles[p.obstacle!];
        expect(Math.max(r.w, r.h)).toBeLessThanOrEqual(PROPS3D.obstacle.maxSize);
        expect(r.blocksSight).not.toBe(false);
        expect(r.style).not.toBe('cliff');
        // 物件放在障礙物中心
        expect(p.x).toBeCloseTo(r.x + r.w / 2);
        expect(p.y).toBeCloseTo(r.y + r.h / 2);
      }
    }
    expect(planProps(MAPS.forest01).some((p) => p.kind === 'obstacle')).toBe(true);
    expect(planProps(MAPS.boss01).some((p) => p.kind === 'obstacle')).toBe(false);
  });

  it('矮籬沿長軸排滿倒木；草叢的灌木都落在草叢範圍內', () => {
    const m = MAPS.marsh01;
    const plan = planProps(m);
    for (const t of m.terrain!.filter((t) => t.kind === 'hedge')) {
      const logs = plan.filter((p) => p.kind === 'hedge' && p.x >= t.x - 0.3 && p.x <= t.x + t.w + 0.3 && p.y >= t.y - 0.3 && p.y <= t.y + t.h + 0.3);
      expect(logs.length).toBeGreaterThanOrEqual(PROPS3D.hedge.rows);
      // 每排倒木的總長度等於矮籬長度
      const len = (logs.length / PROPS3D.hedge.rows) * PROP_META[PROPS3D.hedge.prop].size_m[0] * logs[0].scale;
      expect(len).toBeCloseTo(Math.max(t.w, t.h), 3);
    }
    const brush = m.terrain!.filter((t) => t.kind === 'brush');
    for (const p of plan.filter((p) => p.kind === 'brush')) expect(brush.some((t) => p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h)).toBe(true);
  });
});

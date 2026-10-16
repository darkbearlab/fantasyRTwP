import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/sim/data/enemies';
import { HEROES } from '../src/sim/data/heroes';
import type { MapDef } from '../src/sim/data/types';
import { dist } from '../src/sim/math';
import { World } from '../src/sim/world';
import { HOLD, OPEN_MAP, PASSIVE, run } from './helpers';

const AGGRO = { ...PASSIVE, enemyAggroRange: 99, enemyAggroTime: 0 };

describe('切片 3 新敵人（SPEC_SLICE3 §3、§7-6）', () => {
  it('攻城兵無視控制區：直接穿過戰士的控制區走向後排', () => {
    const map: MapDef = { ...OPEN_MAP, id: 'zoc', width: 20, height: 12 };
    const mk = (enemy: string) =>
      new World({
        seed: 1, map, config: { ...PASSIVE, zocMode: 'pin' }, idleBehavior: HOLD,
        spawns: [{ defId: 'warrior', pos: { x: 10, y: 6 } }, { defId: 'mage', pos: { x: 3, y: 6 } }, { defId: enemy, pos: { x: 11.4, y: 6 } }],
      });
    for (const id of ['siege', 'brute']) {
      const w = mk(id);
      const [, , e] = w.units;
      let pinned = false;
      for (let i = 0; i < 30 * 4 && !pinned; i++) {
        const r = w.moveAlong(e, { x: 5, y: 6 });
        pinned = r === 'pinned';
        if (r === 'arrived') break;
      }
      if (id === 'siege') {
        expect(pinned).toBe(false);
        expect(e.pos.x).toBeLessThan(6);
      } else {
        expect(pinned).toBe(true);
        expect(e.pos.x).toBeGreaterThan(7.5);
      }
    }
    expect(ENEMIES.siege.skills).toContain('ram');
  });

  it('攻城兵的撞擊：衝向英雄並擊退', () => {
    const w = new World({
      seed: 2, map: OPEN_MAP, config: AGGRO, idleBehavior: HOLD,
      spawns: [{ defId: 'warrior', pos: { x: 4, y: 6 } }, { defId: 'siege', pos: { x: 11, y: 6 } }],
    });
    const [war, s] = w.units;
    const evs = run(w, 30 * 4);
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === s.id && e.skillId === 'ram')).toBe(true);
    expect(evs.some((e) => e.type === 'knockback' && e.unitId === war.id) || evs.some((e) => e.type === 'miss' && e.sourceId === s.id && e.skillId === 'ram')).toBe(true);
  });

  it('投彈手不需視線：隔著牆也會攻擊', () => {
    const walled: MapDef = { ...OPEN_MAP, id: 'walled', obstacles: [{ x: 8, y: 1, w: 1, h: 10 }] };
    const w = new World({
      seed: 3, map: walled, config: AGGRO, idleBehavior: HOLD,
      spawns: [{ defId: 'warrior', pos: { x: 5, y: 6 }, hp: 999 }, { defId: 'bomber', pos: { x: 12, y: 6 } }],
    });
    const [h, b] = w.units;
    expect(w.canSee(b, h)).toBe(false);
    const evs = run(w, 30 * 6);
    expect(evs.some((e) => (e.type === 'hit' || e.type === 'miss') && e.sourceId === b.id)).toBe(true);
    // 沒有為了找視線而繞過牆
    expect(b.pos.x).toBeGreaterThan(9);
  });

  it('潛行者開場隱匿（貼近或攻擊才現身），優先攻擊後排生命最低者', () => {
    const w = new World({
      seed: 4, map: OPEN_MAP, config: AGGRO, idleBehavior: HOLD,
      spawns: [
        { defId: 'warrior', pos: { x: 8, y: 6 } },
        { defId: 'ranger', pos: { x: 4, y: 3 } },
        { defId: 'mage', pos: { x: 4, y: 9 }, hp: 30 },
        { defId: 'lurker', pos: { x: 15, y: 6 } },
      ],
    });
    const [war, , mage, l] = w.units;
    expect(l.stealthTime).toBeGreaterThan(100);
    expect(w.canTarget(war, l)).toBe(false);
    expect(w.visibleToTeam(l, 'hero')).toBe(false);
    run(w, 30);
    expect(l.order?.type === 'attack' && l.order.targetId).toBe(mage.id);
    const evs = run(w, 30 * 5);
    const first = evs.find((e) => e.type === 'hit' && e.sourceId === l.id);
    expect(first && first.type === 'hit' && first.targetId).toBe(mage.id);
    expect(l.stealthTime).toBe(0);
    expect(w.canTarget(war, l)).toBe(true);
    expect(dist(l.pos, mage.pos)).toBeLessThan(2);
  });

  it('新職業與新敵人的資料都齊全', () => {
    for (const id of ['berserker', 'rogue', 'hexer', 'alchemist']) expect(HEROES[id].team).toBe('hero');
    for (const id of ['siege', 'bomber', 'lurker']) expect(ENEMIES[id].team).toBe('enemy');
  });
});

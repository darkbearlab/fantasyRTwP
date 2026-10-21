import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/run/battle';
import { applyStun, interrupt, knockbackFrom, strike } from '../src/sim/actions';
import { DT } from '../src/sim/constants';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import type { MapDef } from '../src/sim/data/types';
import { World } from '../src/sim/world';

const OPEN: MapDef = { id: 't', name: 't', width: 40, height: 16, obstacles: [], heroSpawns: [], enemySpawns: [] };
const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };

function setup(heroes: { id: string; x: number; y?: number }[], cx = 20, map: MapDef = OPEN) {
  const w = new World({
    seed: 3,
    map,
    spawns: [
      ...heroes.map((h) => ({ defId: h.id, def: { ...HEROES[h.id], skills: [] }, pos: { x: h.x, y: h.y ?? 8 } })),
      { defId: 'champion', def: enemyDef('champion', 1), pos: { x: cx, y: 8 }, squad: 'c' },
    ],
    config: DELIB,
  });
  return { w, heroes: w.units.slice(0, heroes.length), c: w.units[heroes.length] };
}
const windup = (w: World, c: { action: unknown; id: number }) =>
  (c.action = { kind: 'skill', skillId: 'sentinelSweep', point: { x: 0, y: 8 }, phase: 'windup', ticksLeft: 30, ticksTotal: 30 } as never);

describe('魔王的冠軍（Alan 2026-10-22）', () => {
  it('只有盾擊、瞄準射擊打得斷；普攻（聖鎚）、爆擊的打斷都無效', () => {
    const { w, heroes, c } = setup([{ id: 'cleric', x: 19 }]);
    windup(w, c);
    expect(interrupt(w, heroes[0], c)).toBe(false);
    expect(interrupt(w, heroes[0], c, 'holySmite')).toBe(false);
    expect(c.action).not.toBeNull();
    expect(interrupt(w, heroes[0], c, 'shieldBash')).toBe(true);
    windup(w, c);
    expect(interrupt(w, heroes[0], c, 'sureShot')).toBe(true);
  });

  it('不會被擊退；一般的暈眩無效', () => {
    const { w, heroes, c } = setup([{ id: 'warrior', x: 19 }]);
    const p = { ...c.pos };
    expect(knockbackFrom(w, heroes[0], heroes[0].pos, c, 3)).toBe(false);
    expect(c.pos).toEqual(p);
    strike(w, heroes[0], c, { melee: true, damageType: 'melee', mult: 0.1, accBonus: 1000, knockback: 2 });
    expect(c.pos).toEqual(p);
    applyStun(w, c, 2);
    expect(c.stunTime).toBe(0);
  });

  it('沒有普攻：只用有預兆的招式', () => {
    const { w, heroes, c } = setup([{ id: 'warrior', x: 17 }, { id: 'ranger', x: 12 }, { id: 'mage', x: 10 }]);
    for (const e of w.units) if (e.team === 'enemy') e.alerted = true;
    const used: string[] = [];
    for (let t = 0; t < 30 / DT; t++) {
      for (const ev of w.step()) if (ev.type === 'actionStart' && ev.unitId === c.id) used.push(ev.skillId ?? 'BASIC');
      for (const h of heroes) h.hp = h.maxHp;
    }
    expect(used.length).toBeGreaterThan(3);
    expect(used).not.toContain('BASIC');
    expect(new Set(used).size).toBeGreaterThan(1);
  });

  it('馬匹震地：周圍的英雄受傷並被擊退', () => {
    const { w, heroes, c } = setup([{ id: 'warrior', x: 19 }, { id: 'cleric', x: 21 }]);
    c.def.skills.splice(0, c.def.skills.length, 'sentinelStomp');
    // 英雄站著不動（只看擊退）
    for (const h of heroes) h.stunTime = 99;
    w.issueOrder(c, { type: 'skill', skillId: 'sentinelStomp' });
    for (let t = 0; t < 3 / DT; t++) w.step();
    expect(heroes[0].hp).toBeLessThan(heroes[0].maxHp);
    expect(Math.abs(heroes[0].pos.x - c.pos.x)).toBeGreaterThan(2);
  });

  it('衝鋒撞牆會暈眩', () => {
    const wall: MapDef = { ...OPEN, obstacles: [{ x: 24, y: 0, w: 2, h: 16 }] };
    const { w, c } = setup([{ id: 'warrior', x: 5 }], 20, wall);
    // 目標點在射程內（衝鋒距離固定 9 m，途中撞到 x = 24 的牆）
    w.issueOrder(c, { type: 'skill', skillId: 'sentinelRush', point: { x: 23.5, y: 8 } });
    let stunned = false;
    for (let t = 0; t < 4 / DT && !stunned; t++) {
      w.step();
      stunned = c.stunTime > 0;
    }
    expect(stunned).toBe(true);
  });

  it('橫掃衝鋒：衝鋒路徑右側的帶狀區域也有傷害', () => {
    // 往 +x 衝：右側＝ -y 方向
    const { w, heroes, c } = setup([{ id: 'warrior', x: 25, y: 6 }], 20);
    w.issueOrder(c, { type: 'skill', skillId: 'sentinelSweepRush', point: { x: 30, y: 8 } });
    for (let t = 0; t < 4 / DT; t++) w.step();
    expect(heroes[0].hp).toBeLessThan(heroes[0].maxHp);
  });
});

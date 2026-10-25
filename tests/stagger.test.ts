import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/run/battle';
import { addStagger, interrupt } from '../src/sim/actions';
import { DT } from '../src/sim/constants';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { STAGGER, staggerStunOf } from '../src/sim/data/stagger';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { World } from '../src/sim/world';

const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };
const MAP = { id: 't', name: 't', width: 30, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };

/** 一名戰士與一名遠處的盾兵（不會互打） */
function setup(config = DELIB) {
  const w = new World({
    seed: 1,
    map: MAP,
    spawns: [
      { defId: 'warrior', def: { ...HEROES.warrior, skills: [] }, pos: { x: 3, y: 6 } },
      { defId: 'shieldbearer', def: { ...enemyDef('shieldbearer', 1), ai: 'nest' }, pos: { x: 26, y: 6 }, squad: 's' },
    ],
    config,
  });
  const [h, e] = w.units;
  return { w, h, e };
}

function run(w: World, seconds: number) {
  for (let t = 0; t < seconds / DT; t++) w.step();
}

describe('失衡值（SPEC_STAGGER）', () => {
  it('累積到上限就暈眩這個單位固定的秒數、歸零；暈眩中不累積', () => {
    const { w, e } = setup();
    expect(e.poise).toBe(Math.round(e.maxHp * STAGGER.hpRatio));
    addStagger(w, e, e.poise - 1);
    expect(e.stunTime).toBe(0);
    addStagger(w, e, 1);
    expect(e.stagger).toBe(0);
    expect(e.stunTime).toBeCloseTo(staggerStunOf(e.def));
    addStagger(w, e, 5);
    expect(e.stagger).toBe(0);
  });

  it('暈眩恢復後，和暈眩一樣長的時間內累積減半，之後恢復', () => {
    const { w, e } = setup();
    const stun = staggerStunOf(e.def);
    addStagger(w, e, e.poise);
    run(w, stun + 0.1);
    expect(e.stunTime).toBe(0);
    addStagger(w, e, 4);
    expect(e.stagger).toBeCloseTo(2);
    run(w, stun);
    const before = e.stagger;
    addStagger(w, e, 4);
    expect(e.stagger - before).toBeCloseTo(4);
  });

  it('交戰中不消退，脫離交戰後退掉', () => {
    const { w, h } = setup();
    // 戰鬥狀態由 world 自己算：強制成戰鬥中再看
    addStagger(w, h, 10);
    w.inCombat = true;
    for (let t = 0; t < 2 / DT; t++) {
      w.inCombat = true;
      w.step();
    }
    expect(h.stagger).toBeCloseTo(10);
    w.inCombat = false;
    run(w, STAGGER.decaySec + 0.1);
    expect(h.stagger).toBe(0);
  });

  it('沉穩節奏的打斷不附帶暈眩；舊模式照舊', () => {
    for (const [config, stunned] of [
      [DELIB, false],
      [DEFAULT_SIM_CONFIG, true],
    ] as const) {
      const { w, h, e } = setup(config);
      e.action = { kind: 'attack', phase: 'windup', ticksLeft: 30, ticksTotal: 30, targetId: h.id } as never;
      expect(interrupt(w, h, e)).toBe(true);
      expect(e.stunTime > 0).toBe(stunned);
    }
  });

  it('舊模式不累積失衡', () => {
    const { w, e } = setup(DEFAULT_SIM_CONFIG);
    addStagger(w, e, 999);
    expect(e.stagger).toBe(0);
    expect(e.stunTime).toBe(0);
  });

  it('普攻命中會累積；堅定減少', () => {
    const { w, h, e } = setup();
    e.pos = { x: 4.2, y: 6 };
    e.alerted = true;
    for (let t = 0; t < 6 / DT && e.stagger === 0 && e.stunTime === 0; t++) {
      if (t % 10 === 0) w.enqueue({ type: 'attack', unitIds: [h.id], targetId: e.id });
      w.step();
    }
    expect(e.stagger > 0 || e.stunTime > 0).toBe(true);
    const s = setup();
    Object.assign(s.h.def, { interruptStunImmune: true });
    addStagger(s.w, s.h, 10);
    expect(s.h.stagger).toBeCloseTo(10 * STAGGER.steadfastMult);
  });
});

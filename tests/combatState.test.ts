/** 戰鬥中／非戰鬥中與換裝備（SPEC_SLICE7 §2） */
import { describe, expect, it } from 'vitest';
import { strike } from '../src/sim/actions';
import { COMBAT_STATE } from '../src/sim/data/deliberate';
import { DT } from '../src/sim/constants';
import { HEROES } from '../src/sim/data/heroes';
import { ENEMIES } from '../src/sim/data/enemies';
import { ITEMS } from '../src/sim/data/items';
import type { MapDef } from '../src/sim/data/types';
import { HOLD, PASSIVE, makeWorld, run } from './helpers';

const WIDE: MapDef = { id: 'test-wide', name: '測試', width: 60, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };
const secs = (s: number) => Math.ceil(s / DT);

/** 英雄在左邊，一名不會動的木樁敵人在 x 處 */
function setup(x: number, items: string[] = []) {
  const w = makeWorld(
    [
      { defId: 'warrior', def: { ...HEROES.warrior, accuracy: 999 }, pos: { x: 5, y: 6 }, items },
      { defId: 'brute', def: { ...ENEMIES.brute, maxHp: 1000 }, pos: { x, y: 6 } },
      // 遠處另一名沒警覺的敵人：第一名倒下後戰鬥不會結束
      { defId: 'brute', def: ENEMIES.brute, pos: { x: 58, y: 1 } },
    ],
    { ...PASSIVE, battleStyle: 'deliberate' },
    WIDE,
    1,
    HOLD,
  );
  const h = w.heroes()[0];
  const e = w.units.find((u) => u.team === 'enemy')!;
  return { w, h, e };
}

describe('戰鬥中／非戰鬥中', () => {
  it('沒有警覺的敵人：非戰鬥中', () => {
    const { w } = setup(8);
    run(w, secs(1));
    expect(w.inCombat).toBe(false);
  });

  it('警覺的敵人在附近：戰鬥中；遠處的不算', () => {
    const near = setup(5 + COMBAT_STATE.engageRange - 2);
    near.e.alerted = true;
    const ev = run(near.w, secs(0.5));
    expect(near.w.inCombat).toBe(true);
    expect(ev).toContainEqual({ type: 'combatState', inCombat: true });
    const far = setup(5 + COMBAT_STATE.engageRange + 10);
    far.e.alerted = true;
    run(far.w, secs(0.5));
    expect(far.w.inCombat).toBe(false);
  });

  it('打中敵人就算戰鬥中；敵人倒下後過一段時間才脫離戰鬥', () => {
    const { w, h, e } = setup(5 + COMBAT_STATE.engageRange + 10);
    strike(w, h, e, { melee: true, mult: 1, damageType: 'melee', basic: true });
    run(w, secs(0.2));
    expect(w.inCombat).toBe(true);
    e.hp = 0;
    e.dead = true;
    run(w, secs(COMBAT_STATE.exitDelay - 1));
    expect(w.inCombat).toBe(true);
    const ev = run(w, secs(2));
    expect(w.inCombat).toBe(false);
    expect(ev).toContainEqual({ type: 'combatState', inCombat: false });
  });
});

describe('換裝備', () => {
  it('非戰鬥中可以換：舊道具的被動與數值拿掉，新的加上', () => {
    const { w, h } = setup(40, ['thornMail']);
    expect(h.passives.some((p) => p.id === ITEMS.thornMail.passive.id)).toBe(true);
    const armor = h.mods.armor;
    w.enqueue({ type: 'setItems', heroSlot: h.heroSlot, items: ['metronome'] });
    run(w, 1);
    expect(h.items).toEqual(['metronome']);
    expect(h.passives.some((p) => p.id === ITEMS.thornMail.passive.id)).toBe(false);
    expect(h.passives.some((p) => p.id === ITEMS.metronome.passive.id)).toBe(true);
    expect(h.mods.armor).toBe(armor - (ITEMS.thornMail.passive.mods?.armor ?? 0));
  });

  it('戰鬥中換裝備被忽略', () => {
    const { w, h, e } = setup(8, ['thornMail']);
    e.alerted = true;
    run(w, secs(0.5));
    expect(w.inCombat).toBe(true);
    w.enqueue({ type: 'setItems', heroSlot: h.heroSlot, items: [] });
    run(w, 1);
    expect(h.items).toEqual(['thornMail']);
  });
});

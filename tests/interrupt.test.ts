import { describe, expect, it } from 'vitest';
import { INTERRUPT_STUN, strike } from '../src/sim/actions';
import { HEROES } from '../src/sim/data/heroes';
import { ENEMIES } from '../src/sim/data/enemies';
import { World } from '../src/sim/world';
import { UnitState } from '../src/sim/unit';
import { OPEN_MAP, PASSIVE, makeWorld, run } from './helpers';

describe('打斷（SPEC §5.3）', () => {
  it('準備中被 interrupts 命中 → 動作取消、不進冷卻、進入暈眩', () => {
    const w = makeWorld([
      { defId: 'mage', pos: { x: 3, y: 5 } },
      { defId: 'caster', pos: { x: 10, y: 5 } },
    ]);
    const [mage, caster] = w.units;
    w.enqueue({ type: 'skill', unitId: caster.id, skillId: 'hellfire', point: { x: 3, y: 5 } });
    run(w, 5);
    expect(caster.state).toBe(UnitState.Windup);
    strike(w, mage, caster, { melee: false, damageType: 'spell', mult: 1, flatDamage: [8, 12], interrupts: true, accBonus: 1000 });
    expect(caster.action).toBeNull();
    expect(caster.stunTime).toBeCloseTo(INTERRUPT_STUN);
    expect(caster.cooldowns.hellfire ?? 0).toBe(0);
    w.step();
    expect(caster.state).toBe(UnitState.Stunned);
  });

  it('用技能指令打斷術士的範圍法術（完整流程）', () => {
    const sharpMage = { ...HEROES.mage, accuracy: 999 };
    const w = new World({
      seed: 7,
      map: OPEN_MAP,
      config: PASSIVE,
      defs: { mage: sharpMage, caster: ENEMIES.caster },
      spawns: [
        { defId: 'mage', pos: { x: 3, y: 5 } },
        { defId: 'caster', pos: { x: 10, y: 5 } },
      ],
    });
    const [mage, caster] = w.units;
    w.enqueue({ type: 'skill', unitId: caster.id, skillId: 'hellfire', point: { x: 3, y: 5 } });
    run(w, 2);
    w.enqueue({ type: 'skill', unitId: mage.id, skillId: 'arcaneMissile', targetId: caster.id });
    const evs = run(w, 40);
    const intr = evs.find((e) => e.type === 'interrupt');
    expect(intr).toMatchObject({ sourceId: mage.id, targetId: caster.id, skillId: 'hellfire' });
    expect(evs.some((e) => e.type === 'aoe' && e.skillId === 'hellfire')).toBe(false);
    expect(caster.cooldowns.hellfire ?? 0).toBe(0);
  });

  it('不在準備中的單位不會被打斷', () => {
    const w = makeWorld([
      { defId: 'mage', pos: { x: 3, y: 5 } },
      { defId: 'brute', pos: { x: 10, y: 5 } },
    ]);
    const [mage, brute] = w.units;
    strike(w, mage, brute, { melee: false, damageType: 'projectile', mult: 1, interrupts: true, accBonus: 1000 });
    expect(brute.stunTime).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { secondsToTicks } from '../src/sim/constants';
import { HEROES } from '../src/sim/data/heroes';
import { makeWorld } from './helpers';

function effectTicks(config: object): number {
  const w = makeWorld([{ defId: 'warrior', pos: { x: 5, y: 5 } }, { defId: 'brute', pos: { x: 5.95, y: 5 } }], config);
  const [war, b] = w.units;
  w.enqueue({ type: 'attack', unitIds: [war.id], targetId: b.id });
  let start = -1;
  for (let i = 0; i < 120; i++) {
    const t = w.tick;
    for (const e of w.step()) {
      if (e.type === 'actionStart' && e.unitId === war.id && start < 0) start = t;
      if ((e.type === 'hit' || e.type === 'miss') && e.sourceId === war.id) return t - start;
    }
  }
  return -1;
}

describe('節奏倍率（simConfig）', () => {
  it('actionSpeedMult < 1：準備時間變長', () => {
    expect(effectTicks({ actionSpeedMult: 1 })).toBe(secondsToTicks(HEROES.warrior.windup));
    expect(effectTicks({ actionSpeedMult: 0.85 })).toBe(secondsToTicks(HEROES.warrior.windup / 0.85));
  });

  it('heroDamageMult：只放大我方傷害', () => {
    const total = (mult: number, attacker: 'warrior' | 'brute') => {
      let sum = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const w = makeWorld(
          [
            { defId: attacker === 'warrior' ? 'warrior' : 'cleric', pos: { x: 5, y: 5 } },
            { defId: 'brute', pos: { x: 5.95, y: 5 } },
          ],
          { heroDamageMult: mult },
          undefined,
          seed,
        );
        const [h, b] = w.units;
        const [src, dst] = attacker === 'warrior' ? [h, b] : [b, h];
        w.enqueue({ type: 'attack', unitIds: [src.id], targetId: dst.id });
        for (let i = 0; i < 90; i++) for (const e of w.step()) if (e.type === 'hit' && e.sourceId === src.id) sum += e.damage;
      }
      return sum;
    };
    expect(total(1.5, 'warrior')).toBeGreaterThan(total(1, 'warrior') * 1.2);
    expect(total(1.5, 'brute')).toBe(total(1, 'brute'));
  });
});

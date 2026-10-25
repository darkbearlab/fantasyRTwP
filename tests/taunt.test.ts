/** 嘲諷（Alan 2026-10-25）：同樣距離時優先打嘲諷的，不是範圍內就一定來打嘲諷的 */
import { describe, expect, it } from 'vitest';
import { pickTarget } from '../src/sim/ai/enemyAI';
import { ENEMIES, ENEMY_ALERT } from '../src/sim/data/enemies';
import { HEROES } from '../src/sim/data/heroes';
import { HOLD, PASSIVE, makeWorld } from './helpers';

/** 戰士（有嘲諷光環）和遊俠，敵人在 (10, 6)；ranger／warrior 是兩人離敵人的距離 */
function setup(warrior: number, ranger: number) {
  const w = makeWorld(
    [
      { defId: 'warrior', def: HEROES.warrior, pos: { x: 10 - warrior, y: 6 } },
      { defId: 'ranger', def: HEROES.ranger, pos: { x: 10 + ranger, y: 6 } },
      { defId: 'raider', def: ENEMIES.raider, pos: { x: 10, y: 6 } },
    ],
    { ...PASSIVE, battleStyle: 'deliberate' },
    undefined,
    1,
    HOLD,
  );
  const e = w.units.find((u) => u.team === 'enemy')!;
  return { w, e, heroes: w.heroes() };
}

describe('嘲諷', () => {
  it('嘲諷範圍內，但遊俠明顯比較近：打遊俠', () => {
    const { w, e, heroes } = setup(4.5, 1.5);
    expect(pickTarget(w, e, heroes).def.id).toBe('ranger');
  });

  it('差不多一樣近：優先打嘲諷的戰士', () => {
    const { w, e, heroes } = setup(2, 2);
    expect(pickTarget(w, e, heroes).def.id).toBe('warrior');
    const near = setup(2 + ENEMY_ALERT.tauntTie * 0.5, 2);
    expect(pickTarget(near.w, near.e, near.heroes).def.id).toBe('warrior');
  });
});

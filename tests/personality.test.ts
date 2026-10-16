import { describe, expect, it } from 'vitest';
import { HEROES } from '../src/sim/data/heroes';
import { dist } from '../src/sim/math';
import { makeWorld, run } from './helpers';

describe('閒置性格', () => {
  it('預設：戰士、牧師好戰；遊俠、法師膽小', () => {
    expect(HEROES.warrior.personality ?? 'aggressive').toBe('aggressive');
    expect(HEROES.cleric.personality ?? 'aggressive').toBe('aggressive');
    expect(HEROES.ranger.personality).toBe('cowardly');
    expect(HEROES.mage.personality).toBe('cowardly');
  });

  it('好戰：敵人靠近就自動普攻', () => {
    const w = makeWorld([{ defId: 'ranger', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 10, y: 6 } }]);
    const [r] = w.units;
    w.enqueue({ type: 'setPersonality', unitId: r.id, personality: 'aggressive' });
    const evs = run(w, 60);
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === r.id)).toBe(true);
  });

  it('膽小：不自動攻擊，敵人靠近就往反方向逃跑', () => {
    const w = makeWorld([{ defId: 'mage', pos: { x: 8, y: 6 } }, { defId: 'brute', pos: { x: 11, y: 6 } }]);
    const [m, b] = w.units;
    const d0 = dist(m.pos, b.pos);
    const evs = run(w, 60);
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === m.id)).toBe(false);
    expect(dist(m.pos, b.pos)).toBeGreaterThan(d0 + 2);
    expect(m.pos.x).toBeLessThan(8); // 往遠離敵人的方向
  });

  it('膽小：敵人在逃跑距離外時原地不動', () => {
    const w = makeWorld([{ defId: 'mage', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 15, y: 6 } }]);
    const [m] = w.units;
    run(w, 60);
    expect(dist(m.pos, { x: 3, y: 6 })).toBeLessThan(0.01);
  });

  it('膽小：玩家下攻擊指令就原地接戰，不會逃', () => {
    const w = makeWorld([{ defId: 'mage', pos: { x: 8, y: 6 } }, { defId: 'brute', pos: { x: 11, y: 6 } }]);
    const [m, b] = w.units;
    w.enqueue({ type: 'attack', unitIds: [m.id], targetId: b.id });
    const evs = run(w, 60);
    expect(evs.some((e) => (e.type === 'hit' || e.type === 'miss') && e.sourceId === m.id)).toBe(true);
    expect(dist(m.pos, { x: 8, y: 6 })).toBeLessThan(0.3);
  });

  it('膽小：被牽制時不會一直嘗試逃跑（不洗「被牽制」）', () => {
    const w = makeWorld([{ defId: 'mage', pos: { x: 6.2, y: 6 } }, { defId: 'brute', pos: { x: 5, y: 6 } }]);
    const evs = run(w, 60);
    expect(evs.filter((e) => e.type === 'pinned').length).toBeLessThanOrEqual(1);
  });
});

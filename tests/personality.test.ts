import { describe, expect, it } from 'vitest';
import { HEROES } from '../src/sim/data/heroes';
import { dist } from '../src/sim/math';
import { makeWorld, run } from './helpers';

describe('閒置性格', () => {
  it('預設：戰士、牧師堅守；遊俠、法師游擊；好戰目前沒人用', () => {
    expect(HEROES.warrior.personality ?? 'steadfast').toBe('steadfast');
    expect(HEROES.cleric.personality ?? 'steadfast').toBe('steadfast');
    expect(HEROES.ranger.personality).toBe('guerrilla');
    expect(HEROES.mage.personality).toBe('guerrilla');
  });

  it('堅守：射程內的敵人自動普攻', () => {
    const w = makeWorld([{ defId: 'ranger', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 10, y: 6 } }]);
    const [r] = w.units;
    w.enqueue({ type: 'setPersonality', unitId: r.id, personality: 'steadfast' });
    const evs = run(w, 60);
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === r.id)).toBe(true);
  });

  it('好戰：看到一定距離內的敵人就衝出去打，無視駐守點', () => {
    // 戰士駐守在 (3,6)，蠻兵在 9 m 外（超過堅守的 6 m，但在好戰的 10 m 內）
    const w = makeWorld([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 12.85, y: 6 } }]);
    const [war, b] = w.units;
    w.enqueue({ type: 'move', unitIds: [war.id], point: { x: 3, y: 6 } });
    w.enqueue({ type: 'setPersonality', unitId: war.id, personality: 'aggressive' });
    run(w, 30 * 5);
    expect(dist(war.pos, b.pos)).toBeLessThan(1.3);
  });

  it('好戰：會一路追擊逃跑的目標', () => {
    // 關閉控制區，否則弓手會被戰士牽制住跑不掉
    const w = makeWorld([{ defId: 'warrior', pos: { x: 3, y: 6 } }, { defId: 'archer', pos: { x: 6, y: 6 } }], { zocMode: 'off' });
    const [war, a] = w.units;
    w.enqueue({ type: 'setPersonality', unitId: war.id, personality: 'aggressive' });
    run(w, 30);
    for (let i = 0; i < 30 * 4; i++) {
      // 弓手比戰士慢不了多少，一直往右跑
      if (a.order?.type !== 'move') w.enqueue({ type: 'move', unitIds: [a.id], point: { x: 19, y: 6 } });
      w.step();
    }
    expect(war.order).toMatchObject({ type: 'attack', targetId: a.id });
    expect(war.pos.x).toBeGreaterThan(12);
  });

  it('堅守：同樣情況不會追出 6 m', () => {
    const w = makeWorld([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 12.85, y: 6 } }]);
    const [war] = w.units;
    run(w, 30 * 3);
    expect(dist(war.pos, { x: 2, y: 6 })).toBeLessThan(0.01);
  });

  it('游擊：不自動攻擊，敵人靠近就往反方向逃跑', () => {
    const w = makeWorld([{ defId: 'mage', pos: { x: 8, y: 6 } }, { defId: 'brute', pos: { x: 11, y: 6 } }]);
    const [m, b] = w.units;
    const d0 = dist(m.pos, b.pos);
    const evs = run(w, 60);
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === m.id)).toBe(false);
    expect(dist(m.pos, b.pos)).toBeGreaterThan(d0 + 2);
    expect(m.pos.x).toBeLessThan(8);
  });

  it('游擊：敵人在逃跑距離外時原地不動', () => {
    const w = makeWorld([{ defId: 'mage', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 15, y: 6 } }]);
    const [m] = w.units;
    run(w, 60);
    expect(dist(m.pos, { x: 3, y: 6 })).toBeLessThan(0.01);
  });

  it('游擊：玩家下攻擊指令就原地接戰，不會逃', () => {
    const w = makeWorld([{ defId: 'mage', pos: { x: 8, y: 6 } }, { defId: 'brute', pos: { x: 11, y: 6 } }]);
    const [m, b] = w.units;
    w.enqueue({ type: 'attack', unitIds: [m.id], targetId: b.id });
    const evs = run(w, 60);
    expect(evs.some((e) => (e.type === 'hit' || e.type === 'miss') && e.sourceId === m.id)).toBe(true);
    expect(dist(m.pos, { x: 8, y: 6 })).toBeLessThan(0.3);
  });

  it('游擊：被牽制時不會一直嘗試逃跑（不洗「被牽制」）', () => {
    const w = makeWorld([{ defId: 'mage', pos: { x: 6.2, y: 6 } }, { defId: 'brute', pos: { x: 5, y: 6 } }]);
    const evs = run(w, 60);
    expect(evs.filter((e) => e.type === 'pinned').length).toBeLessThanOrEqual(1);
  });
});

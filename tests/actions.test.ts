import { describe, expect, it } from 'vitest';
import { secondsToTicks } from '../src/sim/constants';
import { HEROES } from '../src/sim/data/heroes';
import { UnitState } from '../src/sim/unit';
import { makeWorld, run } from './helpers';

describe('動作時序（SPEC §5）', () => {
  it('普攻在 windup 結束的那一個節拍生效', () => {
    const w = makeWorld([
      { defId: 'warrior', pos: { x: 5, y: 5 } },
      { defId: 'brute', pos: { x: 5.95, y: 5 } },
    ]);
    const [war, brute] = w.units;
    w.enqueue({ type: 'attack', unitIds: [war.id], targetId: brute.id });
    let startTick = -1;
    let effectTick = -1;
    for (let i = 0; i < 60 && effectTick < 0; i++) {
      const tick = w.tick;
      for (const e of w.step()) {
        if (e.type === 'actionStart' && e.unitId === war.id && startTick < 0) startTick = tick;
        if ((e.type === 'hit' || e.type === 'miss') && e.sourceId === war.id) effectTick = tick;
      }
    }
    expect(startTick).toBeGreaterThanOrEqual(0);
    expect(effectTick - startTick).toBe(secondsToTicks(HEROES.warrior.windup));
    expect(war.state).toBe(UnitState.Recovery);
  });

  it('恢復期間不能移動、不能開始新動作；指令在恢復結束後才執行', () => {
    const w = makeWorld([
      { defId: 'warrior', pos: { x: 5, y: 5 } },
      { defId: 'brute', pos: { x: 5.95, y: 5 } },
    ]);
    const [war, brute] = w.units;
    w.enqueue({ type: 'attack', unitIds: [war.id], targetId: brute.id });
    while (war.state !== UnitState.Recovery) w.step();
    const pos = { ...war.pos };
    w.enqueue({ type: 'move', unitIds: [war.id], point: { x: 1, y: 5 } });
    const recTicks = war.action!.ticksLeft;
    for (let i = 0; i < recTicks - 1; i++) {
      w.step();
      expect(war.state).toBe(UnitState.Recovery);
      expect(war.pos.x).toBeCloseTo(pos.x, 6);
    }
    run(w, 3);
    expect(war.order?.type).toBe('move');
    expect(war.pos.x).toBeLessThan(pos.x);
  });

  it('準備期間下新指令：立即取消準備', () => {
    const w = makeWorld([
      { defId: 'warrior', pos: { x: 5, y: 5 } },
      { defId: 'brute', pos: { x: 5.95, y: 5 } },
    ]);
    const [war, brute] = w.units;
    w.enqueue({ type: 'attack', unitIds: [war.id], targetId: brute.id });
    run(w, 3);
    expect(war.state).toBe(UnitState.Windup);
    w.enqueue({ type: 'move', unitIds: [war.id], point: { x: 1, y: 5 } });
    const evs = run(w, 20);
    expect(evs.some((e) => (e.type === 'hit' || e.type === 'miss') && e.sourceId === war.id)).toBe(false);
    expect(war.pos.x).toBeLessThan(5);
  });

  it('技能冷卻從生效那一刻開始計算', () => {
    const w = makeWorld([
      { defId: 'cleric', pos: { x: 5, y: 5 } },
      { defId: 'brute', pos: { x: 15, y: 5 } },
    ]);
    const [cleric] = w.units;
    w.enqueue({ type: 'skill', unitId: cleric.id, skillId: 'bless' });
    run(w, 2);
    expect(cleric.state).toBe(UnitState.Windup);
    expect(cleric.cooldowns.bless ?? 0).toBe(0);
    run(w, secondsToTicks(0.6));
    expect(cleric.cooldowns.bless).toBeGreaterThan(19.9);
    expect(cleric.blessTime).toBeGreaterThan(9.9);
  });
});

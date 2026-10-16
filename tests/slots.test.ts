import { describe, expect, it } from 'vitest';
import { SlotManager, slotPositions } from '../src/sim/nav/slots';
import { makeWorld, run } from './helpers';

describe('近戰攻擊站位（SPEC §8-6）', () => {
  it('站位距離 = 雙方半徑和 + 0.1', () => {
    for (const p of slotPositions({ x: 0, y: 0 }, 0.4, 0.45)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(0.95);
  });

  it('SlotManager：同一目標的攻擊者拿到不同站位', () => {
    const m = new SlotManager();
    const got = [1, 2, 3, 4].map((id) => m.claim(99, { x: 5, y: 5 }, 0.4, id, { x: 0, y: 5 }, 0.4, () => true).index);
    expect(new Set(got).size).toBe(4);
  });

  it('4 名近戰圍攻同一目標時，各自佔用不同站位', () => {
    const w = makeWorld([
      { defId: 'warrior', pos: { x: 10, y: 6 } },
      { defId: 'brute', pos: { x: 4, y: 3 } },
      { defId: 'brute', pos: { x: 4, y: 9 } },
      { defId: 'brute', pos: { x: 16, y: 3 } },
      { defId: 'brute', pos: { x: 16, y: 9 } },
    ]);
    const [war, ...brutes] = w.units;
    w.enqueue({ type: 'move', unitIds: [war.id], point: { ...war.pos } });
    w.enqueue({ type: 'attack', unitIds: brutes.map((b) => b.id), targetId: war.id });
    run(w, 30 * 4);
    const slots = brutes.map((b) => w.slots.slotOf(b.id));
    for (const s of slots) expect(s?.[0]).toBe(war.id);
    expect(new Set(slots.map((s) => s![1])).size).toBe(4);
    // 都已經貼身開始攻擊
    for (const b of brutes) expect(Math.hypot(b.pos.x - war.pos.x, b.pos.y - war.pos.y)).toBeLessThan(0.85 + 0.45);
  });
});

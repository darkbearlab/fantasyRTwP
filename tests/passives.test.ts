import { describe, expect, it } from 'vitest';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { CLASS_PASSIVES, PASSIVES } from '../src/sim/data/passives';
import type { PassiveDef } from '../src/sim/data/passives';
import { addZone } from '../src/sim/zones';
import { HOLD, makeWorld, run } from './helpers';

const D = deliberateConfig();

describe('被動框架（SPEC_SLICE5 §14）', () => {
  it('沉穩節奏的英雄帶職業被動；其他模式沒有', () => {
    const w = makeWorld([{ defId: 'warrior', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 18, y: 6 } }], D);
    expect(w.getUnit(1)!.passives.map((p) => p.id)).toEqual(CLASS_PASSIVES.warrior);
    const t = makeWorld([{ defId: 'warrior', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 18, y: 6 } }]);
    expect(t.getUnit(1)!.passives).toEqual([]);
  });

  it('數值修正：命中、防禦、護甲、傷害、移動速度、射程', () => {
    const w = makeWorld([{ defId: 'ranger', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 18, y: 6 } }], D);
    const u = w.getUnit(1)!;
    const before = { acc: u.accuracy, def: u.defense, armor: u.armor, dmg: u.outgoingDamageMult, range: w.attackRange(u), move: w.moveMultFor(u) };
    const item: PassiveDef = { id: 'testItem', name: '測試', description: '', source: 'item', mods: { accuracy: 5, defense: 4, armor: 1, damagePct: 0.2, moveSpeedPct: 0.15, range: 1 } };
    u.addPassive(item);
    u.addPassive(item); // 同一個被動不重複
    expect(u.accuracy).toBe(before.acc + 5);
    expect(u.defense).toBe(before.def + 4);
    expect(u.armor).toBe(before.armor + 1);
    expect(u.outgoingDamageMult).toBeCloseTo(before.dmg * 1.2);
    expect(w.attackRange(u)).toBeCloseTo(before.range + 1);
    expect(w.moveMultFor(u)).toBeCloseTo(before.move * 1.15);
  });

  it('戰士橫掃：普攻同時打到前方扇形內的兩名敵人', () => {
    const w = makeWorld([{ defId: 'warrior', pos: { x: 5, y: 6 } }, { defId: 'brute', pos: { x: 6.1, y: 5.6 } }, { defId: 'brute', pos: { x: 6.1, y: 6.4 } }], { ...D, enemyAggroRange: 0 }, undefined, 2);
    w.enqueue({ type: 'attackMove', unitIds: [1], point: { x: 6.1, y: 5.6 } });
    const evs = run(w, 10 * 30);
    const hitTargets = new Set(evs.filter((e) => e.type === 'hit' && e.sourceId === 1).map((e) => (e as { targetId: number }).targetId));
    expect(hitTargets.has(2) && hitTargets.has(3)).toBe(true);
  });

  it('嘲諷光環：光環內的敵人改打戰士，不打旁邊的牧師', () => {
    // 蠻兵站在牧師旁邊（更近），但也在戰士 3 m 嘲諷光環內
    const w = makeWorld(
      [{ defId: 'warrior', pos: { x: 8, y: 6 } }, { defId: 'cleric', pos: { x: 11.5, y: 6 } }, { defId: 'brute', pos: { x: 10.6, y: 6 } }],
      { ...D, enemyAggroRange: 30, enemyAggroTime: 0 },
      undefined,
      1,
      HOLD,
    );
    const evs = run(w, 6 * 30);
    const targets = evs.filter((e) => e.type === 'actionStart' && e.unitId === 3).map((e) => (e as { targetId?: number }).targetId);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t === 1)).toBe(true);
  });

  it('普攻命中效果：每第 N 擊暈眩', () => {
    const w = makeWorld([{ defId: 'warrior', pos: { x: 5, y: 6 } }, { defId: 'brute', pos: { x: 6.1, y: 6 } }], { ...D, enemyAggroRange: 0 }, undefined, 3);
    w.getUnit(1)!.addPassive({ id: 'ironShield', name: '鐵盾', description: '', source: 'item', onHit: [{ kind: 'stun', duration: 0.5, every: 2 }] });
    w.enqueue({ type: 'attackMove', unitIds: [1], point: { x: 6.1, y: 6 } });
    const evs = run(w, 20 * 30);
    expect(evs.some((e) => e.type === 'notice' && e.unitId === 1 && e.text === '鐵盾')).toBe(true);
  });

  it('所有職業被動都有定義；每名職業最多一個普攻方式', () => {
    for (const [cls, ids] of Object.entries(CLASS_PASSIVES)) {
      for (const id of ids) expect(PASSIVES[id], `${cls}:${id}`).toBeDefined();
      expect(ids.filter((id) => PASSIVES[id].attack).length, cls).toBeLessThanOrEqual(1);
    }
  });
});

describe('持續地面效果（通用 helper）', () => {
  it('燃燒區：站在裡面的敵人持續燃燒；離開後燃燒自然結束', () => {
    const w = makeWorld([{ defId: 'alchemist', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 10, y: 6 } }], D);
    addZone(w, w.getUnit(1)!, { x: 10, y: 6 }, 2, { duration: 5, affects: 'enemy', effects: [{ kind: 'burn' }], style: 'fire' }, 'fireFlask');
    const evs = run(w, 4 * 30);
    expect(w.getUnit(2)!.burnTime).toBeGreaterThan(0);
    expect(evs.some((e) => e.type === 'hit' && e.targetId === 2)).toBe(true);
    run(w, 2 * 30);
    expect(w.zones.length).toBe(0);
  });

  it('每秒回復只影響友軍；每秒傷害只影響敵人；減速取最慢', () => {
    const w = makeWorld([{ defId: 'cleric', pos: { x: 5, y: 6 } }, { defId: 'warrior', pos: { x: 6, y: 6 } }, { defId: 'brute', pos: { x: 5.5, y: 7 } }], { ...D, enemyAggroRange: 0 }, undefined, 1, HOLD);
    const ally = w.getUnit(2)!;
    ally.hp = 50;
    const foe = w.getUnit(3)!;
    const foeHp = foe.hp;
    addZone(w, w.getUnit(1)!, { x: 5.5, y: 6.5 }, 3, { duration: 3, affects: 'ally', effects: [{ kind: 'heal', perSecond: 5 }] }, 'test');
    addZone(w, w.getUnit(1)!, { x: 5.5, y: 6.5 }, 3, { duration: 3, affects: 'enemy', effects: [{ kind: 'damage', perSecond: 4 }, { kind: 'slow', moveMult: 0.5 }] }, 'test');
    expect(w.moveMultFor(foe)).toBeCloseTo(Math.min(0.5, w.moveMultAt(foe.pos)));
    const evs = run(w, Math.round(3.05 * 30));
    // 回復只給友軍（每秒 5，共 3 次）；敵人不會被回復
    const heals = evs.filter((e) => e.type === 'heal') as { targetId: number; amount: number }[];
    expect(heals.filter((h) => h.targetId === ally.id).reduce((a, h) => a + h.amount, 0)).toBe(15);
    expect(heals.some((h) => h.targetId === foe.id)).toBe(false);
    // 傷害只給敵人（每秒 4，共 3 次）
    const zoneHits = evs.filter((e) => e.type === 'hit' && e.skillId === 'test') as { targetId: number; damage: number }[];
    expect(zoneHits.every((h) => h.targetId === foe.id)).toBe(true);
    expect(zoneHits.reduce((a, h) => a + h.damage, 0)).toBe(12);
    expect(foe.hp).toBeLessThanOrEqual(foeHp - 12);
  });
});

import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/sim/data/enemies';
import { HEROES } from '../src/sim/data/heroes';
import type { UnitDef } from '../src/sim/data/types';
import type { SimEvent } from '../src/sim/events';
import { dist } from '../src/sim/math';
import type { UnitSpawn } from '../src/sim/world';
import { World } from '../src/sim/world';
import { HOLD, OPEN_MAP, PASSIVE, run } from './helpers';

/** 必中版本的單位（避免命中判定干擾技能效果測試） */
const sure = (d: UnitDef): UnitDef => ({ ...d, accuracy: 999 });
const DEFS: Record<string, UnitDef> = {
  warrior: sure(HEROES.warrior),
  ranger: sure(HEROES.ranger),
  mage: sure(HEROES.mage),
  cleric: sure(HEROES.cleric),
  brute: sure(ENEMIES.brute),
};

function world(spawns: UnitSpawn[]): World {
  return new World({ seed: 3, map: OPEN_MAP, spawns, config: PASSIVE, defs: DEFS, idleBehavior: HOLD });
}

const hitBy = (evs: SimEvent[], skillId: string) => evs.filter((e) => e.type === 'hit' && e.skillId === skillId);

describe('英雄技能（SPEC §10.2）', () => {
  it('戰士 盾擊：傷害＋暈眩', () => {
    const w = world([{ defId: 'warrior', pos: { x: 5, y: 5 } }, { defId: 'brute', pos: { x: 5.95, y: 5 } }]);
    const [war, b] = w.units;
    w.enqueue({ type: 'skill', unitId: war.id, skillId: 'shieldBash', targetId: b.id });
    const evs = run(w, 15);
    expect(hitBy(evs, 'shieldBash')).toHaveLength(1);
    expect(b.stunTime).toBeGreaterThan(0.5);
    expect(war.cooldowns.shieldBash).toBeGreaterThan(7);
  });

  it('戰士 守護：友軍受到的近戰攻擊部分改由戰士承受', () => {
    const w = world([
      { defId: 'warrior', pos: { x: 5, y: 5 } },
      { defId: 'ranger', pos: { x: 7, y: 5 } },
      { defId: 'brute', pos: { x: 7.95, y: 5 } },
    ]);
    const [war, r, b] = w.units;
    w.enqueue({ type: 'skill', unitId: war.id, skillId: 'guard', targetId: r.id });
    run(w, 10);
    expect(r.guardTime).toBeGreaterThan(5);
    w.enqueue({ type: 'attack', unitIds: [b.id], targetId: r.id });
    const evs = run(w, 30 * 6);
    expect(evs.some((e) => e.type === 'guardRedirect' && e.guardId === war.id)).toBe(true);
    expect(war.stats.damageTaken).toBeGreaterThan(0);
  });

  it('戰士 衝鋒：衝到目標身邊並攻擊一次', () => {
    const w = world([{ defId: 'warrior', pos: { x: 2, y: 5 } }, { defId: 'brute', pos: { x: 11, y: 5 } }]);
    const [war, b] = w.units;
    w.enqueue({ type: 'skill', unitId: war.id, skillId: 'charge', targetId: b.id });
    const evs = run(w, 45);
    expect(hitBy(evs, 'charge')).toHaveLength(1);
    expect(dist(war.pos, b.pos)).toBeLessThan(1.3);
  });

  it('遊俠 瞄準射擊／震懾箭：遠程命中', () => {
    const w = world([{ defId: 'ranger', pos: { x: 2, y: 5 } }, { defId: 'brute', pos: { x: 10, y: 5 } }]);
    const [r, b] = w.units;
    w.enqueue({ type: 'skill', unitId: r.id, skillId: 'aimedShot', targetId: b.id });
    let evs = run(w, 90);
    expect(hitBy(evs, 'aimedShot')).toHaveLength(1);
    w.enqueue({ type: 'skill', unitId: r.id, skillId: 'stunArrow', targetId: b.id });
    evs = run(w, 60);
    expect(hitBy(evs, 'stunArrow')).toHaveLength(1);
  });

  it('遊俠 翻滾：快速位移到指定點', () => {
    // 場上要有敵人，否則戰鬥直接結束
    const w = world([{ defId: 'ranger', pos: { x: 2, y: 5 } }, { defId: 'brute', pos: { x: 18, y: 10 } }]);
    const [r] = w.units;
    w.enqueue({ type: 'skill', unitId: r.id, skillId: 'tumble', point: { x: 7, y: 5 } });
    run(w, 20); // 0.1 準備 + 5 m / 12 m/s ≈ 0.52 秒
    expect(dist(r.pos, { x: 7, y: 5 })).toBeLessThan(0.2);
  });

  it('法師 火球：範圍傷害，會傷到友軍', () => {
    const w = world([
      { defId: 'mage', pos: { x: 2, y: 5 } },
      { defId: 'warrior', pos: { x: 10, y: 5.8 } },
      { defId: 'brute', pos: { x: 10, y: 4.2 } },
    ]);
    const [m, war, b] = w.units;
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'fireball', point: { x: 10, y: 5 } });
    const evs = run(w, 30 * 3);
    expect(evs.some((e) => e.type === 'aoe' && e.skillId === 'fireball')).toBe(true);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(war.hp).toBeLessThan(war.maxHp);
  });

  it('法師 冰縛：定身（不能移動，可攻擊）', () => {
    const w = world([{ defId: 'mage', pos: { x: 2, y: 5 } }, { defId: 'brute', pos: { x: 8, y: 5 } }]);
    const [m, b] = w.units;
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'iceBind', targetId: b.id });
    run(w, 40);
    expect(b.rootTime).toBeGreaterThan(3);
    const p = { ...b.pos };
    w.enqueue({ type: 'move', unitIds: [b.id], point: { x: 15, y: 5 } });
    run(w, 30);
    expect(dist(b.pos, p)).toBeLessThan(0.01);
  });

  it('法師 奧術飛彈：固定 8–12 傷害', () => {
    const w = world([{ defId: 'mage', pos: { x: 2, y: 5 } }, { defId: 'brute', pos: { x: 8, y: 5 } }]);
    const [m, b] = w.units;
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'arcaneMissile', targetId: b.id });
    const evs = run(w, 30);
    const h = hitBy(evs, 'arcaneMissile');
    expect(h).toHaveLength(1);
    expect(b.maxHp - b.hp).toBeGreaterThan(0);
  });

  it('牧師 治療／祝福', () => {
    const w = world([
      { defId: 'cleric', pos: { x: 2, y: 5 } },
      { defId: 'ranger', pos: { x: 6, y: 5 } },
      { defId: 'brute', pos: { x: 18, y: 10 } },
    ]);
    const [c, r] = w.units;
    r.hp = 20; // 測試情境設定
    w.enqueue({ type: 'skill', unitId: c.id, skillId: 'heal', targetId: r.id });
    let evs = run(w, 40);
    expect(evs.some((e) => e.type === 'heal' && e.amount === 35)).toBe(true);
    expect(r.hp).toBe(55);
    // 恢復期間下的指令會在恢復結束後執行
    w.enqueue({ type: 'skill', unitId: c.id, skillId: 'bless' });
    evs = run(w, 60);
    expect(c.blessTime).toBeGreaterThan(9);
    expect(r.blessTime).toBeGreaterThan(9);
    expect(r.accuracy).toBe(DEFS.ranger.accuracy + 15);
    expect(r.defense).toBe(DEFS.ranger.defense + 10);
  });

  it('牧師 聖光震擊：擊退 2 m', () => {
    const w = world([{ defId: 'cleric', pos: { x: 5, y: 5 } }, { defId: 'brute', pos: { x: 5.95, y: 5 } }]);
    const [c, b] = w.units;
    w.enqueue({ type: 'skill', unitId: c.id, skillId: 'holySmite', targetId: b.id });
    const evs = run(w, 15);
    expect(hitBy(evs, 'holySmite')).toHaveLength(1);
    const kb = evs.find((e) => e.type === 'knockback' && e.unitId === b.id);
    expect(kb && kb.type === 'knockback' && dist(kb.from, kb.to)).toBeCloseTo(2, 5);
  });

  it('冷卻中再施放：不會生效', () => {
    const w = world([{ defId: 'mage', pos: { x: 2, y: 5 } }, { defId: 'brute', pos: { x: 8, y: 5 } }]);
    const [m, b] = w.units;
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'arcaneMissile', targetId: b.id });
    run(w, 30);
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'arcaneMissile', targetId: b.id });
    const evs = run(w, 30);
    expect(hitBy(evs, 'arcaneMissile')).toHaveLength(0);
    expect(evs.some((e) => e.type === 'notice' && e.text === '冷卻中')).toBe(true);
  });
});

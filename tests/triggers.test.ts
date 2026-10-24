/** 通用觸發框架（Alan 2026-10-24）：命中、爆擊、擊殺、被打、放技能、沒打中、閃避；條件與效果 */
import { describe, expect, it } from 'vitest';
import { strike } from '../src/sim/actions';
import type { PassiveDef } from '../src/sim/data/passives';
import type { TriggerDef } from '../src/sim/triggers';
import { DT } from '../src/sim/constants';
import { HEROES } from '../src/sim/data/heroes';
import { ENEMIES } from '../src/sim/data/enemies';
import type { Unit } from '../src/sim/unit';
import type { World } from '../src/sim/world';
import { HOLD, PASSIVE, makeWorld } from './helpers';

/** 一名必中的英雄打一名不會動的木樁 */
function setup(): { w: World; a: Unit; b: Unit; e: Unit } {
  const sure = { ...HEROES.warrior, accuracy: 999 };
  const w = makeWorld(
    [
      { defId: 'warrior', def: sure, pos: { x: 5, y: 5 } },
      { defId: 'ranger', def: { ...HEROES.ranger, accuracy: 999 }, pos: { x: 5, y: 7 } },
      { defId: 'brute', def: { ...ENEMIES.brute, maxHp: 1000, defense: 0, armor: 0 }, pos: { x: 6, y: 5 } },
    ],
    { ...PASSIVE, battleStyle: 'deliberate' },
    undefined,
    1,
    HOLD,
  );
  const [a, b] = w.heroes();
  const e = w.units.find((u) => u.team === 'enemy')!;
  return { w, a, b, e };
}

const passive = (id: string, triggers: TriggerDef[]): PassiveDef => ({ id, name: id, description: '', source: 'item', triggers });
const basicHit = (w: World, src: Unit, t: Unit) => strike(w, src, t, { melee: true, mult: 1, damageType: 'melee', basic: true });

describe('通用觸發', () => {
  // 必中時大多是高階爆擊、本身就會暈眩：用定身判斷有沒有觸發
  it('命中：每第 2 下普攻才觸發（定身）', () => {
    const { w, a, e } = setup();
    a.addPassive(passive('p', [{ on: 'hit', every: 2, effects: [{ kind: 'root', duration: 1 }] }]));
    basicHit(w, a, e);
    expect(e.rootTime).toBe(0);
    basicHit(w, a, e);
    expect(e.rootTime).toBeGreaterThan(0);
  });

  it('預設只算普攻；source: any 連技能命中也算', () => {
    const { w, a, e } = setup();
    a.addPassive(passive('basicOnly', [{ on: 'hit', effects: [{ kind: 'mark', vuln: 0.2, duration: 3 }] }]));
    strike(w, a, e, { melee: true, mult: 1, damageType: 'melee', skillId: 'shieldBash' });
    expect(e.markTime).toBe(0);
    a.addPassive(passive('any', [{ on: 'hit', source: 'any', effects: [{ kind: 'mark', vuln: 0.2, duration: 3 }] }]));
    strike(w, a, e, { melee: true, mult: 1, damageType: 'melee', skillId: 'shieldBash' });
    expect(e.markTime).toBeGreaterThan(0);
  });

  it('爆擊：疊增益（造成傷害每層 +%，有上限）', () => {
    const { w, a, e } = setup();
    a.addPassive(passive('p', [{ on: 'crit', effects: [{ kind: 'empower', damagePct: 0.1, duration: 5, maxStacks: 2 }] }]));
    const base = a.outgoingDamageMult;
    for (let i = 0; i < 3; i++) {
      a.critPending = true;
      basicHit(w, a, e);
    }
    expect(a.empowerStacks).toBe(2);
    expect(a.outgoingDamageMult).toBeCloseTo(base * 1.2);
  });

  it('擊殺：技能冷卻立刻轉好', () => {
    const { w, a, e } = setup();
    a.addPassive(passive('p', [{ on: 'kill', effects: [{ kind: 'resetCooldown' }] }]));
    a.cooldowns.shieldBash = 8;
    e.hp = 1;
    basicHit(w, a, e);
    expect(e.dead).toBe(true);
    expect(a.cooldowns.shieldBash).toBeLessThanOrEqual(DT);
  });

  it('被打：反擊（引爆打回去）；兩邊都有反擊也不會無限遞迴', () => {
    const { w, a, e } = setup();
    a.addPassive(passive('thorns', [{ on: 'hitTaken', effects: [{ kind: 'detonate', mult: 0.5 }] }]));
    e.addPassive(passive('thorns2', [{ on: 'hitTaken', effects: [{ kind: 'detonate', mult: 0.5 }] }]));
    const hp = e.hp;
    strike(w, e, a, { melee: true, mult: 1, damageType: 'melee', basic: true, accBonus: 999 });
    expect(e.hp).toBeLessThan(hp);
  });

  it('放技能：回血', () => {
    const { w, a, e } = setup();
    a.addPassive(passive('p', [{ on: 'skillCast', effects: [{ kind: 'heal', pct: 0.2 }] }]));
    a.hp = 10;
    w.enqueue({ type: 'skill', unitId: a.id, skillId: 'shieldBash', targetId: e.id });
    for (let i = 0; i < 60 && a.hp === 10; i++) w.step();
    expect(a.hp).toBeGreaterThan(10);
  });

  it('跨英雄連鎖：遊俠標記，戰士打被標記的目標時引爆並消耗標記；標記讓受到的傷害增加', () => {
    const { w, a, b, e } = setup();
    b.addPassive(passive('mark', [{ on: 'hit', effects: [{ kind: 'mark', vuln: 0.5, duration: 4 }] }]));
    a.addPassive(passive('detonate', [{ on: 'hit', targetHas: 'marked', effects: [{ kind: 'detonate', mult: 1, consume: true }] }]));
    basicHit(w, a, e);
    expect(e.markTime).toBe(0);
    basicHit(w, b, e);
    expect(e.markTime).toBeGreaterThan(0);
    const before = e.hp;
    basicHit(w, a, e);
    expect(e.markTime).toBe(0);
    expect(before - e.hp).toBeGreaterThan(0);
  });

  it('觸發冷卻：冷卻中不再觸發', () => {
    const { w, a, e } = setup();
    a.addPassive(passive('p', [{ on: 'hit', cooldown: 5, effects: [{ kind: 'root', duration: 0.2 }] }]));
    basicHit(w, a, e);
    expect(e.rootTime).toBeGreaterThan(0);
    e.rootTime = 0;
    basicHit(w, a, e);
    expect(e.rootTime).toBe(0);
  });

  it('沒打中、閃避', () => {
    const { w, a, e } = setup();
    a.addPassive(passive('miss', [{ on: 'miss', effects: [{ kind: 'cooldown', seconds: 2 }] }]));
    e.addPassive(passive('dodge', [{ on: 'dodge', effects: [{ kind: 'empower', damagePct: 0.1, duration: 3, maxStacks: 3 }] }]));
    a.cooldowns.shieldBash = 6;
    strike(w, a, e, { melee: true, mult: 1, damageType: 'melee', basic: true, accBonus: -9999 });
    expect(a.cooldowns.shieldBash).toBeCloseTo(4);
    expect(e.empowerStacks).toBe(1);
  });
});

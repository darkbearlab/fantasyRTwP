import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/run/battle';
import { applyDamage, armorOf, matchup, strike } from '../src/sim/actions';
import { DT } from '../src/sim/constants';
import { critTierOf } from '../src/sim/data/damageTypes';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import type { PassiveDef } from '../src/sim/data/passives';
import { focusing, focusMult } from '../src/sim/focus';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import type { SimEvent } from '../src/sim/events';
import type { Unit } from '../src/sim/unit';
import { World } from '../src/sim/world';

const MAP = { id: 't', name: 't', width: 40, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };
const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };

/** 英雄們與一名遠處、還沒警覺的敵人 */
function setup(heroes: { id: string; skills?: string[]; x?: number }[], foe = 'raider', foeX = 30, seed = 1) {
  const w = new World({
    seed,
    map: MAP,
    spawns: [
      ...heroes.map((h, i) => ({ defId: h.id, def: { ...HEROES[h.id], skills: h.skills ?? [] }, pos: { x: h.x ?? 5 + i, y: 6 } })),
      { defId: foe, def: enemyDef(foe, 1), pos: { x: foeX, y: 6 }, squad: 's' },
    ],
    config: DELIB,
  });
  return { w, heroes: w.units.slice(0, heroes.length), e: w.units[heroes.length] };
}

const passive = (p: Partial<PassiveDef>): PassiveDef => ({ id: 'test', name: '測試', description: '', source: 'status', ...p });
const run = (w: World, seconds: number) => {
  for (let t = 0; t < seconds / DT; t++) w.step();
};
const statuses = (w: World, u: Unit) => (w as unknown as { events: SimEvent[] }).events.filter((e) => e.type === 'status' && e.unitId === u.id).map((e) => (e as { text: string }).text);

describe('昇變的通用機制（SPEC_CLASSES §2）', () => {
  it('爆擊分級：100／120／150 三個門檻', () => {
    expect(critTierOf(99)).toBeNull();
    expect(critTierOf(100)?.mult).toBe(1.5);
    expect(critTierOf(120)).toMatchObject({ mult: 2, interrupts: true });
    expect(critTierOf(150)).toMatchObject({ mult: 2.5, stagger: 15 });
  });

  it('致命一擊：傷害 ×2.5 並暈眩', () => {
    const { w, heroes, e } = setup([{ id: 'warrior' }], 'raider', 6.2);
    strike(w, heroes[0], e, { melee: true, damageType: 'melee', mult: 0.1, accBonus: 1000 });
    expect(statuses(w, e)).toContain('致命');
    expect(e.stunTime).toBeGreaterThan(0);
  });

  it('背刺改成加命中：命中已經滿了的時候，背後和正面的傷害一樣', () => {
    const hit = (facing: number) => {
      const { w, heroes, e } = setup([{ id: 'rogue' }], 'raider', 6.2, 7);
      e.facing = facing;
      strike(w, heroes[0], e, { melee: true, damageType: 'melee', mult: 1, basic: true, accBonus: 1000 });
      return e.maxHp - e.hp;
    };
    expect(hit(0)).toBe(hit(Math.PI));
  });

  it('相剋取最有利的屬性：任一相剋就算相剋，全部被抗才算被剋', () => {
    const { e } = setup([{ id: 'warrior' }], 'exploder');
    expect(matchup(e, { cat: 'phys', attrs: ['cut', 'pierce'] })).toEqual({ w: 0, r: 1 });
    expect(matchup(e, { cat: 'phys', attrs: ['cut', 'fire'] })).toEqual({ w: 1, r: 0 });
    expect(matchup(e, { cat: 'phys', attrs: ['fire', 'holy'] })).toEqual({ w: 1, r: 0 });
    expect(matchup(e, { cat: 'phys', attrs: ['cut', 'blunt'] })).toEqual({ w: 0, r: 0 });
  });

  it('命中附帶破甲：可疊層、物理與特殊護甲都降，時間到就消失', () => {
    const { w, heroes, e } = setup([{ id: 'warrior' }], 'raider', 6.2);
    heroes[0].passives.push(passive({ onHit: [{ kind: 'sunder', armor: 2, maxStacks: 3, duration: 2 }] }));
    const phys = armorOf(e, 'phys');
    const spec = armorOf(e, 'spec');
    for (let i = 0; i < 4 && !e.dead; i++) strike(w, heroes[0], e, { melee: true, damageType: 'melee', mult: 0.01, basic: true, accBonus: 60 });
    expect(e.sunderStacks).toBe(3);
    expect(armorOf(e, 'phys')).toBe(phys - 6);
    expect(armorOf(e, 'spec')).toBe(spec - 6);
    // 雙方都停手，等破甲時間過去
    e.stunTime = 99;
    heroes[0].stunTime = 99;
    run(w, 2.5);
    expect(e.sunderStacks).toBe(0);
    expect(armorOf(e, 'phys')).toBe(phys);
  });

  it('吸血（被動）：對敵人造成的傷害有一部分補自己', () => {
    const { w, heroes, e } = setup([{ id: 'warrior' }]);
    const h = heroes[0];
    h.passives.push(passive({ lifesteal: 0.5 }));
    h.hp = h.maxHp - 30;
    applyDamage(w, e, 10, 'melee', h);
    expect(h.hp).toBe(h.maxHp - 25);
  });

  it('吸血光環：光環裡的隊友打得更痛並吸血，光環主人扣血但不會死', () => {
    const { w, heroes, e } = setup([{ id: 'cleric' }, { id: 'warrior' }]);
    const [owner, ally] = heroes;
    owner.passives.push(passive({ aura: { radius: 5, drain: { damagePct: 0.2, lifesteal: 0.3, ownerCost: 0.1 } } }));
    w.step();
    expect(ally.drainAuraTime).toBeGreaterThan(0);
    expect(owner.drainAuraTime).toBe(0);
    ally.hp = ally.maxHp - 30;
    const ownerHp = owner.hp;
    const before = e.hp;
    applyDamage(w, e, 20, 'melee', ally);
    expect(before - e.hp).toBe(24);
    expect(ally.hp).toBe(ally.maxHp - 30 + 7);
    expect(owner.hp).toBe(ownerHp - 2);
    owner.hp = 1;
    applyDamage(w, e, 20, 'melee', ally);
    expect(owner.hp).toBe(1);
  });

  it('吸血技能：敵人、友軍都能吸，吸友軍吸得多、都不是 1:1，不會把友軍吸死', () => {
    const { w, heroes, e } = setup([{ id: 'cleric', skills: ['drainLife'] }, { id: 'warrior' }], 'raider', 9);
    const [c, ally] = heroes;
    // 只看吸血：其他人都停手
    e.stunTime = 99;
    ally.stunTime = 99;
    c.hp = c.maxHp - 60;
    const cast = (targetId: number) => {
      c.cooldowns = {};
      c.charges = {};
      w.enqueue({ type: 'skill', unitId: c.id, skillId: 'drainLife', targetId });
      // 準備＋恢復（沉穩節奏的行動時間比較長）
      run(w, 3);
    };
    const allyBefore = ally.hp;
    const hpBefore = c.hp;
    cast(ally.id);
    const fromAlly = allyBefore - ally.hp;
    expect(fromAlly).toBeGreaterThan(0);
    expect(c.hp - hpBefore).toBeLessThan(fromAlly);
    expect(c.hp - hpBefore).toBeGreaterThan(0);
    const enemyBefore = e.hp;
    const hp2 = c.hp;
    cast(e.id);
    const fromEnemy = enemyBefore - e.hp;
    expect(fromEnemy).toBeGreaterThan(0);
    expect(fromEnemy).toBeLessThan(fromAlly);
    expect(c.hp - hp2).toBeLessThan(fromEnemy);
    ally.hp = 3;
    cast(ally.id);
    expect(ally.hp).toBe(1);
  });

  it('集中：時間越久下一發越痛（有上限），移動或受傷就中斷', () => {
    const { w, heroes, e } = setup([{ id: 'ranger', skills: ['focus', 'aimedShot'] }]);
    const r = heroes[0];
    w.enqueue({ type: 'skill', unitId: r.id, skillId: 'focus' });
    run(w, 0.5);
    expect(focusing(r)).toBe(true);
    run(w, 2);
    expect(focusMult(w, r)).toBeGreaterThan(1.4);
    run(w, 10);
    expect(focusMult(w, r)).toBeCloseTo(2, 5);
    // 受傷中斷
    applyDamage(w, r, 1, 'melee', e);
    expect(focusing(r)).toBe(false);
    // 移動中斷
    r.cooldowns = {};
    r.charges = {};
    w.enqueue({ type: 'skill', unitId: r.id, skillId: 'focus' });
    run(w, 0.5);
    expect(focusing(r)).toBe(true);
    w.enqueue({ type: 'move', unitIds: [r.id], point: { x: 12, y: 6 } });
    run(w, 1);
    expect(focusing(r)).toBe(false);
  });

  it('集中後放出的傷害技能威力放大，放完集中就結束', () => {
    const shot = (focusSec: number) => {
      const { w, heroes, e } = setup([{ id: 'ranger', skills: ['focus', 'aimedShot'] }], 'raider', 10, 5);
      const r = heroes[0];
      e.stunTime = 99;
      if (focusSec > 0) {
        w.enqueue({ type: 'skill', unitId: r.id, skillId: 'focus' });
        run(w, focusSec);
      }
      // 命中拉滿，排除沒打中的情況
      r.mods.accuracy = 1000;
      w.enqueue({ type: 'skill', unitId: r.id, skillId: 'aimedShot', targetId: e.id });
      let dmg = 0;
      for (let t = 0; t < 4 / DT && !dmg; t++) for (const ev of w.step()) if (ev.type === 'hit' && ev.skillId === 'aimedShot') dmg = ev.damage;
      return { dmg, focused: focusing(r) };
    };
    const plain = shot(0);
    const focused = shot(5);
    expect(focused.focused).toBe(false);
    expect(focused.dmg).toBeGreaterThan(plain.dmg * 1.5);
  });
});

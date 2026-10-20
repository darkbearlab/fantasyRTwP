import { describe, expect, it } from 'vitest';
import { HEROES } from '../src/sim/data/heroes';
import { SKILLS } from '../src/sim/data/skills';
import { UPGRADES } from '../src/run/data/upgrades';
import { createRun } from '../src/run/runState';
import { grantUpgrade, heroDef, rollUpgrades } from '../src/run/upgrades';
import { battleSkillsOf } from '../src/run/loadout';
import { Rng } from '../src/sim/rng';
import { World } from '../src/sim/world';
import { strike } from '../src/sim/actions';
import { HOLD, OPEN_MAP, PASSIVE, run } from './helpers';

describe('強化修飾器（SPEC_SLICE2 §9、§11-5）', () => {
  it('修飾器正確疊加，且不污染基礎資料表', () => {
    const snapshot = JSON.stringify(HEROES);
    const r = createRun(1);
    grantUpgrade(r, 'precise', 0);
    grantUpgrade(r, 'precise', 0);
    grantUpgrade(r, 'ironWall', 0);
    grantUpgrade(r, 'swift', 0);
    grantUpgrade(r, 'vigor', 0);
    const d = heroDef(r.party[0]!);
    expect(d.accuracy).toBe(HEROES.warrior.accuracy + 16);
    expect(d.armor).toBe(HEROES.warrior.armor + 2);
    expect(d.attackSpeed).toBeCloseTo(1.1);
    expect(d.maxHp).toBe(Math.round(140 * 1.15));
    expect(r.party[0]!.hp).toBe(d.maxHp); // 強健立刻回同等數值
    expect(JSON.stringify(HEROES)).toBe(snapshot);
    expect(heroDef(r.party[1]!).accuracy).toBe(HEROES.ranger.accuracy);
  });

  it('沉穩節奏：需要技能的強化只能指定戰鬥中實際用到的技能（舊技能欄不算）', () => {
    const r = createRun(1, { style: 'deliberate' });
    expect(battleSkillsOf(r, r.party[2]!)).toEqual(['flashFireball']);
    expect(() => grantUpgrade(r, 'practiced', 2, 'iceBind')).toThrow();
    grantUpgrade(r, 'practiced', 2, 'flashFireball');
    expect(heroDef(r.party[2]!).skillMods!.flashFireball.cooldownMult).toBeLessThan(1);
    // 舊模式照舊用技能欄
    const t = createRun(1, { style: 'tactical' });
    expect(battleSkillsOf(t, t.party[2]!)).toEqual(t.party[2]!.skills);
  });

  it('全隊強化：戰地醫療回血、同袍套到所有存活英雄', () => {
    const r = createRun(1);
    for (const h of r.party) h!.hp = 10;
    grantUpgrade(r, 'fieldMedic');
    expect(r.party[0]!.hp).toBe(10 + Math.round(140 * 0.2));
    grantUpgrade(r, 'unity');
    for (const h of r.party) expect(heroDef(h!).defense).toBe(HEROES[h!.classId].defense + 4);
  });

  it('需要技能的強化必須指定技能；熟練 ×2 冷卻疊乘', () => {
    // 舊的三技能欄只存在於封存的戰術模式
    const r = createRun(1, { style: 'tactical' });
    expect(() => grantUpgrade(r, 'practiced', 2)).toThrow();
    grantUpgrade(r, 'practiced', 2, 'fireball');
    grantUpgrade(r, 'practiced', 2, 'fireball');
    expect(heroDef(r.party[2]!).skillMods!.fireball.cooldownMult).toBeCloseTo(0.64);
  });

  it('精英獎勵保證至少一個稀有', () => {
    for (let s = 0; s < 100; s++) expect(rollUpgrades(new Rng(s), 4, true).some((id) => UPGRADES[id].rare)).toBe(true);
  });

  it('效果在戰鬥中生效：熟練縮短冷卻、二連可連放兩次、堅定不會被打斷暈眩', () => {
    const r = createRun(1, { style: 'tactical' });
    grantUpgrade(r, 'practiced', 2, 'arcaneMissile');
    grantUpgrade(r, 'doubleCast', 2, 'iceBind');
    grantUpgrade(r, 'steadfast', 2);
    const mage = { ...heroDef(r.party[2]!), accuracy: 999 };
    const w = new World({
      seed: 1,
      map: OPEN_MAP,
      config: PASSIVE,
      idleBehavior: HOLD,
      spawns: [
        { defId: 'mage', def: mage, pos: { x: 2, y: 5 } },
        { defId: 'brute', pos: { x: 9, y: 5 } },
      ],
    });
    const [m, b] = w.units;
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'arcaneMissile', targetId: b.id });
    run(w, 10);
    // 冷卻從生效那一刻開始（0.2 秒準備），之後經過了數個節拍
    expect(m.cooldowns.arcaneMissile).toBeLessThanOrEqual(SKILLS.arcaneMissile.cooldown * 0.8);
    expect(m.cooldowns.arcaneMissile).toBeGreaterThan(SKILLS.arcaneMissile.cooldown * 0.8 - 0.4);
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'iceBind', targetId: b.id });
    run(w, 60);
    expect(m.charges.iceBind).toBe(1);
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'iceBind', targetId: b.id });
    run(w, 60);
    expect(m.charges.iceBind).toBe(0);
    // 堅定：準備中被打斷不會暈眩
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'fireball', point: { x: 9, y: 5 } });
    run(w, 5);
    strike(w, b, m, { melee: false, damageType: 'projectile', mult: 0.1, interrupts: true, accBonus: 999 });
    expect(m.action).toBeNull();
    expect(m.stunTime).toBe(0);
  });
});

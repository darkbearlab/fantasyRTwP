import { describe, expect, it } from 'vitest';
import { strike } from '../src/sim/actions';
import { MAPS } from '../src/sim/data/maps';
import { World } from '../src/sim/world';
import { UnitState } from '../src/sim/unit';
import { HOLD, run } from './helpers';

/** 王座廳：戰士站在頭目面前，頭目 AI 會主動出招 */
function bossWorld() {
  const w = new World({
    seed: 4,
    map: MAPS.boss01,
    idleBehavior: HOLD,
    config: { enemyAggroTime: 0 },
    spawns: [
      { defId: 'warrior', pos: { x: 21.5, y: 12 } },
      { defId: 'mage', pos: { x: 12, y: 12 } },
      { defId: 'warlord', pos: { x: 23, y: 12 } },
    ],
  });
  const [war, mage, boss] = w.units;
  return { w, war, mage, boss };
}

describe('頭目：戰爭領主（SPEC_SLICE2 §7.3、§11-7）', () => {
  it('橫掃：扇形範圍傷害（準備 1.5 秒）', () => {
    const { w, war, boss } = bossWorld();
    let started = false;
    let hit = false;
    for (let i = 0; i < 30 * 6 && !hit; i++) {
      for (const e of w.step()) {
        if (e.type === 'actionStart' && e.unitId === boss.id && e.skillId === 'sweep') started = true;
        if (e.type === 'hit' && e.skillId === 'sweep' && e.targetId === war.id) hit = true;
      }
    }
    expect(started).toBe(true);
    expect(hit).toBe(true);
  });

  it('橫掃可以被打斷', () => {
    const { w, mage, boss } = bossWorld();
    for (let i = 0; i < 30 * 6 && !(boss.action?.skillId === 'sweep'); i++) w.step();
    expect(boss.state).toBe(UnitState.Windup);
    strike(w, mage, boss, { melee: false, damageType: 'spell', mult: 1, flatDamage: [8, 12], interrupts: true, accBonus: 999 });
    expect(boss.action).toBeNull();
    expect(boss.stunTime).toBeGreaterThan(0);
    expect(boss.spentSkills).not.toContain('sweep'); // 橫掃之後還能再用
  });

  it('戰吼：生命低於 50% 使用一次，召喚 3 名蠻兵並提高全體敵人傷害', () => {
    const { w, boss } = bossWorld();
    boss.hp = Math.floor(boss.maxHp * 0.45);
    let spawned = 0;
    for (let i = 0; i < 30 * 5; i++) for (const e of w.step()) if (e.type === 'spawn') spawned++;
    expect(spawned).toBe(3);
    expect(boss.spentSkills).toContain('warcry');
    expect(boss.damageBuffTime).toBeGreaterThan(0);
    expect(boss.outgoingDamageMult).toBeCloseTo(1.2);
    expect(w.units.filter((u) => u.def.id === 'brute').length).toBe(3);
    // 不會再用第二次
    run(w, 30 * 10);
    expect(w.units.filter((u) => u.def.id === 'brute').length).toBe(3);
  });

  it('戰吼被打斷後就不能再用', () => {
    const { w, mage, boss } = bossWorld();
    boss.hp = Math.floor(boss.maxHp * 0.45);
    for (let i = 0; i < 30 * 3 && boss.action?.skillId !== 'warcry'; i++) w.step();
    expect(boss.action?.skillId).toBe('warcry');
    strike(w, mage, boss, { melee: false, damageType: 'spell', mult: 1, flatDamage: [8, 12], interrupts: true, accBonus: 999 });
    expect(boss.spentSkills).toContain('warcry');
    let spawned = 0;
    for (let i = 0; i < 30 * 15; i++) for (const e of w.step()) if (e.type === 'spawn') spawned++;
    expect(spawned).toBe(0);
    expect(boss.skillReady('warcry')).toBe(false);
  });
});

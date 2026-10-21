import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/run/battle';
import { deliberateSkillsOf } from '../src/run/loadout';
import { applyDamage, interrupt, strike } from '../src/sim/actions';
import { DT } from '../src/sim/constants';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { World } from '../src/sim/world';

const MAP = { id: 't', name: 't', width: 40, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };
const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };

/** 沉穩節奏的英雄（職業被動照 def.id 自動帶上）與一名敵人 */
function setup(heroes: string[], foe = 'raider', foeX = 30, seed = 1) {
  const w = new World({
    seed,
    map: MAP,
    spawns: [
      ...heroes.map((id, i) => ({ defId: id, def: { ...HEROES[id], skills: deliberateSkillsOf(id) }, pos: { x: 5 + i, y: 6 } })),
      { defId: foe, def: enemyDef(foe, 1), pos: { x: foeX, y: 6 }, squad: 's' },
    ],
    config: DELIB,
  });
  return { w, heroes: w.units.slice(0, heroes.length), e: w.units[heroes.length] };
}
const run = (w: World, seconds: number) => {
  for (let t = 0; t < seconds / DT; t++) w.step();
};

describe('進階職業：戰士、遊俠（SPEC_CLASSES §3）', () => {
  it('守護者：光環內的隊友受到的傷害有 30% 改由守護者承受', () => {
    const { w, heroes, e } = setup(['guardian', 'ranger']);
    const [g, ally] = heroes;
    w.step();
    const gHp = g.hp;
    const aHp = ally.hp;
    applyDamage(w, ally, 20, 'melee', e);
    expect(aHp - ally.hp).toBe(14);
    expect(gHp - g.hp).toBe(6);
    // 守護者自己被打不分擔
    applyDamage(w, g, 10, 'melee', e);
    expect(gHp - 6 - g.hp).toBe(10);
  });

  it('角鬥士：盾擊可存 2 次；打斷敵人後下一擊必定爆擊', () => {
    const { w, heroes, e } = setup(['gladiator'], 'raider', 6.2);
    const g = heroes[0];
    expect(g.maxCharges('shieldBash')).toBe(2);
    e.action = { kind: 'attack', targetId: g.id, phase: 'windup', ticksLeft: 10, ticksTotal: 10 } as never;
    expect(interrupt(w, g, e)).toBe(true);
    expect(g.critPending).toBe(true);
    // 命中很低也一定打中、而且是爆擊
    strike(w, g, e, { melee: true, damageType: 'melee', mult: 0.1, accBonus: -500 });
    expect(g.critPending).toBe(false);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('狙擊手：技能循環是集中 → 瞄準射擊', () => {
    expect(deliberateSkillsOf('sniper')).toEqual(['focus', 'aimedShot']);
    const { w, heroes } = setup(['sniper']);
    const s = heroes[0];
    expect(s.cycle?.steps).toEqual(['focus', 'aimedShot']);
    w.enqueue({ type: 'skill', unitId: s.id, skillId: 'focus' });
    run(w, 0.5);
    expect(s.cycle!.steps[s.cycleStep]).toBe('aimedShot');
    // 被打中斷 → 回到集中
    applyDamage(w, s, 1, 'melee', w.units[1]);
    expect(s.cycle!.steps[s.cycleStep]).toBe('focus');
  });

  it('連弩手：攻擊間距比遊俠短得多', () => {
    expect(HEROES.arbalest.attackSpeed).toBeGreaterThan(HEROES.ranger.attackSpeed * 2);
  });
});

describe('進階職業：法師、牧師（SPEC_CLASSES §3）', () => {
  it('元素法師：普攻是火＋寒；元素附魔讓隊友的攻擊也帶上火＋寒', async () => {
    const { attackInfo, matchup } = await import('../src/sim/actions');
    const { w, heroes, e } = setup(['elementalist', 'warrior'], 'caster');
    const [m, ally] = heroes;
    // 法師敵人抗火、怕寒：火＋寒取最有利的＝相剋
    expect(matchup(e, attackInfo(m, undefined, 'spell'))).toEqual({ w: 1, r: 0 });
    expect(matchup(e, attackInfo(ally, undefined, 'melee'))).toEqual({ w: 0, r: 0 });
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'elementalEnchant' });
    run(w, 2);
    expect(attackInfo(ally, undefined, 'melee').attrs).toEqual(['cut', 'fire', 'cold']);
    expect(matchup(e, attackInfo(ally, undefined, 'melee'))).toEqual({ w: 1, r: 0 });
  });

  it('死亡法師：身邊的敵人受到的傷害增加', () => {
    const { w, e } = setup(['deathMage'], 'raider', 7);
    e.stunTime = 99;
    w.step();
    const before = e.hp;
    applyDamage(w, e, 20, 'melee', w.units[0]);
    expect(before - e.hp).toBe(23);
  });

  it('戰法師：近戰，普攻破甲', () => {
    const { w, heroes, e } = setup(['battlemage'], 'raider', 6.2);
    expect(heroes[0].def.range).toBeLessThan(1);
    strike(w, heroes[0], e, { melee: true, damageType: 'melee', mult: 0.01, basic: true, accBonus: 60 });
    expect(e.sunderStacks).toBe(1);
  });

  it('聖騎士：聖域同時讓敵人變慢', () => {
    const { w, heroes, e } = setup(['paladin'], 'raider', 8);
    e.stunTime = 99;
    w.enqueue({ type: 'skill', unitId: heroes[0].id, skillId: 'holyGround', point: { x: 8, y: 6 } });
    run(w, 1.5);
    expect(w.moveMultFor(e)).toBeCloseTo(0.6, 5);
  });

  it('狂信者：光環同時加攻擊', () => {
    const { w, heroes } = setup(['zealot', 'warrior']);
    const before = heroes[1].outgoingDamageMult;
    w.step();
    expect(heroes[1].outgoingDamageMult).toBeCloseTo(before * 1.15, 5);
  });

  it('異教徒：血之光環讓隊友吸血、自己扣血；主動是吸血', () => {
    expect(deliberateSkillsOf('heretic')).toEqual(['drainLife']);
    const { w, heroes, e } = setup(['heretic', 'warrior']);
    const [x, ally] = heroes;
    w.step();
    ally.hp = ally.maxHp - 30;
    const xHp = x.hp;
    applyDamage(w, e, 20, 'melee', ally);
    expect(ally.hp).toBe(ally.maxHp - 30 + Math.round(23 * 0.2));
    expect(x.hp).toBe(xHp - Math.round(23 * 0.08));
  });
});

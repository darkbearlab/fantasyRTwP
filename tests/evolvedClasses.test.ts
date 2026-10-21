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

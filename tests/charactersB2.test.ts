/** 具名角色 B2：奧爾德斯（大法師、死靈法師）、芬恩（下位元素師、元素師、戰法師）（SPEC_CHARACTERS §4.1） */
import { describe, expect, it } from 'vitest';
import { battleOutcomeFromWorld, enemyDef } from '../src/run/battle';
import { deliberateSkillsOf } from '../src/run/loadout';
import { createRun } from '../src/run/runState';
import { recipesOf } from '../src/run/upgrades';
import { explode, kill } from '../src/sim/actions';
import { followerOrder } from '../src/sim/ai/follower';
import { DT } from '../src/sim/constants';
import { CLASSES } from '../src/sim/data/classes';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { SKILLS } from '../src/sim/data/skills';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import type { Unit } from '../src/sim/unit';
import { World } from '../src/sim/world';

const MAP = { id: 't', name: 't', width: 40, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };
const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };

function setup(heroes: string[], foes: { id: string; x: number }[]) {
  const w = new World({
    seed: 1,
    map: MAP,
    spawns: [
      ...heroes.map((id, i) => ({ defId: id, def: { ...HEROES[id], skills: deliberateSkillsOf(id) }, pos: { x: 5 + i, y: 6 } })),
      ...foes.map((f) => ({ defId: f.id, def: enemyDef(f.id, 1), pos: { x: f.x, y: 6 }, squad: 's' })),
    ],
    config: DELIB,
  });
  return { w, heroes: w.units.slice(0, heroes.length), foes: w.units.slice(heroes.length) };
}
const curse = (t: Unit, by: Unit) => {
  t.curseTime = 8;
  t.curseBy = by.id;
};

describe('奧爾德斯：大法師、死靈法師', () => {
  it('大法師：大附魔不限距離', () => {
    expect(deliberateSkillsOf('archmage')).toEqual(['grandEnchant']);
    expect(CLASSES.archmage.evolvedFrom).toBe('mage');
    const { w, heroes } = setup(['archmage', 'warrior'], [{ id: 'raider', x: 38 }]);
    heroes[1].pos = { x: 30, y: 6 };
    w.enqueue({ type: 'skill', unitId: heroes[0].id, skillId: 'grandEnchant' });
    for (let i = 0; i < 2 / DT; i++) w.step();
    expect(heroes[1].damageBuffTime).toBeGreaterThan(0);
  });

  it('死靈法師：被自己詛咒的敵人死亡時站起來成為隨從（最多 3 個）；沒詛咒、別人詛咒的不會', () => {
    expect(deliberateSkillsOf('necromancer')).toEqual(['curse', 'curseBurst']);
    const { w, heroes, foes } = setup(['necromancer', 'hexer'], [1, 2, 3, 4, 5, 6].map((k) => ({ id: 'raider', x: 20 + k })));
    const [n, hexer] = heroes;
    // 沒有詛咒
    kill(w, foes[0], n);
    // 別人（咒術師）下的詛咒
    curse(foes[1], hexer);
    kill(w, foes[1], n);
    expect(w.units.filter((u) => u.undead).length).toBe(0);
    // 自己下的詛咒：站起來，最多 3 個
    for (const f of foes.slice(2)) {
      curse(f, n);
      kill(w, f, hexer);
    }
    const risen = w.units.filter((u) => u.undead && !u.dead);
    expect(risen.length).toBe(3);
    for (const r of risen) {
      expect(r.team).toBe('hero');
      expect(r.follower).toBe(true);
      expect(r.masterId).toBe(n.id);
      expect(r.maxHp).toBeLessThan(foes[2].maxHp);
    }
  });

  it('亡者優先打被詛咒的敵人；戰鬥結束不記回遠征', () => {
    const { w, heroes, foes } = setup(['necromancer'], [{ id: 'raider', x: 8 }, { id: 'raider', x: 9 }, { id: 'raider', x: 10 }]);
    const n = heroes[0];
    curse(foes[0], n);
    kill(w, foes[0], n);
    const r = w.units.find((u) => u.undead)!;
    r.pos = { x: 8.5, y: 6 };
    // 近的那個沒詛咒、遠的那個被詛咒：打被詛咒的
    curse(foes[2], n);
    const o = followerOrder(w, r);
    expect(o).toEqual({ type: 'attack', targetId: foes[2].id });
    w.result = 'hero';
    expect(battleOutcomeFromWorld(w).followers ?? []).toEqual([]);
  });
});

describe('芬恩：下位元素師、元素師、戰法師', () => {
  it('下位元素師：普攻累積滿 5 層，第一招換成大火球；元素師 4 層', () => {
    expect(deliberateSkillsOf('adept')).toEqual(['flashFireball', 'greatFireball']);
    const { w, heroes } = setup(['adept', 'elementalist'], [{ id: 'raider', x: 30 }]);
    const [a, el] = heroes;
    expect(a.cycle?.mode).toBe('charge');
    expect(a.cycle?.chargeMax).toBe(5);
    expect(el.cycle?.chargeMax).toBe(4);
    expect(w).toBeDefined();
  });

  it('大火球不會傷到隊友（Alan 2026-10-30）', () => {
    const { w, heroes, foes } = setup(['adept', 'warrior'], [{ id: 'raider', x: 7 }]);
    const ally = heroes[1];
    const hp = ally.hp;
    const foeHp = foes[0].hp;
    explode(w, heroes[0], { x: 6.5, y: 6 }, SKILLS.greatFireball);
    expect(ally.hp).toBe(hp);
    expect(foes[0].hp).toBeLessThan(foeHp);
  });

  it('芬恩是下位元素師；兩條線是元素師、戰法師（都從下位元素師昇變）', () => {
    const r = createRun(1, { style: 'deliberate', party: ['fenn', 'aldous'] });
    expect(r.party[0]).toMatchObject({ characterId: 'fenn', classId: 'adept' });
    expect(recipesOf(r.party[0]!).map((rc) => rc.evolvesTo).sort()).toEqual(['battlemage', 'elementalist']);
    expect(recipesOf(r.party[1]!).map((rc) => rc.evolvesTo).sort()).toEqual(['archmage', 'necromancer']);
    expect(CLASSES.elementalist.evolvedFrom).toBe('adept');
    expect(CLASSES.battlemage.evolvedFrom).toBe('adept');
  });
});

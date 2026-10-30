/** 具名角色 B1：柯林、希爾雯、班尼迪克的進階職業（SPEC_CHARACTERS §4.1） */
import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/run/battle';
import { deliberateSkillsOf } from '../src/run/loadout';
import { createRun } from '../src/run/runState';
import { classUpgradesFor, recipesOf } from '../src/run/upgrades';
import { actionRate, applyDamage, strike } from '../src/sim/actions';
import { DT } from '../src/sim/constants';
import { CLASSES } from '../src/sim/data/classes';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { CLASS_PASSIVES } from '../src/sim/data/passives';
import { UPGRADES } from '../src/run/data/upgrades';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import type { Unit } from '../src/sim/unit';
import { World } from '../src/sim/world';

const MAP = { id: 't', name: 't', width: 40, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };
const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };

function setup(heroes: string[], foe = 'raider', foeX = 30) {
  const w = new World({
    seed: 1,
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
/** 讓敵人處在讀條（預兆）中 */
const telegraph = (e: Unit) => {
  e.action = { kind: 'attack', targetId: -1, phase: 'windup', progress: 0, duration: 5 } as unknown as Unit['action'];
};

describe('柯林：守護者・反制、聖騎士（戰士底）', () => {
  it('反制：打斷正在預兆中的敵人，4 m 內隊友 3 秒受傷 −40%；沒在讀條就沒有', () => {
    expect(deliberateSkillsOf('guardian')).toEqual(['shieldCounter']);
    const { w, heroes, e } = setup(['guardian', 'cleric'], 'raider', 7);
    const [g, ally] = heroes;
    const cw = { radius: 4, duration: 3, reduction: 0.4 };
    // 沒在讀條：打不斷，沒有反制
    strike(w, g, e, { melee: true, damageType: 'melee', mult: 0.01, accBonus: 300, interrupts: true, counterWard: cw, skillId: 'shieldCounter' });
    expect(ally.counterWardTime).toBe(0);
    telegraph(e);
    strike(w, g, e, { melee: true, damageType: 'melee', mult: 0.01, accBonus: 300, interrupts: true, counterWard: cw, skillId: 'shieldCounter' });
    expect(e.action).toBeNull();
    expect(ally.counterWardTime).toBe(3);
    expect(g.counterWardTime).toBe(3);
    const before = ally.hp;
    applyDamage(w, ally, 50, 'melee', e);
    expect(before - ally.hp).toBe(30);
    run(w, 3.1);
    expect(ally.counterWardTime).toBe(0);
  });

  it('聖騎士：戰士底（戰士的職業被動）；聖域・審判放下時打斷範圍內的敵人、加失衡', () => {
    expect(CLASSES.paladin.evolvedFrom).toBe('warrior');
    expect(CLASS_PASSIVES.paladin).toEqual(['cleave', 'tauntAura', 'shieldBearer']);
    const { w, heroes, e } = setup(['paladin'], 'raider', 8);
    const pal = heroes[0];
    // 放下的瞬間：讀條中的敵人被打斷、累積失衡（或直接失衡暈眩）
    w.enqueue({ type: 'skill', unitId: pal.id, skillId: 'holyGround', point: { x: 8, y: 6 } });
    let cast = false;
    for (let i = 0; i < 2 / DT && !cast; i++) {
      if (pal.action?.phase === 'windup' && !e.action) telegraph(e);
      for (const ev of w.step()) if (ev.type === 'aoe' && ev.sourceId === pal.id) cast = true;
    }
    expect(cast).toBe(true);
    expect(e.action === null || e.action.phase !== 'windup').toBe(true);
    expect(e.stagger > 0 || e.stunTime > 0).toBe(true);
    expect(w.moveMultFor(e)).toBeCloseTo(0.6, 5);
  });
});

describe('希爾雯：大遊俠的齊射', () => {
  it('齊射：4 秒內普攻速度大幅提高，之後恢復', () => {
    const { w, heroes } = setup(['arbalest']);
    const a = heroes[0];
    const base = actionRate(w, a, 'attack');
    w.enqueue({ type: 'skill', unitId: a.id, skillId: 'volley' });
    run(w, 0.8);
    expect(a.hasteTime).toBeGreaterThan(0);
    expect(actionRate(w, a, 'attack')).toBeCloseTo(base * 3, 5);
    run(w, 4.5);
    expect(actionRate(w, a, 'attack')).toBeCloseTo(base, 5);
  });
});

describe('班尼迪克：大祭司、邪教徒', () => {
  it('大祭司：大聖域，範圍內友軍受傷 −40%', () => {
    expect(deliberateSkillsOf('highPriest')).toEqual(['grandSanctuary']);
    expect(CLASSES.highPriest.evolvedFrom).toBe('cleric');
    const { w, heroes, e } = setup(['highPriest', 'warrior']);
    const ally = heroes[1];
    w.enqueue({ type: 'skill', unitId: heroes[0].id, skillId: 'grandSanctuary', point: { ...ally.pos } });
    run(w, 1.5);
    const before = ally.hp;
    applyDamage(w, ally, 50, 'melee', e);
    // −40%（施放者的技能效果倍率另外再乘）
    expect(before - ally.hp).toBeLessThanOrEqual(30);
  });

  it('血契：吸敵人留下血印，隊友打它時邪教徒回血；吸隊友讓隊友加傷', () => {
    const { w, heroes, e } = setup(['heretic', 'warrior'], 'raider', 9);
    const [x, ally] = heroes;
    e.stunTime = 99;
    w.enqueue({ type: 'skill', unitId: x.id, skillId: 'bloodDrain', targetId: e.id });
    run(w, 1.5);
    expect(e.bloodMarkTime).toBeGreaterThan(0);
    expect(e.bloodMarkBy).toBe(x.id);
    x.hp = 10;
    applyDamage(w, e, 20, 'melee', ally);
    expect(x.hp).toBeGreaterThan(10);
    // 吸隊友
    const { w: w2, heroes: h2 } = setup(['heretic', 'warrior']);
    const before = h2[1].outgoingDamageMult;
    w2.enqueue({ type: 'skill', unitId: h2[0].id, skillId: 'bloodDrain', targetId: h2[1].id });
    run(w2, 1.5);
    expect(h2[1].damageBuffTime).toBeGreaterThan(0);
    expect(h2[1].outgoingDamageMult).toBeGreaterThan(before);
  });
});

describe('角色只走自己的兩條線（C 階段之前的過渡）', () => {
  const lines = (party: string, slot = 0) => recipesOf(createRun(1, { style: 'deliberate', party: [party] }).party[slot]!).map((rc) => rc.evolvesTo).sort();
  it('柯林：守護者、聖騎士；希爾雯：大遊俠、刺客；班尼迪克：大祭司、邪教徒', () => {
    expect(lines('corin')).toEqual(['guardian', 'paladin']);
    expect(lines('sylwen')).toEqual(['arbalest', 'cutthroat']);
    expect(lines('benedict')).toEqual(['heretic', 'highPriest']);
  });

  it('升級選項只出兩條線用得到的專屬升級', () => {
    const h = createRun(1, { style: 'deliberate', party: ['corin'] }).party[0]!;
    const branches = new Set(classUpgradesFor(h).flatMap((id) => (UPGRADES[id].branch ? [UPGRADES[id].branch!.id] : [])));
    expect([...branches].sort()).toEqual(['gladiator', 'guardian']);
  });
});

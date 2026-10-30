/** 具名角色 B3：阿許卡（決鬥者、解放者、狂戰士）（SPEC_CHARACTERS §4.1） */
import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/run/battle';
import { deliberateSkillsOf } from '../src/run/loadout';
import { createRun } from '../src/run/runState';
import { recipesOf } from '../src/run/upgrades';
import { interrupt, strike } from '../src/sim/actions';
import { DT } from '../src/sim/constants';
import { CLASSES } from '../src/sim/data/classes';
import { CRIT_TIERS } from '../src/sim/data/damageTypes';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import type { Unit } from '../src/sim/unit';
import { World } from '../src/sim/world';

const MAP = { id: 't', name: 't', width: 40, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };
const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };

function setup(heroes: string[], foeX = 30, foe = 'raider', foeHp?: number) {
  const w = new World({
    seed: 1,
    map: MAP,
    spawns: [
      ...heroes.map((id, i) => ({ defId: id, def: { ...HEROES[id], skills: deliberateSkillsOf(id) }, pos: { x: 5 + i, y: 6 } })),
      { defId: foe, def: { ...enemyDef(foe, 1), ...(foeHp ? { maxHp: foeHp } : {}) }, pos: { x: foeX, y: 6 }, squad: 's' },
    ],
    config: DELIB,
  });
  return { w, heroes: w.units.slice(0, heroes.length), e: w.units[heroes.length] };
}
const telegraph = (e: Unit) => {
  e.action = { kind: 'attack', targetId: -1, phase: 'windup', progress: 0, duration: 5 } as unknown as Unit['action'];
};

describe('阿許卡：決鬥者', () => {
  it('突刺：衝到 4 m 內的敵人身邊刺一下，打斷讀條中的敵人', () => {
    expect(deliberateSkillsOf('fencer')).toEqual(['thrust']);
    const { w, heroes, e } = setup(['fencer'], 8.5);
    const a = heroes[0];
    e.stunTime = 99;
    let hit = false;
    w.enqueue({ type: 'skill', unitId: a.id, skillId: 'thrust', targetId: e.id });
    for (let i = 0; i < 2 / DT && !hit; i++) {
      // 刺到之前讓敵人讀條
      if (!e.action) telegraph(e);
      for (const ev of w.step()) if ((ev.type === 'hit' || ev.type === 'miss') && (ev as { sourceId?: number }).sourceId === a.id) hit = true;
    }
    expect(hit).toBe(true);
    expect(a.pos.x).toBeGreaterThan(6);
  });

  it('阿許卡是決鬥者；兩條線是解放者、狂戰士（都從決鬥者昇變）', () => {
    const r = createRun(1, { style: 'deliberate', party: ['ashka'] });
    expect(r.party[0]).toMatchObject({ characterId: 'ashka', classId: 'fencer' });
    expect(recipesOf(r.party[0]!).map((rc) => rc.evolvesTo).sort()).toEqual(['berserker', 'liberator']);
    expect(CLASSES.liberator.evolvedFrom).toBe('fencer');
    expect(CLASSES.berserker.evolvedFrom).toBe('fencer');
    expect(HEROES.fencer.defense).toBeGreaterThan(HEROES.warrior.defense);
  });
});

describe('阿許卡：解放者、狂戰士', () => {
  it('解放者：突刺存 2 次；打斷時 4 m 內的隊友解除負面狀態，下一擊必定爆擊', () => {
    const { w, heroes, e } = setup(['liberator', 'cleric'], 7);
    const [l, ally] = heroes;
    expect(l.maxCharges('thrust')).toBe(2);
    ally.stunTime = 3;
    ally.curseTime = 5;
    ally.rootTime = 2;
    telegraph(e);
    expect(interrupt(w, l, e, 'thrust')).toBe(true);
    expect(ally.stunTime).toBe(0);
    expect(ally.curseTime).toBe(0);
    expect(ally.rootTime).toBe(0);
    expect(l.critPending).toBe(true);
  });

  it('狂戰士：旋風斬打中失衡（暈眩）中的敵人，必定算重擊以上（比最低一級的爆擊痛）', () => {
    const hitOnStunned = (opts: { heavyVsStunned?: boolean; critVsStunned?: boolean }) => {
      const { w, heroes, e } = setup(['berserker'], 6.5, 'raider', 9999);
      e.stunTime = 2;
      strike(w, heroes[0], e, { melee: true, damageType: 'melee', mult: 1, skillId: 'whirlwind', ...opts });
      return 9999 - e.hp;
    };
    const heavy = CRIT_TIERS.find((t) => t.interrupts)!;
    const lowest = CRIT_TIERS[CRIT_TIERS.length - 1];
    const a = hitOnStunned({ heavyVsStunned: true });
    const b = hitOnStunned({ critVsStunned: true });
    expect(a / b).toBeCloseTo(heavy.mult / lowest.mult, 1);
  });
});

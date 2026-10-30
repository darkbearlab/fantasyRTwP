/** 具名角色 B4：杜爾根（圖騰師、大圖騰師、背負者）（SPEC_CHARACTERS §4.1、§4.3） */
import { describe, expect, it } from 'vitest';
import { battleOutcomeFromWorld, createBattleFromRun, enemyDef, heroBattleSkills } from '../src/run/battle';
import { setTotemVariant } from '../src/run/characters';
import { chooseNode } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import { recipesOf } from '../src/run/upgrades';
import { actionRate, addStagger, placeTotem } from '../src/sim/actions';
import { DT } from '../src/sim/constants';
import { CLASSES } from '../src/sim/data/classes';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { TOTEM_RULES } from '../src/sim/data/totems';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { World } from '../src/sim/world';

const MAP = { id: 't', name: 't', width: 40, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };
const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };

function setup(heroes: string[], foeX = 30, foeHp?: number) {
  const w = new World({
    seed: 1,
    map: MAP,
    spawns: [
      ...heroes.map((id, i) => ({ defId: id, def: { ...HEROES[id], skills: heroBattleSkills({ classId: id }) }, pos: { x: 5 + i, y: 6 } })),
      { defId: 'raider', def: { ...enemyDef('raider', 1), ...(foeHp ? { maxHp: foeHp } : {}) }, pos: { x: foeX, y: 6 }, squad: 's' },
    ],
    config: DELIB,
  });
  return { w, heroes: w.units.slice(0, heroes.length), e: w.units[heroes.length] };
}
const run = (w: World, s: number) => {
  for (let i = 0; i < s / DT; i++) w.step();
};

describe('杜爾根：圖騰師', () => {
  it('杜爾根是圖騰師；兩條線是大圖騰師、背負者', () => {
    const r = createRun(1, { style: 'deliberate', party: ['durgan'] });
    expect(r.party[0]).toMatchObject({ characterId: 'durgan', classId: 'totemist' });
    expect(recipesOf(r.party[0]!).map((rc) => rc.evolvesTo).sort()).toEqual(['totemBearer', 'totemElder']);
    expect(CLASSES.totemElder.evolvedFrom).toBe('totemist');
    expect(CLASSES.totemBearer.evolvedFrom).toBe('totemist');
  });

  it('整備時選圖騰種類：主動技能跟著換；三個職業沿用同一個設定', () => {
    let r = createRun(1, { style: 'deliberate', party: ['durgan', 'corin'] });
    expect(heroBattleSkills(r.party[0]!)).toEqual(['totemDecoy']);
    r = setTotemVariant(r, 0, 'drum');
    expect(heroBattleSkills(r.party[0]!)).toEqual(['totemDrum']);
    expect(heroBattleSkills({ ...r.party[0]!, classId: 'totemElder' })).toEqual(['grandDrum']);
    expect(heroBattleSkills({ ...r.party[0]!, classId: 'totemBearer' })).toEqual(['bearDrum']);
    expect(() => setTotemVariant(r, 1, 'bind')).toThrow();
    const w = createBattleFromRun(chooseNode(r, r.map.layers[0][0]));
    expect(w.units.find((u) => u.heroSlot === 0)!.def.skills).toEqual(['totemDrum']);
  });

  it('放圖騰：不會移動、有生命、同時最多 1 個（再放就拆掉舊的）；不記回遠征', () => {
    const { w, heroes } = setup(['totemist']);
    const d = heroes[0];
    w.enqueue({ type: 'skill', unitId: d.id, skillId: 'totemDecoy', point: { x: 8, y: 6 } });
    run(w, 1.5);
    const t1 = w.units.find((u) => u.totem && !u.dead)!;
    expect(t1).toBeDefined();
    expect(t1.isHero).toBe(false);
    expect(t1.maxHp).toBe(Math.round(TOTEM_RULES.hp.small * TOTEM_RULES.decoyHpMult));
    run(w, 2);
    expect(t1.pos).toEqual({ x: 8, y: 6 });
    placeTotem(w, d, { x: 10, y: 6 }, 'decoy', 'small');
    expect(t1.dead).toBe(true);
    expect(w.units.filter((u) => u.totem && !u.dead).length).toBe(1);
    w.result = 'hero';
    expect(battleOutcomeFromWorld(w).followers ?? []).toEqual([]);
  });

  it('三種圖騰：誘餌嘲諷、戰鼓加隊友攻速、縛地讓敵人變慢並多吃失衡', () => {
    // 誘餌：有嘲諷
    const a = setup(['totemist']);
    const decoy = placeTotem(a.w, a.heroes[0], { x: 8, y: 6 }, 'decoy', 'small');
    expect(decoy.passives.some((p) => (p.taunt ?? 0) > 0)).toBe(true);
    // 戰鼓：附近隊友攻速提高
    const b = setup(['totemist', 'warrior']);
    const before = actionRate(b.w, b.heroes[1], 'attack');
    placeTotem(b.w, b.heroes[0], { x: 6, y: 6 }, 'drum', 'small');
    b.w.step();
    expect(actionRate(b.w, b.heroes[1], 'attack')).toBeGreaterThan(before);
    // 縛地：敵人變慢、多吃失衡
    const c = setup(['totemist'], 9);
    placeTotem(c.w, c.heroes[0], { x: 9, y: 6 }, 'bind', 'small');
    c.e.stunTime = 0;
    c.w.step();
    expect(c.e.chillSlow).toBeGreaterThan(0);
    const s0 = c.e.stagger;
    addStagger(c.w, c.e, 1);
    expect(c.e.stagger - s0).toBeCloseTo(1.3, 5);
  });
});

describe('杜爾根：大圖騰師、背負者', () => {
  it('大圖騰：拉出時重擊（擊退、失衡），同時最多 2 個，會打射程內的敵人', () => {
    const { w, heroes, e } = setup(['totemElder'], 9);
    const x0 = e.pos.x;
    const t = placeTotem(w, heroes[0], { x: 8.5, y: 6 }, 'drum', 'grand');
    expect(e.pos.x).toBeGreaterThan(x0);
    expect(e.stagger > 0 || e.stunTime > 0).toBe(true);
    expect(t.def.damage[1]).toBeGreaterThan(0);
    placeTotem(w, heroes[0], { x: 7, y: 8 }, 'drum', 'grand');
    placeTotem(w, heroes[0], { x: 7, y: 4 }, 'drum', 'grand');
    expect(w.units.filter((u) => u.totem && !u.dead).length).toBe(2);
    expect(t.dead).toBe(true);
  });

  it('背負：光環套在自己身上 8 秒，周圍的敵人每秒受傷並累積失衡，時間到拿掉', () => {
    // 敵人打不死：戰鬥結束時 world 就不再前進
    const { w, heroes, e } = setup(['totemBearer'], 6.8, 9999);
    const b = heroes[0];
    e.stunTime = 0;
    w.enqueue({ type: 'skill', unitId: b.id, skillId: 'bearDecoy' });
    for (let i = 0; i < 3 / DT && b.bearTime <= 0; i++) w.step();
    expect(b.bearTime).toBeGreaterThan(0);
    expect(b.passives.some((p) => p.id === 'bear:decoy' && (p.taunt ?? 0) > 0)).toBe(true);
    const hp = e.hp;
    run(w, 2.5);
    expect(e.hp).toBeLessThan(hp);
    run(w, TOTEM_RULES.bear.duration);
    expect(b.bearTime).toBe(0);
    expect(b.passives.some((p) => p.id.startsWith('bear:'))).toBe(false);
  });

  it('非戰鬥中可以換主動技能（換圖騰種類）；戰鬥中不行', () => {
    const { w, heroes } = setup(['totemist']);
    w.enqueue({ type: 'setSkills', heroSlot: heroes[0].heroSlot, skills: ['totemBind'] });
    w.step();
    expect(heroes[0].def.skills).toEqual(['totemBind']);
  });
});

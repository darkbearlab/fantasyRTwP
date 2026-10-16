import { describe, expect, it } from 'vitest';
import { applyStun, damageMultOf, isBehind, startAction, strike } from '../src/sim/actions';
import { COMBOS } from '../src/sim/data/combos';
import { ENEMIES } from '../src/sim/data/enemies';
import { HEROES } from '../src/sim/data/heroes';
import { TERRAIN } from '../src/sim/data/terrain';
import type { MapDef, UnitDef } from '../src/sim/data/types';
import type { SimEvent } from '../src/sim/events';
import { dist } from '../src/sim/math';
import type { Unit } from '../src/sim/unit';
import type { UnitSpawn } from '../src/sim/world';
import { World } from '../src/sim/world';
import { HOLD, OPEN_MAP, PASSIVE, run } from './helpers';

/** 必中（而且必定爆擊，傷害倍率固定）版本，方便比較倍率 */
const sure = (d: UnitDef): UnitDef => ({ ...d, accuracy: 999 });
/** 沒有護甲、生命很多的木樁 */
const dummy: UnitDef = { ...ENEMIES.brute, id: 'dummy', maxHp: 100000, armor: 0, defense: 0, skills: [] };
const DEFS: Record<string, UnitDef> = {
  berserker: sure(HEROES.berserker),
  rogue: sure(HEROES.rogue),
  hexer: sure(HEROES.hexer),
  alchemist: sure(HEROES.alchemist),
  warrior: sure(HEROES.warrior),
  cleric: sure(HEROES.cleric),
  mage: sure(HEROES.mage),
  ranger: sure(HEROES.ranger),
  brute: sure(ENEMIES.brute),
  dummy,
};

function world(spawns: UnitSpawn[], map: MapDef = OPEN_MAP): World {
  return new World({ seed: 3, map, spawns, config: PASSIVE, defs: DEFS, idleBehavior: HOLD });
}

const hits = (evs: SimEvent[], skillId?: string) =>
  evs.filter((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit' && (skillId === undefined || e.skillId === skillId));

/** 同一個 strike 參數打木樁，回傳傷害（固定傷害區間＋必定爆擊，結果可直接比較） */
function strikeDamage(setup: (w: World, src: Unit, t: Unit) => void, params: Partial<Parameters<typeof strike>[3]> = {}, srcId = 'rogue'): number {
  const w = world([{ defId: srcId, pos: { x: 5, y: 5 } }, { defId: 'dummy', pos: { x: 5.9, y: 5 } }]);
  const [src, t] = w.units;
  setup(w, src, t);
  const before = t.hp;
  strike(w, src, t, { melee: true, damageType: 'melee', mult: 1, flatDamage: [20, 20], ...params });
  return before - t.hp;
}

describe('狂戰士（SPEC_SLICE3 §1.4）', () => {
  it('旋風斬打到周圍所有敵人，範圍外的不會', () => {
    const w = world([
      { defId: 'berserker', pos: { x: 8, y: 6 } },
      { defId: 'dummy', pos: { x: 9.2, y: 6 } },
      { defId: 'dummy', pos: { x: 6.8, y: 6 } },
      { defId: 'dummy', pos: { x: 8, y: 7.2 } },
      { defId: 'dummy', pos: { x: 13, y: 6 } },
    ]);
    const [b] = w.units;
    w.enqueue({ type: 'skill', unitId: b.id, skillId: 'whirlwind' });
    const evs = run(w, 30);
    const targets = new Set(hits(evs, 'whirlwind').map((e) => e.targetId));
    expect(targets.size).toBe(3);
    expect(targets.has(w.units[4].id)).toBe(false);
  });

  it('不產生控制區；生命越低傷害越高（最多 +50%）', () => {
    const w = world([{ defId: 'berserker', pos: { x: 5, y: 5 } }]);
    const [b] = w.units;
    expect(b.def.projectsZoc).toBe(false);
    const full = damageMultOf(w, b);
    b.hp = b.maxHp / 2;
    expect(damageMultOf(w, b) / full).toBeCloseTo(1.25, 5);
    b.hp = 0.0001;
    expect(damageMultOf(w, b) / full).toBeCloseTo(1.5, 3);
  });
});

describe('盜賊（SPEC_SLICE3 §1.4）', () => {
  it('背後判定：目標面向的反方向 120° 以上', () => {
    const w = world([{ defId: 'rogue', pos: { x: 5, y: 5 } }, { defId: 'dummy', pos: { x: 6, y: 5 } }]);
    const [r, t] = w.units;
    t.facing = 0; // 面向 +x，盜賊在 −x：背後
    expect(isBehind(r, t)).toBe(true);
    t.facing = Math.PI; // 面向盜賊
    expect(isBehind(r, t)).toBe(false);
    t.facing = Math.PI / 2; // 側面 90°
    expect(isBehind(r, t)).toBe(false);
  });

  it('背刺：背後 ×2.5、正面 ×1；普攻背後 ×1.5', () => {
    const front = strikeDamage((_w, _r, t) => (t.facing = Math.PI), { behindMult: 2.5, skillId: 'backstab' });
    const back = strikeDamage((_w, _r, t) => (t.facing = 0), { behindMult: 2.5, skillId: 'backstab' });
    expect(back / front).toBeCloseTo(2.5, 1);
    const basicFront = strikeDamage((_w, _r, t) => (t.facing = Math.PI));
    const basicBack = strikeDamage((_w, _r, t) => (t.facing = 0));
    expect(basicBack / basicFront).toBeCloseTo(HEROES.rogue.backstabMult!, 1);
  });

  it('連動：背刺暈眩中的目標必定爆擊（命中再低也一樣）', () => {
    const w = world([{ defId: 'rogue', pos: { x: 5, y: 5 } }, { defId: 'dummy', pos: { x: 5.9, y: 5 } }]);
    const [r, t] = w.units;
    (r as { def: UnitDef }).def = { ...r.def, accuracy: -999 };
    applyStun(w, t, 2);
    const evs: SimEvent[] = [];
    for (let i = 0; i < 5; i++) {
      strike(w, r, t, { melee: true, damageType: 'melee', mult: 1, critVsStunned: true, skillId: 'backstab' });
    }
    evs.push(...w.step());
    expect(t.hp).toBeLessThan(t.maxHp);
    // 沒暈眩時同樣的命中一定落空
    t.stunTime = 0;
    const hp = t.hp;
    strike(w, r, t, { melee: true, damageType: 'melee', mult: 1, critVsStunned: true, skillId: 'backstab' });
    expect(t.hp).toBe(hp);
  });

  it('煙霧彈：敵人在 2 m 外看不到、可以穿過控制區，攻擊後解除', () => {
    const w = world([
      { defId: 'rogue', pos: { x: 5, y: 5 } },
      { defId: 'brute', pos: { x: 9, y: 5 } },
      { defId: 'brute', pos: { x: 5.9, y: 6.5 } },
    ]);
    const [r, far, near] = w.units;
    (r as { def: UnitDef }).def = { ...r.def, skills: ['backstab', 'smokeBomb', 'tumble'] };
    w.enqueue({ type: 'skill', unitId: r.id, skillId: 'smokeBomb' });
    run(w, 6);
    expect(r.stealthTime).toBeGreaterThan(1.5);
    expect(w.canTarget(far, r)).toBe(false);
    expect(w.canTarget(near, r)).toBe(true);
    // 隱匿中移動不會被控制區牽制
    expect(w.moveAlong(r, { x: 5, y: 9 })).not.toBe('pinned');
    r.revealTime = 0;
    w.enqueue({ type: 'attack', unitIds: [r.id], targetId: near.id });
    run(w, 30);
    expect(r.stealthTime).toBe(0);
  });
});

describe('咒術師（SPEC_SLICE3 §1.4）', () => {
  it('衰弱詛咒：8 秒內行動條慢 40%、受到傷害 +15%', () => {
    const w = world([{ defId: 'hexer', pos: { x: 3, y: 5 } }, { defId: 'dummy', pos: { x: 9, y: 5 } }]);
    const [h, t] = w.units;
    w.enqueue({ type: 'skill', unitId: h.id, skillId: 'curse', targetId: t.id });
    const evs = run(w, 60);
    expect(evs.some((e) => e.type === 'status' && e.text === '詛咒')).toBe(true);
    expect(t.curseTime).toBeGreaterThan(6);
    startAction(w, t, { kind: 'attack', targetId: h.id });
    const cursedTicks = t.action!.ticksTotal;
    t.action = null;
    t.curseTime = 0;
    startAction(w, t, { kind: 'attack', targetId: h.id });
    expect(cursedTicks / t.action!.ticksTotal).toBeCloseTo(1 / 0.6, 1);
    t.action = null;
    const plain = strikeDamage(() => {}, {}, 'hexer');
    const cursed = strikeDamage((_w, _s, d) => {
      d.curseTime = 5;
      d.curseVuln = 0.15;
    }, {}, 'hexer');
    expect(cursed / plain).toBeCloseTo(1.15, 1);
  });

  it('沼澤：區域內敵人移動 ×0.5，自己人不受影響；8 秒後消失', () => {
    const w = world([{ defId: 'hexer', pos: { x: 3, y: 5 } }, { defId: 'dummy', pos: { x: 9, y: 5 } }, { defId: 'warrior', pos: { x: 9, y: 6 } }]);
    const [h, e, ally] = w.units;
    (h as { def: UnitDef }).def = { ...h.def, skills: ['curse', 'iceBind', 'swamp'] };
    w.enqueue({ type: 'skill', unitId: h.id, skillId: 'swamp', point: { x: 9, y: 5.5 } });
    run(w, 40);
    expect(w.zones.length).toBe(1);
    expect(w.moveMultFor(e)).toBe(0.5);
    expect(w.moveMultFor(ally)).toBe(1);
    run(w, 30 * 9);
    expect(w.zones.length).toBe(0);
    expect(w.moveMultFor(e)).toBe(1);
  });
});

describe('煉金術士（SPEC_SLICE3 §1.4）', () => {
  const walled: MapDef = { ...OPEN_MAP, id: 'walled', obstacles: [{ x: 8, y: 2, w: 1, h: 8 }] };

  it('火焰瓶不需視線：隔著牆也丟得到，命中的敵人燃燒', () => {
    const w = world([{ defId: 'alchemist', pos: { x: 5, y: 6 } }, { defId: 'dummy', pos: { x: 11, y: 6 } }], walled);
    const [a, t] = w.units;
    expect(w.canSee(a, t)).toBe(false);
    w.enqueue({ type: 'skill', unitId: a.id, skillId: 'firebomb', point: { x: 11, y: 6 } });
    const evs = run(w, 60);
    expect(hits(evs, 'firebomb')).toHaveLength(1);
    expect(t.burnTime).toBeGreaterThan(2);
    const burnHits = hits(run(w, 30 * 3), 'burn');
    expect(burnHits.length).toBeGreaterThanOrEqual(2);
    expect(burnHits[0].damage).toBe(TERRAIN.burnDamagePerSecond);
  });

  it('普攻是拋物線：不需視線、不受矮籬掩體影響', () => {
    const w = world([{ defId: 'alchemist', pos: { x: 5, y: 6 } }, { defId: 'dummy', pos: { x: 11, y: 6 } }], walled);
    const [a, t] = w.units;
    w.enqueue({ type: 'attack', unitIds: [a.id], targetId: t.id });
    const evs = run(w, 90);
    expect(hits(evs).some((e) => e.sourceId === a.id)).toBe(true);
  });

  it('治療藥瓶：範圍內友軍回血', () => {
    const w = world([
      { defId: 'alchemist', pos: { x: 3, y: 6 } },
      { defId: 'warrior', pos: { x: 9, y: 6 }, hp: 50 },
      { defId: 'cleric', pos: { x: 9.8, y: 6.5 }, hp: 40 },
      { defId: 'mage', pos: { x: 15, y: 6 }, hp: 30 },
      { defId: 'dummy', pos: { x: 19, y: 11 } },
    ]);
    const [a, war, cl, mg] = w.units;
    w.enqueue({ type: 'skill', unitId: a.id, skillId: 'healFlask', point: { x: 9.4, y: 6.2 } });
    run(w, 60);
    expect(war.hp).toBe(70);
    expect(cl.hp).toBe(60);
    expect(mg.hp).toBe(30);
  });
});

describe('技能連動（SPEC_SLICE3 §1.6）', () => {
  it('碎冰：定身中的目標受到近戰重擊 +50% 並解除定身', () => {
    const plain = strikeDamage(() => {}, { shatters: true, skillId: 'shieldBash' }, 'warrior');
    let rootAfter = -1;
    const shattered = strikeDamage((_w, _s, t) => (t.rootTime = 3), { shatters: true, skillId: 'shieldBash' }, 'warrior');
    expect(shattered / plain).toBeCloseTo(COMBOS.shatterMult, 1);
    const w = world([{ defId: 'warrior', pos: { x: 5, y: 5 } }, { defId: 'dummy', pos: { x: 5.9, y: 5 } }]);
    const [war, t] = w.units;
    t.rootTime = 3;
    strike(w, war, t, { melee: true, damageType: 'melee', mult: 1, shatters: true, skillId: 'shieldBash' });
    rootAfter = t.rootTime;
    expect(rootAfter).toBe(0);
    // 沒有碎冰能力的攻擊不會解除定身
    t.rootTime = 3;
    strike(w, war, t, { melee: true, damageType: 'melee', mult: 1 });
    expect(t.rootTime).toBe(3);
  });

  it('擊退撞牆：聖光震擊把目標推到障礙物上會暈眩 1 秒；空地上不會', () => {
    const wallMap: MapDef = { ...OPEN_MAP, id: 'wall', obstacles: [{ x: 7, y: 0, w: 1, h: 12 }] };
    const near = world([{ defId: 'cleric', pos: { x: 5, y: 5 } }, { defId: 'dummy', pos: { x: 5.9, y: 5 } }], wallMap);
    const [c1, t1] = near.units;
    strike(near, c1, t1, { melee: true, damageType: 'melee', mult: 1, knockback: 2, wallStun: true, skillId: 'holySmite' });
    expect(t1.stunTime).toBeCloseTo(COMBOS.wallStunSeconds, 5);
    const open = world([{ defId: 'cleric', pos: { x: 3, y: 5 } }, { defId: 'dummy', pos: { x: 3.9, y: 5 } }], wallMap);
    const [c2, t2] = open.units;
    strike(open, c2, t2, { melee: true, damageType: 'melee', mult: 1, knockback: 2, wallStun: true, skillId: 'holySmite' });
    expect(t2.stunTime).toBe(0);
    expect(dist(t2.pos, { x: 5.9, y: 5 })).toBeLessThan(0.15);
  });

  it('戰吼：周圍友軍命中 +15', () => {
    const w = world([{ defId: 'warrior', pos: { x: 5, y: 5 } }, { defId: 'ranger', pos: { x: 7, y: 5 } }, { defId: 'mage', pos: { x: 15, y: 5 } }, { defId: 'dummy', pos: { x: 19, y: 11 } }]);
    const [war, r, m] = w.units;
    (war as { def: UnitDef }).def = { ...war.def, skills: ['guard', 'battleCry', 'charge'] };
    const base = r.accuracy;
    w.enqueue({ type: 'skill', unitId: war.id, skillId: 'battleCry' });
    run(w, 20);
    expect(r.accuracy - base).toBe(15);
    expect(m.blessTime).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { actionRate, startAction } from '../src/sim/actions';
import { HORDE_CHAIN, HORDE_CONFIG } from '../src/sim/data/horde';
import { ENEMIES } from '../src/sim/data/enemies';
import { HEROES } from '../src/sim/data/heroes';
import type { MapDef, UnitDef } from '../src/sim/data/types';
import type { SimConfig } from '../src/sim/simConfig';
import type { Unit } from '../src/sim/unit';
import type { UnitSpawn } from '../src/sim/world';
import { World } from '../src/sim/world';
import { HOLD, NEUTRAL_PACING, run } from './helpers';

const MAP: MapDef = { id: 'hh', name: '測試', width: 30, height: 30, obstacles: [], heroSpawns: [], enemySpawns: [] };
const HORDE: Partial<SimConfig> = { ...NEUTRAL_PACING, ...HORDE_CONFIG, enemyAggroRange: 0, enemyAggroTime: 1e9 };

/** 必中的英雄（命中 50、目標防禦 0 → 一定命中） */
const hero = (id: string, x: number, y: number, extra: Partial<UnitDef> = {}): UnitSpawn => ({ defId: id, def: { ...HEROES[id], accuracy: 50, maxHp: 1000, ...extra }, pos: { x, y } });
/** 不會動的雜兵靶子 */
const dummy = (x: number, y: number, hp = 1000): UnitSpawn => ({ defId: 'thrall', def: { ...ENEMIES.thrall, maxHp: hp, defense: 0, ai: 'nest' }, pos: { x, y } });

function world(spawns: UnitSpawn[], config: Partial<SimConfig> = HORDE): World {
  return new World({ seed: 7, map: MAP, spawns, config, idleBehavior: HOLD, horde: { spawners: [], waves: [], objective: { type: 'clear' } } });
}

const byId = (w: World, id: string) => w.units.find((u) => u.def.id === id)!;
const dummies = (w: World) => w.units.filter((u) => u.team === 'enemy');
const dmg = (u: Unit) => u.maxHp - u.hp;

/** 對 t 普攻一次（直接走到生效那一刻） */
function attackOnce(w: World, u: Unit, t: Unit): void {
  startAction(w, u, { kind: 'attack', targetId: t.id });
  for (let i = 0; i < 300 && u.action?.phase === 'windup'; i++) w.step();
}

describe('怪群模式：普攻命中效果（SPEC_SLICE4 §3.1）', () => {
  it('戰士橫掃：前方扇形內全部受傷，背後不受傷；每第 3 擊重擊附帶擊退', () => {
    const w = world([hero('warrior', 10, 10), dummy(10.9, 10), dummy(10.7, 10.6), dummy(9.1, 10)]);
    const war = byId(w, 'warrior');
    const [a, b, behind] = dummies(w);
    attackOnce(w, war, a);
    expect(dmg(a)).toBeGreaterThan(0);
    expect(dmg(b)).toBeGreaterThan(0);
    expect(dmg(behind)).toBe(0);
    run(w, 60);
    attackOnce(w, war, a);
    run(w, 60);
    const before = a.pos.x;
    attackOnce(w, war, a);
    expect(a.pos.x).toBeGreaterThan(before + 0.5);
  });

  it('遊俠穿透：箭穿過後方的敵人，傷害遞減；擊殺時下一箭立即射出', () => {
    const w = world([hero('ranger', 5, 10), dummy(10, 10), dummy(12, 10.2), dummy(14, 9.9), dummy(16, 10)]);
    const r = byId(w, 'ranger');
    const [a, b, c, d] = dummies(w);
    attackOnce(w, r, a);
    run(w, 60);
    expect(dmg(a)).toBeGreaterThan(0);
    expect(dmg(b)).toBeGreaterThan(0);
    expect(dmg(c)).toBeGreaterThan(0);
    // 最多 3 名
    expect(dmg(d)).toBe(0);
    // 擊殺 → 下一擊沒有準備時間
    const w2 = world([hero('ranger', 5, 10), dummy(10, 10, 1)]);
    const r2 = byId(w2, 'ranger');
    attackOnce(w2, r2, dummies(w2)[0]);
    run(w2, 30);
    expect(dummies(w2)[0].dead).toBe(true);
    expect(r2.attackResetPending).toBe(true);
  });

  it('法師震擊：命中點附近的敵人受到濺射並被推開，友軍不受傷', () => {
    const w = world([hero('mage', 4, 10), hero('warrior', 10.6, 11), dummy(10, 10), dummy(10.8, 10)]);
    const m = byId(w, 'mage');
    const war = byId(w, 'warrior');
    const [a, b] = dummies(w);
    const bx = b.pos.x;
    attackOnce(w, m, a);
    run(w, 60);
    expect(dmg(b)).toBeGreaterThan(0);
    expect(b.pos.x).toBeGreaterThan(bx + 0.2);
    expect(dmg(war)).toBe(0);
  });

  it('牧師聖鎚：命中時為附近生命最低的隊友回復', () => {
    const w = world([hero('cleric', 10, 10), hero('ranger', 12, 10), dummy(10.8, 10)]);
    const c = byId(w, 'cleric');
    const r = byId(w, 'ranger');
    r.hp = 500;
    attackOnce(w, c, dummies(w)[0]);
    expect(r.hp).toBeGreaterThan(500);
  });

  it('盜賊：擊殺後下一擊沒有準備時間', () => {
    const w = world([hero('rogue', 10, 10), dummy(10.7, 10, 1), dummy(9.3, 10)]);
    const ro = byId(w, 'rogue');
    attackOnce(w, ro, dummies(w)[0]);
    expect(dummies(w)[0].dead).toBe(true);
    run(w, 2);
    startAction(w, ro, { kind: 'attack', targetId: dummies(w)[1].id });
    expect(ro.action!.ticksTotal).toBe(1);
  });

  it('咒術師咒彈：目標死亡時詛咒擴散給附近 1 名敵人', () => {
    const w = world([hero('hexer', 4, 10), dummy(10, 10), dummy(11, 10)]);
    const h = byId(w, 'hexer');
    const [a, b] = dummies(w);
    attackOnce(w, h, a);
    run(w, 60);
    expect(a.hexed).toBe(true);
    expect(b.hexed).toBe(false);
    a.hp = 1;
    attackOnce(w, h, a);
    run(w, 60);
    expect(a.dead).toBe(true);
    expect(b.hexed).toBe(true);
  });

  it('戰術模式完全照舊：戰士單體、普攻速度與冷卻不變', () => {
    const w = world([hero('warrior', 10, 10), dummy(10.9, 10), dummy(10.7, 10.6)], { ...NEUTRAL_PACING, enemyAggroRange: 0, enemyAggroTime: 1e9 });
    const war = byId(w, 'warrior');
    const [a, b] = dummies(w);
    attackOnce(w, war, a);
    expect(dmg(a)).toBeGreaterThan(0);
    expect(dmg(b)).toBe(0);
    expect(actionRate(w, war, 'attack')).toBeCloseTo(actionRate(w, war, 'skill'));
  });

  it('怪群模式：英雄普攻加速、技能冷卻縮短', () => {
    const w = world([hero('warrior', 10, 10), dummy(11, 10)]);
    const war = byId(w, 'warrior');
    expect(actionRate(w, war, 'attack')).toBeCloseTo(actionRate(w, war, 'skill') * HORDE_CONFIG.basicAttackSpeedMult);
    w.enqueue({ type: 'skill', unitId: war.id, skillId: 'guard', targetId: byId(w, 'warrior').id });
    run(w, 90);
  });
});

describe('怪群模式：戰士嘲諷光環（SPEC_SLICE4 §4）', () => {
  it('光環內的雜兵改打戰士；戰士控制區不牽制雜兵，牧師控制區照舊', () => {
    const horde = { spawners: [{ id: 's', x: 13, y: 10, radius: 0.1 }], waves: [{ id: 'w', trigger: { type: 'start' as const }, spawns: [{ spawner: 's', enemy: 'thrall', count: 1 }] }], objective: { type: 'clear' as const } };
    // 遊俠比較近，但雜兵在戰士的光環內
    const w = new World({ seed: 1, map: MAP, spawns: [hero('warrior', 10, 10), hero('ranger', 13, 12)], config: HORDE, idleBehavior: HOLD, horde });
    run(w, 2);
    const t = w.units.find((u) => u.def.id === 'thrall')!;
    expect(t.hordeTargetId).toBe(byId(w, 'warrior').id);
    // 控制區：戰士不牽制雜兵、牧師會
    const w2 = world([hero('warrior', 10, 10), hero('cleric', 20, 10), dummy(11.2, 10), dummy(21.2, 10)]);
    const [nearWar, nearCleric] = dummies(w2);
    expect(w2.units.filter((u) => u.team === 'hero').some((h) => h.def.id === 'warrior')).toBe(true);
    const pinned = (x: Unit) => w2.units.some((e) => e.team === 'hero' && e.def.projectsZoc && Math.hypot(e.pos.x - x.pos.x, e.pos.y - x.pos.y) < 2.5 && e.def.id === 'cleric');
    expect(pinned(nearWar)).toBe(false);
    expect(pinned(nearCleric)).toBe(true);
  });
});

describe('怪群模式：連鎖反應（SPEC_SLICE4 §3.3）', () => {
  it('被擊退的敵人撞到其他敵人，兩者都受傷', () => {
    const w = world([hero('warrior', 10, 10), dummy(10.8, 10), dummy(11.9, 10)]);
    const war = byId(w, 'warrior');
    const [a, b] = dummies(w);
    war.attackCount = 2; // 下一擊是重擊（擊退 1 m）
    attackOnce(w, war, a);
    expect(dmg(b)).toBeGreaterThanOrEqual(HORDE_CHAIN.knockbackCollisionDamage);
  });

  it('燃燒中的雜兵死亡時，對周圍的敵人造成火焰傷害', () => {
    const w = world([hero('warrior', 10, 10), dummy(10.8, 10, 1), dummy(11.4, 10)]);
    const war = byId(w, 'warrior');
    const [a, b] = dummies(w);
    a.burnTime = 3;
    a.burnSourceId = war.id;
    // 只打 a（b 在橫掃範圍外，比對火焰傷害）
    b.pos = { x: 11.5, y: 10.6 };
    attackOnce(w, war, a);
    expect(a.dead).toBe(true);
    expect(dmg(b)).toBeGreaterThanOrEqual(HORDE_CHAIN.burningDeathDamage);
  });
});

describe('怪群模式：自動施放與攻擊移動（SPEC_SLICE4 §3.1b、§3.4）', () => {
  it('預設不自動施放；開啟後隊友生命低於一半時牧師自己補血；衝鋒不能開', () => {
    // 遠處放一個靶子，戰鬥才不會因為沒有敵人而結束
    const w = world([hero('cleric', 10, 10), hero('ranger', 13, 10), dummy(28, 28)]);
    const c = byId(w, 'cleric');
    const r = byId(w, 'ranger');
    r.hp = 300;
    run(w, 60);
    expect(r.hp).toBe(300);
    w.enqueue({ type: 'setAutocast', unitId: c.id, skillId: 'heal', on: true });
    run(w, 90);
    expect(r.hp).toBeGreaterThan(300);
    const w2 = world([hero('warrior', 10, 10), dummy(28, 28)]);
    const war = byId(w2, 'warrior');
    w2.enqueue({ type: 'setAutocast', unitId: war.id, skillId: 'charge', on: true });
    run(w2, 1);
    expect(war.autocast.has('charge')).toBe(false);
  });

  it('範圍技能：3 名以上敵人聚在一起才自動施放', () => {
    const w = world([hero('mage', 5, 10), dummy(12, 10), dummy(12.5, 10.5)]);
    const m = byId(w, 'mage');
    w.enqueue({ type: 'setAutocast', unitId: m.id, skillId: 'fireball', on: true });
    run(w, 30);
    expect(m.skillReady('fireball')).toBe(true);
    const w2 = world([hero('mage', 5, 10), dummy(12, 10), dummy(12.5, 10.5), dummy(12, 11)]);
    const m2 = byId(w2, 'mage');
    w2.enqueue({ type: 'setAutocast', unitId: m2.id, skillId: 'fireball', on: true });
    run(w2, 120);
    expect(m2.skillReady('fireball')).toBe(false);
  });

  it('攻擊移動：途中遇到敵人先打，打完繼續走到目標點', () => {
    const w = world([hero('warrior', 3, 10), dummy(10, 10, 20), dummy(28, 28)]);
    const war = byId(w, 'warrior');
    w.enqueue({ type: 'attackMove', unitIds: [war.id], point: { x: 25, y: 10 } });
    run(w, 30 * 30);
    expect(dummies(w)[0].dead).toBe(true);
    expect(Math.hypot(war.pos.x - 25, war.pos.y - 10)).toBeLessThan(0.5);
    expect(war.order).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import type { MapDef } from '../src/sim/data/types';
import { World } from '../src/sim/world';
import { HOLD, OPEN_MAP, PASSIVE, run } from './helpers';

const D = { ...PASSIVE, ...deliberateConfig(), enemyAggroRange: 0 };
const world = (spawns: ConstructorParameters<typeof World>[0]['spawns'], map: MapDef = OPEN_MAP) => new World({ seed: 1, map, config: D, idleBehavior: HOLD, spawns });

describe('英雄技能重整（Alan 2026-10-20）', () => {
  it('戰士：嘲諷光環 5 m、防禦 +10；主動是盾擊', () => {
    const w = world([{ defId: 'warrior', def: { ...HEROES.warrior, skills: ['shieldBash'] }, pos: { x: 5, y: 6 } }]);
    const u = w.getUnit(1)!;
    expect(u.passives.find((p) => p.id === 'tauntAura')!.taunt).toBe(5);
    expect(u.defense).toBe(HEROES.warrior.defense + 10);
  });

  it('遊俠的瞄準射擊：打斷敵人的準備動作', () => {
    const w = world([
      { defId: 'ranger', def: { ...HEROES.ranger, skills: ['sureShot'] }, pos: { x: 3, y: 6 } },
      { defId: 'charger', pos: { x: 8, y: 6 } },
    ]);
    const e = w.getUnit(2)!;
    w.enqueue({ type: 'skill', unitId: 1, skillId: 'sureShot', targetId: 2 });
    let interrupted = false;
    for (let i = 0; i < 30 * 6 && !interrupted; i++) {
      // 讓敵人一直處在準備動作中
      if (!e.action) e.action = { kind: 'skill', skillId: 'rush', phase: 'windup', ticksLeft: 999, ticksTotal: 999, point: { x: 3, y: 6 } };
      interrupted = run(w, 1).some((ev) => ev.type === 'interrupt' && ev.targetId === 2);
    }
    expect(interrupted).toBe(true);
  });

  it('牧師的祝福光環：5 m 內隊友命中 +10、防禦 +5；離開範圍很快消失', () => {
    const w = world([
      { defId: 'cleric', pos: { x: 5, y: 6 } },
      { defId: 'warrior', def: { ...HEROES.warrior, skills: [] }, pos: { x: 8, y: 6 } },
      { defId: 'ranger', pos: { x: 15, y: 6 } },
      // 沒有敵人時戰鬥立刻結束：放一名不會警覺的敵人在角落
      { defId: 'brute', pos: { x: 19, y: 11 } },
    ]);
    run(w, 2);
    const near = w.getUnit(2)!;
    const far = w.getUnit(3)!;
    expect(near.blessTime).toBeGreaterThan(0);
    expect(near.blessAccuracy).toBe(10);
    expect(far.blessTime).toBe(0);
    near.pos = { x: 15, y: 9 };
    run(w, 15);
    expect(near.blessTime).toBe(0);
  });

  it('法師：寒氣光環讓 3 m 內的敵人變慢；普攻是小火球；附魔讓範圍內隊友傷害 +30%', () => {
    const w = world([
      { defId: 'mage', def: { ...HEROES.mage, skills: ['enchant'] }, pos: { x: 5, y: 6 } },
      { defId: 'warrior', def: { ...HEROES.warrior, skills: [] }, pos: { x: 7, y: 6 } },
      { defId: 'brute', pos: { x: 7, y: 8 } },
      { defId: 'brute', pos: { x: 15, y: 6 } },
    ]);
    run(w, 2);
    const mage = w.getUnit(1)!;
    expect(w.getUnit(3)!.chillTime).toBeGreaterThan(0);
    expect(w.moveMultFor(w.getUnit(3)!)).toBeCloseTo(0.75 * w.moveMultFor(w.getUnit(4)!));
    expect(w.getUnit(4)!.chillTime).toBe(0);
    expect(mage.basicProjectile).toBe('fireball');
    w.enqueue({ type: 'skill', unitId: 1, skillId: 'enchant' });
    run(w, 3 * 30);
    expect(w.getUnit(2)!.damageBuffTime).toBeGreaterThan(0);
    // 附魔 +30% × 英雄技能效果倍率（沉穩節奏）
    expect(w.getUnit(2)!.outgoingDamageMult).toBeCloseTo((HEROES.warrior.damageMult ?? 1) * (1 + 0.3 * w.config.heroSkillPowerMult), 1);
  });

  it('遊俠的鷹眼：看得見 10 m 內草叢裡的敵人，並分享給全隊', () => {
    const map: MapDef = { ...OPEN_MAP, id: 'brushmap', terrain: [{ kind: 'brush', x: 12, y: 4, w: 4, h: 4 }] };
    const spawns = (withRanger: boolean) => [
      { defId: 'mage', pos: { x: 2, y: 6 } },
      ...(withRanger ? [{ defId: 'ranger', pos: { x: 6, y: 6 } }] : []),
      { defId: 'assassin', pos: { x: 14, y: 6 } },
    ];
    const a = world(spawns(false), map);
    run(a, 1);
    const enemyA = a.units.find((u) => u.team === 'enemy')!;
    expect(a.visibleToTeam(enemyA, 'hero')).toBe(false);
    const b = world(spawns(true), map);
    run(b, 1);
    const enemyB = b.units.find((u) => u.team === 'enemy')!;
    expect(b.visibleToTeam(enemyB, 'hero')).toBe(true);
    // 視野分享：離得遠的法師也能把它當目標
    expect(b.canTarget(b.getUnit(1)!, enemyB)).toBe(true);
  });
});

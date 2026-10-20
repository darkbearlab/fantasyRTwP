import { describe, expect, it } from 'vitest';
import { applyDamage } from '../src/sim/actions';
import { pickTarget, targetScore } from '../src/sim/ai/enemyAI';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { ENEMIES } from '../src/sim/data/enemies';
import type { MapDef } from '../src/sim/data/types';
import type { UnitSpawn } from '../src/sim/world';
import { HOLD, OPEN_MAP, makeWorld, run } from './helpers';

/** 沉穩節奏、敵人察覺距離放大（測試直接看行為） */
const D = (spawns: UnitSpawn[], range = 30, map: MapDef = OPEN_MAP) => makeWorld(spawns, { ...deliberateConfig(), enemyAggroRange: range }, map, 1, HOLD);

describe('沉穩節奏的敵人（SPEC_SLICE5 §15）', () => {
  it('盾兵：生命高於一半前防禦、護甲較高；跌破後「破盾」，不再恢復', () => {
    const w = D([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'shieldbearer', pos: { x: 18, y: 6 } }], 0);
    const s = w.getUnit(2)!;
    const sh = ENEMIES.shieldbearer.shield!;
    expect(s.defense).toBe(ENEMIES.shieldbearer.defense + sh.defense);
    expect(s.armor).toBe(ENEMIES.shieldbearer.armor + sh.armor);
    applyDamage(w, s, Math.ceil(s.maxHp * 0.55), 'melee', w.getUnit(1)!);
    expect(s.shieldUp).toBe(false);
    expect(w.step().length).toBeGreaterThanOrEqual(0);
    expect(s.defense).toBe(ENEMIES.shieldbearer.defense);
    s.hp = s.maxHp;
    expect(s.shieldUp).toBe(false);
  });

  it('小隊警覺：看到英雄的敵人與同小隊的同伴一起進攻；其他小隊不動', () => {
    const w = D(
      [
        { defId: 'warrior', pos: { x: 2, y: 6 } },
        { defId: 'brute', pos: { x: 8, y: 6 }, squad: 'a' },
        { defId: 'brute', pos: { x: 19, y: 1 }, squad: 'a' },
        { defId: 'brute', pos: { x: 19, y: 11 }, squad: 'b' },
      ],
      8,
    );
    run(w, 10);
    expect(w.getUnit(2)!.alerted).toBe(true);
    expect(w.getUnit(3)!.alerted).toBe(true);
    expect(w.getUnit(4)!.alerted).toBe(false);
    run(w, 60);
    expect(w.getUnit(4)!.order).toBeNull();
    expect(w.getUnit(3)!.order?.type).toBe('attack');
  });

  it('被打的敵人會警覺（只有它的小隊）', () => {
    const w = D([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 18, y: 2 }, squad: 'a' }, { defId: 'brute', pos: { x: 18, y: 10 } }], 0);
    applyDamage(w, w.getUnit(2)!, 1, 'melee', w.getUnit(1)!);
    expect(w.getUnit(2)!.alerted).toBe(true);
    expect(w.getUnit(3)!.alerted).toBe(false);
  });

  it('目標優先度：刺客優先後排；蠻兵優先最近；仇恨提高分數；嘲諷光環最優先', () => {
    const w = D([
      { defId: 'warrior', pos: { x: 10, y: 6 } },
      { defId: 'mage', pos: { x: 4, y: 6 } },
      { defId: 'assassin', pos: { x: 14.5, y: 6 } },
      { defId: 'brute', pos: { x: 13, y: 9 } },
    ]);
    const [war, mage, ass, brute] = [1, 2, 3, 4].map((i) => w.getUnit(i)!);
    // 戰士的嘲諷光環 3 m 外
    expect(pickTarget(w, ass, [war, mage])).toBe(mage);
    expect(pickTarget(w, brute, [war, mage])).toBe(war);
    const before = targetScore(w, brute, mage, -1);
    applyDamage(w, brute, 30, 'spell', mage);
    expect(targetScore(w, brute, mage, -1)).toBeGreaterThan(before);
    // 進入嘲諷光環：刺客也改打戰士
    ass.pos = { x: 11.5, y: 6 };
    expect(pickTarget(w, ass, [war, mage])).toBe(war);
  });

  it('衝鋒兵：預兆後直線衝鋒，撞到的英雄受傷但不擊倒', () => {
    const w = D([{ defId: 'mage', pos: { x: 6, y: 6 } }, { defId: 'charger', pos: { x: 12, y: 6 } }]);
    const evs = run(w, 6 * 30);
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === 2 && e.skillId === 'rush')).toBe(true);
    const hits = evs.filter((e) => e.type === 'hit' && e.sourceId === 2 && e.skillId === 'rush');
    expect(hits.length).toBe(1);
    expect(evs.some((e) => e.type === 'status' && e.unitId === 1 && e.text === '暈眩')).toBe(false);
  });

  it('刺客：跳到落點，落地打周圍；離開落點就躲得掉', () => {
    const w = D([{ defId: 'mage', pos: { x: 6, y: 6 } }, { defId: 'assassin', pos: { x: 12, y: 6 } }]);
    const evs: ReturnType<typeof run> = [];
    let moved = false;
    for (let i = 0; i < 4 * 30; i++) {
      const e = w.step();
      evs.push(...e);
      // 看到預兆就往旁邊走開
      if (!moved && e.some((x) => x.type === 'actionStart' && x.skillId === 'leap')) {
        w.getUnit(1)!.pos = { x: 6, y: 10 };
        moved = true;
      }
    }
    expect(moved).toBe(true);
    expect(evs.some((e) => e.type === 'aoe' && e.skillId === 'leap')).toBe(true);
    expect(evs.some((e) => e.type === 'hit' && e.skillId === 'leap')).toBe(false);
    expect(w.getUnit(2)!.pos.x).toBeLessThan(7);
  });

  it('鉤手：把後排英雄拉到身前', () => {
    // 交戰距離 ×0.6：鉤鎖射程 8 → 4.8 m
    const w = D([{ defId: 'warrior', pos: { x: 15, y: 2 } }, { defId: 'mage', pos: { x: 6.5, y: 6 } }, { defId: 'hooker', pos: { x: 11, y: 6 } }]);
    const evs = run(w, 4 * 30);
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === 3 && e.skillId === 'hook' && e.targetId === 2)).toBe(true);
    expect(evs.some((e) => e.type === 'status' && e.unitId === 2 && e.text === '被鉤住')).toBe(true);
    expect(w.getUnit(2)!.pos.x).toBeGreaterThan(9);
  });

  it('祭司：治療受傷的同伴', () => {
    const w = D([{ defId: 'warrior', pos: { x: 2, y: 2 } }, { defId: 'priest', pos: { x: 14, y: 6 } }, { defId: 'brute', pos: { x: 17, y: 6 } }]);
    w.getUnit(3)!.hp = 30;
    const evs = run(w, 6 * 30);
    expect(evs.some((e) => e.type === 'heal' && e.sourceId === 2 && e.targetId === 3)).toBe(true);
  });

  it('召喚師：召喚 3 隻屍僕，召喚物直接進入戰鬥', () => {
    const w = D([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'summoner', pos: { x: 16, y: 6 } }]);
    const evs = run(w, 4 * 30);
    const spawned = evs.filter((e) => e.type === 'spawn' && e.byId === 2);
    expect(spawned.length).toBe(3);
    for (const e of spawned) {
      const m = w.getUnit((e as { unitId: number }).unitId)!;
      expect(m.def.id).toBe('minion');
      expect(m.alerted).toBe(true);
    }
  });

  it('自爆屍：貼近後倒數自爆、自己死亡；範圍內的英雄受傷', () => {
    const w = D([{ defId: 'warrior', pos: { x: 4, y: 6 } }, { defId: 'exploder', pos: { x: 9, y: 6 } }]);
    const evs = run(w, 10 * 30);
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === 2 && e.skillId === 'selfDestruct')).toBe(true);
    expect(w.getUnit(2)!.dead).toBe(true);
    expect(evs.some((e) => e.type === 'hit' && e.sourceId === 2 && e.targetId === 1 && e.skillId === 'selfDestruct')).toBe(true);
  });
});

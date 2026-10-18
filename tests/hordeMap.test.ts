import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../src/run/data/encounters';
import { createBattleFromRun } from '../src/run/battle';
import { createRun } from '../src/run/runState';
import { HORDE_VISION } from '../src/sim/data/horde';
import { HEROES } from '../src/sim/data/heroes';
import { ENEMIES } from '../src/sim/data/enemies';
import { MAPS } from '../src/sim/data/maps';
import type { HordeSetup, MapDef } from '../src/sim/data/types';
import { findPath } from '../src/sim/nav/astar';
import { NavGrid } from '../src/sim/nav/grid';
import { FOG_EXPLORED, FOG_UNEXPLORED, FOG_VISIBLE } from '../src/sim/vision';
import type { UnitSpawn } from '../src/sim/world';
import { World } from '../src/sim/world';
import { HOLD, NEUTRAL_PACING, run } from './helpers';

const MAP: MapDef = { id: 'fog', name: '測試', width: 40, height: 40, obstacles: [{ x: 20, y: 0, w: 1, h: 30 }], heroSpawns: [], enemySpawns: [] };
const FOG: HordeSetup = { spawners: [], waves: [], objective: { type: 'clear' }, fog: true };
const hero = (x: number, y: number, id = 'ranger'): UnitSpawn => ({ defId: id, def: { ...HEROES[id], maxHp: 1000 }, pos: { x, y } });
const still = (x: number, y: number): UnitSpawn => ({ defId: 'thrall', def: { ...ENEMIES.thrall, ai: 'nest', maxHp: 1000 }, pos: { x, y } });

function fogWorld(spawns: UnitSpawn[], idle = HOLD): World {
  return new World({ seed: 1, map: MAP, spawns, config: { ...NEUTRAL_PACING, enemyAggroRange: 0, enemyAggroTime: 1e9 }, idleBehavior: idle, horde: FOG });
}

describe('視線與戰爭迷霧（SPEC_SLICE4 §6）', () => {
  it('視野半徑內可見、牆後看不到；未探索／已探索／視野內三種狀態', () => {
    const w = fogWorld([hero(15, 10), still(30, 40 - 1)]);
    const v = w.vision!;
    expect(v.stateAt({ x: 18, y: 10 })).toBe(FOG_VISIBLE);
    // 牆後（同一高度、在視野半徑內）看不到
    expect(v.stateAt({ x: 23, y: 10 })).toBe(FOG_UNEXPLORED);
    // 視野半徑外
    expect(v.stateAt({ x: 15, y: 10 + HORDE_VISION.heroSightRange + 3 })).toBe(FOG_UNEXPLORED);
    // 英雄離開後，看過的地方變成「已探索」
    w.units[0].pos = { x: 5, y: 38 };
    run(w, HORDE_VISION.interval + 1);
    expect(v.stateAt({ x: 18, y: 10 })).toBe(FOG_EXPLORED);
    expect(v.stateAt({ x: 5, y: 35 })).toBe(FOG_VISIBLE);
  });

  it('視野外的敵人：不能下攻擊指令、閒置自動攻擊不會打；進入視野後可以', () => {
    const w = fogWorld([hero(5, 10), still(30, 10)]);
    const [h, e] = w.units;
    expect(w.canTarget(h, e)).toBe(false);
    expect(w.visibleToTeam(e, 'hero')).toBe(false);
    w.enqueue({ type: 'attack', unitIds: [h.id], targetId: e.id });
    run(w, 1);
    expect(h.order).toBeNull();
    // 關掉迷霧（除錯）就看得到
    w.enqueue({ type: 'setConfig', patch: { fogOfWar: false } });
    run(w, 1);
    expect(w.canTarget(h, e)).toBe(true);
    w.enqueue({ type: 'setConfig', patch: { fogOfWar: true } });
    run(w, 1);
    // 走到看得到的位置
    h.pos = { x: 25, y: 14 };
    run(w, HORDE_VISION.interval + 1);
    expect(w.canTarget(h, e)).toBe(true);
  });

  it('沒有啟用迷霧的遭遇不受影響', () => {
    const w = new World({ seed: 1, map: MAP, spawns: [hero(5, 10), still(30, 10)], config: NEUTRAL_PACING, idleBehavior: HOLD });
    expect(w.vision).toBeNull();
    expect(w.canTarget(w.units[0], w.units[1])).toBe(true);
  });
});

describe('怪群地圖 horde01（SPEC_SLICE4 §5）', () => {
  const map = MAPS.horde01;
  const enc = ENCOUNTERS.hordeMoria;

  it('96 × 96 m；英雄出生點、所有生成點都可走；從出生點走得到出口，而且路線是之字形（比直線長很多）', () => {
    expect(map.width).toBe(96);
    expect(map.height).toBe(96);
    const g = NavGrid.fromMap(map, 0.5, 0.45);
    for (const p of map.heroSpawns) expect(g.isWalkable(p)).toBe(true);
    for (const s of enc.horde!.spawners) expect(g.isWalkable(s), s.id).toBe(true);
    const exit = map.landmarks!.exit;
    const path = findPath(g, map.heroSpawns[0], exit)!;
    expect(path).not.toBeNull();
    let len = 0;
    let prev = map.heroSpawns[0];
    for (const p of path) {
      len += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
    const straight = Math.hypot(exit.x - map.heroSpawns[0].x, exit.y - map.heroSpawns[0].y);
    expect(len).toBeGreaterThan(straight * 1.8);
  });

  it('hordeMoria：啟用迷霧；進入區域觸發波次；全員抵達出口即勝利', () => {
    const r = createRun(2);
    const node = r.map.nodes.find((n) => n.layer === 1)!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: 'hordeMoria', fromEvent: false };
    const w = createBattleFromRun(r);
    expect(w.fogActive).toBe(true);
    const heroes = w.units.filter((u) => u.team === 'hero');
    // 把隊伍移到長廊：觸發「長廊」波次
    for (const h of heroes) h.pos = { x: 30, y: 66 };
    const evs = run(w, 2);
    expect(evs.some((e) => e.type === 'waveStart' && e.waveId === '長廊')).toBe(true);
    // 全員到出口
    for (const h of heroes) h.pos = { x: 91, y: 4 };
    run(w, 2);
    expect(w.result).toBe('hero');
  });

  it('hordeMoria 的門與絞盤（SPEC_SLICE4 §15.1）：石門關著；鐵柵門上鎖，拉動絞盤才打開，而且會引來「警報」波次', () => {
    const r = createRun(3);
    const node = r.map.nodes.find((n) => n.layer === 1)!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: 'hordeMoria', fromEvent: false };
    const w = createBattleFromRun(r);
    expect(w.interactables.get('gate2')!.open).toBe(false);
    expect(w.interactables.get('gate3')!.def.locked).toBe(true);
    const heroes = w.units.filter((u) => u.team === 'hero');
    for (const h of heroes) h.pos = { x: 62, y: 88.5 };
    w.enqueue({ type: 'interact', unitId: heroes[0].id, objectId: 'lever3' });
    const evs = run(w, 3 * 30);
    expect(w.interactables.get('gate3')!.open).toBe(true);
    expect(evs.some((e) => e.type === 'waveStart' && e.waveId === '警報')).toBe(true);
  });
});

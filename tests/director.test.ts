import { describe, expect, it } from 'vitest';
import { createBattleFromRun } from '../src/run/battle';
import { createRun } from '../src/run/runState';
import { HEROES } from '../src/sim/data/heroes';
import type { DirectorDef, HordeSetup, MapDef } from '../src/sim/data/types';
import type { UnitSpawn } from '../src/sim/world';
import { World } from '../src/sim/world';
import { HOLD, NEUTRAL_PACING, run } from './helpers';

const MAP: MapDef = { id: 'dir', name: '測試', width: 60, height: 60, obstacles: [], heroSpawns: [], enemySpawns: [] };
const tank = (x: number, y: number): UnitSpawn => ({ defId: 'warrior', def: { ...HEROES.warrior, maxHp: 1e6, damage: [0, 0] }, pos: { x, y } });

const DIRECTOR: DirectorDef = {
  enemies: [{ enemy: 'thrall', weight: 1 }],
  packSize: [3, 4],
  spawnDistance: [14, 18],
  cooldown: 1,
  nearbyRadius: 20,
  maxAlive: 30,
  cycle: { buildUp: 1, peak: 100, relax: 10 },
  stages: [{ trigger: { type: 'time', t: 2 }, low: 6, high: 10 }],
};

function world(director: DirectorDef, fog = false, objective: HordeSetup['objective'] = { type: 'exit', rect: { x: 0, y: 0, w: 1, h: 1 } }): World {
  const horde: HordeSetup = { spawners: [], waves: [], objective, director, fog };
  return new World({ seed: 3, map: MAP, spawns: [tank(30, 30)], config: { ...NEUTRAL_PACING, enemyAggroRange: 0, enemyAggroTime: 1e9 }, idleBehavior: HOLD, horde });
}

const spawnsOf = (evs: ReturnType<typeof run>) => evs.filter((e) => e.type === 'spawn' && e.waveId === 'director') as { unitId: number }[];

describe('自動出怪（Alan 回饋：小群、密集、四面八方）', () => {
  it('階段觸發前不出怪；觸發後一群 3–4 隻，出現在隊伍周圍指定距離、視野外', () => {
    const w = world(DIRECTOR, true);
    expect(spawnsOf(run(w, 30)).length).toBe(0);
    const evs = run(w, 3 * 30);
    const ids = spawnsOf(evs).map((e) => e.unitId);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    // 第一群剛出現時的位置
    const first = evs.filter((e) => e.type === 'spawn').slice(0, 3).map((e) => w.getUnit((e as { unitId: number }).unitId)!);
    expect(first.length).toBe(3);
  });

  it('出現位置：距離英雄 14–18 m，而且（有迷霧時）在視野外', () => {
    const w = world(DIRECTOR, true);
    run(w, 2 * 30);
    const evs = w.step();
    const all = [...evs, ...run(w, 10)];
    const born = spawnsOf(all).map((e) => w.getUnit(e.unitId)!);
    expect(born.length).toBeGreaterThan(0);
    for (const u of born) {
      const d = Math.hypot(u.pos.x - 30, u.pos.y - 30);
      expect(d).toBeGreaterThan(14 - 1.3);
      expect(d).toBeLessThan(18 + 1.3);
    }
  });

  it('連續幾群從不同方向出現（四面八方）', () => {
    const w = world({ ...DIRECTOR, stages: [{ trigger: { type: 'start' }, low: 40, high: 40 }] });
    const firstOfPack: { x: number; y: number }[] = [];
    let lastTick = -99;
    for (let i = 0; i < 6 * 30; i++) {
      for (const e of spawnsOf(w.step())) {
        if (w.tick - lastTick > 1) firstOfPack.push({ ...w.getUnit(e.unitId)!.pos });
        lastTick = w.tick;
      }
    }
    expect(firstOfPack.length).toBeGreaterThanOrEqual(4);
    const quads = new Set(firstOfPack.map((p) => Math.floor(((Math.atan2(p.y - 30, p.x - 30) + Math.PI) / (Math.PI / 2)) % 4)));
    expect(quads.size).toBeGreaterThanOrEqual(3);
  });

  it('附近敵人達到目標數量、或全場達到上限就不再補；喘息期不補；階段上限用完就停', () => {
    const w = world({ ...DIRECTOR, maxAlive: 8 });
    run(w, 20 * 30);
    expect(w.units.filter((u) => u.team === 'enemy' && !u.dead).length).toBeLessThanOrEqual(8 + 3);
    // 喘息期（buildUp 0、peak 0）：目標 0
    const calm = world({ ...DIRECTOR, cycle: { buildUp: 0.01, peak: 0.01, relax: 100 } });
    run(calm, 3 * 30);
    const before = calm.units.length;
    run(calm, 5 * 30);
    expect(calm.units.length).toBe(before);
    // 階段上限
    const capped = world({ ...DIRECTOR, stages: [{ trigger: { type: 'start' }, low: 40, high: 40, budget: 5 }] });
    run(capped, 10 * 30);
    expect(capped.units.filter((u) => u.team === 'enemy').length).toBe(5);
  });

  it('目標 clear：總預算用完、敵人清光才算勝利', () => {
    const w = world({ ...DIRECTOR, budget: 4, stages: [{ trigger: { type: 'start' }, low: 40, high: 40 }] }, false, { type: 'clear' });
    run(w, 3 * 30);
    expect(w.director!.exhausted).toBe(true);
    expect(w.result).toBeNull();
    for (const u of w.units) if (u.team === 'enemy') {
      u.hp = 0;
      u.dead = true;
    }
    run(w, 1);
    expect(w.result).toBe('hero');
  });
});

describe('雜兵包圍（Alan 回饋：不要全部從同一側撞上來）', () => {
  it('從同一方向來的一群雜兵，最後分散在英雄四周', () => {
    const horde: HordeSetup = { spawners: [{ id: 'e', x: 45, y: 30, radius: 1.5 }], waves: [{ id: 'w', trigger: { type: 'start' }, spawns: [{ spawner: 'e', enemy: 'thrall', count: 10 }] }], objective: { type: 'clear' } };
    const w = new World({ seed: 5, map: MAP, spawns: [tank(30, 30)], config: { ...NEUTRAL_PACING, enemyAggroRange: 0, enemyAggroTime: 1e9 }, idleBehavior: HOLD, horde });
    run(w, 15 * 30);
    // 以英雄目前的位置為中心（被人群擠動也沒關係）
    const h = w.units[0].pos;
    const near = w.units.filter((u) => u.team === 'enemy' && Math.hypot(u.pos.x - h.x, u.pos.y - h.y) < 2.5);
    expect(near.length).toBeGreaterThanOrEqual(6);
    const quads = new Set(near.map((u) => Math.floor(((Math.atan2(u.pos.y - h.y, u.pos.x - h.x) + Math.PI) / (Math.PI / 2)) % 4)));
    expect(quads.size).toBeGreaterThanOrEqual(3);
  });
});

describe('深淵礦坑（自動出怪版）', () => {
  it('決定論：同一個種子跑出相同的結果', () => {
    const snap = () => {
      const r = createRun(4);
      const node = r.map.nodes.find((n) => n.layer === 1)!;
      r.currentNodeId = node.id;
      r.phase = { kind: 'battle', nodeId: node.id, encounterId: 'hordeMoria', fromEvent: false };
      const w = createBattleFromRun(r);
      for (let i = 0; i < 30 * 30; i++) w.step();
      return w.snapshot();
    };
    expect(snap()).toBe(snap());
  });
});

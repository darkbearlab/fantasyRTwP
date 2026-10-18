import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../src/run/data/encounters';
import { createBattleFromRun } from '../src/run/battle';
import { createRun } from '../src/run/runState';
import { ENEMIES } from '../src/sim/data/enemies';
import { HEROES } from '../src/sim/data/heroes';
import type { HordeSetup, MapDef } from '../src/sim/data/types';
import { FlowField } from '../src/sim/nav/flowField';
import { NavGrid } from '../src/sim/nav/grid';
import { SpatialHash } from '../src/sim/nav/spatial';
import { Unit } from '../src/sim/unit';
import type { UnitSpawn } from '../src/sim/world';
import { World } from '../src/sim/world';
import { HOLD, NEUTRAL_PACING, run } from './helpers';

const BIG: MapDef = { id: 'horde-test', name: '測試', width: 40, height: 40, obstacles: [], heroSpawns: [], enemySpawns: [] };

function hordeWorld(spawns: UnitSpawn[], horde: HordeSetup, map: MapDef = BIG, seed = 1): World {
  return new World({ seed, map, spawns, config: { ...NEUTRAL_PACING, enemyAggroTime: 1e9, enemyAggroRange: 0 }, idleBehavior: HOLD, horde });
}

const hero = (x: number, y: number, id = 'warrior'): UnitSpawn => ({ defId: id, def: { ...HEROES[id], maxHp: 5000 }, pos: { x, y } });
const enemiesOf = (w: World) => w.units.filter((u) => u.team === 'enemy' && !u.dead);

describe('怪群試作：流場與空間分格（SPEC_SLICE4 §8）', () => {
  it('流場繞過障礙物：牆後的格子距離大於直線距離，梯度指向英雄', () => {
    const map: MapDef = { ...BIG, obstacles: [{ x: 10, y: 0, w: 2, h: 30 }] };
    const g = NavGrid.fromMap(map, 1, 0.4);
    const f = new FlowField(g);
    f.compute([{ x: 5, y: 5 }]);
    // 牆的另一側（同一高度）要繞過牆底（y = 30）
    const behind = f.distanceAt({ x: 16, y: 5 });
    expect(behind).toBeGreaterThan(40);
    // 從牆後往下走（繞路的方向）
    const next = f.nextPoint({ x: 16.5, y: 5.5 })!;
    expect(next.y).toBeGreaterThan(5.5);
    // 空地上直接朝英雄
    const n2 = f.nextPoint({ x: 5.5, y: 15.5 })!;
    expect(n2.y).toBeLessThan(15.5);
    // 英雄所在格距離為 0；不可走格回傳 Infinity 以外的值也無妨，但牆內的格子不可達
    expect(f.distanceAt({ x: 5.2, y: 5.2 })).toBe(0);
    expect(f.distanceAt({ x: 10.5, y: 10.5 })).toBe(Infinity);
  });

  it('空間分格查詢涵蓋半徑內的所有單位，結果依陣列順序', () => {
    const units = [0, 1, 2, 3, 4, 5].map((i) => new Unit(i + 1, ENEMIES.thrall, { x: i * 1.5, y: 0 }, -1));
    const h = new SpatialHash(2);
    h.rebuild(units);
    const near = h.query(3, 0, 1.6).map((u) => u.id);
    for (const id of [2, 3, 4]) expect(near).toContain(id);
    expect([...near].sort((a, b) => a - b)).toEqual(near);
  });
});

describe('怪群試作：雜兵 AI（SPEC_SLICE4 §1.1）', () => {
  it('雜兵追向最近的英雄並攻擊；繞過牆', () => {
    const map: MapDef = { ...BIG, obstacles: [{ x: 18, y: 0, w: 2, h: 30 }] };
    const horde: HordeSetup = { spawners: [{ id: 's', x: 30, y: 5, radius: 0.5 }], waves: [{ id: 'w', trigger: { type: 'start' }, spawns: [{ spawner: 's', enemy: 'thrall', count: 1 }] }], objective: { type: 'clear' } };
    const w = hordeWorld([hero(8, 5)], horde, map);
    const evs = run(w, 30 * 30);
    const t = enemiesOf(w)[0];
    expect(t.def.tier).toBe('fodder');
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === t.id)).toBe(true);
    expect(Math.hypot(t.pos.x - 8, t.pos.y - 5)).toBeLessThan(1.5);
  });

  it('雜兵挑最近的英雄', () => {
    const horde: HordeSetup = { spawners: [{ id: 's', x: 30, y: 20, radius: 0.1 }], waves: [{ id: 'w', trigger: { type: 'start' }, spawns: [{ spawner: 's', enemy: 'skitter', count: 1 }] }], objective: { type: 'clear' } };
    const w = hordeWorld([hero(5, 20), hero(24, 20, 'cleric')], horde);
    run(w, 3);
    const s = enemiesOf(w)[0];
    expect(s.hordeTargetId).toBe(w.units.find((u) => u.def.id === 'cleric')!.id);
  });
});

describe('怪群試作：波次、生成點、勝利目標（SPEC_SLICE4 §2）', () => {
  const sp = (id: string, x: number, y: number, nest = false) => ({ id, x, y, radius: 1, nest });

  it('四種觸發條件：開場、時間、區域、剩餘數量（after）', () => {
    const horde: HordeSetup = {
      spawners: [sp('a', 35, 5), sp('b', 35, 35)],
      waves: [
        { id: 'start', trigger: { type: 'start' }, spawns: [{ spawner: 'a', enemy: 'thrall', count: 2 }] },
        { id: 'time', trigger: { type: 'time', t: 2 }, spawns: [{ spawner: 'a', enemy: 'thrall', count: 1 }] },
        { id: 'area', trigger: { type: 'area', rect: { x: 0, y: 30, w: 10, h: 10 } }, spawns: [{ spawner: 'b', enemy: 'thrall', count: 1 }] },
        { id: 'rem', trigger: { type: 'remaining', count: 0, after: 'time' }, spawns: [{ spawner: 'b', enemy: 'skitter', count: 1 }] },
      ],
      objective: { type: 'clear' },
    };
    const w = hordeWorld([hero(5, 5)], horde);
    const fired = (evs: ReturnType<typeof run>) => evs.filter((e) => e.type === 'waveStart').map((e) => (e as { waveId: string }).waveId);
    expect(fired(run(w, 1))).toEqual(['start']);
    expect(enemiesOf(w).length).toBe(2);
    expect(fired(run(w, 2 * 30))).toEqual(['time']);
    // 英雄走進區域
    w.units[0].pos = { x: 5, y: 35 };
    expect(fired(run(w, 1))).toEqual(['area']);
    // 殺光所有敵人 → remaining 觸發
    for (const e of enemiesOf(w)) {
      e.hp = 0;
      e.dead = true;
    }
    expect(fired(run(w, 1))).toEqual(['rem']);
  });

  it('重複波次依間隔出現；巢穴被摧毀後該生成點停止生成；目標 nests 在巢穴全毀時勝利', () => {
    const horde: HordeSetup = {
      spawners: [sp('n', 35, 20, true), sp('open', 35, 35)],
      waves: [{ id: 'loop', trigger: { type: 'start' }, repeat: { interval: 1, times: -1 }, spawns: [{ spawner: 'n', enemy: 'thrall', count: 1 }] }],
      objective: { type: 'nests' },
    };
    const w = hordeWorld([hero(5, 5)], horde);
    const nestId = w.nestBySpawner.get('n')!;
    expect(w.getUnit(nestId)!.def.id).toBe('nest');
    run(w, 1 + 2 * 30);
    const before = enemiesOf(w).filter((u) => u.def.id === 'thrall').length;
    expect(before).toBe(3);
    const nest = w.getUnit(nestId)!;
    nest.hp = 0;
    nest.dead = true;
    const evs = run(w, 3 * 30);
    expect(evs.some((e) => e.type === 'waveStart')).toBe(false);
    expect(w.result).toBe('hero');
  });

  it('目標 clear：波次還沒出完不算勝利；目標 exit：全員進入出口區域勝利', () => {
    const clear: HordeSetup = { spawners: [sp('a', 35, 5)], waves: [{ id: 'late', trigger: { type: 'time', t: 3 }, spawns: [{ spawner: 'a', enemy: 'thrall', count: 1 }] }], objective: { type: 'clear' } };
    const w = hordeWorld([hero(5, 5)], clear);
    run(w, 30);
    expect(w.result).toBeNull();
    const exit: HordeSetup = { spawners: [], waves: [], objective: { type: 'exit', rect: { x: 30, y: 30, w: 10, h: 10 } } };
    const w2 = hordeWorld([hero(5, 5), hero(6, 5, 'ranger')], exit);
    run(w2, 5);
    expect(w2.result).toBeNull();
    for (const u of w2.units) u.pos = { x: 35, y: 35 };
    run(w2, 1);
    expect(w2.result).toBe('hero');
  });

  it('巢穴不會被推開', () => {
    const horde: HordeSetup = { spawners: [sp('n', 20, 20, true)], waves: [], objective: { type: 'nests' } };
    const w = hordeWorld([hero(20.5, 20)], horde);
    run(w, 10);
    const nest = w.getUnit(w.nestBySpawner.get('n')!)!;
    expect(nest.pos).toEqual({ x: 20, y: 20 });
  });
});

describe('怪群遭遇 hordePass（SPEC_SLICE4）', () => {
  it('不進遠征的遭遇池；建立戰鬥時自動設成怪群模式；決定論', () => {
    expect(ENCOUNTERS.hordePass.tier).toBe('horde');
    const snap = (seed: number) => {
      const r = createRun(seed);
      const node = r.map.nodes.find((n) => n.layer === 1)!;
      r.currentNodeId = node.id;
      r.phase = { kind: 'battle', nodeId: node.id, encounterId: 'hordePass', fromEvent: false };
      const w = createBattleFromRun(r);
      expect(w.config.battleStyle).toBe('horde');
      for (let i = 0; i < 20 * 30; i++) w.step();
      return w.snapshot();
    };
    expect(snap(3)).toBe(snap(3));
  });
});

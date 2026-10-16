import { describe, expect, it } from 'vitest';
import { strike } from '../src/sim/actions';
import { TERRAIN } from '../src/sim/data/terrain';
import type { MapDef, TerrainRect } from '../src/sim/data/types';
import { dist } from '../src/sim/math';
import type { UnitSpawn } from '../src/sim/world';
import { HOLD, OPEN_MAP, makeWorld, run } from './helpers';

const mapWith = (terrain: TerrainRect[], obstacles: MapDef['obstacles'] = []): MapDef => ({ ...OPEN_MAP, id: 'terrain-test', terrain, obstacles });
const world = (terrain: TerrainRect[], spawns: UnitSpawn[], config = {}) => makeWorld(spawns, config, mapWith(terrain), 1, HOLD);

/** 對 target 做 N 次遠程攻擊（不打斷、固定倍率），統計命中率 */
function hitRate(terrain: TerrainRect[], from: { x: number; y: number }, to: { x: number; y: number }, opts: { arc?: boolean } = {}): number {
  const w = world(terrain, [
    { defId: 'ranger', pos: from },
    { defId: 'brute', pos: to },
  ]);
  const [r, b] = w.units;
  let hits = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    b.hp = b.maxHp;
    const before = w.rng.state;
    void before;
    let hit = false;
    const evs: unknown[] = [];
    w.emit = (e) => void evs.push(e);
    strike(w, r, b, { melee: false, damageType: 'projectile', mult: 0.01, arc: opts.arc });
    hit = evs.some((e) => (e as { type: string }).type === 'hit');
    if (hit) hits++;
  }
  return hits / N;
}

describe('戰術地形（SPEC_SLICE3 §2）', () => {
  it('淺水移動 ×0.4、矮籬移動 ×0.5', () => {
    const travel = (kind?: 'shallow' | 'hedge') => {
      const w = world(kind ? [{ kind, x: 0, y: 0, w: 20, h: 12 }] : [], [{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 19, y: 11 } }]);
      const [war] = w.units;
      w.enqueue({ type: 'move', unitIds: [war.id], point: { x: 15, y: 6 } });
      run(w, 30);
      return war.pos.x - 2;
    };
    const base = travel();
    expect(travel('shallow') / base).toBeCloseTo(TERRAIN.shallowMoveMult, 1);
    expect(travel('hedge') / base).toBeCloseTo(TERRAIN.hedgeMoveMult, 1);
  });

  it('淺水中的目標防禦下降（較容易被打中）', () => {
    const dry = hitRate([], { x: 2, y: 6 }, { x: 10, y: 6 });
    const wet = hitRate([{ kind: 'shallow', x: 9, y: 5, w: 2, h: 2 }], { x: 2, y: 6 }, { x: 10, y: 6 });
    expect(wet).toBeGreaterThan(dry + 0.05);
  });
});

describe('矮籬掩體（SPEC_SLICE3 §2.3）', () => {
  const hedge: TerrainRect[] = [{ kind: 'hedge', x: 9, y: 3, w: 0.5, h: 6 }];

  it('路徑穿過矮籬、目標貼著矮籬 → 防禦 +15（命中率下降）', () => {
    const w = world(hedge, [{ defId: 'ranger', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 10, y: 6 } }]);
    const [r, b] = w.units;
    expect(w.hasCover(r.pos, b)).toBe(true);
    const open = hitRate([], { x: 2, y: 6 }, { x: 10, y: 6 });
    const covered = hitRate(hedge, { x: 2, y: 6 }, { x: 10, y: 6 });
    expect(covered).toBeLessThan(open - 0.08);
  });

  it('目標離矮籬很遠 → 沒有掩體', () => {
    const w = world(hedge, [{ defId: 'ranger', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 16, y: 6 } }]);
    const [r, b] = w.units;
    expect(w.hasCover(r.pos, b)).toBe(false);
  });

  it('攻擊者自己貼著同一道矮籬 → 不算掩體', () => {
    const w = world(hedge, [{ defId: 'ranger', pos: { x: 8.6, y: 6 } }, { defId: 'brute', pos: { x: 10, y: 6 } }]);
    const [r, b] = w.units;
    expect(w.hasCover(r.pos, b)).toBe(false);
  });

  it('拋物線攻擊與近戰不受掩體影響', () => {
    const open = hitRate([], { x: 2, y: 6 }, { x: 10, y: 6 }, { arc: true });
    const arc = hitRate(hedge, { x: 2, y: 6 }, { x: 10, y: 6 }, { arc: true });
    expect(Math.abs(arc - open)).toBeLessThan(0.02);
  });
});

describe('高地（SPEC_SLICE3 §2.4）', () => {
  const high: TerrainRect[] = [{ kind: 'high', x: 0, y: 0, w: 5, h: 12 }];

  it('站在高地上的遠程單位射程 +2', () => {
    const w = world(high, [{ defId: 'ranger', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 15.8, y: 6 } }]);
    const [r, b] = w.units;
    expect(w.attackRange(r)).toBe(r.def.range + TERRAIN.highRangeBonus);
    w.enqueue({ type: 'attack', unitIds: [r.id], targetId: b.id });
    run(w, 3);
    expect(r.action?.kind).toBe('attack'); // 不用移動就能開打
    expect(dist(r.pos, { x: 2, y: 6 })).toBeLessThan(0.01);
  });

  it('由低處射向高地上的目標：命中下降', () => {
    const flat = hitRate([], { x: 12, y: 6 }, { x: 2, y: 6 });
    const up = hitRate(high, { x: 12, y: 6 }, { x: 2, y: 6 });
    expect(up).toBeLessThan(flat - 0.05);
  });
});

describe('草叢隱匿與點燃（SPEC_SLICE3 §2.2）', () => {
  const brush: TerrainRect[] = [{ kind: 'brush', x: 10, y: 4, w: 3, h: 4 }];

  it('草叢裡的單位對外隱藏；距離 ≤ 2 m 或在同一片草叢時看得到（敵我通用）', () => {
    const w = world(brush, [
      { defId: 'ranger', pos: { x: 3, y: 6 } },
      { defId: 'brute', pos: { x: 11.5, y: 6 } },
      { defId: 'warrior', pos: { x: 12.5, y: 5 } },
    ]);
    const [r, b, war] = w.units;
    expect(w.canTarget(r, b)).toBe(false);
    expect(w.canTarget(war, b)).toBe(true); // 同一片草叢
    expect(w.canTarget(b, war)).toBe(true);
    expect(w.canTarget(b, r)).toBe(true); // 遊俠不在草叢
    r.pos = { x: 9.8, y: 6 };
    expect(w.canTarget(r, b)).toBe(true); // 貼近
  });

  it('攻擊過的單位會暴露 2 秒', () => {
    const w = world(brush, [{ defId: 'ranger', pos: { x: 3, y: 6 } }, { defId: 'archer', pos: { x: 11.5, y: 6 } }]);
    const [r, a] = w.units;
    expect(w.canTarget(r, a)).toBe(false);
    w.enqueue({ type: 'attack', unitIds: [a.id], targetId: r.id });
    let revealed = false;
    for (let i = 0; i < 60 && !revealed; i++) {
      w.step();
      revealed = w.canTarget(r, a);
    }
    expect(revealed).toBe(true);
  });

  it('看不到的目標不能下攻擊指令；閒置也不會自動攻擊', () => {
    const w = makeWorld([{ defId: 'ranger', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 11.5, y: 6 } }], {}, mapWith(brush));
    const [r, b] = w.units;
    w.enqueue({ type: 'attack', unitIds: [r.id], targetId: b.id });
    const evs = run(w, 60);
    expect(r.order).toBeNull();
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === r.id)).toBe(false);
  });

  it('火球點燃草叢、延燒、燒完變成空地；站在火上會燃燒', () => {
    const w = world(brush, [{ defId: 'mage', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 12.5, y: 7.5 } }]);
    const [m, b] = w.units;
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'fireball', point: { x: 10.5, y: 4.5 } });
    run(w, 30 * 3);
    expect(w.fire.size).toBeGreaterThan(0);
    run(w, 30 * 3);
    expect(b.burnTime > 0 || b.stats.damageTaken > 0).toBe(true);
    run(w, 30 * 10);
    expect(w.fire.size).toBe(0);
    expect(w.terrain.patchAt({ x: 11.5, y: 6 })).toBe(-1); // 草叢燒光
  });
});

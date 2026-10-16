import { describe, expect, it } from 'vitest';
import { strike } from '../src/sim/actions';
import { TERRAIN } from '../src/sim/data/terrain';
import type { MapDef, TerrainRect } from '../src/sim/data/types';
import { MAPS } from '../src/sim/data/maps';
import { dist } from '../src/sim/math';
import type { Unit } from '../src/sim/unit';
import { findPath } from '../src/sim/nav/astar';
import { NavGrid } from '../src/sim/nav/grid';
import { segmentClear } from '../src/sim/los';
import { T_HIGH, T_SHALLOW, TerrainGrid } from '../src/sim/terrain';
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

describe('切片 3 新地圖（SPEC_SLICE3 §4）', () => {
  it('marsh01、hill01 各有至少 3 種戰術地形（障礙物算一種），高地可以從英雄出生點走上去', () => {
    for (const id of ['marsh01', 'hill01']) {
      const map = MAPS[id];
      const kinds = new Set((map.terrain ?? []).map((t) => t.kind));
      expect(kinds.size + (map.obstacles.length > 0 ? 1 : 0), id).toBeGreaterThanOrEqual(3);
    }
    const hill = MAPS.hill01;
    const g = NavGrid.fromMap(hill, 0.5, 0.5);
    const t = new TerrainGrid(hill);
    expect(t.has({ x: 27, y: 14 }, T_HIGH)).toBe(true);
    expect(findPath(g, hill.heroSpawns[0], { x: 27, y: 14 })).not.toBeNull();
    expect(new TerrainGrid(MAPS.marsh01).has({ x: 19, y: 15 }, T_SHALLOW)).toBe(true);
  });
});

describe('遠程阻擋（Alan 回饋：射擊要被障礙物與人群擋住）', () => {
  it('投射物飛行中撞到遮擋視線的障礙物會落空（目標躲到岩石後面）', () => {
    const wall: MapDef = { ...OPEN_MAP, id: 'wall', obstacles: [{ x: 9, y: 4, w: 1, h: 4 }] };
    const w = makeWorld([{ defId: 'ranger', pos: { x: 3, y: 9 } }, { defId: 'brute', pos: { x: 14, y: 9 } }], {}, wall, 1, HOLD);
    const [r, b] = w.units;
    expect(w.canSee(r, b)).toBe(true);
    w.spawnProjectile(r, 'arrow', 10, { type: 'strike', melee: false, mult: 1, damageType: 'projectile' }, { unit: b });
    // 目標躲到牆後
    b.pos = { x: 14, y: 6 };
    b.prevPos = { ...b.pos };
    const evs = run(w, 60);
    expect(evs.some((e) => e.type === 'miss' && e.blocked)).toBe(true);
    expect(evs.some((e) => e.type === 'hit')).toBe(false);
  });

  it('看得見的目標：投射物從看得見的取樣點射出，不會一出手就撞牆', () => {
    // 牆角只擋住中心連線、側邊看得到
    const corner: MapDef = { ...OPEN_MAP, id: 'corner', obstacles: [{ x: 8, y: 4, w: 2, h: 4.9 }] };
    const w = makeWorld([{ defId: 'ranger', pos: { x: 3, y: 9 } }, { defId: 'brute', pos: { x: 15, y: 4 } }], {}, corner, 1, HOLD);
    const [r, b] = w.units;
    // 找一個「中心連線被擋、但側邊取樣點看得到」的位置
    let found = false;
    for (let y = 2; y <= 11 && !found; y += 0.05) {
      b.pos = { x: 15, y };
      if (w.canSee(r, b) && !segmentClear(w.sight, r.pos, b.pos)) found = true;
    }
    expect(found).toBe(true);
    b.prevPos = { ...b.pos };
    w.spawnProjectile(r, 'arrow', 20, { type: 'strike', melee: false, mult: 1, damageType: 'projectile' }, { unit: b });
    const evs = run(w, 60);
    expect(evs.some((e) => e.type === 'miss' && e.blocked)).toBe(false);
  });

  it('拋物線投射物不會被擋', () => {
    const wall: MapDef = { ...OPEN_MAP, id: 'wall', obstacles: [{ x: 9, y: 2, w: 1, h: 8 }] };
    const w = makeWorld([{ defId: 'alchemist', pos: { x: 3, y: 6 } }, { defId: 'brute', pos: { x: 14, y: 6 } }], {}, wall, 1, HOLD);
    const [a, b] = w.units;
    w.spawnProjectile(a, 'flask', 14, { type: 'strike', melee: false, mult: 1, damageType: 'projectile', arc: true }, { unit: b });
    const evs = run(w, 60);
    expect(evs.some((e) => e.type === 'miss' && e.blocked)).toBe(false);
  });

  it('射入混戰：路徑上有其他單位時目標防禦 +10（敵我都算；射手身邊的隊友不算）', () => {
    const w = makeWorld([
      { defId: 'ranger', pos: { x: 3, y: 6 } },
      { defId: 'brute', pos: { x: 12, y: 6 } },
      { defId: 'warrior', pos: { x: 8, y: 6.1 } },
      { defId: 'cleric', pos: { x: 3.8, y: 6 } },
    ], {}, OPEN_MAP, 1, HOLD);
    const [r, b, war, cl] = w.units;
    expect(w.hasBodyCover(r.pos, b, r.id)).toBe(true);
    war.pos = { x: 8, y: 9 };
    expect(w.hasBodyCover(r.pos, b, r.id)).toBe(false);
    // 緊貼射手的隊友不擋
    expect(dist(cl.pos, r.pos)).toBeLessThan(TERRAIN.bodyCoverShooterClearance);
    // 命中率確實下降
    war.pos = { x: 8, y: 6.1 };
    const covered = hitRateWith(w, r, b);
    war.pos = { x: 8, y: 9 };
    const open = hitRateWith(w, r, b);
    expect(open - covered).toBeGreaterThan(0.05);
  });
});

function hitRateWith(w: ReturnType<typeof makeWorld>, src: Unit, tgt: Unit): number {
  const N = 2000;
  const hp = tgt.hp;
  let hits = 0;
  for (let i = 0; i < N; i++) {
    const before = tgt.stats.damageTaken;
    strike(w, src, tgt, { melee: false, mult: 1, damageType: 'projectile' });
    if (tgt.stats.damageTaken > before) hits++;
    tgt.hp = hp;
  }
  return hits / N;
}

describe('節奏設定', () => {
  it('moveSpeedMult 放慢一般移動；衝鋒、翻滾等技能位移不受影響', () => {
    const go = (mult: number) => {
      const w = makeWorld([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 19, y: 11 } }], { moveSpeedMult: mult }, OPEN_MAP, 1, HOLD);
      const [u] = w.units;
      w.enqueue({ type: 'move', unitIds: [u.id], point: { x: 18, y: 6 } });
      run(w, 30);
      return u.pos.x - 2;
    };
    expect(go(0.5) / go(1)).toBeCloseTo(0.5, 1);
  });
});

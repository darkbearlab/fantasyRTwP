/**
 * 頭目房（Alan 2026-10-21：頭目走自己的專屬房間，不用走路，往前走一點就是頭目）。
 * 輸出和野外地圖相同的格式（FieldLevel），沿用 fbbLevel 的轉換與 fbbMapView 的畫法。
 *
 * 版面（格子：x 往右、y 往下；入口在下方）：
 * - 下方一條短走道（ARENA.corridor 寬）進到石牆圍起來的頭目房，房間外面是密林。
 * - 房裡四根石柱（掩體）、後方兩堆營火；頭目站在房間後方中央，護衛在兩側，援軍從左右兩側進場。
 * 版面數值都在 ARENA，可以調；種子只決定季節以外的小變化（營火、石柱稍微偏移）。
 */
import { Rng } from '../sim/rng';
import { DELIBERATE_LEVELS } from './data/deliberateLevels';
import { spawnCells } from './edgeLayout';
import type { FieldLevel, FieldProp } from './fieldGen';
import { deriveSeed } from './seed';

export const ARENA = {
  width: 30,
  height: 28,
  /** 石牆圍起來的房間（含牆）：左上角與右下角 */
  room: { x0: 3, y0: 2, x1: 26, y1: 19 },
  /** 走道寬（格），在房間下方中央 */
  corridor: 6,
  /** 頭目、護衛（相對房間後方中央的偏移）、援軍進場點、石柱 */
  boss: { dx: 0, dy: 4 },
  escorts: [
    { dx: -3, dy: 6 },
    { dx: 3, dy: 6 },
  ],
  summons: [
    { x: 6, y: 11 },
    { x: 23, y: 11 },
    { x: 6, y: 16 },
    { x: 23, y: 16 },
  ],
  pillars: [
    { x: 9, y: 8 },
    { x: 20, y: 8 },
    { x: 9, y: 14 },
    { x: 20, y: 14 },
  ],
  fires: [
    { x: 6, y: 5 },
    { x: 23, y: 5 },
  ],
  /** 樹幹間距（密林） */
  trunkStep: 2,
};

export interface BossArena {
  level: FieldLevel;
  /** 援軍進場點（格子） */
  summons: [number, number][];
}

/** 頭目、護衛、頭目房樣式（camp＝石牆圍起來的營地；clearing＝林中空地，沒有石牆）；totem：四根石柱換成這個敵人 */
export interface BossArenaSpec {
  enemy: string;
  escorts: string[];
  arena: 'camp' | 'clearing';
  totem?: string;
}

export function generateBossArena(seed: number, spec: BossArenaSpec = { ...DELIBERATE_LEVELS.boss, arena: 'camp' }): BossArena {
  const A = ARENA;
  const W = A.width;
  const H = A.height;
  const rng = new Rng(deriveSeed(seed, 'arena'));
  const { x0, y0, x1, y1 } = A.room;
  const cx = Math.floor((x0 + x1) / 2);
  const c0 = cx - Math.floor(A.corridor / 2) + 1;
  const c1 = c0 + A.corridor - 1;
  const inRoom = (x: number, y: number) => x > x0 && x < x1 && y > y0 && y < y1;
  const inCorridor = (x: number, y: number) => x >= c0 && x <= c1 && y >= y1;
  // 石牆：房間外框，下方走道的位置開口
  const walls: [number, number][] = [];
  // 林中空地沒有石牆：外框那一圈改成密林
  const clearing = spec.arena === 'clearing';
  const ring: [number, number][] = [];
  for (let x = x0; x <= x1; x++) {
    ring.push([x, y0]);
    if (x < c0 - 1 || x > c1 + 1) ring.push([x, y1]);
  }
  for (let y = y0 + 1; y < y1; y++) ring.push([x0, y], [x1, y]);
  if (!clearing) walls.push(...ring);
  // 地面：房間裡和走道是泥土地
  const ground: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) row += inRoom(x, y) || inCorridor(x, y) ? 'p' : '.';
    ground.push(row);
  }
  // 密林：房間與走道以外（離牆、走道留 1 格）
  const wallSet = new Set(walls.map(([x, y]) => `${x},${y}`));
  const nearOpen = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (wallSet.has(`${x + dx},${y + dy}`) || inCorridor(x + dx, y + dy) || inRoom(x + dx, y + dy)) return true;
    return false;
  };
  const forest: [number, number][] = clearing ? [...ring] : [];
  const props: FieldProp[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (inRoom(x, y) || inCorridor(x, y) || wallSet.has(`${x},${y}`) || nearOpen(x, y)) continue;
      forest.push([x, y]);
      const stagger = Math.floor(y / A.trunkStep) % 2;
      if (y % A.trunkStep === 0 && (x + stagger) % A.trunkStep === 0 && y >= 4) props.push({ prefab: rng.chance(0.5) ? 'treeA' : 'treeB', x, y });
    }
  if (!spec.totem) for (const p of A.pillars) props.push({ prefab: 'pillar', x: p.x, y: p.y });
  for (const f of A.fires) props.push({ prefab: 'campfire', x: f.x, y: f.y });
  // 頭目、護衛
  const bx = cx;
  const by = y0 + A.boss.dy;
  const enemies: FieldLevel['enemies'] = [{ enemy: spec.enemy, x: bx, y: by, squad: 'boss', facing: 'down' }];
  spec.escorts.forEach((e, i) => {
    const o = A.escorts[i % A.escorts.length];
    enemies.push({ enemy: e, x: cx + o.dx, y: y0 + o.dy, squad: 'boss', facing: 'down' });
  });
  // 圖騰站在石柱的位置（獸人酋長：打掉圖騰酋長就變弱）
  if (spec.totem) for (const p of A.pillars) enemies.push({ enemy: spec.totem, x: p.x, y: p.y, squad: 'boss', facing: 'down' });
  const heroSpawns = spawnCells('bottom', cx, W, H).map(([x, y]) => ({ x, y }));
  const level: FieldLevel = { seed, w: W, h: H, ground, walls, forest, props, sites: [], heroSpawns, enemies, exits: [], chunks: ['boss'] };
  return { level, summons: A.summons.map((s) => [s.x, s.y] as [number, number]) };
}

/**
 * 野外戰鬥地圖的程序生成（finalbossblues 地形；交接文件 §5b）。純函式、只用種子亂數。
 * 座標是畫面方向的格子：x 往右、y 往下；入口在下緣，出口依要求放在上、左、右緣。
 *
 * 流程（Alan：路、據點、森林要一起設計）：
 * 1. 區塊：起點（下排）、檢查點（中排）、樹林區塊。
 * 2. 檢查點：路從中間穿過的關卡，先放。
 * 3. 泥土路：加權最短路徑，入口 → 檢查點 → 每個出口；已經是路的格子便宜（會合流成分岔）。
 * 4. 據點：沿著路找位置，開口旋轉到朝向最近的路（哨點離路近、營地遠一點），牆包住背面與兩側。
 * 5. 密林：平滑雜訊長出大片森林（路兩側留空），整片擋路擋視線，用來限制行進路線；畫面上用密集的大樹表示。
 * 6. 散件：小段廢牆 → 零星大樹 → 石柱 → 雙格石頭 → 倒木 → 單格石頭，各自照間距規則，放不下就跳過。
 * 7. 敵人：每個據點固定幾個生怪格，先放雜兵，再用升級點數（隨層數增加）換成強敵；面向開口。
 * 8. 檢查：出生點走得到每個出口與每名敵人；不通過就換子種子重來。
 */
import { Rng } from '../sim/rng';
import type { DeliberateTier } from './data/deliberateLevels';
import { LEVEL_POOLS } from './data/levelPools';
import { FIELD, PREFABS, RUIN_SHAPES, SITES, WALL_JOINS } from './data/prefabs';
import { deriveSeed } from './seed';
import { exitRects, inward, roadStart, spawnCells } from './edgeLayout';
import type { MapEdge } from './edgeLayout';

export type FieldEdge = MapEdge;
export type Facing = 'up' | 'down' | 'left' | 'right';

export interface FieldOptions {
  tier: DeliberateTier;
  layer: number;
  /** 出口（依順序沿著那一邊排列） */
  exits: { id: string; edge: FieldEdge; label?: string }[];
  /** 從哪一邊進來（出生點在那一側；預設 bottom） */
  entry?: FieldEdge;
  /** 升級點數倍率（被主力佔領的節點） */
  upgradeMult?: number;
  /** 精英隊長換成這個敵人（冠軍戰；有給時一般戰鬥也會有隊長） */
  captainEnemy?: string;
  /** 精英隊長的候選（精英關卡） */
  captainPool?: string[];
}

export interface FieldProp {
  prefab: string;
  /** 錨點格 */
  x: number;
  y: number;
  /** 變化（例：單格石頭用哪一張） */
  variant?: number;
}

export interface FieldSite {
  kind: 'lookout' | 'camp' | 'checkpoint';
  /** 開口朝向 */
  facing: Facing;
  /** 內側的格 */
  cells: [number, number][];
}

export interface FieldLevel {
  seed: number;
  w: number;
  h: number;
  /** 地面：. 草地、p 泥土路 */
  ground: string[];
  walls: [number, number][];
  /** 密林：擋路（FIELD.forest.blocksSight 時也擋視線）的格 */
  forest: [number, number][];
  props: FieldProp[];
  sites: FieldSite[];
  heroSpawns: { x: number; y: number }[];
  enemies: { enemy: string; x: number; y: number; squad: string; facing: Facing; captain?: boolean }[];
  exits: { id: string; edge: FieldEdge; x: number; y: number; w: number; h: number; label?: string }[];
  /** 各區塊用途（說明與除錯用） */
  chunks: string[];
}

type Cell = [number, number];

const DIRS: Record<Facing, Cell> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function shuffle<T>(rng: Rng, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 順時針轉 90° */
function rotate(rows: string[]): string[] {
  const h = rows.length;
  const w = rows[0].length;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let s = '';
    for (let y = h - 1; y >= 0; y--) s += rows[y][x];
    out.push(s);
  }
  return out;
}

/** 形狀的開口在哪一邊（外框上有空格的那一邊） */
function openSide(rows: string[]): Facing | null {
  const h = rows.length;
  const w = rows[0].length;
  if (h > 1 && rows[h - 1].includes('.')) return 'down';
  if (h > 1 && rows[0].includes('.')) return 'up';
  if (w > 1 && rows.some((r) => r[0] === '.')) return 'left';
  if (w > 1 && rows.some((r) => r[w - 1] === '.')) return 'right';
  return null;
}

/** 把開口朝下的形狀轉到開口朝 face */
function orient(rows: string[], face: Facing): string[] {
  let r = rows;
  for (let k = 0; k < 4; k++) {
    if (openSide(r) === face) return r;
    r = rotate(r);
  }
  return rows;
}

export function generateField(seed: number, opts: FieldOptions): FieldLevel {
  for (let attempt = 0; attempt < FIELD.maxAttempts; attempt++) {
    const lv = tryGenerate(new Rng(deriveSeed(seed, 'field', attempt)), seed, opts);
    if (lv) return lv;
  }
  throw new Error('野外地圖生成失敗');
}

function tryGenerate(rng: Rng, seed: number, opts: FieldOptions): FieldLevel | null {
  const F = FIELD;
  const W = F.width;
  const H = F.height;
  const C = F.chunk;
  const cw = W / C;
  const ch = H / C;
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const N4: Cell[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const pick = <T extends { weight: number }>(list: T[]): T => {
    const total = list.reduce((a, s) => a + s.weight, 0);
    let r = rng.range(0, total);
    return list.find((s) => (r -= s.weight) < 0) ?? list[0];
  };

  // ── 1. 區塊 ──
  const roles: string[] = new Array(cw * ch).fill('open');
  const entryEdge: FieldEdge = opts.entry ?? 'bottom';
  const vertical = entryEdge === 'bottom' || entryEdge === 'top';
  // 起點區塊在入口那一邊；檢查點在中間那一排（和入口那一邊平行）
  const startK = rng.int(0, (vertical ? cw : ch) - 1);
  const along = startK * C + C / 2;
  const chunkAt = (x: number, y: number) => Math.floor(y / C) * cw + Math.floor(x / C);
  const [ix, iy] = inward(entryEdge);
  const entry: Cell = entryEdge === 'bottom' ? [along, H - 1] : entryEdge === 'top' ? [along, 0] : entryEdge === 'left' ? [0, along] : [W - 1, along];
  roles[chunkAt(Math.min(W - 1, entry[0]), Math.min(H - 1, entry[1]))] = 'start';
  const midBand = [...roles.keys()].filter((i) => (vertical ? Math.floor(i / cw) === Math.floor(ch / 2) : i % cw === Math.floor(cw / 2)));
  const cpChunk = midBand[rng.int(0, midBand.length - 1)];
  roles[cpChunk] = 'checkpoint';
  /** 檢查點面向入口那一邊 */
  const towardEntry: Facing = entryEdge === 'bottom' ? 'down' : entryEdge === 'top' ? 'up' : entryEdge;
  const free = shuffle(
    rng,
    [...roles.keys()].filter((i) => roles[i] === 'open'),
  );
  for (const i of free.slice(0, rng.int(F.forests[0], F.forests[1]))) roles[i] = 'forest';

  // ── 出口位置、保留區 ──
  const exits = exitRects(opts.exits, W, H, F.exitSize, { edge: entryEdge, along });
  const path = new Uint8Array(W * H);
  const blocked = new Uint8Array(W * H);
  const reserved = new Uint8Array(W * H);
  const reserve = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (inside(x, y)) reserved[idx(x, y)] = 1;
  };
  reserve(entry[0] + ix * 3, entry[1] + iy * 3, F.keepClear);
  for (const e of exits) reserve(e.x + e.w / 2, e.y + e.h / 2, F.keepClear);
  const isFree = (x: number, y: number) => inside(x, y) && !blocked[idx(x, y)] && !reserved[idx(x, y)] && !path[idx(x, y)];
  const nearBlocker = (x: number, y: number, gap: number) => {
    for (let yy = y - gap; yy <= y + gap; yy++) for (let xx = x - gap; xx <= x + gap; xx++) if (inside(xx, yy) && blocked[idx(xx, yy)]) return true;
    return false;
  };

  const wallSet = new Set<number>();
  const sites: (FieldSite & { gate?: Cell })[] = [];
  const props: FieldProp[] = [];
  const place = (prefab: string, x: number, y: number, variant?: number) => {
    props.push({ prefab, x, y, variant });
    for (const [dx, dy] of PREFABS[prefab].blocks) blocked[idx(x + dx, y + dy)] = 1;
  };
  const canPlace = (prefab: string, x: number, y: number, gap: number) =>
    PREFABS[prefab].blocks.every(([dx, dy]) => isFree(x + dx, y + dy) && !nearBlocker(x + dx, y + dy, gap));
  /** 把字元圖放到 (ox, oy)：牆格要空、四周不貼其他擋路物件；回傳內側的格（所有空格），放不下回傳 null */
  const stampShape = (rows: string[], ox: number, oy: number, interiorOk: (x: number, y: number) => boolean) => {
    const walls: Cell[] = [];
    const inner: Cell[] = [];
    for (let y = 0; y < rows.length; y++)
      for (let x = 0; x < rows[0].length; x++) {
        const c: Cell = [ox + x, oy + y];
        if (rows[y][x] === '#') {
          if (!isFree(c[0], c[1]) || nearBlocker(c[0], c[1], 1)) return null;
          walls.push(c);
        } else {
          if (!interiorOk(c[0], c[1])) return null;
          inner.push(c);
        }
      }
    for (const [x, y] of walls) {
      wallSet.add(idx(x, y));
      blocked[idx(x, y)] = 1;
    }
    return inner;
  };
  const fires: Cell[] = [];
  const addFire = (cand: Cell[]) => {
    const c = shuffle(rng, cand.slice()).find(([x, y]) => !blocked[idx(x, y)] && !path[idx(x, y)] && inside(x, y - 1));
    if (!c) return null;
    place('campfire', c[0], c[1]);
    fires.push(c);
    return c;
  };

  // ── 2. 檢查點（路從中間穿過） ──
  {
    const def = SITES.checkpoint;
    const cx0 = (cpChunk % cw) * C;
    const cy0 = Math.floor(cpChunk / cw) * C;
    for (let t = 0; t < 30 && !sites.length; t++) {
      // 開口朝入口那一邊（左右進來時轉 90°）
      const rows = vertical ? pick(def.shapes).rows : rotate(pick(def.shapes).rows);
      const sw = rows[0].length;
      const sh = rows.length;
      const ox = cx0 + rng.int(1, C - 1 - sw);
      const oy = cy0 + rng.int(1, C - 1 - sh);
      const inner = stampShape(rows, ox, oy, (x, y) => isFree(x, y));
      const gate: Cell = vertical ? [ox + Math.floor(sw / 2) - 2, oy + 1] : [ox + 1, oy + Math.floor(sh / 2) - 2];
      if (inner) sites.push({ kind: 'checkpoint', facing: towardEntry, cells: inner, gate });
    }
    if (!sites.length) return null;
    // 營火貼側牆，中間留給路
    const g = sites[0].gate!;
    const side = ([x, y]: Cell) => (vertical ? (x < g[0] - 1 || x > g[0] + 4) && y > g[1] - 1 && y < g[1] + 3 : (y < g[1] - 1 || y > g[1] + 4) && x > g[0] - 1 && x < g[0] + 3);
    addFire(sites[0].cells.filter(side));
  }

  // ── 3. 泥土路 ──
  const randomField = () => {
    const a = new Float32Array(W * H);
    for (let i = 0; i < a.length; i++) a[i] = rng.range(0, 1);
    return a;
  };
  const blur = (src: Float32Array, r: number) => {
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inside(x + dx, y + dy)) (sum += src[idx(x + dx, y + dy)], n++);
        out[idx(x, y)] = sum / n;
      }
    return out;
  };
  const smooth = blur(randomField(), 2);
  const wd = rng.int(F.path.width[0], F.path.width[1]);
  const walkable = (x: number, y: number) => {
    for (let dy = 0; dy < wd; dy++) for (let dx = 0; dx < wd; dx++) if (!inside(x + dx, y + dy) || nearBlocker(x + dx, y + dy, 1)) return false;
    return true;
  };
  const route = (from: Cell, to: Cell) => {
    const dist = new Float32Array(W * H).fill(Infinity);
    const prev = new Int32Array(W * H).fill(-1);
    const open: number[] = [idx(from[0], from[1])];
    dist[open[0]] = 0;
    const goal = idx(to[0], to[1]);
    while (open.length) {
      // 小地圖：線性找最小值就夠快
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      const x = cur % W;
      const y = (cur - x) / W;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny) || !walkable(nx, ny)) continue;
        const j = idx(nx, ny);
        const cost = path[j] ? 0.3 : 1 + smooth[j] * F.path.wiggle * 6;
        if (dist[cur] + cost < dist[j]) {
          if (dist[j] === Infinity) open.push(j);
          dist[j] = dist[cur] + cost;
          prev[j] = cur;
        }
      }
    }
    if (prev[goal] < 0) return false;
    for (let c = goal; c >= 0; c = prev[c]) {
      const x = c % W;
      const y = (c - x) / W;
      for (let dy = 0; dy < wd; dy++) for (let dx = 0; dx < wd; dx++) if (inside(x + dx, y + dy)) path[idx(x + dx, y + dy)] = 1;
    }
    return true;
  };
  {
    const gate = sites[0].gate!;
    if (!route(roadStart(entryEdge, along, W, H, wd), gate)) return null;
    for (const e of exits) if (!route(gate, [Math.min(W - wd, e.x + 1), Math.min(H - wd, e.y + 1)])) return null;
  }
  // 清掉單格凸起、填滿凹洞（兩輪）
  for (let pass = 0; pass < 2; pass++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const n = N4.filter(([dx, dy]) => inside(x + dx, y + dy) && path[idx(x + dx, y + dy)]).length;
        if (path[idx(x, y)] && n <= 1) path[idx(x, y)] = 0;
        else if (!path[idx(x, y)] && n >= 3 && !blocked[idx(x, y)]) path[idx(x, y)] = 1;
      }

  // 每格到路的距離、最近的路格（多源 BFS）
  const roadDist = new Int32Array(W * H).fill(1e9);
  const nearest = new Int32Array(W * H).fill(-1);
  {
    const q: number[] = [];
    for (let i = 0; i < W * H; i++) if (path[i]) (roadDist[i] = 0, nearest[i] = i, q.push(i));
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        if (!inside(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        if (roadDist[j] <= roadDist[i] + 1) continue;
        roadDist[j] = roadDist[i] + 1;
        nearest[j] = nearest[i];
        q.push(j);
      }
    }
  }

  // ── 4. 據點：開口朝向最近的路 ──
  const tooClose = (x: number, y: number) =>
    sites.some((s) => s.cells.some(([sx, sy]) => Math.abs(sx - x) < F.siteGap && Math.abs(sy - y) < F.siteGap));
  for (const kind of ['camp', 'lookout'] as const) {
    const def = SITES[kind];
    let n = rng.int(def.count[0], def.count[1]);
    for (let t = 0; t < 400 && n > 0; t++) {
      const x = rng.int(2, W - 3);
      const y = rng.int(3, H - 3);
      const d = roadDist[idx(x, y)];
      if (d < def.roadDist[0] || d > def.roadDist[1] || reserved[idx(x, y)] || tooClose(x, y)) continue;
      const r = nearest[idx(x, y)];
      const vx = (r % W) - x;
      const vy = Math.floor(r / W) - y;
      const face: Facing = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      let rows = orient(pick(def.shapes).rows, face);
      if (rng.chance(0.5)) rows = face === 'up' || face === 'down' ? rows.map((row) => [...row].reverse().join('')) : rows.slice().reverse();
      const sw = rows[0].length;
      const sh = rows.length;
      // 內側大約落在 (x, y)
      const ox = x - Math.floor(sw / 2);
      const oy = y - Math.floor(sh / 2);
      if (ox < 1 || oy < 2 || ox + sw > W - 1 || oy + sh > H - 1) continue;
      const inner = stampShape(rows, ox, oy, (cx, cy) => isFree(cx, cy) && !nearBlocker(cx, cy, 0));
      if (!inner || !inner.length) continue;
      sites.push({ kind, facing: face, cells: inner });
      // 據點四周與開口前方保留（之後的廢牆、石頭、倒木不能擋住射界）
      {
        const [fx, fy] = DIRS[face];
        for (let y = oy - 1; y <= oy + sh; y++) for (let x2 = ox - 1; x2 <= ox + sw; x2++) if (inside(x2, y) && !wallSet.has(idx(x2, y))) reserved[idx(x2, y)] = 1;
        for (const [cx, cy] of inner) for (let k = 1; k <= 3; k++) if (inside(cx + fx * k, cy + fy * k)) reserved[idx(cx + fx * k, cy + fy * k)] = 1;
      }
      if (def.campfire) {
        // 營火在最裡面（離開口最遠）；剩下的格給敵人
        const [fx, fy] = DIRS[face];
        const depth = (c: Cell) => -(c[0] * fx + c[1] * fy);
        const far = Math.max(...inner.map(depth));
        addFire(inner.filter((c) => depth(c) === far));
      }
      n--;
    }
  }
  if (sites.filter((s) => s.kind === 'lookout').length < SITES.lookout.count[0]) return null;
  if (sites.filter((s) => s.kind === 'camp').length < SITES.camp.count[0]) return null;

  // ── 5. 密林 ──
  const FO = F.forest;
  const fz = blur(randomField(), 3);
  let mean = 0;
  for (const v of fz) mean += v;
  mean /= fz.length;
  let sd = 0;
  for (const v of fz) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / fz.length) || 1;
  const nearSite = (x: number, y: number) => sites.some((s) => s.cells.some(([sx, sy]) => Math.abs(sx - x) <= 3 && Math.abs(sy - y) <= 3));
  const forest = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (roadDist[i] < FO.roadClear || reserved[i] || blocked[i] || nearBlocker(x, y, 1) || nearSite(x, y)) continue;
      const z = (fz[i] - mean) / sd;
      const role = roles[Math.floor(y / C) * cw + Math.floor(x / C)];
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y) < FO.edgeBand;
      const th = Math.min(role === 'forest' ? FO.forestThreshold : FO.threshold, edge ? FO.edgeThreshold : Infinity);
      if (z > th) forest[i] = 1;
    }
  // 拆掉太小的森林塊
  {
    const seen = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (!forest[i] || seen[i]) continue;
      const blob = [i];
      seen[i] = 1;
      for (let h = 0; h < blob.length; h++) {
        const x = blob[h] % W;
        const y = (blob[h] - x) / W;
        for (const [dx, dy] of N4) {
          const j = idx(x + dx, y + dy);
          if (inside(x + dx, y + dy) && forest[j] && !seen[j]) (seen[j] = 1, blob.push(j));
        }
      }
      if (blob.length < FO.minBlob) for (const j of blob) forest[j] = 0;
    }
  }
  for (let i = 0; i < W * H; i++) if (forest[i]) blocked[i] = 1;
  // 畫面：森林格上每隔 trunkStep 種一棵（隔列錯開），樹冠互相重疊成一片
  const trunks: Cell[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!forest[idx(x, y)]) continue;
      const stagger = Math.floor(y / FO.trunkStep) % 2;
      if (y % FO.trunkStep || (x + stagger) % FO.trunkStep) continue;
      props.push({ prefab: rng.chance(0.5) ? 'treeA' : 'treeB', x, y });
      trunks.push([x, y]);
    }

  // ── 6. 散件 ──
  const has = (x: number, y: number) => inside(x, y) && wallSet.has(idx(x, y));
  // 小段廢牆（擋視線）：和其他擋路物件保持間距，不會接上別的牆
  for (let k = rng.int(F.ruins.count[0], F.ruins.count[1]); k > 0; k--) {
    for (let t = 0; t < 40; t++) {
      let rows = pick(RUIN_SHAPES).rows;
      for (let r = rng.int(0, 3); r > 0; r--) rows = rotate(rows);
      if (rng.chance(0.5)) rows = rows.map((row) => [...row].reverse().join(''));
      const ox = rng.int(1, W - 1 - rows[0].length);
      const oy = rng.int(2, H - 1 - rows.length);
      const cells: Cell[] = [];
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) if (rows[y][x] === '#') cells.push([ox + x, oy + y]);
      if (!cells.every(([x, y]) => isFree(x, y) && !nearBlocker(x, y, F.ruins.gap))) continue;
      for (const [x, y] of cells) {
        wallSet.add(idx(x, y));
        blocked[idx(x, y)] = 1;
      }
      break;
    }
  }
  // 接法檢查（保險：素材沒有的接法就拆掉那一格）
  for (let changed = true; changed; ) {
    changed = false;
    for (const i of [...wallSet]) {
      const x = i % W;
      const y = (i - x) / W;
      const key = (has(x, y - 1) ? 'U' : '') + (has(x, y + 1) ? 'D' : '') + (has(x - 1, y) ? 'L' : '') + (has(x + 1, y) ? 'R' : '');
      if (!WALL_JOINS.includes(key)) {
        wallSet.delete(i);
        blocked[i] = 0;
        changed = true;
      }
    }
  }
  // 零星大樹（空地）
  const T = F.trees;
  for (let k = rng.int(T.scatter[0], T.scatter[1]), t = 0; k > 0 && t < 200; t++) {
    const x = rng.int(1, W - 2);
    const y = rng.int(4, H - 2);
    if (!isFree(x, y) || nearBlocker(x, y, 1) || nearSite(x, y)) continue;
    if (trunks.some(([tx, ty]) => Math.abs(tx - x) < T.minDx && Math.abs(ty - y) < T.minDy)) continue;
    let under = false;
    for (let dy = -4; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) if (has(x + dx, y + dy)) under = true;
    if (under) continue;
    place(rng.chance(0.5) ? 'treeA' : 'treeB', x, y);
    trunks.push([x, y]);
    k--;
  }
  const scatter = (prefab: string, count: [number, number], gap: number, near?: (x: number, y: number) => boolean) => {
    let n = rng.int(count[0], count[1]);
    for (let t = 0; t < 200 && n > 0; t++) {
      const x = rng.int(1, W - 2);
      const y = rng.int(2, H - 2);
      if (near && !near(x, y)) continue;
      if (!canPlace(prefab, x, y, gap)) continue;
      place(prefab, x, y);
      n--;
    }
  };
  scatter('pillar', F.pillars.count, F.pillars.clear, (x, y) => roadDist[idx(x, y)] <= 3);
  for (let k = rng.int(F.rocks2[0], F.rocks2[1]); k > 0; k--) scatter(rng.chance(0.5) ? 'rockGrey2' : 'rockBrown2', [1, 1], F.blockerGap);
  for (let k = rng.int(F.logs[0], F.logs[1]); k > 0; k--) scatter(rng.chance(0.5) ? 'logH' : 'logV', [1, 1], F.blockerGap);
  // 單格石頭：裝飾、不擋路，草地或路上都可以
  for (let k = rng.int(F.rocks1[0], F.rocks1[1]), t = 0; k > 0 && t < 200; t++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    if (blocked[idx(x, y)] || reserved[idx(x, y)] || props.some((p) => p.x === x && p.y === y)) continue;
    props.push({ prefab: 'rock1', x, y, variant: rng.int(0, 7) });
    k--;
  }

  // ── 出生點 ──
  const heroSpawns = spawnCells(entryEdge, along, W, H).map(([x, y]) => ({ x, y }));

  // ── 7. 敵人：每個據點固定幾個生怪格，先放雜兵，再用升級點數換成強敵 ──
  const E = F.enemies;
  const enemies: FieldLevel['enemies'] = [];
  const enemySite: FieldSite[] = [];
  sites.forEach((s, k) => {
    const def = SITES[s.kind];
    // 站在內側；開口那一排優先（看得到外面）
    const [fx, fy] = DIRS[s.facing];
    const spots = shuffle(rng, s.cells.filter(([x, y]) => !blocked[idx(x, y)])).sort((a, b) => b[0] * fx + b[1] * fy - (a[0] * fx + a[1] * fy));
    const n = rng.int(def.enemies[0], def.enemies[1]);
    for (let i = 0; i < n && i < spots.length && enemies.length < E.max; i++) {
      const [x, y] = spots[i];
      // 第一個（開口正中那一排）是鐵砧
      enemies.push({ enemy: i === 0 && def.anvil ? def.anvil : pick(def.grunts).enemy, x, y, squad: `${s.kind}${k}`, facing: s.facing });
      enemySite.push(s);
    }
  });
  let points = (E.upgrade.base + E.upgrade.perLayer * (opts.layer - 1) + (opts.tier === 'elite' ? E.upgrade.eliteBonus : 0)) * (opts.upgradeMult ?? 1);
  for (const i of shuffle(
    rng,
    enemies.map((_, i) => i),
  )) {
    const def = SITES[enemySite[i].kind];
    const all = LEVEL_POOLS[def.upgradePool] ?? [];
    const pool = all.filter((e) => e.minLayer <= opts.layer);
    const grunts = new Set(def.grunts.map((g) => g.enemy));
    if (def.anvil && enemies[i].enemy === def.anvil) continue;
    const cur = all.find((p) => p.enemy === enemies[i].enemy)?.cost ?? 1;
    const price = (p: { cost: number }) => Math.max(1, p.cost - cur);
    const ups = pool.filter((p) => !grunts.has(p.enemy) && p.cost >= cur && price(p) <= points);
    if (!ups.length) continue;
    const u = pick(ups);
    points -= price(u);
    enemies[i].enemy = u.enemy;
  }
  // 精英隊長（精英關卡、冠軍戰）：營地裡的第一名（沒有營地就檢查點）
  if (opts.tier === 'elite' || opts.captainEnemy) {
    const i = Math.max(
      0,
      enemySite.findIndex((s) => s.kind === 'camp'),
    );
    const pool = opts.captainPool ?? [];
    const id = opts.captainEnemy ?? (pool.length ? pool[rng.int(0, pool.length - 1)] : undefined);
    if (!enemies[i] || !id) return null;
    enemies[i].enemy = id;
    enemies[i].captain = true;
  }

  // ── 8. 可達性：出生點走得到每個出口與每名敵人 ──
  const seen = new Uint8Array(W * H);
  const s0 = heroSpawns[0];
  if (blocked[idx(s0.x, s0.y)]) return null;
  const stack = [idx(s0.x, s0.y)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny) || blocked[idx(nx, ny)] || seen[idx(nx, ny)]) continue;
      seen[idx(nx, ny)] = 1;
      stack.push(idx(nx, ny));
    }
  }
  if (!heroSpawns.every((p) => seen[idx(p.x, p.y)])) return null;
  if (!exits.every((e) => seen[idx(e.x + 1, e.y + 1)])) return null;
  if (!enemies.every((e) => seen[idx(e.x, e.y)])) return null;

  const ground: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) row += path[idx(x, y)] ? 'p' : '.';
    ground.push(row);
  }
  const cellsWhere = (f: (i: number) => boolean) => {
    const out: [number, number][] = [];
    for (let i = 0; i < W * H; i++) if (f(i)) out.push([i % W, Math.floor(i / W)]);
    return out;
  };
  return {
    seed,
    w: W,
    h: H,
    ground,
    walls: cellsWhere((i) => wallSet.has(i)),
    forest: cellsWhere((i) => forest[i] === 1),
    props,
    sites: sites.map(({ kind, facing, cells }) => ({ kind, facing, cells })),
    heroSpawns,
    enemies,
    exits,
    chunks: roles,
  };
}

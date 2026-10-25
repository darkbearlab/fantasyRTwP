/**
 * 城內戰鬥地圖的程序生成（首都突圍：燃燒中的高密度街區；finalbossblues Hometown）。純函式、只用種子亂數。
 * 座標是畫面方向的格子：x 往右、y 往下；入口在下緣的大街，出口依要求放在上、左、右緣。
 *
 * 流程：
 * 1. 街網：由下往上切出橫街（最下面一條是入口大街）、由左往右切出直街，街區大小在範圍內隨機。
 * 2. 拆街段：隨機拆掉部分街段，相鄰街區合併成大街區（拆了會不通就不拆）。
 * 3. 出口：從出口往內打一條街，接到最近的街上。
 * 4. 廣場：最靠近中央的一個街區改成廣場（中間放井）。
 * 5. 房子：每個街區由下往上排成一列一列（門朝南），列與列之間留後巷，同列房子之間偶爾留窄巷；一部分在燒。
 * 6. 散件：路燈、木箱堆、瓦礫、地上小火。
 * 7. 敵人：小隊守在路口與廣場，面向英雄來的方向，前方擺木箱路障；生怪格固定，先放雜兵再升級。
 * 8. 檢查：出生點走得到每個出口與每名敵人；不通過就換子種子重來。
 */
import { Rng } from '../sim/rng';
import type { DeliberateTier } from './data/deliberateLevels';
import { LEVEL_POOLS } from './data/levelPools';
import { TOWN } from './data/town';
import type { Facing, FieldEdge } from './fieldGen';
import { deriveSeed } from './seed';
import { exitRects, inward, spawnCells } from './edgeLayout';
import type { TilePrefab } from './tilePrefab';

export interface TownOptions {
  tier: DeliberateTier;
  layer: number;
  exits: { id: string; edge: FieldEdge; label?: string }[];
  /** 從哪一邊進來（出生點在那一側；預設 bottom＝入口大街） */
  entry?: FieldEdge;
  /** 升級點數倍率（被主力佔領的節點） */
  upgradeMult?: number;
  /** 精英隊長換成這個敵人（冠軍戰） */
  captainEnemy?: string;
  /** 精英隊長的候選（精英關卡） */
  captainPool?: string[];
  /** 手工預製件（src/run/data/tilePrefabs/，用 parseTilePrefab 讀好）；房屋與水井從這裡挑，沒有就全用佔位 */
  prefabs?: TilePrefab[];
}

/**
 * 一棟房子：手工預製件（prefab 有值）或佔位矩形（Alan：首都一系列的圖先佔位，之後重做）。
 * 佔位的房子整個矩形擋路擋視線，門在下緣中間（門口是下緣外側那一格）。
 */
export interface TownHouse {
  /** 占地左上角與大小 */
  x: number;
  y: number;
  w: number;
  h: number;
  prefab?: string;
  burning: boolean;
  /** 屋頂上的火（燃燒時）：絕對座標 */
  fires: [number, number][];
}

export interface TownProp {
  /** lamp 路燈、crates 木箱堆、sack 麻袋、rubble 瓦礫、well 井（prefab 有值時是手工預製件，否則 2×2 圖塊）、fire 地上小火 */
  kind: 'lamp' | 'crates' | 'sack' | 'rubble' | 'well' | 'fire';
  x: number;
  y: number;
  variant?: number;
  prefab?: string;
}

export interface TownLevel {
  seed: number;
  w: number;
  h: number;
  /** 地面：. 草地（後院）、s 石板街 */
  ground: string[];
  houses: TownHouse[];
  props: TownProp[];
  /** 擋路的格；其中 sight 也擋視線（房子） */
  blocked: [number, number][];
  sightBlocked: [number, number][];
  heroSpawns: { x: number; y: number }[];
  enemies: { enemy: string; x: number; y: number; squad: string; facing: Facing; captain?: boolean }[];
  exits: { id: string; edge: FieldEdge; x: number; y: number; w: number; h: number; label?: string }[];
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

export function generateTown(seed: number, opts: TownOptions): TownLevel {
  for (let attempt = 0; attempt < TOWN.maxAttempts; attempt++) {
    const lv = tryGenerate(new Rng(deriveSeed(seed, 'town', attempt)), seed, opts);
    if (lv) return lv;
  }
  throw new Error('城內地圖生成失敗');
}

function tryGenerate(rng: Rng, seed: number, opts: TownOptions): TownLevel | null {
  const T = TOWN;
  const W = T.width;
  const H = T.height;
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const N4: Cell[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const pick = <V extends { weight: number }>(list: V[]): V => {
    const total = list.reduce((a, s) => a + s.weight, 0);
    let r = rng.range(0, total);
    return list.find((s) => (r -= s.weight) < 0) ?? list[0];
  };
  const street = new Uint8Array(W * H);
  const fillRect = (m: Uint8Array, x0: number, y0: number, w: number, h: number, v = 1) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inside(x, y)) m[idx(x, y)] = v;
  };

  // ── 1. 街網 ──
  // 橫街：最下面是入口大街，往上每隔一個街區高一條
  const hStreets: { y: number; h: number }[] = [{ y: H - T.street.main, h: T.street.main }];
  for (let y = H - T.street.main; ; ) {
    const bh = rng.int(T.block.h[0], T.block.h[1]);
    const sw = T.street.side;
    if (y - bh - sw - T.block.h[0] < 0) break;
    y -= bh + sw;
    hStreets.push({ y, h: sw });
  }
  // 直街：中間那條是主街（較寬）
  const vStreets: { x: number; w: number }[] = [];
  for (let x = 0; ; ) {
    const bw = rng.int(T.block.w[0], T.block.w[1]);
    if (x + bw + T.street.main + T.block.w[0] > W) break;
    x += bw;
    vStreets.push({ x, w: T.street.side });
    x += T.street.side;
  }
  if (!vStreets.length || hStreets.length < 2) return null;
  const mainV = vStreets.reduce((a, b) => (Math.abs(b.x - W / 2) < Math.abs(a.x - W / 2) ? b : a));
  mainV.w = T.street.main;
  for (const s of hStreets) fillRect(street, 0, s.y, W, s.h);
  for (const s of vStreets) fillRect(street, s.x, 0, s.w, H);

  const connected = () => {
    let start = -1;
    let total = 0;
    for (let i = 0; i < W * H; i++) if (street[i]) (total++, start < 0 && (start = i));
    if (start < 0) return false;
    const seen = new Uint8Array(W * H);
    const q = [start];
    seen[start] = 1;
    for (let h = 0; h < q.length; h++) {
      const x = q[h] % W;
      const y = (q[h] - x) / W;
      for (const [dx, dy] of N4) {
        const j = idx(x + dx, y + dy);
        if (inside(x + dx, y + dy) && street[j] && !seen[j]) (seen[j] = 1, q.push(j));
      }
    }
    return q.length === total;
  };

  // ── 2. 拆街段（入口大街不拆；主街不拆） ──
  const hs = [...hStreets].sort((a, b) => a.y - b.y);
  const vs = [...vStreets].sort((a, b) => a.x - b.x);
  const yBounds = [0, ...hs.flatMap((s) => [s.y, s.y + s.h]), H];
  const xBounds = [0, ...vs.flatMap((s) => [s.x, s.x + s.w]), W];
  const segs: { x: number; y: number; w: number; h: number }[] = [];
  for (const v of vs) {
    if (v === mainV) continue;
    for (let k = 0; k + 1 < yBounds.length; k += 2) segs.push({ x: v.x, y: yBounds[k], w: v.w, h: yBounds[k + 1] - yBounds[k] });
  }
  for (const h of hs) {
    if (h === hStreets[0]) continue;
    for (let k = 0; k + 1 < xBounds.length; k += 2) segs.push({ x: xBounds[k], y: h.y, w: xBounds[k + 1] - xBounds[k], h: h.h });
  }
  for (const s of shuffle(rng, segs)) {
    if (!rng.chance(T.removeSegment)) continue;
    fillRect(street, s.x, s.y, s.w, s.h, 0);
    if (!connected()) fillRect(street, s.x, s.y, s.w, s.h, 1);
  }

  // ── 3. 出口：往內打一條街接到最近的街 ──
  // 入口：下方＝入口大街上的主街口；上方＝主街口；左右＝隨機一條橫街的街口
  const entryEdge: FieldEdge = opts.entry ?? 'bottom';
  const sideStreets = hStreets.slice(1);
  const pickH = sideStreets.length ? sideStreets[rng.int(0, sideStreets.length - 1)] : hStreets[0];
  const along = entryEdge === 'bottom' || entryEdge === 'top' ? Math.round(mainV.x + mainV.w / 2) : pickH.y + Math.floor(pickH.h / 2);
  const exits = exitRects(opts.exits, W, H, T.exitSize, { edge: entryEdge, along });
  const S = T.exitSize;
  const entryRect = { edge: entryEdge, ...(entryEdge === 'bottom' ? { x: along - 2, y: H - S } : entryEdge === 'top' ? { x: along - 2, y: 0 } : entryEdge === 'left' ? { x: 0, y: along - 2 } : { x: W - S, y: along - 2 }), w: S, h: S };
  // 出口與入口：往內打一條街接到最近的街（入口寬 exitSize，出口寬 exitSize−1）
  for (const e of [...exits, entryRect]) {
    fillRect(street, e.x, e.y, e.w, e.h);
    const [dx, dy] = inward(e.edge);
    const width = e === entryRect ? S : S - 1;
    let x = dx > 0 ? e.x + e.w : dx < 0 ? e.x - 1 : e.x;
    let y = dy > 0 ? e.y + e.h : dy < 0 ? e.y - 1 : e.y;
    for (let k = 0; k < Math.max(W, H); k++) {
      const cells: Cell[] = [];
      for (let t = 0; t < width; t++) cells.push(dx ? [x, y + t] : [x + t, y]);
      if (cells.some(([cx, cy]) => !inside(cx, cy) || street[idx(cx, cy)])) break;
      for (const [cx, cy] of cells) street[idx(cx, cy)] = 1;
      x += dx;
      y += dy;
    }
  }

  // ── 街區（非街道的連通塊） ──
  const blockId = new Int32Array(W * H).fill(-1);
  const blocks: Cell[][] = [];
  for (let i = 0; i < W * H; i++) {
    if (street[i] || blockId[i] >= 0) continue;
    const id = blocks.length;
    const cells: Cell[] = [];
    const q = [i];
    blockId[i] = id;
    for (let h = 0; h < q.length; h++) {
      const x = q[h] % W;
      const y = (q[h] - x) / W;
      cells.push([x, y]);
      for (const [dx, dy] of N4) {
        const j = idx(x + dx, y + dy);
        if (inside(x + dx, y + dy) && !street[j] && blockId[j] < 0) (blockId[j] = id, q.push(j));
      }
    }
    blocks.push(cells);
  }

  // ── 4. 廣場 ──
  const plaza = new Uint8Array(W * H);
  const props: TownProp[] = [];
  const blocked = new Uint8Array(W * H);
  const sight = new Uint8Array(W * H);
  const center = (cells: Cell[]): Cell => [cells.reduce((a, c) => a + c[0], 0) / cells.length, cells.reduce((a, c) => a + c[1], 0) / cells.length];
  const plazaBlocks = blocks
    .map((cells, id) => ({ id, cells, c: center(cells) }))
    .filter((b) => b.cells.length >= T.plazaSize[0] && b.cells.length <= T.plazaSize[1])
    .sort((a, b) => Math.hypot(a.c[0] - W / 2, a.c[1] - H / 2) - Math.hypot(b.c[0] - W / 2, b.c[1] - H / 2))
    .slice(0, T.plazas);
  const prefabs = opts.prefabs ?? [];
  const wellPf = prefabs.find((p) => p.kind === 'well');
  const housePfs = prefabs.filter((p) => p.kind === 'house');
  for (const b of plazaBlocks) {
    for (const [x, y] of b.cells) plaza[idx(x, y)] = 1;
    const ww = wellPf?.w ?? 2;
    const wh = wellPf?.h ?? 2;
    const wx = Math.round(b.c[0] - ww / 2);
    const wy = Math.round(b.c[1] - wh / 2);
    props.push({ kind: 'well', x: wx, y: wy, prefab: wellPf?.id });
    if (wellPf) for (const [dx, dy] of wellPf.blockCells) blocked[idx(wx + dx, wy + dy)] = 1;
    else fillRect(blocked, wx, wy, 2, 2);
  }

  // ── 5. 房子 ──
  const houses: TownHouse[] = [];
  const HO = T.house;
  /** 房子的整個矩形（排房子用；預製件矩形裡沒圖的格不擋路，但也不給別棟用） */
  const occupied = new Uint8Array(W * H);
  /** 門口：不放任何東西，最後檢查走得到 */
  const doors: Cell[] = [];
  const addHouse = (x: number, y: number, w: number, h: number, pf?: TilePrefab) => {
    fillRect(occupied, x, y, w, h);
    const burning = rng.chance(HO.burning);
    let roofCells: Cell[] = [];
    if (pf) {
      for (const [dx, dy] of pf.blockCells) {
        blocked[idx(x + dx, y + dy)] = 1;
        if (pf.blocksSight) sight[idx(x + dx, y + dy)] = 1;
        if (dy < pf.h / 2) roofCells.push([x + dx, y + dy]);
      }
      for (const [dx, dy] of pf.doorCells) doors.push([x + dx, y + dy]);
    } else {
      fillRect(blocked, x, y, w, h);
      fillRect(sight, x, y, w, h);
      roofCells = [
        [x + 1, y + 1],
        [x + w - 2, y + 1],
      ];
      for (let k = 0; k < Math.min(2, w); k++) doors.push([x + Math.floor(w / 2) - 1 + k, y + h]);
    }
    const fires = burning ? shuffle(rng, roofCells).slice(0, 2) : [];
    houses.push({ x, y, w, h, prefab: pf?.id, burning, fires });
  };
  for (let id = 0; id < blocks.length; id++) {
    if (plazaBlocks.some((b) => b.id === id)) continue;
    const cells = blocks[id];
    const inBlock = (x: number, y: number) => inside(x, y) && blockId[idx(x, y)] === id && !blocked[idx(x, y)] && !occupied[idx(x, y)];
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const bx0 = Math.min(...xs);
    const bx1 = Math.max(...xs);
    const by0 = Math.min(...ys);
    let yb = Math.max(...ys);
    const fits = (x: number, yt: number, w: number, d: number) => {
      for (let y = yt; y < yt + d; y++) for (let xx = x; xx < x + w; xx++) if (!inBlock(xx, y)) return false;
      return true;
    };
    while (yb - by0 + 1 >= HO.roofH[0] + HO.wallH) {
      // 手工預製件的一排：放得下就用預製件，空隙用同深度的佔位補
      const room = yb - by0 + 1;
      const pfs = housePfs.filter((p) => p.h <= room);
      if (pfs.length && rng.chance(HO.prefabRow)) {
        const d = Math.max(...pfs.map((p) => p.h));
        for (let x = bx0; x <= bx1; ) {
          const pf = pfs[rng.int(0, pfs.length - 1)];
          if (rng.chance(HO.prefabChance) && fits(x, yb - pf.h + 1, pf.w, pf.h)) {
            addHouse(x, yb - pf.h + 1, pf.w, pf.h, pf);
            x += pf.w + (rng.chance(HO.gapChance) ? HO.gapWidth : 0);
            continue;
          }
          let w = rng.int(HO.w[0], HO.w[1]);
          while (w >= HO.w[0] && !fits(x, yb - d + 1, w, d)) w--;
          if (w < HO.w[0]) {
            x++;
            continue;
          }
          addHouse(x, yb - d + 1, w, d);
          x += w + (rng.chance(HO.gapChance) ? HO.gapWidth : 0);
        }
        yb = yb - d - rng.int(HO.alley[0], HO.alley[1]);
        continue;
      }
      // 佔位的一排：橫排（寬而淺）或直排（窄而深、屋脊南北向），各自決定
      const deep = rng.chance(HO.deep.chance) && yb - by0 + 1 >= HO.deep.depth[0];
      const [wMin, wMax] = deep ? HO.deep.w : HO.w;
      let rh = deep ? Math.min(rng.int(HO.deep.depth[0], HO.deep.depth[1]), yb - by0 + 1) - HO.wallH : rng.int(HO.roofH[0], HO.roofH[1]);
      if (!deep && yb - (rh + HO.wallH) + 1 < by0) rh = HO.roofH[0];
      const d = rh + HO.wallH;
      const yt = yb - d + 1;
      if (yt < by0) break;
      for (let x = bx0; x <= bx1; ) {
        let w = rng.int(wMin, wMax);
        while (w >= wMin && !fits(x, yt, w, d)) w--;
        if (w < wMin) {
          x++;
          continue;
        }
        // 剩下太窄放不下另一棟：把這棟拉寬吃掉
        while (w < wMax + 2 && fits(x, yt, w + 1, d) && !fits(x + w + 1, yt, wMin, d)) w++;
        addHouse(x, yt, w, d);
        x += w + (rng.chance(HO.gapChance) ? HO.gapWidth : 0);
      }
      yb = yt - 1 - rng.int(HO.alley[0], HO.alley[1]);
    }
  }
  if (houses.length < 12) return null;

  // ── 出生點、保留區 ──
  const heroSpawns = spawnCells(entryEdge, along, W, H, [1, 2]).map(([x, y]) => ({ x, y }));
  const reserved = new Uint8Array(W * H);
  const reserve = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (inside(x, y)) reserved[idx(x, y)] = 1;
  };
  {
    const [ix, iy] = inward(entryEdge);
    const [ex, ey] = entryEdge === 'bottom' ? [along, H - 1] : entryEdge === 'top' ? [along, 0] : entryEdge === 'left' ? [0, along] : [W - 1, along];
    reserve(ex + ix * 3, ey + iy * 3, T.keepClear + 1);
  }
  for (const e of exits) reserve(e.x + e.w / 2, e.y + e.h / 2, T.keepClear);
  // 門口外側不放東西
  for (const [x, y] of doors) if (inside(x, y)) reserved[idx(x, y)] = 1;
  const openCell = (x: number, y: number) => inside(x, y) && !blocked[idx(x, y)] && !reserved[idx(x, y)];

  // ── 6. 散件 ──
  /**
   * 街上可以放擋路的東西嗎（Alan 2026-10-21：有條路被兩個箱子堵死）：放了之後這一格橫豎兩個方向剩下的通路都至少 2 格寬
   * （角色直徑約 1 m，1 格的縫過不去）；不在街上的（後院）不限制。
   */
  const keepsPassage = (x: number, y: number, min = 2): boolean => {
    if (!street[idx(x, y)]) return true;
    const run = (dx: number, dy: number) => {
      let n = 1;
      for (const sgn of [-1, 1]) for (let k = 1; inside(x + dx * k * sgn, y + dy * k * sgn) && street[idx(x + dx * k * sgn, y + dy * k * sgn)] && !blocked[idx(x + dx * k * sgn, y + dy * k * sgn)]; k++) n++;
      return n;
    };
    return Math.min(run(1, 0), run(0, 1)) - 1 >= min;
  };
  /** 空曠：周圍 T.roomy 格內全部可以走（Alan 2026-10-25：擋路的散件集中在空曠區域） */
  const roomy = (x: number, y: number): boolean => {
    for (let yy = y - T.roomy; yy <= y + T.roomy; yy++)
      for (let xx = x - T.roomy; xx <= x + T.roomy; xx++) if (!inside(xx, yy) || blocked[idx(xx, yy)] || reserved[idx(xx, yy)]) return false;
    return true;
  };
  const scatter = (kind: TownProp['kind'], count: [number, number], ok: (x: number, y: number) => boolean, blocks: boolean, variants = 0) => {
    let n = rng.int(count[0], count[1]);
    for (let t = 0; t < 300 && n > 0; t++) {
      const x = rng.int(1, W - 2);
      const y = rng.int(2, H - 2);
      if (!openCell(x, y) || !ok(x, y) || props.some((p) => p.x === x && p.y === y)) continue;
      if (blocks && N4.some(([dx, dy]) => inside(x + dx, y + dy) && blocked[idx(x + dx, y + dy)] && !sight[idx(x + dx, y + dy)])) continue;
      if (blocks && !keepsPassage(x, y)) continue;
      props.push({ kind, x, y, variant: variants ? rng.int(0, variants - 1) : undefined });
      if (blocks) blocked[idx(x, y)] = 1;
      n--;
    }
  };
  scatter('lamp', T.lamps, roomy, true);
  scatter('crates', T.crates, roomy, true, 1);
  scatter('rubble', T.rubble, () => true, false, 5);
  scatter('fire', T.groundFires, () => true, false);

  // ── 7. 敵人：路口與廣場的小隊 ──
  // 出生點出發的步數（找「英雄從哪邊來」）
  const dist = new Int32Array(W * H).fill(1e9);
  {
    const s = idx(heroSpawns[1].x, heroSpawns[1].y);
    dist[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const x = q[h] % W;
      const y = (q[h] - x) / W;
      for (const [dx, dy] of N4) {
        const j = idx(x + dx, y + dy);
        if (!inside(x + dx, y + dy) || blocked[j] || dist[j] <= dist[q[h]] + 1) continue;
        dist[j] = dist[q[h]] + 1;
        q.push(j);
      }
    }
  }
  const posts: Cell[] = [];
  for (const h of hs)
    for (const v of vs) {
      const x = v.x + Math.floor(v.w / 2);
      const y = h.y + Math.floor(h.h / 2);
      if (street[idx(x, y)]) posts.push([x, y]);
    }
  for (const b of plazaBlocks) posts.push([Math.round(b.c[0]), Math.round(b.c[1]) + 2]);
  const SQ = T.squads;
  const chosen: Cell[] = [];
  for (const p of shuffle(rng, posts)) {
    if (chosen.length >= rng.int(SQ.count[0], SQ.count[1])) break;
    if (dist[idx(p[0], p[1])] < SQ.minDistFromEntry || dist[idx(p[0], p[1])] >= 1e9) continue;
    if (chosen.some(([x, y]) => Math.abs(x - p[0]) + Math.abs(y - p[1]) < 8)) continue;
    chosen.push(p);
  }
  const enemies: TownLevel['enemies'] = [];
  chosen.forEach(([px, py], k) => {
    // 面向：往英雄來的方向（三格外步數最少的那一邊）
    let face: Facing = 'down';
    let best = Infinity;
    for (const f of ['down', 'left', 'right', 'up'] as Facing[]) {
      const [dx, dy] = DIRS[f];
      for (let s = 3; s >= 1; s--) {
        const x = px + dx * s;
        const y = py + dy * s;
        if (inside(x, y) && dist[idx(x, y)] < best) {
          best = dist[idx(x, y)];
          face = f;
        }
      }
    }
    const [fx, fy] = DIRS[face];
    const [qx, qy] = [fy, fx];
    // 路障：小隊前方兩格，不放在正中間（留路）
    let nb = rng.int(SQ.barricade[0], SQ.barricade[1]);
    for (const j of shuffle(rng, [-2, -1, 1, 2])) {
      if (nb <= 0) break;
      const x = px + fx * 2 + qx * j;
      const y = py + fy * 2 + qy * j;
      if (!inside(x, y) || !street[idx(x, y)] || blocked[idx(x, y)] || reserved[idx(x, y)] || !keepsPassage(x, y, T.barricadePassage)) continue;
      props.push({ kind: 'crates', x, y, variant: 0 });
      blocked[idx(x, y)] = 1;
      nb--;
    }
    const n = rng.int(SQ.size[0], SQ.size[1]);
    for (const j of [0, -1, 1, -2, 2]) {
      if (enemies.filter((e) => e.squad === `s${k}`).length >= n || enemies.length >= T.maxEnemies) break;
      const x = px + qx * j;
      const y = py + qy * j;
      if (!inside(x, y) || blocked[idx(x, y)]) continue;
      enemies.push({ enemy: j === 0 && T.anvil ? T.anvil : pick(T.grunts).enemy, x, y, squad: `s${k}`, facing: face });
    }
  });
  if (chosen.length < SQ.count[0]) return null;
  // 升級
  {
    let points = (T.upgrade.base + T.upgrade.perLayer * (opts.layer - 1) + (opts.tier === 'elite' ? T.upgrade.eliteBonus : 0)) * (opts.upgradeMult ?? 1);
    const all = LEVEL_POOLS[T.upgradePool] ?? [];
    const pool = all.filter((e) => e.minLayer <= opts.layer);
    const grunts = new Set(T.grunts.map((g) => g.enemy));
    for (const i of shuffle(
      rng,
      enemies.map((_, i) => i),
    )) {
      if (enemies[i].enemy === T.anvil) continue;
      const cur = all.find((p) => p.enemy === enemies[i].enemy)?.cost ?? 1;
      const price = (p: { cost: number }) => Math.max(1, p.cost - cur);
      const ups = pool.filter((p) => !grunts.has(p.enemy) && p.cost >= cur && price(p) <= points);
      if (!ups.length) continue;
      const u = pick(ups);
      points -= price(u);
      enemies[i].enemy = u.enemy;
    }
    // 精英隊長（精英關卡、冠軍戰）：第一個小隊的第一名
    if (opts.tier === 'elite' || opts.captainEnemy) {
      const pool = opts.captainPool ?? [];
      const id = opts.captainEnemy ?? (pool.length ? pool[rng.int(0, pool.length - 1)] : undefined);
      if (!enemies.length || !id) return null;
      enemies[0].enemy = id;
      enemies[0].captain = true;
    }
  }

  // ── 8. 可達性 ──
  const seen = new Uint8Array(W * H);
  const s0 = idx(heroSpawns[0].x, heroSpawns[0].y);
  if (blocked[s0]) return null;
  const stack = [s0];
  seen[s0] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N4) {
      const j = idx(x + dx, y + dy);
      if (!inside(x + dx, y + dy) || blocked[j] || seen[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  if (!heroSpawns.every((p) => seen[idx(p.x, p.y)])) return null;
  if (!exits.every((e) => seen[idx(e.x + 1, e.y + 1)])) return null;
  if (!enemies.every((e) => seen[idx(e.x, e.y)])) return null;
  // 門口走得到（貼著地圖邊的佔位房子門口在圖外，不算）
  if (!doors.every(([x, y]) => !inside(x, y) || seen[idx(x, y)])) return null;

  const ground: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) row += street[idx(x, y)] || plaza[idx(x, y)] ? 's' : '.';
    ground.push(row);
  }
  const cellsWhere = (m: Uint8Array) => {
    const out: [number, number][] = [];
    for (let i = 0; i < W * H; i++) if (m[i]) out.push([i % W, Math.floor(i / W)]);
    return out;
  };
  return { seed, w: W, h: H, ground, houses, props, blocked: cellsWhere(blocked), sightBlocked: cellsWhere(sight), heroSpawns, enemies, exits };
}

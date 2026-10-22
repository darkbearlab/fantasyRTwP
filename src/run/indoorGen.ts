/**
 * 室內地圖的程序生成（SPEC_CAMPAIGN §6，第 3～5 章）。輸出共用的 IndoorLevel：
 * - grid：一列一字串。'#' 牆（擋路、擋視線）、'.' 地面、'D' 門（開著，可以關；關著擋視線）、'^' 高台（遠程站的地方）。
 * - props：單格物件或佔位矩形（多格物件之後由 Alan 用拼圖台做成預製件）。
 * - exits：出口（地圖邊緣的 4 格寬開口，開口處放樓梯）；heroSpawns：出生點（入口那一側）。
 * 三種版面：
 * - temple（第 3 章 試煉地城）：BSP 切房間＋2～3 格寬的走廊；走廊進房間處放門；每個房間一道試煉。
 * - cave（第 4 章 密道）：細胞自動機長出洞穴，保留最大的連通區；1 格寬的縫加寬成 2 格；大洞室放蟲巢。
 * - castle（第 5 章 魔王城）：左右對稱。中央大廳由下往上（兩道城門關卡）、兩側迴廊、二樓高台、最上方王座廳。
 * 全部參數在 INDOOR，可以調。sim／run 層純函式，不 import 畫面。
 */
import { Rng } from '../sim/rng';
import type { FieldEdge } from './fieldGen';
import { deriveSeed } from './seed';

export type IndoorTheme = 'temple' | 'cave' | 'castle';

export interface IndoorProp {
  kind: string;
  x: number;
  y: number;
  /** 佔位矩形的大小（多格物件；省略＝單格） */
  w?: number;
  h?: number;
}

export interface IndoorRoom {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 房間的試煉（temple）或用途 */
  role: string;
}

export interface IndoorLevel {
  seed: number;
  theme: IndoorTheme;
  w: number;
  h: number;
  grid: string[];
  rooms: IndoorRoom[];
  props: IndoorProp[];
  enemies: { enemy: string; x: number; y: number; squad: string; facing?: FieldEdge; captain?: boolean; hidden?: boolean }[];
  heroSpawns: { x: number; y: number }[];
  exits: { id: string; edge: FieldEdge; label?: string; x: number; y: number; w: number; h: number }[];
}

export interface IndoorOptions {
  layer: number;
  exits: { id: string; edge: FieldEdge; label?: string }[];
  entry?: FieldEdge;
}

export const INDOOR = {
  size: 48,
  exitWidth: 4,
  temple: {
    /** BSP 葉子最大尺寸、房間最小尺寸（內部，格） */
    leafMax: 15,
    roomMin: 6,
    roomMax: 11,
    corridorWidth: [2, 3] as [number, number],
    /** 額外的迴圈走廊比例 */
    loopChance: 0.25,
    /** 門最寬幾格（更長的開口是走廊貼著房間，不放門） */
    doorMax: 3,
    /** 試煉的種類與權重（入口房另外指定） */
    roles: { strength: 3, wits: 2, courage: 2, heart: 2, library: 2 } as Record<string, number>,
  },
  cave: {
    fill: 0.46,
    steps: 5,
    /** 洞室：離牆至少這麼遠的格子當成大洞室的中心 */
    chamberClear: 3,
    chambers: [3, 5] as [number, number],
    torches: [6, 10] as [number, number],
  },
  castle: {
    hallHalf: 4,
    galleryOffset: 13,
    galleryWidth: 3,
    /** 城門在大廳的哪裡（由下往上的比例） */
    gateAt: [0.68, 0.34],
    gateWidth: 3,
    throneRows: 10,
  },
};

type Cell = [number, number];

/** 共用的格子工具 */
class Grid {
  cells: string[][];
  constructor(
    readonly w: number,
    readonly h: number,
    fill = '#',
  ) {
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  }
  in(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number) {
    return this.in(x, y) ? this.cells[y][x] : '#';
  }
  set(x: number, y: number, c: string) {
    if (this.in(x, y)) this.cells[y][x] = c;
  }
  open(x: number, y: number) {
    const c = this.get(x, y);
    return c !== '#';
  }
  rect(x0: number, y0: number, w: number, h: number, c: string) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }
  /** 從 (sx, sy) 走得到的地面格 */
  flood(sx: number, sy: number): Set<number> {
    const seen = new Set<number>();
    if (!this.open(sx, sy)) return seen;
    const st = [sy * this.w + sx];
    seen.add(st[0]);
    while (st.length) {
      const i = st.pop()!;
      const x = i % this.w;
      const y = (i - x) / this.w;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        const k = ny * this.w + nx;
        if (!this.in(nx, ny) || seen.has(k) || !this.open(nx, ny)) continue;
        seen.add(k);
        st.push(k);
      }
    }
    return seen;
  }
}

/** 挖一條 L 形走廊（寬 width），先橫再直或先直再橫 */
function corridor(g: Grid, a: Cell, b: Cell, width: number, rng: Rng, c = '.', horizontalFirst?: boolean): void {
  const [ax, ay] = a;
  const [bx, by] = b;
  const half = Math.floor((width - 1) / 2);
  const dig = (x: number, y: number) => {
    for (let dy = -half; dy < width - half; dy++) for (let dx = -half; dx < width - half; dx++) if (g.get(x + dx, y + dy) === '#') g.set(x + dx, y + dy, c);
  };
  const horizFirst = horizontalFirst ?? rng.chance(0.5);
  if (horizFirst) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) dig(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) dig(bx, y);
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) dig(ax, y);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) dig(x, by);
  }
}

/** 出口：沿著那一邊開一個 exitWidth 格寬的口，並往內挖到最近的地面 */
function carveEdge(g: Grid, edge: FieldEdge, along: number, rng: Rng, width = 2): { x: number; y: number; w: number; h: number; inner: Cell } {
  const W = INDOOR.exitWidth;
  const a = Math.max(2, Math.min((edge === 'top' || edge === 'bottom' ? g.w : g.h) - W - 2, along - Math.floor(W / 2)));
  const rect =
    edge === 'top' ? { x: a, y: 0, w: W, h: 2 } : edge === 'bottom' ? { x: a, y: g.h - 2, w: W, h: 2 } : edge === 'left' ? { x: 0, y: a, w: 2, h: W } : { x: g.w - 2, y: a, w: 2, h: W };
  g.rect(rect.x, rect.y, rect.w, rect.h, '.');
  const mid: Cell = [rect.x + Math.floor(rect.w / 2), rect.y + Math.floor(rect.h / 2)];
  // 往內找最近的地面，挖過去
  let best: Cell | null = null;
  let bd = Infinity;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (!g.open(x, y)) continue;
      const inRect = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      if (inRect) continue;
      const d = Math.abs(x - mid[0]) + Math.abs(y - mid[1]);
      if (d < bd) {
        bd = d;
        best = [x, y];
      }
    }
  if (best) corridor(g, mid, best, width, rng);
  return { ...rect, inner: best ?? mid };
}

/** 各邊上的出口沿線位置：同一邊有好幾個時平均分配 */
function exitAlongs(opts: IndoorOptions, size: number): { e: IndoorOptions['exits'][number]; along: number }[] {
  const byEdge = new Map<FieldEdge, IndoorOptions['exits']>();
  for (const e of opts.exits) byEdge.set(e.edge, [...(byEdge.get(e.edge) ?? []), e]);
  const out: { e: IndoorOptions['exits'][number]; along: number }[] = [];
  for (const [, list] of byEdge) list.forEach((e, i) => out.push({ e, along: Math.round(((i + 1) / (list.length + 1)) * size) }));
  return out;
}

/** 出生點：入口那一側的地圖邊緣，4 名英雄 */
function spawnAt(g: Grid, edge: FieldEdge, rng: Rng): { cells: { x: number; y: number }[]; rect: ReturnType<typeof carveEdge> } {
  const rect = carveEdge(g, edge, Math.floor((edge === 'top' || edge === 'bottom' ? g.w : g.h) / 2), rng, 3);
  const cells: { x: number; y: number }[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (cells.length < 4) cells.push({ x, y });
  return { cells, rect };
}

/** 牆裡只剩 1 格寬的縫：往旁邊多挖一格（1 m 的角色走得過） */
function widenSlits(g: Grid): void {
  for (let pass = 0; pass < 2; pass++)
    for (let y = 1; y < g.h - 1; y++)
      for (let x = 1; x < g.w - 1; x++) {
        if (!g.open(x, y)) continue;
        if (!g.open(x - 1, y) && !g.open(x + 1, y)) g.set(x + 1 < g.w - 1 ? x + 1 : x - 1, y, '.');
        if (!g.open(x, y - 1) && !g.open(x, y + 1)) g.set(x, y + 1 < g.h - 1 ? y + 1 : y - 1, '.');
      }
}

// ───────────── 第 3 章：試煉地城（BSP 房間＋走廊） ─────────────

function generateTemple(seed: number, opts: IndoorOptions, rng: Rng): IndoorLevel | null {
  const T = INDOOR.temple;
  const S = INDOOR.size;
  const g = new Grid(S, S);
  // BSP：把 (2,2)–(S-3,S-3) 切成葉子
  const leaves: { x: number; y: number; w: number; h: number }[] = [];
  const split = (x: number, y: number, w: number, h: number) => {
    if (w <= T.leafMax && h <= T.leafMax) {
      leaves.push({ x, y, w, h });
      return;
    }
    const vertical = w > h ? true : h > w ? false : rng.chance(0.5);
    if (vertical) {
      const c = rng.int(Math.floor(w * 0.4), Math.ceil(w * 0.6));
      split(x, y, c, h);
      split(x + c, y, w - c, h);
    } else {
      const c = rng.int(Math.floor(h * 0.4), Math.ceil(h * 0.6));
      split(x, y, w, c);
      split(x, y + c, w, h - c);
    }
  };
  split(3, 3, S - 6, S - 6);
  const rooms: IndoorRoom[] = [];
  for (const l of leaves) {
    const rw = Math.min(T.roomMax, Math.max(T.roomMin, rng.int(T.roomMin, Math.max(T.roomMin, l.w - 3))));
    const rh = Math.min(T.roomMax, Math.max(T.roomMin, rng.int(T.roomMin, Math.max(T.roomMin, l.h - 3))));
    if (rw > l.w - 2 || rh > l.h - 2) continue;
    const rx = l.x + rng.int(1, l.w - rw - 1);
    const ry = l.y + rng.int(1, l.h - rh - 1);
    rooms.push({ x: rx, y: ry, w: rw, h: rh, role: '' });
    g.rect(rx, ry, rw, rh, '.');
  }
  if (rooms.length < 5) return null;
  const center = (r: IndoorRoom): Cell => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)];
  // 走廊：最小生成樹（Prim）＋一些迴圈
  const inTree = new Set([0]);
  const edges: [number, number][] = [];
  while (inTree.size < rooms.length) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const a of inTree)
      for (let b = 0; b < rooms.length; b++) {
        if (inTree.has(b)) continue;
        const [ax, ay] = center(rooms[a]);
        const [bx, by] = center(rooms[b]);
        const d = Math.abs(ax - bx) + Math.abs(ay - by);
        if (d < bd) {
          bd = d;
          best = [a, b];
        }
      }
    edges.push(best!);
    inTree.add(best![1]);
  }
  for (let a = 0; a < rooms.length; a++)
    for (let b = a + 1; b < rooms.length; b++) {
      if (edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue;
      const [ax, ay] = center(rooms[a]);
      const [bx, by] = center(rooms[b]);
      if (Math.abs(ax - bx) + Math.abs(ay - by) < 20 && rng.chance(T.loopChance)) edges.push([a, b]);
    }
  const inRoom = (x: number, y: number) => rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  for (const [a, b] of edges) corridor(g, center(rooms[a]), center(rooms[b]), rng.int(T.corridorWidth[0], T.corridorWidth[1]), rng);
  // 門：走廊進房間的開口（房間外框上連續開著的一段，長度不超過 doorMax；走廊貼著房間走的長段不放門）
  for (const r of rooms) {
    const sides: Cell[][] = [
      Array.from({ length: r.w }, (_, i): Cell => [r.x + i, r.y - 1]),
      Array.from({ length: r.w }, (_, i): Cell => [r.x + i, r.y + r.h]),
      Array.from({ length: r.h }, (_, i): Cell => [r.x - 1, r.y + i]),
      Array.from({ length: r.h }, (_, i): Cell => [r.x + r.w, r.y + i]),
    ];
    for (const side of sides) {
      let run: Cell[] = [];
      const flush = () => {
        if (run.length > 0 && run.length <= T.doorMax && run.every(([x, y]) => !inRoom(x, y))) for (const [x, y] of run) g.set(x, y, 'D');
        run = [];
      };
      for (const c of side) {
        if (g.open(c[0], c[1])) run.push(c);
        else flush();
      }
      flush();
    }
  }
  return finishLevel(seed, 'temple', g, rooms, opts, rng, (lv) => templeContents(lv, g, rng));
}

/** 試煉地城：入口房以外的房間各抽一道試煉，放物件與敵人 */
function templeContents(lv: IndoorLevel, g: Grid, rng: Rng): void {
  const T = INDOOR.temple;
  const roles = Object.entries(T.roles);
  const total = roles.reduce((s, [, w]) => s + w, 0);
  const pickRole = () => {
    let r = rng.next() * total;
    for (const [id, w] of roles) if ((r -= w) < 0) return id;
    return roles[0][0];
  };
  const spawn = lv.heroSpawns[0];
  const near = [...lv.rooms].sort((a, b) => Math.abs(a.x + a.w / 2 - spawn.x) + Math.abs(a.y + a.h / 2 - spawn.y) - (Math.abs(b.x + b.w / 2 - spawn.x) + Math.abs(b.y + b.h / 2 - spawn.y)))[0];
  lv.rooms.forEach((r, k) => {
    r.role = r === near ? 'entry' : pickRole();
    const sq = `room${k}`;
    const cx = r.x + Math.floor(r.w / 2);
    const cy = r.y + Math.floor(r.h / 2);
    const at = (x: number, y: number, enemy: string, extra: Partial<IndoorLevel['enemies'][number]> = {}) => {
      if (g.get(x, y) === '.') lv.enemies.push({ enemy, x, y, squad: sq, ...extra });
    };
    // 每個房間四角的燭台
    for (const [x, y] of [
      [r.x, r.y],
      [r.x + r.w - 1, r.y],
    ])
      lv.props.push({ kind: 'candle', x, y });
    switch (r.role) {
      case 'strength': {
        // 力之試煉：活化鎧甲擋在門口，神殿騎士在後面
        const doors = doorCells(g, r);
        const d = doors[0];
        if (d) {
          const inside = stepInto(r, d);
          at(inside[0], inside[1], 'hollowArmor');
        }
        at(cx, cy, 'templeKnight');
        at(cx + 1, cy + 1, 'templeKnight');
        break;
      }
      case 'wits':
        // 智之試煉：會移動的光柱（佔位：一排光柱格）
        for (let y = r.y + 1; y < r.y + r.h - 1; y += 3) lv.props.push({ kind: 'lightBeam', x: r.x, y, w: r.w, h: 1 });
        at(cx, r.y + 1, 'templeKnight');
        break;
      case 'courage':
        // 勇之試煉：四角的魔像生成點（進房間才出現）
        for (const [x, y] of [
          [r.x + 1, r.y + 1],
          [r.x + r.w - 2, r.y + 1],
          [r.x + 1, r.y + r.h - 2],
          [r.x + r.w - 2, r.y + r.h - 2],
        ]) {
          lv.props.push({ kind: 'golemSeal', x, y });
          at(x, y, 'golem', { hidden: true });
        }
        break;
      case 'heart':
        // 心之試煉：保護中間的石像
        lv.props.push({ kind: 'statue', x: cx - 1, y: cy - 1, w: 2, h: 2 });
        at(r.x + 1, cy, 'templeKnight');
        at(r.x + r.w - 2, cy, 'templeKnight');
        at(cx, r.y + 1, 'golem');
        break;
      case 'library':
        // 書庫：書架當掩體（佔位矩形），騎士躲在後面
        for (let x = r.x + 1; x + 3 <= r.x + r.w - 1; x += 4) lv.props.push({ kind: 'bookshelf', x, y: cy - 1, w: 3, h: 1 });
        for (let x = r.x + 1; x + 3 <= r.x + r.w - 1; x += 4) for (let dx = 0; dx < 3; dx++) g.set(x + dx, cy - 1, '#');
        at(cx, r.y + 1, 'templeKnight');
        at(cx + 2, r.y + 1, 'templeKnight');
        break;
      default:
        break;
    }
  });
}

/** 房間外框上的門 */
function doorCells(g: Grid, r: IndoorRoom): Cell[] {
  const out: Cell[] = [];
  for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (g.get(x, y) === 'D') out.push([x, y]);
  return out;
}

/** 門往房間裡面走一格 */
function stepInto(r: IndoorRoom, [x, y]: Cell): Cell {
  if (x < r.x) return [r.x, y];
  if (x >= r.x + r.w) return [r.x + r.w - 1, y];
  if (y < r.y) return [x, r.y];
  return [x, r.y + r.h - 1];
}

// ───────────── 第 4 章：密道（細胞自動機洞穴） ─────────────

function generateCave(seed: number, opts: IndoorOptions, rng: Rng): IndoorLevel | null {
  const C = INDOOR.cave;
  const S = INDOOR.size;
  let g = new Grid(S, S);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) g.set(x, y, rng.chance(C.fill) ? '#' : '.');
  for (let s = 0; s < C.steps; s++) {
    const n = new Grid(S, S);
    for (let y = 1; y < S - 1; y++)
      for (let x = 1; x < S - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !g.open(x + dx, y + dy)) walls++;
        n.set(x, y, walls >= 5 ? '#' : walls <= 3 ? '.' : g.get(x, y));
      }
    g = n;
  }
  // 只留最大的連通區
  let best = new Set<number>();
  const seen = new Set<number>();
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      if (!g.open(x, y) || seen.has(k)) continue;
      const f = g.flood(x, y);
      for (const i of f) seen.add(i);
      if (f.size > best.size) best = f;
    }
  if (best.size < S * S * 0.3) return null;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g.open(x, y) && !best.has(y * S + x)) g.set(x, y, '#');
  widenSlits(g);
  return finishLevel(seed, 'cave', g, [], opts, rng, (lv) => caveContents(lv, g, rng));
}

/** 離最近的牆幾格（曼哈頓距離，地面格才有意義） */
function wallDistance(g: Grid): number[] {
  const d = new Array(g.w * g.h).fill(Infinity);
  const q: number[] = [];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (!g.open(x, y)) {
        d[y * g.w + x] = 0;
        q.push(y * g.w + x);
      }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % g.w;
    const y = (i - x) / g.w;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!g.in(nx, ny)) continue;
      const k = ny * g.w + nx;
      if (d[k] > d[i] + 1) {
        d[k] = d[i] + 1;
        q.push(k);
      }
    }
  }
  return d;
}

function caveContents(lv: IndoorLevel, g: Grid, rng: Rng): void {
  const C = INDOOR.cave;
  const dist = wallDistance(g);
  const spawn = lv.heroSpawns[0];
  // 大洞室：離牆夠遠、彼此相隔、離出生點遠
  const cands: Cell[] = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.open(x, y) && dist[y * g.w + x] >= C.chamberClear && Math.abs(x - spawn.x) + Math.abs(y - spawn.y) > 12) cands.push([x, y]);
  const chambers: Cell[] = [];
  for (const c of shuffle(rng, cands)) {
    if (chambers.length >= rng.int(C.chambers[0], C.chambers[1])) break;
    if (chambers.every(([x, y]) => Math.abs(x - c[0]) + Math.abs(y - c[1]) >= 12)) chambers.push(c);
  }
  chambers.forEach(([x, y], k) => {
    lv.rooms.push({ x: x - 3, y: y - 3, w: 7, h: 7, role: k === 0 ? 'nest' : rng.chance(0.5) ? 'nest' : 'lair' });
    const sq = `chamber${k}`;
    if (lv.rooms[k].role === 'nest') {
      lv.enemies.push({ enemy: 'bugNest', x, y, squad: sq });
      for (const [dx, dy] of [
        [2, 0],
        [-2, 0],
        [0, 2],
      ])
        if (g.get(x + dx, y + dy) === '.') lv.enemies.push({ enemy: 'swarmling', x: x + dx, y: y + dy, squad: sq });
    } else {
      lv.enemies.push({ enemy: 'lurker', x, y, squad: sq });
      if (g.get(x + 2, y) === '.') lv.enemies.push({ enemy: 'exploder', x: x + 2, y, squad: sq });
    }
  });
  // 窄道上的伏兵：離牆只有 1 格（2 格寬）的地方
  const narrow: Cell[] = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.open(x, y) && dist[y * g.w + x] === 1 && Math.abs(x - spawn.x) + Math.abs(y - spawn.y) > 10) narrow.push([x, y]);
  for (const [x, y] of shuffle(rng, narrow).slice(0, 2)) lv.enemies.push({ enemy: 'lurker', x, y, squad: `narrow${x}_${y}` });
  // 牆上的火把（可以點亮）、地上的碎石
  const wallSide: Cell[] = [];
  for (let y = 1; y < g.h - 1; y++) for (let x = 1; x < g.w - 1; x++) if (!g.open(x, y) && g.open(x, y + 1)) wallSide.push([x, y]);
  for (const [x, y] of shuffle(rng, wallSide).slice(0, rng.int(C.torches[0], C.torches[1]))) lv.props.push({ kind: 'torch', x, y });
  const floor: Cell[] = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y) === '.' && dist[y * g.w + x] >= 2) floor.push([x, y]);
  for (const [x, y] of shuffle(rng, floor).slice(0, 12)) lv.props.push({ kind: rng.chance(0.5) ? 'rubble' : 'mushroom', x, y });
}

// ───────────── 第 5 章：魔王城（左右對稱） ─────────────

function generateCastle(seed: number, opts: IndoorOptions, rng: Rng): IndoorLevel | null {
  const K = INDOOR.castle;
  const S = INDOOR.size;
  const g = new Grid(S, S);
  const cx = Math.floor(S / 2);
  const rooms: IndoorRoom[] = [];
  // 中央大廳：由下往上
  const hall = { x: cx - K.hallHalf, y: K.throneRows + 3, w: K.hallHalf * 2, h: S - K.throneRows - 6, role: 'hall' };
  g.rect(hall.x, hall.y, hall.w, hall.h, '.');
  rooms.push(hall);
  // 王座廳（最上方）
  const throne = { x: cx - 9, y: 2, w: 18, h: K.throneRows, role: 'throne' };
  g.rect(throne.x, throne.y, throne.w, throne.h, '.');
  rooms.push(throne);
  // 寬 4 的走廊以 cx - 0.5 為中心（x = cx-2 … cx+1）
  corridor(g, [cx - 1, throne.y + throne.h - 1], [cx - 1, hall.y], 4, rng);
  // 二樓高台：大廳兩側各 2 格
  for (let y = hall.y + 2; y < hall.y + hall.h - 2; y++)
    for (const x of [hall.x, hall.x + 1, hall.x + hall.w - 2, hall.x + hall.w - 1]) g.set(x, y, '^');
  // 城門關卡：橫跨大廳的牆，中間留 gateWidth 格
  const gateRows = K.gateAt.map((f) => hall.y + Math.round(hall.h * f));
  for (const gy of gateRows) {
    for (let x = hall.x; x < hall.x + hall.w; x++) if (Math.abs(x - cx + 0.5) > K.gateWidth / 2) g.set(x, gy, '#');
    rooms.push({ x: cx - Math.ceil(K.gateWidth / 2), y: gy, w: K.gateWidth, h: 1, role: 'gate' });
  }
  // 兩側迴廊（對稱），每隔一段用門接到大廳
  for (const side of [-1, 1]) {
    // 中軸在 cx - 0.5：右側用左側的鏡像位置
    const leftGx = cx - K.galleryOffset - Math.floor(K.galleryWidth / 2);
    const gx = side < 0 ? leftGx : S - leftGx - K.galleryWidth;
    g.rect(gx, hall.y - 4, K.galleryWidth, hall.h + 4, '.');
    rooms.push({ x: gx, y: hall.y - 4, w: K.galleryWidth, h: hall.h + 4, role: 'gallery' });
    // 側門避開城門那一列
    for (const y of [hall.y + 4, hall.y + Math.floor(hall.h / 2) + 1, hall.y + hall.h - 5].map((y) => (gateRows.some((gy) => Math.abs(gy - y) <= 1) ? y + 3 : y))) {
      const a = side < 0 ? gx + K.galleryWidth : hall.x + hall.w;
      const b = side < 0 ? hall.x - 1 : gx - 1;
      for (let x = Math.min(a, b); x <= Math.max(a, b); x++) {
        g.set(x, y, '.');
        g.set(x, y + 1, '.');
      }
      g.set(side < 0 ? hall.x - 1 : hall.x + hall.w, y, 'D');
      g.set(side < 0 ? hall.x - 1 : hall.x + hall.w, y + 1, 'D');
    }
    // 迴廊外側的小房間（對稱）
    for (const ry of [hall.y, hall.y + 12]) {
      const rx = side < 0 ? 3 : S - 3 - 7;
      g.rect(rx, ry, 7, 8, '.');
      rooms.push({ x: rx, y: ry, w: 7, h: 8, role: 'barracks' });
      const doorX = side < 0 ? rx + 7 : rx - 1;
      g.set(doorX, ry + 3, 'D');
      g.set(doorX, ry + 4, 'D');
      for (let x = Math.min(doorX, gx), e = Math.max(doorX, gx + K.galleryWidth - 1); x <= e; x++) if (g.get(x, ry + 3) === '#') (g.set(x, ry + 3, '.'), g.set(x, ry + 4, '.'));
    }
    // 迴廊頂端接王座廳側門
    // 兩側都先直走再橫走，保持對稱
    const top = side < 0 ? gx + 1 : gx + K.galleryWidth - 2;
    corridor(g, [top, hall.y - 4], [side < 0 ? throne.x : throne.x + throne.w - 1, throne.y + throne.h - 2], 2, rng, '.', false);
  }
  return finishLevel(seed, 'castle', g, rooms, opts, rng, (lv) => castleContents(lv, g, rng), 'bottom');
}

function castleContents(lv: IndoorLevel, g: Grid, rng: Rng): void {
  const cx = Math.floor(g.w / 2);
  // 火盆：大廳兩側、王座廳
  for (const r of lv.rooms.filter((r) => r.role === 'hall' || r.role === 'throne'))
    for (let y = r.y + 2; y < r.y + r.h - 1; y += 5) {
      lv.props.push({ kind: 'brazier', x: r.x + 2, y });
      lv.props.push({ kind: 'brazier', x: r.x + r.w - 3, y });
    }
  const throne = lv.rooms.find((r) => r.role === 'throne')!;
  lv.props.push({ kind: 'throne', x: cx - 1, y: throne.y + 1, w: 2, h: 2 });
  // 城門：守門盾兵＋長槍（佔位：帝國盾兵）＋後面的魔王親衛
  lv.rooms.filter((r) => r.role === 'gate').map((r) => r.y).forEach((gy, k) => {
    const sq = `gate${k}`;
    lv.enemies.push({ enemy: 'shieldbearer', x: cx - 1, y: gy + 1, squad: sq, facing: 'bottom' });
    lv.enemies.push({ enemy: 'shieldbearer', x: cx, y: gy + 1, squad: sq, facing: 'bottom' });
    lv.enemies.push({ enemy: 'demonGuard', x: cx, y: gy - 2, squad: sq, facing: 'bottom' });
  });
  // 二樓高台的遠程
  const hall = lv.rooms.find((r) => r.role === 'hall')!;
  for (const y of [hall.y + 4, hall.y + 14]) {
    lv.enemies.push({ enemy: 'archer', x: hall.x, y, squad: `high${y}`, facing: 'right' });
    lv.enemies.push({ enemy: 'archer', x: hall.x + hall.w - 1, y, squad: `high${y}`, facing: 'left' });
  }
  // 迴廊的巡邏隊、兵舍
  lv.rooms
    .filter((r) => r.role === 'gallery')
    .forEach((r, k) => {
      const y = r.y + rng.int(4, r.h - 6);
      lv.enemies.push({ enemy: 'demonElite', x: r.x + 1, y, squad: `patrol${k}` });
      lv.enemies.push({ enemy: 'demonElite', x: r.x + 1, y: y + 1, squad: `patrol${k}` });
    });
  lv.rooms
    .filter((r) => r.role === 'barracks')
    .forEach((r, k) => {
      if (rng.chance(0.5)) lv.enemies.push({ enemy: 'demonElite', x: r.x + 3, y: r.y + 3, squad: `barracks${k}` });
      lv.props.push({ kind: 'armorStand', x: r.x + 1, y: r.y + 1 });
    });
}

// ───────────── 共用：出口、出生點、可達性 ─────────────

function finishLevel(
  seed: number,
  theme: IndoorTheme,
  g: Grid,
  rooms: IndoorRoom[],
  opts: IndoorOptions,
  rng: Rng,
  contents: (lv: IndoorLevel) => void,
  forceEntry?: FieldEdge,
): IndoorLevel | null {
  const entry = forceEntry ?? opts.entry ?? 'bottom';
  const sp = spawnAt(g, entry, rng);
  const exits: IndoorLevel['exits'] = [];
  for (const { e, along } of exitAlongs(opts, g.w)) {
    const r = carveEdge(g, e.edge, along, rng);
    exits.push({ id: e.id, edge: e.edge, label: e.label, x: r.x, y: r.y, w: r.w, h: r.h });
  }
  const lv: IndoorLevel = { seed, theme, w: g.w, h: g.h, grid: [], rooms, props: [], enemies: [], heroSpawns: sp.cells, exits };
  contents(lv);
  // 出口的樓梯（佔位）
  for (const e of exits) lv.props.push({ kind: 'stairs', x: e.x, y: e.y, w: e.w, h: e.h });
  // 可達性：出生點走得到每個出口與每名敵人
  const reach = g.flood(sp.cells[0].x, sp.cells[0].y);
  const ok = (x: number, y: number) => reach.has(y * g.w + x);
  if (!exits.every((e) => ok(e.x, e.y))) return null;
  lv.enemies = lv.enemies.filter((e) => ok(e.x, e.y));
  lv.grid = g.rows();
  return lv;
}

function shuffle<T>(rng: Rng, a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

const GENERATORS: Record<IndoorTheme, (seed: number, opts: IndoorOptions, rng: Rng) => IndoorLevel | null> = {
  temple: generateTemple,
  cave: generateCave,
  castle: generateCastle,
};

/** 生成一張室內地圖（失敗就換子種子重試） */
export function generateIndoor(theme: IndoorTheme, seed: number, opts: IndoorOptions): IndoorLevel {
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = new Rng(deriveSeed(seed, 'indoor', theme, attempt));
    const lv = GENERATORS[theme](seed, opts, rng);
    if (lv) return lv;
  }
  throw new Error(`室內地圖生成失敗：${theme} ${seed}`);
}

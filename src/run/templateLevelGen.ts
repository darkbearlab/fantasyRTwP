/**
 * 模板拼接的關卡生成（SPEC_SLICE6 §1）。純函式、只用種子亂數。
 *
 * 流程：
 * 1. 依關卡類型決定區塊數（TEMPLATE_LEVELS.layouts），先放起點模板（最左一欄），再放必備模板（精英房、頭目房，放在遠端），
 *    一般關卡有機率放一塊大型景點（feature），其餘格子用填充模板補滿；模板可以旋轉、鏡像。
 * 2. 拼成一張字元地圖；區塊之間不通就在交界打開通道。
 * 3. 生怪磚（數字）依池子與權重抽敵人，整關有點數預算上限；精英房的小隊有隊長，頭目房放頭目與護衛。
 * 4. 轉成 MapDef（牆合併成長方形、地形、門），檢查出生點走得到每一名敵人；不通過就換子種子重試。
 */
import type { ExitDef, InteractableDef, MapDef, Rect, TerrainRect } from '../sim/data/types';
import type { Vec } from '../sim/math';
import { NavGrid } from '../sim/nav/grid';
import { Rng } from '../sim/rng';
import { DELIBERATE_LEVELS } from './data/deliberateLevels';
import type { DeliberateTier } from './data/deliberateLevels';
import type { EncounterEnemy } from './data/encounters';
import { LEVEL_POOLS, TEMPLATE_LEVELS } from './data/levelPools';
import type { LevelTemplate, SpawnTile } from './data/templates';
import { TEMPLATES } from './data/templates';
import type { GeneratedLevel } from './levelGen';
import { floodFrom, levelDifficulty } from './levelGen';
import { deriveSeed } from './seed';

export interface TemplateLevelOptions {
  tier: DeliberateTier;
  layer: number;
  /**
   * 出口（SPEC_SLICE6 §2）：一個相鄰節點一個，依路線圖上由左到右的順序排在地圖遠端（畫面上方）由左到右。
   * 沒給（快速戰鬥、最後的頭目戰）＝沒有出口。
   */
  exits?: ExitRequest[];
  /** 從哪一側進入（出生點在那一側）：bottom＝畫面下方（預設）、top、left、right（SPEC_SLICE6 §4：從哪裡來就從哪裡進） */
  entry?: Edge;
  /** 點數預算與人數上限倍率（被主力佔領的節點） */
  budgetMult?: number;
  /** 精英隊長換成這個敵人（冠軍戰） */
  captainEnemy?: string;
}

/** 地圖的四個邊：top＝x 最大（畫面上方）、bottom＝x＝0、left＝y＝0、right＝y 最大 */
export type Edge = 'top' | 'bottom' | 'left' | 'right';

export interface ExitRequest {
  id: string;
  label?: string;
  /** 出口在哪一邊（預設 top） */
  edge?: Edge;
}

/** 擋路的字元 */
const BLOCKING = new Set(['#', 'o', 'W']);

/** 出口大小（公尺） */
const EXIT_SIZE = 4;

/** 放在地圖上的一塊模板（已旋轉／鏡像） */
export interface Placement {
  tpl: LevelTemplate;
  rows: string[];
  /** 左上角的區塊座標與佔用的區塊數 */
  cx: number;
  cy: number;
  sw: number;
  sh: number;
}

/** 旋轉 90 度（順時針）：寬高互換 */
export function rotateRows(rows: string[]): string[] {
  const h = rows.length;
  const w = rows[0].length;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let line = '';
    for (let y = h - 1; y >= 0; y--) line += rows[y][x];
    out.push(line);
  }
  return out;
}

export function mirrorRows(rows: string[]): string[] {
  return rows.map((r) => [...r].reverse().join(''));
}

function weightedPick<T extends { weight: number }>(rng: Rng, list: T[]): T | undefined {
  const total = list.reduce((a, t) => a + t.weight, 0);
  if (total <= 0) return undefined;
  let r = rng.range(0, total);
  for (const t of list) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return list[list.length - 1];
}

/** 依標籤挑模板並隨機旋轉／鏡像 */
function pickTemplate(rng: Rng, tag: string, theme: string): { tpl: LevelTemplate; rows: string[]; sw: number; sh: number } | undefined {
  const tpl = weightedPick(
    rng,
    TEMPLATES.filter((t) => t.tags.includes(tag) && t.tags.includes(theme)),
  );
  if (!tpl) return undefined;
  let rows = tpl.rows;
  let [sw, sh] = tpl.size;
  if (TEMPLATE_LEVELS.allowRotate) {
    const turns = rng.int(0, 3);
    for (let i = 0; i < turns; i++) {
      rows = rotateRows(rows);
      [sw, sh] = [sh, sw];
    }
    if (rng.chance(0.5)) rows = mirrorRows(rows);
  }
  return { tpl, rows, sw, sh };
}

/** 把同一個字元的格子合併成長方形（先每列找連續段，再往下延伸相同的段） */
export function mergeCells(grid: string[][], match: (c: string) => boolean): Rect[] {
  const H = grid.length;
  const W = grid[0].length;
  const out: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let y = 0; y < H; y++) {
    const next = new Map<string, Rect>();
    let x = 0;
    while (x < W) {
      if (!match(grid[y][x])) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < W && match(grid[y][x])) x++;
      const key = `${x0},${x}`;
      const prev = open.get(key);
      if (prev) {
        prev.h += 1;
        next.set(key, prev);
      } else {
        const r = { x: x0, y, w: x - x0, h: 1 };
        out.push(r);
        next.set(key, r);
      }
    }
    open = next;
  }
  return out;
}

/** 相連的同字元格子（4 方向） */
function components(cells: Vec[]): Vec[][] {
  const key = (p: Vec) => `${p.x},${p.y}`;
  const left = new Map(cells.map((p) => [key(p), p]));
  const out: Vec[][] = [];
  for (const start of cells) {
    if (!left.has(key(start))) continue;
    const comp: Vec[] = [];
    const stack = [start];
    left.delete(key(start));
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      for (const q of [
        { x: p.x + 1, y: p.y },
        { x: p.x - 1, y: p.y },
        { x: p.x, y: p.y + 1 },
        { x: p.x, y: p.y - 1 },
      ]) {
        if (left.has(key(q))) {
          left.delete(key(q));
          stack.push(q);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

export function generateTemplateLevel(seed: number, opts: TemplateLevelOptions): GeneratedLevel {
  return generateTemplateLevelDetailed(seed, opts).level;
}

/** 同上，另外回傳拼好的字元地圖與模板位置（預覽工具用） */
export function generateTemplateLevelDetailed(seed: number, opts: TemplateLevelOptions): { level: GeneratedLevel; assembly: Assembly } {
  for (let attempt = 0; attempt < TEMPLATE_LEVELS.maxAttempts; attempt++) {
    const r = tryGenerate(new Rng(deriveSeed(seed, 'tlevel', attempt)), seed, opts);
    if (r) return r;
  }
  throw new Error('模板關卡生成失敗');
}

/** 拼接結果（預覽工具也用） */
export interface Assembly {
  cw: number;
  ch: number;
  placements: Placement[];
  grid: string[][];
}

/** 步驟 1～2：放模板、拼成字元地圖、打通區塊 */
export function assemble(rng: Rng, tier: DeliberateTier): Assembly | null {
  const T = TEMPLATE_LEVELS;
  const layout = T.layouts[tier];
  const { w: cw, h: ch } = layout;
  const C = T.chunk;
  const used: number[] = new Array(cw * ch).fill(-1);
  const placements: Placement[] = [];
  const fits = (cx: number, cy: number, sw: number, sh: number) => {
    if (cx < 0 || cy < 0 || cx + sw > cw || cy + sh > ch) return false;
    for (let y = cy; y < cy + sh; y++) for (let x = cx; x < cx + sw; x++) if (used[y * cw + x] >= 0) return false;
    return true;
  };
  const put = (p: { tpl: LevelTemplate; rows: string[]; sw: number; sh: number }, cx: number, cy: number) => {
    placements.push({ ...p, cx, cy });
    for (let y = cy; y < cy + p.sh; y++) for (let x = cx; x < cx + p.sw; x++) used[y * cw + x] = placements.length - 1;
  };
  /** 在 columns 範圍內找放得下的位置（依欄的順序，同一欄隨機列） */
  const placeIn = (p: { tpl: LevelTemplate; rows: string[]; sw: number; sh: number }, cols: number[]): boolean => {
    for (const cx of cols) {
      const rows = [...Array(ch).keys()];
      for (let i = rows.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      for (const cy of rows) {
        if (fits(cx, cy, p.sw, p.sh)) {
          put(p, cx, cy);
          return true;
        }
      }
    }
    return false;
  };

  // 起點：最左一欄
  const start = pickTemplate(rng, 'start', T.theme);
  if (!start || !placeIn(start, [0])) return null;
  // 必備模板：從最遠的一欄往回找
  const far = [...Array(cw).keys()].reverse().filter((x) => x > 0);
  for (const tag of layout.required) {
    const p = pickTemplate(rng, tag, T.theme);
    if (!p || !placeIn(p, far)) return null;
  }
  // 大型景點（一般關卡有機率）
  if ((tier === 'battle' || tier === 'event') && rng.chance(T.featureChance)) {
    const p = pickTemplate(rng, 'feature', T.theme);
    if (p) placeIn(p, far.slice().reverse());
  }
  // 其餘填滿
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      if (used[cy * cw + cx] >= 0) continue;
      const p = pickTemplate(rng, 'filler', T.theme);
      if (!p) return null;
      // 填充模板一律 1 × 1
      if (p.sw !== 1 || p.sh !== 1) return null;
      put(p, cx, cy);
    }
  }

  const W = cw * C;
  const H = ch * C;
  const grid: string[][] = Array.from({ length: H }, () => new Array<string>(W).fill('.'));
  for (const p of placements) {
    for (let y = 0; y < p.rows.length; y++) for (let x = 0; x < p.rows[y].length; x++) grid[p.cy * C + y][p.cx * C + x] = p.rows[y][x];
  }
  carveConnections(grid, cw, ch, C);
  return { cw, ch, placements, grid };
}

/** 區塊之間不通：從起點能到的區塊往旁邊還到不了的區塊，在交界打開通道（反覆直到全部相連） */
function carveConnections(grid: string[][], cw: number, ch: number, C: number): void {
  const H = grid.length;
  const W = grid[0].length;
  const startCell = (() => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === 'S') return { x, y };
    return { x: 1, y: 1 };
  })();
  const half = TEMPLATE_LEVELS.carveWidth / 2;
  for (let iter = 0; iter < cw * ch * 2; iter++) {
    const seen = new Uint8Array(W * H);
    const stack = [startCell.y * W + startCell.x];
    seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || BLOCKING.has(grid[ny][nx])) continue;
        const j = ny * W + nx;
        if (seen[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    const reached = (cx: number, cy: number) => {
      for (let y = cy * C; y < (cy + 1) * C; y++) for (let x = cx * C; x < (cx + 1) * C; x++) if (seen[y * W + x]) return true;
      return false;
    };
    let carved = false;
    outer: for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        if (reached(cx, cy)) continue;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const ax = cx + dx;
          const ay = cy + dy;
          if (ax < 0 || ay < 0 || ax >= cw || ay >= ch || !reached(ax, ay)) continue;
          // 交界的中央打開 carveWidth 寬、兩側各 3 格深的通道
          if (dx !== 0) {
            const bx = Math.max(cx, ax) * C;
            const my = cy * C + C / 2;
            for (let y = my - half; y < my + half; y++) for (let x = bx - 3; x < bx + 3; x++) if (BLOCKING.has(grid[y][x])) grid[y][x] = '.';
          } else {
            const by = Math.max(cy, ay) * C;
            const mx = cx * C + C / 2;
            for (let x = mx - half; x < mx + half; x++) for (let y = by - 3; y < by + 3; y++) if (BLOCKING.has(grid[y][x])) grid[y][x] = '.';
          }
          carved = true;
          break outer;
        }
      }
    }
    if (!carved) return;
  }
}

/** 字元地圖上的洪水填充（擋路的字元不能走） */
function floodChars(grid: string[][], start: Vec): Uint8Array {
  const H = grid.length;
  const W = grid[0].length;
  const seen = new Uint8Array(W * H);
  const stack = [start.y * W + start.x];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || BLOCKING.has(grid[ny][nx])) continue;
      const j = ny * W + nx;
      if (seen[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/**
 * 出口：沿地圖遠端（x 最大的一邊）平均分配，每個出口 EXIT_SIZE 見方；出口範圍清成地板，
 * 走不到就往地圖內側一路打通，直到和出生點相連。回傳 null＝打不通。
 */
function carveExits(grid: string[][], list: ExitRequest[]): ExitDef[] | null {
  if (list.length === 0) return [];
  const H = grid.length;
  const W = grid[0].length;
  const S = EXIT_SIZE;
  let start: Vec | null = null;
  for (let y = 0; y < H && !start; y++) for (let x = 0; x < W; x++) if (grid[y][x] === 'S') start = { x, y };
  if (!start) return null;
  const out: ExitDef[] = [];
  const edges: Edge[] = ['top', 'bottom', 'left', 'right'];
  for (const edge of edges) {
    const mine = list.filter((e) => (e.edge ?? 'top') === edge);
    mine.forEach((e, k) => {
      // 沿著這條邊平均分配；top／bottom 沿 y、left／right 沿 x
      const along = edge === 'top' || edge === 'bottom' ? H : W;
      const c = Math.round(((k + 0.5) / mine.length) * along);
      const a0 = Math.max(0, Math.min(along - S, c - S / 2));
      const r = edge === 'top' ? { x: W - S, y: a0 } : edge === 'bottom' ? { x: 0, y: a0 } : edge === 'left' ? { x: a0, y: 0 } : { x: a0, y: H - S };
      for (let y = r.y; y < r.y + S; y++) for (let x = r.x; x < r.x + S; x++) if (grid[y][x] !== 'S') grid[y][x] = 'E';
      // 往內側打通（寬度和出口一樣），直到和出生點相連
      const probe = { x: r.x + 1, y: r.y + 1 };
      for (let d = 1; d < Math.max(W, H); d++) {
        if (floodChars(grid, start!)[probe.y * W + probe.x]) break;
        for (let t = 0; t < S; t++) {
          const p = edge === 'top' ? { x: r.x - d, y: r.y + t } : edge === 'bottom' ? { x: r.x + S - 1 + d, y: r.y + t } : edge === 'left' ? { x: r.x + t, y: r.y + S - 1 + d } : { x: r.x + t, y: r.y - d };
          if (p.x >= 0 && p.y >= 0 && p.x < W && p.y < H && BLOCKING.has(grid[p.y][p.x])) grid[p.y][p.x] = '.';
        }
      }
      out.push({ id: e.id, x: r.x, y: r.y, w: S, h: S, label: e.label, edge });
    });
  }
  const seen = floodChars(grid, start);
  const order = new Map(list.map((e, i) => [e.id, i]));
  out.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return out.every((e) => seen[(e.y + 1) * W + e.x + 1]) ? out : null;
}

/**
 * 把拼好的地圖轉向，讓起點（原本在 bottom）落在 entry 那一側；owner 是同樣大小的「這格屬於哪個生怪小隊」，一起轉。
 * left／right 會交換寬高（轉置），等於鏡像＋旋轉，模板本來就允許鏡像。
 */
function orient<T>(grid: T[][], entry: Edge): T[][] {
  const H = grid.length;
  const W = grid[0].length;
  if (entry === 'bottom') return grid;
  if (entry === 'top') return grid.map((_, y) => grid[H - 1 - y].slice().reverse());
  // left：新的 (x', y') = (y, x)；right：新的 (x', y') = (y, W − 1 − x)
  const out: T[][] = Array.from({ length: W }, () => new Array<T>(H));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[entry === 'left' ? x : W - 1 - x][y] = grid[y][x];
  return out;
}

/** 從池子抽一名敵人（只抽已解鎖的層數） */
function rollFromPool(rng: Rng, pool: string, layer: number): { enemy: string; cost: number } | undefined {
  const list = (LEVEL_POOLS[pool] ?? []).filter((e) => e.minLayer <= layer);
  const e = weightedPick(rng, list);
  return e ? { enemy: e.enemy, cost: e.cost } : undefined;
}

function tryGenerate(rng: Rng, seed: number, opts: TemplateLevelOptions): { level: GeneratedLevel; assembly: Assembly } | null {
  const { tier, layer } = opts;
  const L = DELIBERATE_LEVELS;
  const T = TEMPLATE_LEVELS;
  const a = assemble(rng, tier);
  if (!a) return null;
  const { placements } = a;
  const C = T.chunk;
  // 生怪磚屬於哪個小隊（轉向前先標好，跟著地圖一起轉）
  const specs = new Map<string, SpawnTile>();
  const owner0: (string | null)[][] = a.grid.map((row) => row.map(() => null));
  placements.forEach((p, pi) => {
    for (const [digit, spec] of Object.entries(p.tpl.spawns)) {
      const key = `p${pi}_${digit}`;
      specs.set(key, spec);
      for (let y = 0; y < p.rows.length; y++) for (let x = 0; x < p.rows[y].length; x++) if (p.rows[y][x] === digit) owner0[p.cy * C + y][p.cx * C + x] = key;
    }
  });
  const entry = opts.entry ?? 'bottom';
  const grid = orient(a.grid, entry);
  const owner = orient(owner0, entry);
  a.grid = grid;
  const H = grid.length;
  const W = grid[0].length;
  const exits = carveExits(grid, opts.exits ?? []);
  if (!exits) return null;
  const cellsOf = (ch: string) => {
    const out: Vec[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === ch) out.push({ x, y });
    return out;
  };
  const center = (p: Vec) => ({ x: p.x + 0.5, y: p.y + 0.5 });

  // ── 地圖 ──
  const obstacles: Rect[] = [...mergeCells(grid, (c) => c === '#' || c === 'o'), ...mergeCells(grid, (c) => c === 'W').map((r) => ({ ...r, blocksSight: false }))];
  const terrain: TerrainRect[] = [
    ...mergeCells(grid, (c) => c === '"').map((r) => ({ kind: 'brush' as const, ...r })),
    ...mergeCells(grid, (c) => c === '~').map((r) => ({ kind: 'shallow' as const, ...r })),
    ...mergeCells(grid, (c) => c === '=').map((r) => ({ kind: 'hedge' as const, ...r })),
  ];
  const interactables: InteractableDef[] = components(cellsOf('D')).map((comp, i) => {
    const xs = comp.map((p) => p.x);
    const ys = comp.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { id: `door${i}`, kind: 'door', name: '木門', x, y, w: Math.max(...xs) + 1 - x, h: Math.max(...ys) + 1 - y };
  });

  // ── 出生點 ──
  const starts = cellsOf('S').map(center);
  if (starts.length === 0) return null;
  const heroSpawns = starts.slice(0, 4);
  while (heroSpawns.length < 4) heroSpawns.push({ x: heroSpawns[0].x + heroSpawns.length, y: heroSpawns[0].y });
  const camera = { x: heroSpawns.reduce((s, p) => s + p.x, 0) / heroSpawns.length, y: heroSpawns.reduce((s, p) => s + p.y, 0) / heroSpawns.length };

  // ── 可達性（門全開） ──
  const nav = new NavGrid(W, H, 0.5, 0.55, obstacles);
  if (!heroSpawns.every((p) => nav.isWalkable(p))) return null;
  const reach = floodFrom(nav, heroSpawns[0]);
  const reachable = (p: Vec) => {
    const c = nav.cellOf(p);
    return nav.inBounds(c.cx, c.cy) && reach[c.cy * nav.cols + c.cx] === 1;
  };

  // ── 生怪磚 → 小隊 ──
  interface Group {
    squad: string;
    spec: SpawnTile;
    cells: Vec[];
  }
  const cellsBy = new Map<string, Vec[]>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = owner[y][x];
      // 出口打通時被清掉的生怪磚不算
      if (k && /[1-9]/.test(grid[y][x])) (cellsBy.get(k) ?? cellsBy.set(k, []).get(k)!).push(center({ x, y }));
    }
  const groups: Group[] = [];
  for (const [key, spec] of specs) {
    const ok = (cellsBy.get(key) ?? []).filter(reachable);
    if (ok.length) groups.push({ squad: key, spec, cells: ok });
  }
  for (let i = groups.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  const B = L.budget[tier];
  const mult = opts.budgetMult ?? 1;
  const budget = Math.round((B.base + B.perLayer * (layer - 1)) * mult);
  const maxEnemies = Math.round(L.maxEnemies * mult);
  let spent = 0;
  const enemies: EncounterEnemy[] = [];
  const takeCell = (g: Group): Vec | undefined => g.cells.splice(rng.int(0, g.cells.length - 1), 1)[0];
  let captainPlaced = false;
  for (const g of groups) {
    if (g.spec.pool === 'escort') continue;
    const n = rng.int(g.spec.count[0], g.spec.count[1]);
    const members: string[] = [];
    for (let i = 0; i < n && enemies.length + members.length < maxEnemies; i++) {
      const e = rollFromPool(rng, g.spec.pool, layer);
      if (!e || spent + e.cost > budget) break;
      spent += e.cost;
      members.push(e.enemy);
    }
    if (members.length === 0) continue;
    const captain = tier === 'elite' && !!g.spec.captain && !captainPlaced;
    if (captain) {
      members[0] = opts.captainEnemy ?? L.captainPool[rng.int(0, L.captainPool.length - 1)];
      captainPlaced = true;
    }
    members.forEach((enemy, i) => {
      const p = takeCell(g);
      if (p) enemies.push({ enemy, x: p.x, y: p.y, squad: g.squad, captain: (captain && i === 0) || undefined });
    });
  }
  if (tier === 'elite' && !captainPlaced) return null;

  // ── 頭目 ──
  let summonPoints: Vec[] | undefined;
  if (tier === 'boss') {
    const bp = cellsOf('B').map(center)[0];
    if (!bp || !reachable(bp)) return null;
    enemies.push({ enemy: L.boss.enemy, x: bp.x, y: bp.y, squad: 'boss' });
    for (const g of groups.filter((x) => x.spec.pool === 'escort')) {
      const n = rng.int(g.spec.count[0], g.spec.count[1]);
      for (let i = 0; i < n; i++) {
        const e = rollFromPool(rng, 'escort', layer);
        const p = takeCell(g);
        if (e && p) enemies.push({ enemy: e.enemy, x: p.x, y: p.y, squad: 'boss' });
      }
    }
    summonPoints = cellsOf('R').map(center).filter(reachable);
    if (summonPoints.length === 0) return null;
  }
  if (enemies.length < L.minEnemies) return null;
  if (!enemies.every((e) => reachable(e))) return null;

  const place = T.placeNames[rng.int(0, T.placeNames.length - 1)];
  const id = `tlevel_${seed >>> 0}`;
  const mapDef: MapDef = {
    id,
    name: place,
    theme: T.theme,
    width: W,
    height: H,
    obstacles,
    heroSpawns,
    enemySpawns: [],
    landmarks: { cameraStart: camera },
    terrain,
    interactables,
    summonPoints,
    exits: exits.length ? exits : undefined,
    exitLock: tier === 'elite' ? 'captain' : tier === 'boss' ? 'boss' : undefined,
  };
  const label = tier === 'boss' ? '最終決戰' : tier === 'elite' ? '精英' : tier === 'event' ? '突發' : '遭遇';
  const level: GeneratedLevel = {
    id,
    name: `${place}（${label}）`,
    map: id,
    mapDef,
    tier,
    minLayer: layer,
    maxLayer: layer,
    difficulty: levelDifficulty(tier, layer),
    enemies,
    fog: true,
  };
  return { level, assembly: a };
}

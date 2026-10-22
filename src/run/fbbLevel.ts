/**
 * finalbossblues 地形的程序生成地圖（野外 fieldGen、城內 townGen）→ 戰鬥用的遭遇與地圖（MapDef）。
 *
 * 座標：生成器用畫面方向的格子（gx 往右、gy 往下，W × H）；戰鬥世界是 +x 朝畫面上方、+y 朝畫面右方
 * （projection.ts 的 ortho rotation 90），所以格子 (gx, gy) ＝ 世界格 (H − 1 − gy, gx)，地圖寬（x 方向）＝ H、高（y 方向）＝ W。
 * 邊的名稱兩邊一致：格子的上緣（gy＝0）＝世界 x 最大＝top。
 *
 * 擋路：牆、石柱、房子（擋視線）；樹幹、石頭、倒木、營火、木箱、路燈、水井（只擋路）；密林依 FIELD.forest.blocksSight。
 * 生成結果原封不動放在 mapDef.art，畫面層照它拼圖塊。
 */
import { tr } from '../i18n/lang';
import type { MapDef, Rect } from '../sim/data/types';
import type { Vec } from '../sim/math';
import type { DeliberateTier } from './data/deliberateLevels';
import { DELIBERATE_LEVELS } from './data/deliberateLevels';
import type { EncounterEnemy } from './data/encounters';
import { FIELD, PREFABS } from './data/prefabs';
import type { MapEdge } from './edgeLayout';
import type { Facing, FieldLevel } from './fieldGen';
import { generateField } from './fieldGen';
import { generateBossArena } from './bossArena';
import type { GeneratedLevel } from './levelGen';
import { floodFrom, levelDifficulty } from './levelGen';
import { NavGrid } from '../sim/nav/grid';
import { deriveSeed } from './seed';
import { mergeCells } from './templateLevelGen';
import type { FactionDef } from './data/factions';
import { FACTIONS } from './data/factions';
import type { TilePrefab } from './tilePrefab';
import type { TownLevel } from './townGen';
import { generateTown } from './townGen';
import type { IndoorLevel, IndoorTheme } from './indoorGen';
import { generateIndoor } from './indoorGen';
import { placeTreasure } from './treasure';
import type { InteractableDef, TerrainRect } from '../sim/data/types';

export type FbbLook = 'summer' | 'fallDusk' | 'winterOvercast' | 'townNight';

export type FbbArt =
  | { kind: 'fbbField'; look: FbbLook; level: FieldLevel }
  | { kind: 'fbbTown'; look: FbbLook; level: TownLevel }
  /** 室內（第 3～5 章）：look 只是型別一致用，調色依 level.theme */
  | { kind: 'fbbIndoor'; look: FbbLook; level: IndoorLevel };

export interface FbbLevelOptions {
  tier: DeliberateTier;
  layer: number;
  exits: { id: string; label?: string; edge?: MapEdge }[];
  entry?: MapEdge;
  /** 被主力佔領的節點：升級點數倍率 */
  budgetMult?: number;
  /** 冠軍戰：精英隊長換成這個敵人 */
  captainEnemy?: string;
  look?: FbbLook;
  /** 敵方陣營（SPEC_CAMPAIGN；省略＝帝國叛軍） */
  faction?: FactionDef;
}

/** 生成格子 → 世界格（左下角）；中心再加 0.5 */
export function gridToWorld(gx: number, gy: number, H: number): Vec {
  return { x: H - 1 - gy, y: gx };
}

/** 面向（畫面方向）→ 世界角度：上＝+x、右＝+y */
export function facingAngle(f: Facing): number {
  return f === 'up' ? 0 : f === 'down' ? Math.PI : f === 'right' ? Math.PI / 2 : -Math.PI / 2;
}

/** 擋路格 → 世界的障礙物長方形（'#' 擋視線、'o' 只擋路） */
function obstaclesFrom(cells: Map<string, '#' | 'o'>, W: number, H: number): Rect[] {
  // 世界格陣列：grid[wy][wx]，wx 0..H−1、wy 0..W−1
  const grid: string[][] = Array.from({ length: W }, () => new Array<string>(H).fill('.'));
  for (const [k, c] of cells) {
    const [gx, gy] = k.split(',').map(Number);
    const w = gridToWorld(gx, gy, H);
    grid[w.y][w.x] = c;
  }
  return [...mergeCells(grid, (c) => c === '#'), ...mergeCells(grid, (c) => c === 'o').map((r) => ({ ...r, blocksSight: false }))];
}

function exitDefs(list: { id: string; label?: string; edge: MapEdge; x: number; y: number; w: number; h: number }[], H: number) {
  return list.map((e) => ({ id: e.id, label: e.label, edge: e.edge, x: H - (e.y + e.h), y: e.x, w: e.h, h: e.w }));
}

function enemiesFrom(list: { enemy: string; x: number; y: number; squad: string; facing: Facing; captain?: boolean }[], H: number): EncounterEnemy[] {
  return list.map((e) => {
    const w = gridToWorld(e.x, e.y, H);
    return { enemy: e.enemy, x: w.x + 0.5, y: w.y + 0.5, squad: e.squad, captain: e.captain, facing: facingAngle(e.facing) };
  });
}

function wrap(seed: number, kind: 'field' | 'town' | 'indoor', opts: FbbLevelOptions, W: number, H: number, mapDef: Omit<MapDef, 'id' | 'name' | 'width' | 'height' | 'enemySpawns'>, enemies: EncounterEnemy[], place: string): GeneratedLevel {
  const id = `${kind}_${seed >>> 0}`;
  const tier = opts.tier;
  const label = tier === 'boss' ? tr("最終決戰") : tier === 'elite' ? tr("精英") : tier === 'event' ? tr("突發") : tr("遭遇");
  return {
    id,
    name: tr("{0}（{1}）", { 0: place, 1: label }),
    map: id,
    mapDef: { id, name: place, width: H, height: W, enemySpawns: [], exitLock: tier === 'elite' || opts.captainEnemy ? 'captain' : undefined, ...mapDef },
    tier,
    minLayer: opts.layer,
    maxLayer: opts.layer,
    difficulty: levelDifficulty(tier, opts.layer),
    enemies,
    fog: true,
  };
}

const edgeOf = (e: { edge?: MapEdge }): MapEdge => e.edge ?? 'top';

/**
 * 用戰鬥的導航格（和角色一樣的半徑）確認：出生點走得到每個出口與每名敵人。
 * 生成器的檢查是「格子相連」，但角色直徑約 1 m，1 格寬的縫走不過去，所以這裡再驗一次。
 */
export function navOk(level: GeneratedLevel): boolean {
  const m = level.mapDef;
  const nav = new NavGrid(m.width, m.height, 0.5, 0.55, m.obstacles);
  // 貼著牆的格（離牆不到角色半徑）導航格算不可走，但單位出生時會被推到旁邊可走的地方：一律取最近的可走格
  const cellNear = (p: { x: number; y: number }) => {
    const c = nav.cellOf(p);
    if (!nav.inBounds(c.cx, c.cy)) return null;
    return nav.isBlockedCell(c.cx, c.cy) ? nav.nearestWalkableCell(c.cx, c.cy, 2) : c;
  };
  const start = cellNear(m.heroSpawns[0]);
  if (!start) return false;
  const reach = floodFrom(nav, nav.cellCenter(start.cx, start.cy));
  const ok = (p: { x: number; y: number }) => {
    const c = cellNear(p);
    return !!c && reach[c.cy * nav.cols + c.cx] === 1;
  };
  if (!(m.heroSpawns.every(ok) && (m.exits ?? []).every((e) => ok({ x: e.x + e.w / 2, y: e.y + e.h / 2 })) && level.enemies.every(ok))) return false;
  // 城內：每一格角色站得住的街都要走得到（不能有被箱子、路障堵死的死角）
  // 室內：每一格角色站得住的地面都要走得到（Alan 2026-10-22：房間不能被擺設堵死）
  const art = m.art as FbbArt | undefined;
  if (art?.kind === 'fbbIndoor') {
    const L = art.level;
    for (let gy = 0; gy < L.h; gy++)
      for (let gx = 0; gx < L.w; gx++) {
        if (L.grid[gy][gx] === '#') continue;
        const w = gridToWorld(gx, gy, L.h);
        const p = { x: w.x + 0.5, y: w.y + 0.5 };
        if (nav.isWalkable(p) && !ok(p)) return false;
      }
  }
  if (art?.kind === 'fbbTown') {
    const L = art.level;
    for (let gy = 0; gy < L.h; gy++)
      for (let gx = 0; gx < L.w; gx++) {
        if (L.ground[gy][gx] !== 's') continue;
        const w = gridToWorld(gx, gy, L.h);
        const p = { x: w.x + 0.5, y: w.y + 0.5 };
        if (nav.isWalkable(p) && !ok(p)) return false;
      }
  }
  return true;
}

/** 生成到導航檢查通過為止（換子種子重來） */
function withNavCheck(seed: number, make: (s: number) => GeneratedLevel): GeneratedLevel {
  let last: GeneratedLevel | null = null;
  for (let k = 0; k < 12; k++) {
    last = make(k === 0 ? seed : deriveSeed(seed, 'nav', k));
    if (navOk(last)) return last;
  }
  return last!;
}

/** 野外戰鬥地圖 */
export function fieldEncounter(seed: number, opts: FbbLevelOptions): GeneratedLevel {
  return withNavCheck(seed, (s) => fieldOnce(s, opts));
}

function fieldOnce(seed: number, opts: FbbLevelOptions): GeneratedLevel {
  const lv = generateField(seed, {
    tier: opts.tier,
    layer: opts.layer,
    exits: opts.exits.map((e) => ({ ...e, edge: edgeOf(e) })),
    entry: opts.entry,
    upgradeMult: opts.budgetMult,
    captainEnemy: opts.captainEnemy,
    captainPool: opts.faction?.captainPool ?? DELIBERATE_LEVELS.captainPool,
    faction: opts.faction,
  });
  return fieldLevelToEncounter(seed, opts, lv, tr("荒野"));
}

/**
 * 頭目房（Alan 2026-10-21：專屬房間，往前走一點就是頭目）。最後的頭目戰沒有出口，打倒頭目就勝利。
 */
export function bossEncounter(seed: number, opts: FbbLevelOptions): GeneratedLevel {
  const boss = (opts.faction ?? FACTIONS.empire).boss;
  const { level, summons } = generateBossArena(seed, boss);
  const enc = fieldLevelToEncounter(seed, { ...opts, tier: 'boss' }, level, boss.place);
  const H = level.h;
  enc.mapDef.summonPoints = summons.map(([x, y]) => {
    const w = gridToWorld(x, y, H);
    return { x: w.x + 0.5, y: w.y + 0.5 };
  });
  enc.mapDef.exitLock = 'boss';
  return enc;
}

/** 野外格式的地圖（野外、頭目房）→ 遭遇 */
function fieldLevelToEncounter(seed: number, opts: FbbLevelOptions, lv: FieldLevel, place: string): GeneratedLevel {
  const { w: W, h: H } = lv;
  const cells = new Map<string, '#' | 'o'>();
  for (const [x, y] of lv.walls) cells.set(`${x},${y}`, '#');
  for (const [x, y] of lv.forest) cells.set(`${x},${y}`, FIELD.forest.blocksSight ? '#' : 'o');
  for (const p of lv.props) {
    const def = PREFABS[p.prefab];
    for (const [dx, dy] of def.blocks) {
      const k = `${p.x + dx},${p.y + dy}`;
      if (cells.get(k) !== '#') cells.set(k, def.blocksSight ? '#' : 'o');
    }
  }
  const heroSpawns = lv.heroSpawns.map((p) => {
    const w = gridToWorld(p.x, p.y, H);
    return { x: w.x + 0.5, y: w.y + 0.5 };
  });
  const art: FbbArt = { kind: 'fbbField', look: opts.look ?? 'summer', level: lv };
  return wrap(
    seed,
    'field',
    opts,
    W,
    H,
    { obstacles: obstaclesFrom(cells, W, H), heroSpawns, exits: lv.exits.length ? exitDefs(lv.exits, H) : undefined, landmarks: { cameraStart: heroSpawns[0] }, art },
    enemiesFrom(lv.enemies, H),
    place,
  );
}

/** 城內戰鬥地圖（首都突圍） */
export function townEncounter(seed: number, opts: FbbLevelOptions & { prefabs?: TilePrefab[] }): GeneratedLevel {
  return withNavCheck(seed, (s) => townOnce(s, opts));
}

function townOnce(seed: number, opts: FbbLevelOptions & { prefabs?: TilePrefab[] }): GeneratedLevel {
  const lv = generateTown(seed, {
    tier: opts.tier,
    layer: opts.layer,
    exits: opts.exits.map((e) => ({ ...e, edge: edgeOf(e) })),
    entry: opts.entry,
    upgradeMult: opts.budgetMult,
    captainEnemy: opts.captainEnemy,
    captainPool: DELIBERATE_LEVELS.captainPool,
    prefabs: opts.prefabs,
  });
  const { w: W, h: H } = lv;
  const cells = new Map<string, '#' | 'o'>();
  for (const [x, y] of lv.blocked) cells.set(`${x},${y}`, 'o');
  for (const [x, y] of lv.sightBlocked) cells.set(`${x},${y}`, '#');
  const heroSpawns = lv.heroSpawns.map((p) => {
    const w = gridToWorld(p.x, p.y, H);
    return { x: w.x + 0.5, y: w.y + 0.5 };
  });
  const art: FbbArt = { kind: 'fbbTown', look: opts.look ?? 'townNight', level: lv };
  return wrap(
    seed,
    'town',
    opts,
    W,
    H,
    { obstacles: obstaclesFrom(cells, W, H), heroSpawns, exits: lv.exits.length ? exitDefs(lv.exits, H) : undefined, landmarks: { cameraStart: heroSpawns[0] }, art },
    enemiesFrom(lv.enemies, H),
    tr("燃燒的王都"),
  );
}

// ───────────── 室內（第 3～5 章：試煉地城、密道、魔王城） ─────────────

/** 擋路的室內物件：會擋視線的、只擋路的（其他像燭台、瓦礫、光柱只是裝飾） */
const INDOOR_BLOCK: Record<string, '#' | 'o'> = { statue: '#', bookshelf: '#', throne: 'o', armorStand: 'o', brazier: 'o' };

const EDGE_FACING: Record<MapEdge, Facing> = { top: 'up', bottom: 'down', left: 'left', right: 'right' };

/** 格子的長方形 → 世界的長方形 */
function rectToWorld(r: { x: number; y: number; w: number; h: number }, H: number): Rect {
  return { x: H - (r.y + r.h), y: r.x, w: r.h, h: r.w };
}

/** 室內戰鬥地圖；treasure：放寶箱、道具、祭壇（第一次造訪才有，不能重複刷） */
export function indoorEncounter(seed: number, opts: FbbLevelOptions & { theme: IndoorTheme; treasure?: boolean }): GeneratedLevel {
  return withNavCheck(seed, (s) => indoorOnce(s, opts));
}

function indoorOnce(seed: number, opts: FbbLevelOptions & { theme: IndoorTheme; treasure?: boolean }): GeneratedLevel {
  const lv = generateIndoor(opts.theme, seed, { layer: opts.layer, exits: opts.exits.map((e) => ({ ...e, edge: edgeOf(e) })), entry: opts.entry });
  const { w: W, h: H } = lv;
  const cells = new Map<string, '#' | 'o'>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lv.grid[y][x] === '#') cells.set(`${x},${y}`, '#');
  for (const p of lv.props) {
    const b = INDOOR_BLOCK[p.kind];
    if (!b) continue;
    for (let dy = 0; dy < (p.h ?? 1); dy++) for (let dx = 0; dx < (p.w ?? 1); dx++) if (cells.get(`${p.x + dx},${p.y + dy}`) !== '#') cells.set(`${p.x + dx},${p.y + dy}`, b);
  }
  // 精英關卡：離出生點最遠的敵人當隊長（巢穴、小蟲不行）
  const enemies = lv.enemies.map((e) => ({ ...e }));
  const spawn = lv.heroSpawns[0];
  if (opts.tier === 'elite' || opts.captainEnemy) {
    const pool = enemies.filter((e) => e.enemy !== 'bugNest' && e.enemy !== 'swarmling');
    const far = [...pool].sort((a, b) => Math.abs(b.x - spawn.x) + Math.abs(b.y - spawn.y) - (Math.abs(a.x - spawn.x) + Math.abs(a.y - spawn.y)))[0];
    if (far) {
      far.captain = true;
      if (opts.captainEnemy) far.enemy = opts.captainEnemy;
    }
  }
  // 門：相連的 'D' 格一組一道門（開著，可以關）
  const interactables: InteractableDef[] = [];
  const seen = new Set<string>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (lv.grid[y][x] !== 'D' || seen.has(`${x},${y}`)) continue;
      const comp: [number, number][] = [];
      const st: [number, number][] = [[x, y]];
      seen.add(`${x},${y}`);
      while (st.length) {
        const [cx, cy] = st.pop()!;
        comp.push([cx, cy]);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const k = `${cx + dx},${cy + dy}`;
          if (lv.grid[cy + dy]?.[cx + dx] === 'D' && !seen.has(k)) {
            seen.add(k);
            st.push([cx + dx, cy + dy]);
          }
        }
      }
      const xs = comp.map((c) => c[0]);
      const ys = comp.map((c) => c[1]);
      const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
      interactables.push({ id: `door${interactables.length}`, kind: 'door', open: true, ...rectToWorld(r, H) });
    }
  // 探索獎勵：寶箱、地上的道具、祭壇（Alan 2026-10-22）
  if (opts.treasure) {
    const taken = new Set<string>([...cells.keys(), ...enemies.map((e) => `${e.x},${e.y}`)]);
    const spots = placeTreasure(deriveSeed(seed, 'treasure'), { grid: lv.grid, spawn, exits: lv.exits, taken, layer: opts.layer });
    spots.forEach((s, i) => {
      const c = gridToWorld(s.x, s.y, H);
      const size = s.kind === 'pickup' ? 0.5 : s.kind === 'chest' ? 0.8 : 0.9;
      const off = (1 - size) / 2;
      interactables.push({ id: `${s.kind}${i}`, kind: s.kind, x: c.x + off, y: c.y + off, w: size, h: size, loot: s.loot, shrine: s.shrine });
    });
  }
  // 高台
  const hgrid: string[][] = Array.from({ length: W }, () => new Array<string>(H).fill('.'));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (lv.grid[y][x] === '^') {
        const c = gridToWorld(x, y, H);
        hgrid[c.y][c.x] = '^';
      }
  const terrain: TerrainRect[] = mergeCells(hgrid, (c) => c === '^').map((r) => ({ kind: 'high', ...r }));
  const heroSpawns = lv.heroSpawns.map((p) => {
    const c = gridToWorld(p.x, p.y, H);
    return { x: c.x + 0.5, y: c.y + 0.5 };
  });
  const art: FbbArt = { kind: 'fbbIndoor', look: 'winterOvercast', level: lv };
  const place = opts.theme === 'temple' ? tr("試煉地城") : opts.theme === 'cave' ? tr("密道") : tr("魔王城");
  return wrap(
    seed,
    'indoor',
    opts,
    W,
    H,
    { obstacles: obstaclesFrom(cells, W, H), heroSpawns, exits: lv.exits.length ? exitDefs(lv.exits, H) : undefined, landmarks: { cameraStart: heroSpawns[0] }, interactables, terrain, art },
    enemiesFrom(
      enemies.map((e) => ({ ...e, facing: e.facing ? EDGE_FACING[e.facing] : 'down' })),
      H,
    ),
    place,
  );
}

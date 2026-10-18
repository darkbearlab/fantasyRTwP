/**
 * 遠征的大型關卡生成（Alan：主要遠征改成深淵礦坑那種大型關卡）。
 * 依種子產生：之字形的區域（牆＋缺口，部分缺口有門）、區域內的半牆、石頭、地形、生成點與巢穴、
 * 進入區域時的波次、自動出怪的階段、出口（或頭目）。純函式、只用種子亂數，同樣的輸入一定得到同樣的關卡。
 * 生成後用尋路檢查「出生點走得到出口（門全開）」與「生成點都可走」，不通過就換子種子重試。
 */
import type { DirectorDef, HordeSetup, InteractableDef, MapDef, Rect, SpawnerDef, TerrainRect, WaveDef } from '../sim/data/types';
import type { Vec } from '../sim/math';
import { findPath } from '../sim/nav/astar';
import { NavGrid } from '../sim/nav/grid';
import { Rng } from '../sim/rng';
import type { EncounterDef, EncounterTier } from './data/encounters';
import type { LevelTheme } from './data/levels';
import { LEVELS } from './data/levels';
import { deriveSeed } from './seed';

export type LevelTier = Exclude<EncounterTier, 'horde'>;

export interface LevelOptions {
  tier: LevelTier;
  layer: number;
}

/** 生成的關卡＝一個帶自己地圖的遭遇 */
export interface GeneratedLevel extends EncounterDef {
  mapDef: MapDef;
}

interface Zone {
  index: number;
  x0: number;
  x1: number;
  /** 區域入口（上一道牆的缺口中心；第一區為出生點） */
  entry: Vec;
}

const lerpInt = (rng: Rng, [a, b]: [number, number]) => rng.int(a, b);

function inRect(p: Vec, r: Rect, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

export function generateLevel(seed: number, opts: LevelOptions): GeneratedLevel {
  for (let attempt = 0; attempt < LEVELS.maxAttempts; attempt++) {
    const lv = tryGenerate(new Rng(deriveSeed(seed, 'level', attempt)), seed, opts, attempt < LEVELS.maxAttempts - 1);
    if (lv) return lv;
  }
  throw new Error('關卡生成失敗');
}

function tryGenerate(rng: Rng, seed: number, opts: LevelOptions, withRocks: boolean): GeneratedLevel | null {
  const { tier, layer } = opts;
  const size = LEVELS.size[tier];
  const W = size.width;
  const H = size.height;
  const n = size.zones;
  const zw = W / n;
  const theme: LevelTheme = LEVELS.themes[rng.int(0, LEVELS.themes.length - 1)];
  const obstacles: Rect[] = [];
  const interactables: InteractableDef[] = [];
  /** 不能放石頭的範圍（缺口、出生點、出口、半牆開口） */
  const keepOut: Rect[] = [];
  const gap = LEVELS.gapWidth;

  // ── 區域之間的牆與缺口：缺口上下交替，路線呈之字形 ──
  const gaps: { x: number; y: number; top: boolean }[] = [];
  for (let k = 0; k < n - 1; k++) {
    const wx = Math.round((k + 1) * zw);
    const top = k % 2 === 0;
    const m = lerpInt(rng, LEVELS.gapMargin);
    const gy = top ? m : H - m - gap;
    gaps.push({ x: wx, y: gy, top });
    if (gy > 0) obstacles.push({ x: wx, y: 0, w: 1, h: gy });
    if (gy + gap < H) obstacles.push({ x: wx, y: gy + gap, w: 1, h: H - gy - gap });
    keepOut.push({ x: wx - 4, y: gy - 2, w: 9, h: gap + 4 });
  }
  const zones: Zone[] = [];
  const firstTop = gaps.length > 0 ? gaps[0].top : true;
  const spawnPt = { x: 5, y: firstTop ? H - 7 : 7 };
  for (let k = 0; k < n; k++) {
    const x0 = k === 0 ? 0 : Math.round(k * zw) + 1;
    const x1 = k === n - 1 ? W : Math.round((k + 1) * zw);
    const entry = k === 0 ? spawnPt : { x: gaps[k - 1].x + 2.5, y: gaps[k - 1].y + gap / 2 };
    zones.push({ index: k, x0, x1, entry });
  }
  keepOut.push({ x: spawnPt.x - 4, y: spawnPt.y - 4, w: 8, h: 8 });

  // ── 出口（頭目關卡沒有出口，改成擊倒頭目） ──
  const last = zones[n - 1];
  const lastTop = gaps.length > 0 ? gaps[gaps.length - 1].top : !firstTop;
  const E = LEVELS.exitSize;
  const exitRect: Rect = { x: W - E - 1, y: lastTop ? H - E - 1 : 1, w: E, h: E };
  const exitPt = { x: exitRect.x + E / 2, y: exitRect.y + E / 2 };
  keepOut.push({ x: exitRect.x - 2, y: exitRect.y - 2, w: E + 4, h: E + 4 });

  // ── 區域內的橫向半牆：從左或右牆延伸，另一側留開口 ──
  for (const z of zones) {
    if (!rng.chance(LEVELS.innerWallChance)) continue;
    const y = Math.round(H * rng.range(0.4, 0.6));
    const open = LEVELS.innerWallOpening;
    const left = rng.chance(0.5);
    const wx0 = left ? z.x0 : z.x0 + open;
    const wx1 = left ? z.x1 - open : z.x1;
    if (wx1 - wx0 < 6) continue;
    obstacles.push({ x: wx0, y, w: wx1 - wx0, h: 1 });
    keepOut.push({ x: left ? z.x1 - open - 1 : z.x0, y: y - 3, w: open + 1, h: 7 });
  }

  // ── 門：部分缺口裝一般的門；精英與頭目關卡有一道上鎖的門，要拉動前一區的絞盤 ──
  const lockedAt = LEVELS.leverTiers.includes(tier) && gaps.length > 0 ? rng.int(0, gaps.length - 1) : -1;
  gaps.forEach((g, k) => {
    if (k === lockedAt) {
      interactables.push({ id: `gate${k}`, kind: 'door', name: '鐵柵門', x: g.x, y: g.y, w: 1, h: gap, locked: true });
    } else if (rng.chance(LEVELS.doorChance)) {
      interactables.push({ id: `gate${k}`, kind: 'door', name: '木門', x: g.x, y: g.y, w: 1, h: gap });
    }
  });

  // ── 石頭 ──
  if (withRocks) {
    for (const z of zones) {
      const count = Math.round(((z.x1 - z.x0) * H) / LEVELS.rockDensity);
      for (let i = 0; i < count; i++) {
        const s = LEVELS.rockSizes[rng.int(0, LEVELS.rockSizes.length - 1)];
        const r = { x: Math.round(rng.range(z.x0 + 2, z.x1 - 2 - s) * 2) / 2, y: Math.round(rng.range(2, H - 2 - s) * 2) / 2, w: s, h: s };
        if (keepOut.some((k) => overlaps(k, r)) || obstacles.some((o) => overlaps(o, r, 1.2))) continue;
        obstacles.push(r);
      }
    }
  }

  // ── 地形：草叢、淺水、矮籬 ──
  const terrain: TerrainRect[] = [];
  const T = LEVELS.terrain[theme];
  for (const z of zones) {
    const zx = (w: number) => rng.range(z.x0 + 2, Math.max(z.x0 + 2, z.x1 - 2 - w));
    for (let i = lerpInt(rng, T.brush); i > 0; i--) {
      const w = rng.int(4, 7);
      const h = rng.int(3, 6);
      terrain.push({ kind: 'brush', x: zx(w), y: rng.range(2, H - 2 - h), w, h });
    }
    for (let i = lerpInt(rng, T.shallow); i > 0; i--) {
      const w = rng.int(6, 10);
      const h = rng.int(5, 8);
      terrain.push({ kind: 'shallow', x: zx(w), y: rng.range(2, H - 2 - h), w, h });
    }
    for (let i = lerpInt(rng, T.hedge); i > 0; i--) {
      const len = rng.int(4, 8);
      const horiz = rng.chance(0.5);
      const w = horiz ? len : 0.5;
      const h = horiz ? 0.5 : len;
      terrain.push({ kind: 'hedge', x: zx(w), y: rng.range(3, H - 3 - h), w, h });
    }
  }

  // ── 檢查：門全開時出生點走得到出口（或頭目位置）──
  const grid = new NavGrid(W, H, 0.5, 0.5, obstacles);
  const bossPt = { x: (last.x0 + last.x1) / 2, y: H / 2 };
  const goal = tier === 'boss' ? bossPt : exitPt;
  if (!grid.isWalkable(spawnPt) || !grid.isWalkable(goal)) return null;
  if (!findPath(grid, spawnPt, goal)) return null;
  // 從出生點洪水填充一次，之後「走不走得到」只要查表
  const reach = floodFrom(grid, spawnPt);
  const reachable = (p: Vec) => {
    const c = grid.cellOf(p);
    return grid.inBounds(c.cx, c.cy) && reach[c.cy * grid.cols + c.cx] === 1 && !obstacles.some((o) => inRect(p, o, 1));
  };

  // ── 生成點與巢穴 ──
  const spawners: SpawnerDef[] = [];
  const zoneSpawners: string[][] = zones.map(() => []);
  const nests: string[] = [];
  for (const z of zones) {
    for (let i = 0, tries = 0; i < LEVELS.spawnersPerZone && tries < 40; tries++) {
      const p = { x: rng.range(z.x0 + 3, z.x1 - 3), y: rng.range(3, H - 3) };
      if (Math.hypot(p.x - z.entry.x, p.y - z.entry.y) < LEVELS.spawnerMinDistance || !reachable(p)) continue;
      if (inRect(p, exitRect, 2)) continue;
      const id = `z${z.index}s${i}`;
      const nest = z.index >= 1 && i === 0 && rng.chance(LEVELS.nestChance);
      spawners.push({ id, x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2, radius: 2, nest: nest || undefined });
      zoneSpawners[z.index].push(id);
      if (nest) nests.push(id);
      i++;
    }
  }
  if (zoneSpawners.some((s, k) => k > 0 && s.length === 0)) return null;
  // 追兵：最後一區靠入口的位置（從背後追上來）
  const pursuitId = 'pursuit';
  let pursuit: Vec | null = null;
  for (let t = 0; t < 40 && !pursuit; t++) {
    const q = { x: last.entry.x + 3 + rng.range(0, 4), y: last.entry.y + rng.range(-3, 3) };
    if (reachable(q)) pursuit = q;
  }
  if (!pursuit) return null;
  spawners.push({ id: pursuitId, x: Math.round(pursuit.x * 2) / 2, y: Math.round(pursuit.y * 2) / 2, radius: 2 });

  // ── 波次 ──
  const waves: WaveDef[] = [];
  const zoneRect = (z: Zone): Rect => ({ x: z.x0, y: 0, w: z.x1 - z.x0, h: H });
  const fodder = LEVELS.zoneFodder.base + LEVELS.zoneFodder.perLayer * (layer - 1);
  const elites = LEVELS.zoneElites[tier] + Math.floor((layer - 1) / LEVELS.eliteEveryLayers);
  const elitePool = LEVELS.elitePool.filter((e) => layer >= e.minLayer).map((e) => e.enemy);
  for (const z of zones) {
    if (z.index === 0) continue;
    const sp = zoneSpawners[z.index];
    const spawns: WaveDef['spawns'] = [];
    for (let i = 0; i < fodder; i++) spawns.push({ spawner: sp[i % sp.length], enemy: rng.chance(0.7) ? 'thrall' : 'skitter', count: 1 });
    for (let i = 0; i < elites; i++) spawns.push({ spawner: sp[rng.int(0, sp.length - 1)], enemy: elitePool[rng.int(0, elitePool.length - 1)], count: 1 });
    waves.push({ id: `區域${z.index + 1}`, trigger: { type: 'area', rect: zoneRect(z) }, spawns: merge(spawns) });
    const nest = sp.find((id) => nests.includes(id));
    if (nest) {
      const N = LEVELS.nestWave;
      waves.push({ id: `巢穴${z.index + 1}`, trigger: { type: 'area', rect: zoneRect(z) }, repeat: { interval: N.interval, times: N.times }, spawns: [{ spawner: nest, enemy: 'thrall', count: N.count }] });
    }
  }
  // 精英關卡：中間區域的隊長
  if (tier === 'elite') {
    const z = zones[Math.floor(n / 2)];
    const sp = zoneSpawners[z.index];
    const cap = LEVELS.captainPool[rng.int(0, LEVELS.captainPool.length - 1)];
    waves.push({ id: '隊長', trigger: { type: 'area', rect: zoneRect(z) }, spawns: [{ spawner: sp[sp.length - 1], enemy: cap, count: 1, captain: true }, { spawner: sp[sp.length - 1], enemy: elitePool[rng.int(0, elitePool.length - 1)], count: 2 }] });
  }
  // 絞盤：放在上鎖的門之前那一區、離缺口最遠的角落；拉下會引來一波敵人
  if (lockedAt >= 0) {
    const z = zones[lockedAt];
    const g = gaps[lockedAt];
    const p = { x: (z.x0 + z.x1) / 2 + rng.range(-3, 3), y: g.top ? H - 6 : 6 };
    let lever: Vec | null = null;
    for (let t = 0; t < 30 && !lever; t++) {
      const q = { x: p.x + rng.range(-6, 6), y: p.y + rng.range(-3, 3) };
      if (reachable(q)) lever = q;
    }
    if (!lever) return null;
    interactables.push({ id: 'lever', kind: 'lever', name: '絞盤', x: Math.round(lever.x * 2) / 2 - 0.4, y: Math.round(lever.y * 2) / 2 - 0.4, w: 0.8, h: 0.8, actions: [{ type: 'openDoor', door: `gate${lockedAt}` }] });
    const sp = zoneSpawners[lockedAt].length ? zoneSpawners[lockedAt] : zoneSpawners[lockedAt + 1];
    waves.push({ id: '警報', trigger: { type: 'interact', id: 'lever' }, spawns: [{ spawner: sp[0], enemy: 'thrall', count: 4 }, { spawner: sp[sp.length - 1], enemy: 'skitter', count: 3 }] });
  }
  if (tier === 'boss') {
    // 頭目：最後一區中央；進入最後一區時登場
    spawners.push({ id: 'bossDen', x: bossPt.x, y: bossPt.y, radius: 1.5 });
    const B = LEVELS.boss;
    waves.push({ id: 'boss', trigger: { type: 'area', rect: zoneRect(last) }, spawns: [{ spawner: 'bossDen', enemy: B.enemy, count: 1 }] });
    waves.push({ id: '護衛', trigger: { type: 'area', rect: zoneRect(last) }, spawns: B.escorts.map((e) => ({ spawner: 'bossDen', enemy: e.enemy, count: e.count })) });
  } else {
    // 終段追兵：進入最後一區後持續從背後追上來
    const P = LEVELS.pursuit;
    waves.push({ id: '追兵', trigger: { type: 'area', rect: zoneRect(last) }, repeat: { interval: P.interval, times: -1 }, spawns: [{ spawner: pursuitId, enemy: 'thrall', count: P.thrall }, { spawner: pursuitId, enemy: 'skitter', count: P.skitter }] });
  }

  // ── 自動出怪：每個區域一個階段，越深入壓力越高 ──
  const D = LEVELS.director;
  const director: DirectorDef = {
    enemies: D.enemies,
    packSize: D.packSize,
    spawnDistance: D.spawnDistance,
    cooldown: D.cooldown,
    nearbyRadius: D.nearbyRadius,
    maxAlive: D.maxAlive,
    cycle: D.cycle,
    stages: zones.map((z) => ({
      trigger: z.index === 0 ? { type: 'time' as const, t: 3 } : { type: 'area' as const, rect: zoneRect(z) },
      low: Math.round(D.low.base + D.low.perZone * z.index + D.low.perLayer * (layer - 1)),
      high: Math.round(D.high.base + D.high.perZone * z.index + D.high.perLayer * (layer - 1)),
      budget: Math.round(D.budget.base + D.budget.perZone * z.index + D.budget.perLayer * (layer - 1)),
    })),
  };

  const horde: HordeSetup = { fog: true, spawners, waves, director, objective: tier === 'boss' ? { type: 'kill', wave: 'boss' } : { type: 'exit', rect: exitRect } };
  const heroSpawns = [
    { x: spawnPt.x, y: spawnPt.y },
    { x: spawnPt.x + 2, y: spawnPt.y + (firstTop ? 1 : -1) },
    { x: spawnPt.x, y: spawnPt.y + (firstTop ? 2 : -2) },
    { x: spawnPt.x + 2, y: spawnPt.y + (firstTop ? -1 : 1) },
  ];
  const names = LEVELS.themeNames[theme];
  const place = names[rng.int(0, names.length - 1)];
  const id = `level_${seed >>> 0}`;
  const mapDef: MapDef = {
    id,
    name: place,
    theme,
    width: W,
    height: H,
    obstacles,
    heroSpawns,
    enemySpawns: [],
    landmarks: { cameraStart: spawnPt, exit: tier === 'boss' ? bossPt : exitPt },
    terrain,
    interactables,
  };
  const label = tier === 'boss' ? '最終決戰' : tier === 'elite' ? '精英' : tier === 'event' ? '突發' : '探索';
  return {
    id,
    name: `${place}（${label}）`,
    map: id,
    mapDef,
    tier,
    minLayer: layer,
    maxLayer: layer,
    difficulty: levelDifficulty(tier, layer),
    enemies: [],
    horde,
  };
}

/** 從起點出發、4 連通可走到的格子（1 = 可達） */
function floodFrom(grid: NavGrid, start: Vec): Uint8Array {
  const out = new Uint8Array(grid.cols * grid.rows);
  const c = grid.cellOf(start);
  if (grid.isBlockedCell(c.cx, c.cy)) return out;
  const stack = [c.cy * grid.cols + c.cx];
  out[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % grid.cols;
    const y = (i - x) / grid.cols;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (grid.isBlockedCell(nx, ny)) continue;
      const j = ny * grid.cols + nx;
      if (out[j]) continue;
      out[j] = 1;
      stack.push(j);
    }
  }
  return out;
}

/** 顯示用難度 1–5（路線圖預覽不必真的生成關卡） */
export function levelDifficulty(tier: LevelTier, layer: number): number {
  return Math.min(5, 1 + Math.floor(layer / 2) + (tier === 'elite' ? 1 : 0) + (tier === 'boss' ? 2 : 0));
}

/** 合併同一生成點、同一敵人的生成項目 */
function merge(spawns: WaveDef['spawns']): WaveDef['spawns'] {
  const out: WaveDef['spawns'] = [];
  for (const s of spawns) {
    const m = out.find((o) => o.spawner === s.spawner && o.enemy === s.enemy && !!o.captain === !!s.captain);
    if (m) m.count += s.count;
    else out.push({ ...s });
  }
  return out;
}

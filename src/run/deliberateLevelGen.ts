/**
 * 沉穩節奏的遠征關卡生成（SPEC_SLICE5 §15.3，v0.4）：48 × 48、保留迷霧，兩個區域以有缺口的隔牆分開。
 * 少數敵人分成小隊，配置在正面、側翼、草叢埋伏、門後與後方；同小隊一起警覺（src/sim/world.ts）。
 * 純函式、只用種子亂數；生成後用洪水填充檢查「出生點走得到每一名敵人（門全開）」，不通過就換子種子重試。
 */
import { tr } from '../i18n/lang';
import type { InteractableDef, MapDef, Rect, TerrainRect } from '../sim/data/types';
import type { Vec } from '../sim/math';
import { NavGrid } from '../sim/nav/grid';
import { Rng } from '../sim/rng';
import type { DeliberateTier, SquadPlacement } from './data/deliberateLevels';
import { DELIBERATE_LEVELS } from './data/deliberateLevels';
import type { EncounterEnemy } from './data/encounters';
import type { GeneratedLevel } from './levelGen';
import { floodFrom, levelDifficulty } from './levelGen';
import { deriveSeed } from './seed';

export interface DeliberateLevelOptions {
  tier: DeliberateTier;
  layer: number;
}

function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

const round = (v: number) => Math.round(v * 2) / 2;

export function generateDeliberateLevel(seed: number, opts: DeliberateLevelOptions): GeneratedLevel {
  for (let attempt = 0; attempt < DELIBERATE_LEVELS.maxAttempts; attempt++) {
    const lv = tryGenerate(new Rng(deriveSeed(seed, 'dlevel', attempt)), seed, opts);
    if (lv) return lv;
  }
  throw new Error('關卡生成失敗');
}

/** 依點數預算挑敵人（SPEC_SLICE5 §15.2：一場 3～8 名） */
export function rollRoster(rng: Rng, tier: DeliberateTier, layer: number): string[] {
  const L = DELIBERATE_LEVELS;
  const B = L.budget[tier];
  let budget = Math.round(B.base + B.perLayer * (layer - 1));
  const pool = L.pool.filter((e) => layer >= e.minLayer);
  const out: string[] = [];
  while (out.length < L.maxEnemies) {
    const can = pool.filter((e) => e.cost <= budget);
    if (can.length === 0) break;
    const total = can.reduce((s, e) => s + e.weight, 0);
    let r = rng.range(0, total);
    let pick = can[0];
    for (const e of can) {
      r -= e.weight;
      if (r <= 0) {
        pick = e;
        break;
      }
    }
    out.push(pick.enemy);
    budget -= pick.cost;
  }
  // 預算不夠也至少要有 minEnemies 名（補最便宜的）
  const cheapest = [...pool].sort((a, b) => a.cost - b.cost)[0].enemy;
  while (out.length < L.minEnemies) out.push(cheapest);
  return out;
}

function tryGenerate(rng: Rng, seed: number, opts: DeliberateLevelOptions): GeneratedLevel | null {
  const L = DELIBERATE_LEVELS;
  const { tier, layer } = opts;
  const W = L.width;
  const H = L.height;
  const wallX = W / 2;
  const obstacles: Rect[] = [];
  const interactables: InteractableDef[] = [];
  const keepOut: Rect[] = [];
  const gap = L.gapWidth;
  const locked = L.leverTiers.includes(tier);

  // ── 出生點：左側，上中下隨機 ──
  const spawnY = [7, H / 2, H - 7][rng.int(0, 2)];
  const spawnPt = { x: 5, y: spawnY };
  keepOut.push({ x: 0, y: spawnY - 5, w: 10, h: 10 });

  // ── 中間的隔牆與缺口（上鎖關卡只有一個缺口） ──
  const nGaps = locked ? 1 : rng.int(L.gaps[0], L.gaps[1]);
  const gapYs: number[] = [];
  for (let t = 0; gapYs.length < nGaps && t < 40; t++) {
    const y = rng.int(4, H - 4 - gap);
    if (gapYs.some((g) => Math.abs(g - y) < gap + 8)) continue;
    gapYs.push(y);
  }
  gapYs.sort((a, b) => a - b);
  let y0 = 0;
  for (const gy of gapYs) {
    if (gy > y0) obstacles.push({ x: wallX, y: y0, w: 1, h: gy - y0 });
    y0 = gy + gap;
    keepOut.push({ x: wallX - 4, y: gy - 2, w: 9, h: gap + 4 });
  }
  if (y0 < H) obstacles.push({ x: wallX, y: y0, w: 1, h: H - y0 });
  gapYs.forEach((gy, k) => {
    if (locked && k === 0) interactables.push({ id: `gate${k}`, kind: 'door', name: tr("鐵柵門"), x: wallX, y: gy, w: 1, h: gap, locked: true });
    else if (rng.chance(L.doorChance)) interactables.push({ id: `gate${k}`, kind: 'door', name: tr("木門"), x: wallX, y: gy, w: 1, h: gap });
  });

  // ── 掩體短牆、石頭 ──
  const zones = [
    { x0: 1, x1: wallX - 1 },
    { x0: wallX + 2, x1: W - 1 },
  ];
  for (const z of zones) {
    for (let i = rng.int(1, 2); i > 0; i--) {
      const len = rng.int(3, 6);
      const horiz = rng.chance(0.5);
      const r = { x: round(rng.range(z.x0 + 3, z.x1 - 3 - (horiz ? len : 1))), y: round(rng.range(4, H - 4 - (horiz ? 1 : len))), w: horiz ? len : 1, h: horiz ? 1 : len };
      if (keepOut.some((k) => overlaps(k, r)) || obstacles.some((o) => overlaps(o, r, 2))) continue;
      obstacles.push(r);
    }
    const count = Math.round(((z.x1 - z.x0) * H) / L.rockDensity);
    for (let i = 0; i < count; i++) {
      const s = L.rockSizes[rng.int(0, L.rockSizes.length - 1)];
      const r = { x: round(rng.range(z.x0 + 1, z.x1 - 1 - s)), y: round(rng.range(2, H - 2 - s)), w: s, h: s };
      if (keepOut.some((k) => overlaps(k, r)) || obstacles.some((o) => overlaps(o, r, 1.2))) continue;
      obstacles.push(r);
    }
  }

  // ── 地形 ──
  const terrain: TerrainRect[] = [];
  const brushes: TerrainRect[] = [];
  for (const z of zones) {
    const zx = (w: number) => rng.range(z.x0 + 1, Math.max(z.x0 + 1, z.x1 - 1 - w));
    for (let i = rng.int(L.terrain.brush[0], L.terrain.brush[1]); i > 0; i--) {
      const w = rng.int(4, 6);
      const h = rng.int(3, 5);
      const b: TerrainRect = { kind: 'brush', x: zx(w), y: rng.range(2, H - 2 - h), w, h };
      terrain.push(b);
      brushes.push(b);
    }
    for (let i = rng.int(L.terrain.shallow[0], L.terrain.shallow[1]); i > 0; i--) {
      const w = rng.int(5, 8);
      const h = rng.int(4, 6);
      terrain.push({ kind: 'shallow', x: zx(w), y: rng.range(2, H - 2 - h), w, h });
    }
    for (let i = rng.int(L.terrain.hedge[0], L.terrain.hedge[1]); i > 0; i--) {
      const len = rng.int(3, 6);
      const horiz = rng.chance(0.5);
      terrain.push({ kind: 'hedge', x: zx(horiz ? len : 0.5), y: rng.range(3, H - 3 - (horiz ? 0.5 : len)), w: horiz ? len : 0.5, h: horiz ? 0.5 : len });
    }
  }

  // ── 可達性（門全開）──
  const grid = new NavGrid(W, H, 0.5, 0.55, obstacles);
  if (!grid.isWalkable(spawnPt)) return null;
  const reach = floodFrom(grid, spawnPt);
  const reachable = (p: Vec) => {
    const c = grid.cellOf(p);
    return grid.inBounds(c.cx, c.cy) && reach[c.cy * grid.cols + c.cx] === 1;
  };
  const used: Vec[] = [];
  const free = (p: Vec, r = 0.9) => reachable(p) && !used.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < r);

  // ── 小隊的落腳點 ──
  const farFromSpawn = (p: Vec) => Math.hypot(p.x - spawnPt.x, p.y - spawnPt.y) >= L.minSpawnDistance;
  const anchorFor = (kind: SquadPlacement): Vec | null => {
    for (let t = 0; t < 40; t++) {
      let p: Vec;
      switch (kind) {
        case 'front':
          p = { x: rng.range(14, wallX - 3), y: rng.range(8, H - 8) };
          break;
        case 'flank': {
          // 側翼：靠地圖邊緣、離出生點那一側較遠
          const edgeY = spawnY < H / 2 ? rng.range(H - 9, H - 4) : rng.range(4, 9);
          p = { x: rng.range(12, W - 8), y: edgeY };
          break;
        }
        case 'ambush': {
          if (brushes.length === 0) return null;
          const b = brushes[rng.int(0, brushes.length - 1)];
          p = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          break;
        }
        case 'behindDoor': {
          const gy = gapYs[rng.int(0, gapYs.length - 1)];
          p = { x: wallX + rng.range(4, 7), y: gy + gap / 2 + rng.range(-4, 4) };
          break;
        }
        case 'rear':
          p = { x: rng.range(W - 10, W - 4), y: rng.range(5, H - 5) };
          break;
      }
      if (farFromSpawn(p) && free(p, 3)) return p;
    }
    return null;
  };

  const enemies: EncounterEnemy[] = [];
  const placeSquad = (squad: string, members: string[], kind: SquadPlacement, captainIndex = -1): boolean => {
    const a = anchorFor(kind);
    if (!a) return false;
    members.forEach((enemy, i) => {
      let p: Vec | null = null;
      for (let t = 0; t < 20 && !p; t++) {
        const ang = (i / members.length) * Math.PI * 2 + rng.range(-0.4, 0.4) + t;
        const r = i === 0 && t === 0 ? 0 : L.squadSpread * (0.6 + 0.1 * t);
        const q = { x: round(a.x + Math.cos(ang) * r), y: round(a.y + Math.sin(ang) * r) };
        if (free(q)) p = q;
      }
      if (!p) return;
      used.push(p);
      enemies.push({ enemy, x: p.x, y: p.y, squad, captain: i === captainIndex || undefined });
    });
    return true;
  };

  // ── 敵人名單 → 小隊 ──
  const roster = rollRoster(rng, tier, layer);
  for (let i = roster.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [roster[i], roster[j]] = [roster[j], roster[i]];
  }
  const squads: string[][] = [];
  for (let i = 0; i < roster.length; ) {
    const n = Math.min(roster.length - i, rng.int(L.squadSize[0], L.squadSize[1]));
    squads.push(roster.slice(i, i + n));
    i += n;
  }
  // 剩下一名的小隊併進前一隊
  if (squads.length > 1 && squads[squads.length - 1].length === 1) squads[squads.length - 2].push(...squads.pop()!);
  // 配置方式輪流使用，讓每張關卡的敵人分佈不同
  const kinds: SquadPlacement[] = ['front', 'flank', 'behindDoor', 'rear'];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const captainSquad = tier === 'elite' ? rng.int(0, squads.length - 1) : -1;
  for (let k = 0; k < squads.length; k++) {
    const m = squads[k];
    let kind: SquadPlacement = kinds[k % kinds.length];
    if (m.some((e) => L.ambushers.includes(e)) && brushes.length > 0 && rng.chance(0.7)) kind = 'ambush';
    else if (m.every((e) => L.backliners.includes(e))) kind = 'rear';
    if (tier === 'boss' && (kind === 'rear' || kind === 'behindDoor')) kind = 'front';
    let cap = -1;
    if (k === captainSquad) {
      const c = L.captainPool[rng.int(0, L.captainPool.length - 1)];
      if (roster.length >= L.maxEnemies) m[0] = c;
      else m.unshift(c);
      cap = 0;
    }
    if (!placeSquad(`s${k}`, m, kind, cap) && !placeSquad(`s${k}`, m, 'front', cap)) return null;
  }

  // ── 頭目：第二區中央，護衛同一小隊 ──
  let summonPoints: Vec[] | undefined;
  if (tier === 'boss') {
    const bp = { x: (wallX + W) / 2 + 2, y: H / 2 };
    if (!free(bp, 2)) return null;
    used.push(bp);
    enemies.push({ enemy: L.boss.enemy, x: bp.x, y: bp.y, squad: 'boss' });
    L.boss.escorts.forEach((e, i) => {
      const q = { x: round(bp.x - 2.5), y: round(bp.y + (i === 0 ? -2 : 2)) };
      if (free(q)) {
        used.push(q);
        enemies.push({ enemy: e, x: q.x, y: q.y, squad: 'boss' });
      }
    });
    summonPoints = [
      { x: W - 3, y: 6 },
      { x: W - 3, y: H - 6 },
      { x: W - 3, y: H / 2 },
    ].filter((p) => reachable(p));
    if (summonPoints.length === 0) return null;
  }
  if (enemies.length < L.minEnemies) return null;

  // ── 絞盤：第一區、離出生點最遠的一側 ──
  if (locked) {
    let lever: Vec | null = null;
    for (let t = 0; t < 40 && !lever; t++) {
      const q = { x: rng.range(10, wallX - 4), y: spawnY < H / 2 ? rng.range(H - 8, H - 3) : rng.range(3, 8) };
      if (free(q, 2)) lever = q;
    }
    if (!lever) return null;
    interactables.push({ id: 'lever', kind: 'lever', name: tr("絞盤"), x: round(lever.x) - 0.4, y: round(lever.y) - 0.4, w: 0.8, h: 0.8, actions: [{ type: 'openDoor', door: 'gate0' }] });
  }

  const heroSpawns = [
    { x: spawnPt.x, y: spawnPt.y - 1 },
    { x: spawnPt.x + 2, y: spawnPt.y },
    { x: spawnPt.x, y: spawnPt.y + 1 },
    { x: spawnPt.x - 2, y: spawnPt.y },
  ];
  const place = L.themeNames[rng.int(0, L.themeNames.length - 1)];
  const id = `dlevel_${seed >>> 0}`;
  const mapDef: MapDef = {
    id,
    name: place,
    theme: 'wild',
    width: W,
    height: H,
    obstacles,
    heroSpawns,
    enemySpawns: [],
    landmarks: { cameraStart: spawnPt },
    terrain,
    interactables,
    summonPoints,
  };
  const label = tier === 'boss' ? tr("最終決戰") : tier === 'elite' ? tr("精英") : tier === 'event' ? tr("突發") : tr("遭遇");
  return {
    id,
    name: tr("{0}（{1}）", { 0: place, 1: label }),
    map: id,
    mapDef,
    tier,
    minLayer: layer,
    maxLayer: layer,
    difficulty: levelDifficulty(tier, layer),
    enemies,
    fog: true,
  };
}

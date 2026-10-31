/**
 * 一路向前（SPEC_SLICE7 §1）：出口預告前方的地圖、地圖上的商人。純函式。
 */
import { CHARACTERS } from './data/characters';
import { unmetCharacters } from './characters';
import { tr } from '../i18n/lang';
import type { InteractableDef, MapDef, Rect } from '../sim/data/types';
import { currentChapter } from './campaign';
import { CHAPTERS } from './data/chapters';
import { CONSUMABLE_DROP } from './consumables';
import { ECONOMY } from './data/economy';
import { JOURNEY } from './data/journey';
import type { MapNode, RunMap } from './mapGen';
import { availableNodes } from './progression';
import type { HeroRecord, RunState } from './runState';
import { cloneRun, newHero } from './runState';
import { rngFor } from './seed';
import type { Vec } from '../sim/math';
import { NavGrid } from '../sim/nav/grid';
import { UPGRADES } from './data/upgrades';
import { classChoices } from './classes';
import { evolveHero, generalUpgradeIds, grantUpgrade, maxHpOf, maxRankOf, rankOf, recipeDone, recipesOf } from './upgrades';
import { battleSkillsOf } from './loadout';

/** 全程第幾層（前面各章的層數加總＋本章層數，不打折） */
export function journeyDepth(run: RunState, node: MapNode): number {
  let d = 0;
  for (let k = 0; k < (run.chapter ?? 0); k++) d += CHAPTERS[k]?.layers ?? 0;
  return d + node.layer;
}

/** 一路向前的敵人強度倍率（SPEC_SLICE7 §3.3）；頭目從第 1 章頭目那一層開始算 */
export function journeyStrength(run: RunState, node: MapNode): number {
  const C = JOURNEY.curve;
  const base = node.type === 'boss' ? CHAPTERS[0].layers : 1;
  return (1 + C.perDepth * Math.max(0, journeyDepth(run, node) - base)) * (C.chapterMult[run.chapter ?? 0] ?? 1);
}

/** 這個節點有沒有被困的英雄（依種子固定，出口預告才能先說） */
export function rescueAt(run: RunState, nodeId: number): boolean {
  const node = run.map.nodes[nodeId];
  const R = JOURNEY.rescue;
  if (!run.forward || node.type !== 'battle' || node.layer < R.minLayer) return false;
  return rngFor(run.seed, 'rescue', run.chapter ?? 0, nodeId).chance(R.chance);
}

/**
 * 被困的英雄（SPEC_SLICE7 §4）：隊伍等級；加入前的升級已經配好，玩家不能改。
 * 先走一個昇變分支（選滿就昇變），分支走完再拿通用升級。
 */
export function rescueHero(run: RunState, nodeId: number): HeroRecord {
  const rng = rngFor(run.seed, 'rescueHero', run.chapter ?? 0, nodeId);
  const scratch = cloneRun(run);
  // 具名角色（SPEC_CHARACTERS §3.2）：從還沒登場的角色裡抽；都登場過了就照舊抽職業
  const chars = unmetCharacters(run);
  const classes = classChoices(run.style);
  const pick = chars.length ? chars[rng.int(0, chars.length - 1)] : null;
  const h = pick ? newHero(CHARACTERS[pick].baseClass, undefined, pick) : newHero(classes[rng.int(0, classes.length - 1)]);
  h.level = run.level ?? 1;
  scratch.party[0] = h;
  // 朝一份配方前進（SPEC_SLICE7 §4）：先拿配方要的、再把要升滿的升滿，湊齊就昇變，之後拿通用升級
  const recipes = recipesOf(h);
  const recipe = recipes.length ? recipes[rng.int(0, recipes.length - 1)] : null;
  const general = generalUpgradeIds(run.style).filter((id) => UPGRADES[id].scope === 'hero');
  for (let n = Math.floor(((run.level ?? 1) - 1) * JOURNEY.rescue.upgradesPerLevel); n > 0; n--) {
    const hero = scratch.party[0]!;
    const next = recipe && !hero.baseClass ? (recipe.requires.find((id) => rankOf(hero, id) === 0) ?? (rankOf(hero, recipe.maxed) < maxRankOf(recipe.maxed) ? recipe.maxed : undefined)) : undefined;
    const id = next ?? general[rng.int(0, general.length - 1)];
    const skills = battleSkillsOf(scratch, hero);
    grantUpgrade(scratch, id, 0, UPGRADES[id].needsSkill ? skills[rng.int(0, skills.length - 1)] : undefined);
    if (recipe && recipeDone(scratch.party[0]!, recipe)) evolveHero(scratch, 0, recipe);
  }
  const out = scratch.party[0]!;
  out.hp = maxHpOf(out);
  return out;
}

/** 出口預告：前方地圖的地形、可能取得的東西、敵人以外的氣息、可預見的威脅 */
export interface PathPreview {
  nodeId: number;
  terrain: string;
  loot: string[];
  /** 前方有敵人以外的氣息（商人、事件；不說是哪一種） */
  presence: boolean;
  /** 途中停靠：營火；商人、事件只說「有敵人以外的氣息」 */
  campfire: boolean;
  wayPresence: boolean;
  threat: 'elite' | 'boss' | null;
}

const FIGHTS: MapNode['type'][] = ['battle', 'elite', 'boss', 'shop'];

/** 前方地圖的地形（和 encounterFor 選生成器的規則一致） */
export function terrainOf(run: RunState, node: MapNode): string {
  const ch = currentChapter(run);
  if (node.type === 'boss') return tr("野外");
  if (ch.indoor) return ch.indoor === 'temple' ? tr("地城") : ch.indoor === 'cave' ? tr("密道") : tr("魔王城");
  return node.layer <= ch.townUntilLayer ? tr("城內街道") : tr("野外");
}

export function previewOf(run: RunState, nodeId: number, from: number | null = run.currentNodeId): PathPreview {
  const node = run.map.nodes[nodeId];
  // 已經停過的不算（例：事件裡打起來的那張圖，出口預告不再說一次）
  const way = stopsOn(run.map, from, nodeId)
    .filter((id) => !(run.stopsDone ?? []).includes(id))
    .map((id) => run.map.nodes[id].stop!);
  const loot: string[] = [];
  if (FIGHTS.includes(node.type)) {
    const kind = node.type === 'elite' ? 'elite' : 'battle';
    loot.push(tr("金幣"));
    if ((ECONOMY.itemDropChance[kind] ?? 0) > 0) loot.push(tr("裝備"));
    if ((CONSUMABLE_DROP.chance[kind] ?? 0) > 0) loot.push(tr("消耗品"));
    if (currentChapter(run).indoor && node.type !== 'boss') loot.push(tr("寶箱"));
  } else if (node.type === 'rest') loot.push(tr("休息"));
  return {
    nodeId,
    terrain: terrainOf(run, node),
    loot,
    presence: JOURNEY.presence.includes(node.type) || rescueAt(run, nodeId),
    campfire: way.includes('rest'),
    wayPresence: way.some((t) => JOURNEY.presence.includes(t)),
    threat: node.type === 'elite' ? 'elite' : node.type === 'boss' ? 'boss' : null,
  };
}

/** 途中停靠的節點類型 */
export const STOP_TYPES: MapNode['type'][] = ['rest', 'shop', 'event'];

/**
 * 途中停靠（SPEC_SLICE7 §1，Alan 2026-10-24）：休息、商人、事件不再是一個要選路的節點，
 * 而是「走進下一張圖之前路上經過的地方」：節點變成一般戰鬥地圖，原本的類型記在 stop。原地修改。
 * 這樣每章的地圖數不變，只是停靠點穿插在兩張圖之間。
 */
export function foldStops(map: RunMap): RunMap {
  for (const n of map.nodes)
    if (STOP_TYPES.includes(n.type)) {
      n.stop = n.type as MapNode['stop'];
      n.type = 'battle';
    }
  return map;
}

/** 從 from 圖往 to 圖的路上要停哪些（節點 id；停靠點用 to 自己的 id） */
export function stopsOn(map: RunMap, from: number | null, to: number): number[] {
  return from !== null && map.nodes[to].stop ? [to] : [];
}

/** 出發（每章開始）：直接進第一層中間的那張圖，不用選（第一層都是一般戰鬥，選了也沒差） */
export function startNodeOf(run: RunState): number {
  const first = run.map.layers[0];
  return first[Math.floor(first.length / 2)];
}

/** 接下來可以走的路（離開休息或事件之後） */
export function pathsAhead(run: RunState): PathPreview[] {
  return availableNodes(run).map((n) => previewOf(run, n.id));
}

const overlaps = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** 某一點附近的空地（size × size 的方格左上角）；avoid：要離開這些點至少 1.2 m */
export function freeSpotNear(map: MapDef, at: Vec, distances: number[], size: number, avoid: Vec[] = []): Rect | null {
  const taken: Rect[] = [...map.obstacles, ...(map.exits ?? []), ...(map.interactables ?? [])];
  for (const d of distances)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = at.x + Math.cos(a) * d - size / 2;
      const y = at.y + Math.sin(a) * d - size / 2;
      const r = { x, y, w: size, h: size };
      if (x < 1 || y < 1 || x + size > map.width - 1 || y + size > map.height - 1) continue;
      if (taken.some((t) => overlaps(r, t, 0.4))) continue;
      if (avoid.some((p) => Math.hypot(p.x - (x + size / 2), p.y - (y + size / 2)) < 1.2)) continue;
      return r;
    }
  return null;
}

/**
 * 被困英雄躲的地方（Alan 2026-10-31）：從出生點走得到、離所有敵人至少 hideFromEnemies 公尺，
 * 走起來夠遠（找得到的路程裡前段以外的地方），越靠牆角越好。找不到就回傳 null（照舊站在小隊旁邊）。
 */
export function hideSpotFor(map: MapDef, from: Vec, enemies: Vec[], seed: number): Vec | null {
  const R = JOURNEY.rescue;
  const g = NavGrid.fromMap(map, 0.5, 0.45);
  const blocked = [...(map.exits ?? []), ...(map.interactables ?? [])];
  const start = g.nearestWalkableCell(g.cellOf(from).cx, g.cellOf(from).cy);
  if (!start) return null;
  // 從出生點往外擴散，記下每一格的路程
  const steps = new Int32Array(g.cols * g.rows).fill(-1);
  const queue = [start.cy * g.cols + start.cx];
  steps[queue[0]] = 0;
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i];
    const cx = k % g.cols;
    const cy = (k - cx) / g.cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (g.isBlockedCell(nx, ny) || steps[ny * g.cols + nx] >= 0) continue;
      steps[ny * g.cols + nx] = steps[k] + 1;
      queue.push(ny * g.cols + nx);
    }
  }
  const far = steps[queue[queue.length - 1]];
  const rng = rngFor(seed, 'hideSpot');
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (const k of queue) {
    if (steps[k] < far * R.minTravel) continue;
    const cx = k % g.cols;
    const cy = (k - cx) / g.cols;
    const p = g.cellCenter(cx, cy);
    // 離地圖邊至少 1.5 m（身邊還要擺得下屍體、追兵）
    if (p.x < 1.5 || p.y < 1.5 || p.x > map.width - 1.5 || p.y > map.height - 1.5) continue;
    if (enemies.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < R.hideFromEnemies)) continue;
    if (blocked.some((r) => p.x > r.x - 1.5 && p.x < r.x + r.w + 1.5 && p.y > r.y - 1.5 && p.y < r.y + r.h + 1.5)) continue;
    // 牆角：周圍兩格內被擋住的格子越多越像躲起來
    let walls = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (g.isBlockedCell(cx + dx, cy + dy)) walls++;
    // 太擠（四周幾乎都是牆）就擺不下屍體
    if (walls > 15) continue;
    const score = walls + rng.next() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** 地圖上的商人（SPEC_SLICE7 §2）：站在出生點附近的空地；回傳加上商人的新地圖 */
export function withMerchant(map: MapDef): MapDef {
  const spawn = map.heroSpawns[0] ?? { x: map.width / 2, y: map.height / 2 };
  const r = freeSpotNear(map, spawn, JOURNEY.merchantDistances, 0.9, map.heroSpawns);
  if (!r) return map;
  const merchant: InteractableDef = { id: 'merchant', kind: 'merchant', name: tr("商人"), ...r };
  return { ...map, interactables: [...(map.interactables ?? []), merchant] };
}

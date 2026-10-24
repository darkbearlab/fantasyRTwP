/**
 * 一路向前（SPEC_SLICE7 §1）：出口預告前方的地圖、地圖上的商人。純函式。
 */
import { tr } from '../i18n/lang';
import type { InteractableDef, MapDef, Rect } from '../sim/data/types';
import { currentChapter } from './campaign';
import { CONSUMABLE_DROP } from './consumables';
import { ECONOMY } from './data/economy';
import { JOURNEY } from './data/journey';
import type { MapNode } from './mapGen';
import { availableNodes } from './progression';
import type { HeroRecord, RunState } from './runState';
import { cloneRun, newHero } from './runState';
import { rngFor } from './seed';
import type { Vec } from '../sim/math';
import { UPGRADES } from './data/upgrades';
import { classChoices } from './classes';
import { evolveHero, generalUpgradeIds, grantUpgrade, maxHpOf, maxRankOf, rankOf, recipeDone, recipesOf } from './upgrades';
import { battleSkillsOf } from './loadout';

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
  const classes = classChoices(run.style);
  const scratch = cloneRun(run);
  const h = newHero(classes[rng.int(0, classes.length - 1)]);
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

export function previewOf(run: RunState, nodeId: number): PathPreview {
  const node = run.map.nodes[nodeId];
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
    threat: node.type === 'elite' ? 'elite' : node.type === 'boss' ? 'boss' : null,
  };
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

/** 地圖上的商人（SPEC_SLICE7 §2）：站在出生點附近的空地；回傳加上商人的新地圖 */
export function withMerchant(map: MapDef): MapDef {
  const spawn = map.heroSpawns[0] ?? { x: map.width / 2, y: map.height / 2 };
  const r = freeSpotNear(map, spawn, JOURNEY.merchantDistances, 0.9, map.heroSpawns);
  if (!r) return map;
  const merchant: InteractableDef = { id: 'merchant', kind: 'merchant', name: tr("商人"), ...r };
  return { ...map, interactables: [...(map.interactables ?? []), merchant] };
}

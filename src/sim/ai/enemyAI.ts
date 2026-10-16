/**
 * 敵人 AI（SPEC §10.3、§10.4）：每 1.0 ± 0.2 秒重新評估一次目標。
 */
import { SKILLS } from '../data/skills';
import type { Vec } from '../math';
import { dist } from '../math';
import { lineWalkable } from '../nav/smooth';
import type { Unit } from '../unit';
import type { World } from '../world';
import { edgeDistance, pinnersAt } from '../zoc';

const EVAL_INTERVAL = 1.0;
const EVAL_JITTER = 0.2;
/** 弓手被近身的判定距離（邊緣距離） */
const ARCHER_THREAT_RANGE = 2.5;
const ARCHER_RETREAT_DIST = 4;
const ARCHER_RETREAT_COOLDOWN = 4;

export function enemyThink(world: World, u: Unit): void {
  if (!world.enemyAggro) return;
  if (u.order && u.aiTimer > 0) return;
  u.aiTimer = EVAL_INTERVAL + world.rng.range(-EVAL_JITTER, EVAL_JITTER);

  const heroes = world.units.filter((h) => h.team !== u.team && !h.dead);
  if (heroes.length === 0) return;

  // 被牽制時：先處理牽制自己的英雄
  const pinners = pinnersAt(world, u);
  if (pinners.length > 0) {
    attack(world, u, nearest(u, pinners));
    return;
  }

  switch (u.def.ai) {
    case 'skirmisher': {
      // 護甲最低的英雄；同護甲取最近
      const t = [...heroes].sort((a, b) => a.armor - b.armor || dist(u.pos, a.pos) - dist(u.pos, b.pos))[0];
      attack(world, u, t);
      return;
    }
    case 'archer': {
      const threat = heroes.find((h) => edgeDistance(u, h) < ARCHER_THREAT_RANGE);
      if (threat && u.retreatCooldown <= 0) {
        const p = retreatPoint(world, u, heroes);
        if (p) {
          u.retreatCooldown = ARCHER_RETREAT_COOLDOWN;
          world.issueOrder(u, { type: 'move', point: p });
          return;
        }
      }
      const visible = heroes.filter((h) => world.canSee(u, h) && edgeDistance(u, h) <= u.def.range + 2);
      if (visible.length > 0) {
        const t = visible.sort((a, b) => a.defense - b.defense || dist(u.pos, a.pos) - dist(u.pos, b.pos))[0];
        attack(world, u, t);
      } else attack(world, u, nearest(u, heroes));
      return;
    }
    case 'caster': {
      const spell = u.def.skills.find((s) => SKILLS[s]?.effect.kind === 'aoe');
      if (spell && (u.cooldowns[spell] ?? 0) <= 0) {
        const p = bestClusterPoint(u, heroes, SKILLS[spell]);
        if (p) {
          world.issueOrder(u, { type: 'skill', skillId: spell, point: p });
          return;
        }
      }
      const visible = heroes.filter((h) => world.canSee(u, h));
      attack(world, u, nearest(u, visible.length > 0 ? visible : heroes));
      return;
    }
    case 'brute':
    default:
      attack(world, u, nearest(u, heroes));
  }
}

function attack(world: World, u: Unit, t: Unit): void {
  world.issueOrder(u, { type: 'attack', targetId: t.id });
}

function nearest(u: Unit, list: Unit[]): Unit {
  let best = list[0];
  let bestD = Infinity;
  for (const h of list) {
    const d = dist(u.pos, h.pos);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

/** 弓手後退：8 個方向中選離英雄最遠、可直線走到的點 */
function retreatPoint(world: World, u: Unit, heroes: Unit[]): Vec | null {
  const grid = world.navFor(u);
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = { x: u.pos.x + Math.cos(a) * ARCHER_RETREAT_DIST, y: u.pos.y + Math.sin(a) * ARCHER_RETREAT_DIST };
    if (!grid.isWalkable(p) || !lineWalkable(grid, u.pos, p)) continue;
    let minD = Infinity;
    for (const h of heroes) minD = Math.min(minD, dist(p, h.pos));
    if (minD > bestScore) {
      bestScore = minD;
      best = p;
    }
  }
  return best;
}

/** 術士：找英雄最密集的位置（候選：英雄位置與兩兩中點） */
function bestClusterPoint(u: Unit, heroes: Unit[], spell: (typeof SKILLS)[string]): Vec | null {
  const eff = spell.effect;
  if (eff.kind !== 'aoe') return null;
  const cands: Vec[] = heroes.map((h) => h.pos);
  for (let i = 0; i < heroes.length; i++) {
    for (let j = i + 1; j < heroes.length; j++) {
      cands.push({ x: (heroes[i].pos.x + heroes[j].pos.x) / 2, y: (heroes[i].pos.y + heroes[j].pos.y) / 2 });
    }
  }
  let best: Vec | null = null;
  let bestScore = 0;
  for (const c of cands) {
    let n = 0;
    for (const h of heroes) if (dist(c, h.pos) <= eff.radius) n++;
    // 越密集越好，距離近的稍微優先
    const score = n - dist(u.pos, c) * 0.01;
    if (n > 0 && score > bestScore) {
      bestScore = score;
      best = { x: c.x, y: c.y };
    }
  }
  return best;
}

import type { Order } from '../commands';
import type { Personality } from '../data/types';
import { lineWalkable } from '../nav/smooth';
import type { Vec } from '../math';
import { dist } from '../math';
import type { Unit } from '../unit';
import type { World } from '../world';
import { edgeDistance, pinnersAt } from '../zoc';

/**
 * 英雄閒置行為的策略介面（SPEC §10.4）。之後的切片會依「性格」替換。
 * 只在英雄沒有指令、沒有動作時呼叫；技能一律不自動使用。
 */
export interface IdleBehavior {
  decide(world: World, unit: Unit): Order | null;
}

/** 回到駐守點的容許誤差（公尺） */
const GUARD_RETURN_SLACK = 0.3;

/**
 * 近戰：不離開駐守點超過 heroLeashRange 就打得到 t。
 * 遠程：不移動，目前位置在射程內且有視線。
 */
export function withinLeash(world: World, u: Unit, t: Unit, guard: Vec): boolean {
  if (!u.isMelee) return edgeDistance(u, t) <= u.def.range && world.canSee(u, t);
  return dist(guard, t.pos) - t.radius - u.radius - u.def.range <= world.config.heroLeashRange;
}

/** 駐守中的近戰接近點：優先用攻擊站位，站位超出範圍時改走到駐守圈上朝向目標的點 */
export function leashedApproachPoint(world: World, u: Unit, t: Unit, guard: Vec): Vec {
  const grid = world.navFor(u);
  const slot = world.slots.claim(t.id, t.pos, t.radius, u.id, u.pos, u.radius, (p) => grid.isWalkable(p));
  const leash = world.config.heroLeashRange;
  if (dist(slot.pos, guard) <= leash) return slot.pos;
  const d = dist(guard, t.pos);
  if (d < 1e-6) return guard;
  const k = Math.min(leash, d) / d;
  return { x: guard.x + (t.pos.x - guard.x) * k, y: guard.y + (t.pos.y - guard.y) * k };
}

export function returnToGuard(u: Unit, guard: Vec): Order | null {
  return dist(u.pos, guard) > GUARD_RETURN_SLACK ? { type: 'move', point: { x: guard.x, y: guard.y } } : null;
}

/**
 * 堅守（預設）：近戰對 heroIdleAggroRange 內的敵人、遠程對射程內且有視線的敵人自動普攻。
 * 有駐守點時只打「不離開駐守範圍就打得到」的敵人，沒有目標就走回駐守點。
 */
export const defaultIdleBehavior: IdleBehavior = {
  decide(world, u) {
    const guard = u.guardPoint;
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const e of world.units) {
      if (e.dead || e.team === u.team) continue;
      const d = edgeDistance(u, e);
      if (guard) {
        if (!withinLeash(world, u, e, guard)) continue;
      } else if (u.isMelee) {
        if (d > world.config.heroIdleAggroRange) continue;
      } else if (d > u.def.range || !world.canSee(u, e)) continue;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) return { type: 'attack', targetId: best.id, leashed: !!guard };
    return guard ? returnToGuard(u, guard) : null;
  },
};

/** 逃跑方向的取樣數 */
const FLEE_DIRECTIONS = 16;

/**
 * 游擊：不會自動攻擊。敵人進入 heroFleeRange 就往遠離敵人的方向跑 heroFleeDistance。
 * 被牽制或無路可逃時原地不動，等玩家下指令。
 */
export const guerrillaIdleBehavior: IdleBehavior = {
  decide(world, u) {
    const threats = world.units.filter((e) => !e.dead && e.team !== u.team && edgeDistance(u, e) <= world.config.heroFleeRange);
    if (threats.length === 0) return null;
    if (pinnersAt(world, u).length > 0) return null;
    const p = fleePoint(world, u, threats);
    return p ? { type: 'move', point: p } : null;
  },
};

/** 在周圍取樣，選「能直線走到、離威脅最遠、且偏向反方向」的點 */
export function fleePoint(world: World, u: Unit, threats: Unit[]): Vec | null {
  const grid = world.navFor(u);
  // 威脅的反方向（以距離加權）
  let ax = 0;
  let ay = 0;
  for (const e of threats) {
    const d = Math.max(0.1, dist(u.pos, e.pos));
    ax += (u.pos.x - e.pos.x) / (d * d);
    ay += (u.pos.y - e.pos.y) / (d * d);
  }
  const al = Math.hypot(ax, ay) || 1;
  const enemies = world.units.filter((e) => !e.dead && e.team !== u.team);
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < FLEE_DIRECTIONS; i++) {
    const a = (i / FLEE_DIRECTIONS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // 撞牆就縮短距離
    for (const k of [1, 0.6, 0.35]) {
      const r = world.config.heroFleeDistance * k;
      const p = { x: u.pos.x + dx * r, y: u.pos.y + dy * r };
      if (!grid.isWalkable(p) || !lineWalkable(grid, u.pos, p)) continue;
      let minD = Infinity;
      for (const e of enemies) minD = Math.min(minD, dist(p, e.pos));
      const score = minD + 1.5 * ((dx * ax + dy * ay) / al);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
      break;
    }
  }
  // 逃了也沒有比較遠：不動
  if (best) {
    let nowMin = Infinity;
    for (const e of enemies) nowMin = Math.min(nowMin, dist(u.pos, e.pos));
    let newMin = Infinity;
    for (const e of enemies) newMin = Math.min(newMin, dist(best, e.pos));
    if (newMin <= nowMin + 0.5) return null;
  }
  return best;
}

/**
 * 好戰：看得到且在 heroAggressiveRange 內的敵人就主動衝出去打。
 * 下的是一般攻擊指令（不受駐守點限制），所以會一路追擊到目標倒下。
 */
export const aggressiveIdleBehavior: IdleBehavior = {
  decide(world, u) {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const e of world.units) {
      if (e.dead || e.team === u.team) continue;
      const d = edgeDistance(u, e);
      if (d > world.config.heroAggressiveRange || d >= bestD || !world.canSee(u, e)) continue;
      bestD = d;
      best = e;
    }
    return best ? { type: 'attack', targetId: best.id } : null;
  },
};

/** 性格 → 閒置行為 */
export const IDLE_BEHAVIORS: Record<Personality, IdleBehavior> = {
  steadfast: defaultIdleBehavior,
  aggressive: aggressiveIdleBehavior,
  guerrilla: guerrillaIdleBehavior,
};

/** 顯示名稱 */
export const PERSONALITY_LABEL: Record<Personality, string> = {
  steadfast: '堅守',
  aggressive: '好戰',
  guerrilla: '游擊',
};

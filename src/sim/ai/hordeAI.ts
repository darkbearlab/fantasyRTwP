/**
 * 雜兵 AI（SPEC_SLICE4 §1.1）：刻意簡單——衝向最近的英雄、包圍、攻擊。
 * 不使用指令系統與 A*：遠處沿著共用流場移動，靠近目標且直線可走時直接衝過去。
 */
import { RANGE_TOLERANCE } from '../constants';
import { HORDE, HORDE_TAUNT } from '../data/horde';
import { dist } from '../math';
import { startAction } from '../actions';
import { lineWalkable } from '../nav/smooth';
import type { Unit } from '../unit';
import type { World } from '../world';
import { edgeDistance, pinnersAt } from '../zoc';

export function hordeThink(world: World, u: Unit): void {
  if (!world.enemyAggro) return;
  let t = u.hordeTargetId >= 0 ? world.getUnit(u.hordeTargetId) : undefined;
  if (u.aiTimer <= 0 || !t || t.dead || !world.canTarget(u, t)) {
    t = pickTarget(world, u);
    u.hordeTargetId = t ? t.id : -1;
    u.aiTimer = HORDE.retargetInterval + world.rng.range(0, 0.1);
  }
  if (!t) return;
  const inRange = edgeDistance(u, t) <= world.attackRange(u) + RANGE_TOLERANCE && (u.isMelee || world.canSee(u, t));
  if (inRange) {
    startAction(world, u, { kind: 'attack', targetId: t.id });
    return;
  }
  const grid = world.navFor(u);
  const near = dist(u.pos, t.pos) <= HORDE.directChaseRange + t.radius && lineWalkable(grid, u.pos, t.pos);
  const goal = near ? t.pos : (world.flowNext(u.pos) ?? t.pos);
  world.stepToward(u, goal, near ? u.radius + t.radius : 0);
}

/**
 * 目標優先順序：牽制自己的英雄 → 嘲諷光環範圍內的英雄（戰士，SPEC_SLICE4 §4）→ 最近的英雄。
 */
function pickTarget(world: World, u: Unit): Unit | undefined {
  const pinners = u.def.ignoresZoc ? [] : pinnersAt(world, u);
  const visible = world.units.filter((h) => h.team !== u.team && !h.dead && world.canTarget(u, h));
  const taunters = world.config.battleStyle === 'horde' ? visible.filter((h) => HORDE_TAUNT[h.def.id] && dist(u.pos, h.pos) <= HORDE_TAUNT[h.def.id] + h.radius) : [];
  const list = pinners.length > 0 ? pinners : taunters.length > 0 ? taunters : visible;
  let best: Unit | undefined;
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

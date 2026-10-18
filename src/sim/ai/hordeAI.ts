/**
 * 雜兵 AI（SPEC_SLICE4 §1.1）：刻意簡單——衝向最近的英雄、包圍、攻擊。
 * 不使用指令系統與 A*：遠處沿著共用流場移動，靠近目標且直線可走時直接衝過去。
 */
import { RANGE_TOLERANCE } from '../constants';
import { HORDE, HORDE_TAUNT } from '../data/horde';
import type { Vec } from '../math';
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
  const d = dist(u.pos, t.pos);
  // 包圍：近戰雜兵靠近後繞向目標周圍分配到的角度，不再全部從同一側撞上去
  if (u.isMelee && d <= HORDE.encircleRange + t.radius && lineWalkable(grid, u.pos, t.pos)) {
    world.stepToward(u, encirclePoint(u, t, d), 0);
    return;
  }
  u.encircleAngle = null;
  const near = d <= HORDE.directChaseRange + t.radius && lineWalkable(grid, u.pos, t.pos);
  const goal = near ? t.pos : (world.flowNext(u.pos) ?? t.pos);
  world.stepToward(u, goal, near ? u.radius + t.radius : 0);
}

/** 每次最多繞多少角度（弧度）：沿圓弧逼近，不會直接穿過目標 */
const ORBIT_STEP = 0.8;

/**
 * 包圍的下一個目標點。進入包圍距離時決定一次自己的角度（接近方向 ± 依編號分散），
 * 之後沿著目標周圍的圓弧往那個角度繞，同時逐漸縮短距離。
 */
function encirclePoint(u: Unit, t: Unit, d: number): Vec {
  const cur = Math.atan2(u.pos.y - t.pos.y, u.pos.x - t.pos.x);
  if (u.encircleAngle === null || u.encircleTargetId !== t.id) {
    // 黃金比例分散：同一群的雜兵自然地散到兩側
    const k = (u.id * 0.6180339887) % 1;
    u.encircleAngle = cur + (k * 2 - 1) * HORDE.encircleSpread * (Math.PI / 180);
    u.encircleTargetId = t.id;
  }
  let delta = u.encircleAngle - cur;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const next = cur + Math.max(-ORBIT_STEP, Math.min(ORBIT_STEP, delta));
  const ring = t.radius + u.radius + 0.1;
  // 還沒繞到位時保持一點距離（避免卡在目標身上），繞到位才貼上去
  const r = Math.abs(delta) > 0.3 ? Math.max(ring + 0.6, d - 1) : ring;
  return { x: t.pos.x + Math.cos(next) * r, y: t.pos.y + Math.sin(next) * r };
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

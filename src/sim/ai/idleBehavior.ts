import type { Order } from '../commands';
import type { Vec } from '../math';
import { dist } from '../math';
import type { Unit } from '../unit';
import type { World } from '../world';
import { edgeDistance } from '../zoc';

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
 * 預設：近戰對 heroIdleAggroRange 內的敵人、遠程對射程內且有視線的敵人自動普攻。
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

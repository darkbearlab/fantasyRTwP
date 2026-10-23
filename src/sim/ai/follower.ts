/**
 * 隨從的 AI（Alan 2026-10-23）：
 * - 離主人太遠（牽繩）：放下手邊的事跑回主人身邊。
 * - 主人附近有敵人：打離自己最近的那個。
 * - 沒事：跟在主人身邊（每隻隨從圍在主人旁邊不同的位置）。
 * - 主人倒下：就地打附近的敵人。
 */
import { FOLLOWER_RULES } from '../data/followers';
import type { Vec } from '../math';
import { dist } from '../math';
import type { Order } from '../commands';
import type { Unit } from '../unit';
import type { World } from '../world';

/** 第 k 隻隨從在主人旁邊的位置（主人身後的半圈） */
function slotAround(master: Unit, k: number, n: number): Vec {
  const back = master.facing + Math.PI;
  const spread = n <= 1 ? 0 : (k / (n - 1) - 0.5) * Math.PI * 0.9;
  const a = back + spread;
  const r = FOLLOWER_RULES.followDist * 0.75;
  return { x: master.pos.x + Math.cos(a) * r, y: master.pos.y + Math.sin(a) * r };
}

export function followerOrder(world: World, u: Unit): Order | null | undefined {
  const F = FOLLOWER_RULES;
  const master = world.getUnit(u.masterId);
  const nearestEnemy = (from: Vec, range: number) => {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const e of world.units) {
      if (e.dead || e.team === u.team || !world.canTarget(u, e)) continue;
      const d = dist(e.pos, from);
      if (d > range) continue;
      const du = dist(e.pos, u.pos);
      if (du < bd) {
        bd = du;
        best = e;
      }
    }
    return best;
  };
  if (!master || master.dead) {
    const e = nearestEnemy(u.pos, F.aggro);
    return e ? { type: 'attack', targetId: e.id } : null;
  }
  const dm = dist(u.pos, master.pos);
  const mates = world.units.filter((o) => o.follower && !o.dead && o.masterId === master.id);
  const k = mates.indexOf(u);
  // 牽繩：太遠就回去（不管正在做什麼）
  if (dm > F.leash) return { type: 'move', point: slotAround(master, k, mates.length) };
  // 正在打的目標還在主人附近：繼續打
  if (u.order?.type === 'attack') {
    const t = world.getUnit(u.order.targetId);
    if (t && !t.dead && dist(t.pos, master.pos) <= F.leash) return undefined;
  }
  const e = nearestEnemy(master.pos, F.aggro);
  if (e) return { type: 'attack', targetId: e.id };
  if (u.order?.type === 'attack') return null;
  if (dm > F.followDist) return { type: 'move', point: slotAround(master, k, mates.length) };
  return u.order?.type === 'move' ? undefined : null;
}

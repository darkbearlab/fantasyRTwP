import type { Order } from '../commands';
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

/** 預設：近戰對 heroIdleAggroRange 內的敵人、遠程對射程內且有視線的敵人自動普攻 */
export const defaultIdleBehavior: IdleBehavior = {
  decide(world, u) {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const e of world.units) {
      if (e.dead || e.team === u.team) continue;
      const d = edgeDistance(u, e);
      if (u.isMelee) {
        if (d > world.config.heroIdleAggroRange) continue;
      } else if (d > u.def.range || !world.canSee(u, e)) continue;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best ? { type: 'attack', targetId: best.id } : null;
  },
};

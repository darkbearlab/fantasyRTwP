/**
 * 持續性地面效果（Alan：持續效果做成一個通用的 helper）。
 * 任何技能都可以在地上留下一個區域：持續一段時間，對範圍內的敵人／友軍套用一組效果（減速、燃燒、每秒傷害、每秒回復）。
 * 沼澤、火焰瓶的地面火都用這一套；之後的道具、敵人技能也一樣。
 */
import { applyDamage } from './actions';
import { DT } from './constants';
import { TERRAIN } from './data/terrain';
import type { LingeringDef } from './data/types';
import type { Vec } from './math';
import { dist } from './math';
import type { Team } from './data/types';
import type { Unit } from './unit';
import type { World } from './world';

export interface GroundZone extends LingeringDef {
  point: Vec;
  radius: number;
  /** 剩餘秒數 */
  time: number;
  /** 施放者的陣營（affects 以它為準） */
  team: Team;
  sourceId: number;
  skillId: string;
  /** 每秒結算的累積時間 */
  tickAcc: number;
}

/** 在地上留下一個持續區域 */
export function addZone(world: World, src: Unit, point: Vec, radius: number, def: LingeringDef, skillId: string): void {
  world.zones.push({ ...def, point: { ...point }, radius, time: def.duration, team: src.team, sourceId: src.id, skillId, tickAcc: 0 });
}

/** 區域會影響這名單位嗎（陣營、範圍） */
export function zoneAffects(z: GroundZone, u: Unit): boolean {
  if (u.dead) return false;
  if (z.affects === 'enemy' && u.team === z.team) return false;
  if (z.affects === 'ally' && u.team !== z.team) return false;
  return dist(u.pos, z.point) <= z.radius + u.radius * 0.5;
}

/** 範圍內減速效果的移動倍率（取最慢的） */
export function zoneMoveMult(world: World, u: Unit): number {
  let m = 1;
  for (const z of world.zones) {
    if (!zoneAffects(z, u)) continue;
    for (const e of z.effects) if (e.kind === 'slow') m = Math.min(m, e.moveMult);
  }
  return m;
}

/** 每節拍：倒數、燃燒（每節拍維持）、每秒傷害／回復（每滿 1 秒結算一次） */
export function updateZones(world: World): void {
  if (world.zones.length === 0) return;
  for (const z of world.zones) {
    z.time -= DT;
    z.tickAcc += DT;
    const secondTick = z.tickAcc >= 1 - 1e-9;
    if (secondTick) z.tickAcc -= 1;
    const src = world.getUnit(z.sourceId);
    for (const u of [...world.units]) {
      if (!zoneAffects(z, u)) continue;
      for (const e of z.effects) {
        if (e.kind === 'burn') {
          if (u.burnTime <= 0) u.burnTick = 1;
          u.burnTime = Math.max(u.burnTime, TERRAIN.burnDuration);
          u.burnSourceId = z.sourceId;
        } else if (e.kind === 'damage' && secondTick && src) {
          applyDamage(world, u, e.perSecond, 'area', src, { skillId: z.skillId });
        } else if (e.kind === 'heal' && secondTick && !u.dead) {
          const healed = Math.min(e.perSecond, u.maxHp - u.hp);
          if (healed <= 0) continue;
          u.hp += healed;
          if (src) src.stats.healing += healed;
          world.emit({ type: 'heal', sourceId: z.sourceId, targetId: u.id, amount: healed });
        }
        if (u.dead) break;
      }
    }
  }
  world.zones = world.zones.filter((z) => z.time > 0);
}

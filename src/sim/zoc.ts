import type { SimConfig } from './simConfig';
import { SKILLS } from './data/skills';
import type { Unit } from './unit';
import type { Vec } from './math';

/** zoc 判定需要的世界資訊 */
export interface ZocContext {
  readonly units: readonly Unit[];
  readonly config: SimConfig;
  getUnit(id: number): Unit | undefined;
}

const MELEE_TOLERANCE = 0.25;

export function edgeDistance(a: Unit, b: Unit): number {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) - a.radius - b.radius;
}

/** 單位 X 被 E 牽制的距離門檻（中心距離） */
export function zoneDistance(e: Unit, x: Unit, cfg: SimConfig): number {
  return e.radius + cfg.zocRange + x.radius;
}

/** 單位 u 目前近戰攻擊的對象（普攻或近戰技能）；沒有則 -1 */
export function meleeTargetOf(u: Unit): number {
  if (u.dead || !u.order) return -1;
  if (u.order.type === 'attack' && u.isMelee) return u.order.targetId;
  if (u.order.type === 'skill' && u.order.targetId !== undefined) {
    const eff = SKILLS[u.order.skillId]?.effect;
    if (eff && eff.kind === 'strike' && eff.melee) return u.order.targetId;
  }
  return -1;
}

/**
 * E 是否正在與「X 以外」的單位進行近戰：
 * E 正對近戰距離內的其他單位執行近戰攻擊，或正被其他單位近戰攻擊。
 */
export function isEngagedWithOthers(ctx: ZocContext, e: Unit, x: Unit): boolean {
  const t = meleeTargetOf(e);
  if (t >= 0 && t !== x.id) {
    const tu = ctx.getUnit(t);
    if (tu && !tu.dead && edgeDistance(e, tu) <= e.def.range + MELEE_TOLERANCE) return true;
  }
  for (const a of ctx.units) {
    if (a === x || a === e || a.dead) continue;
    if (meleeTargetOf(a) === e.id && edgeDistance(a, e) <= a.def.range + MELEE_TOLERANCE) return true;
  }
  return false;
}

/** E 的控制區此刻對 X 是否有效 */
export function zoneActiveFor(ctx: ZocContext, e: Unit, x: Unit): boolean {
  if (e.dead || x.dead || !e.def.projectsZoc || e.team === x.team) return false;
  if (ctx.config.zocMode === 'off') return false;
  if (ctx.config.zocEngagedException && isEngagedWithOthers(ctx, e, x)) return false;
  return true;
}

/** 在位置 p 時，有哪些敵人牽制 X */
export function pinnersAt(ctx: ZocContext, x: Unit, p: Vec = x.pos): Unit[] {
  const out: Unit[] = [];
  for (const e of ctx.units) {
    if (!zoneActiveFor(ctx, e, x)) continue;
    if (Math.hypot(p.x - e.pos.x, p.y - e.pos.y) <= zoneDistance(e, x, ctx.config)) out.push(e);
  }
  return out;
}

/** 貼身距離：在此距離內可以繞著 E 調整位置（例如走到攻擊站位） */
export const ZOC_CONTACT_SLACK = 0.5;

/**
 * pin 模式下的移動檢查（SPEC §7.1）：被牽制的 X 不能自願移動到離 E 更遠的位置；
 * 可以朝 E 前進，或在貼身距離內繞著 E 調整位置。回傳阻擋者或 null。
 */
export function pinBlocker(ctx: ZocContext, x: Unit, from: Vec, to: Vec): Unit | null {
  if (ctx.config.zocMode !== 'pin') return null;
  for (const e of ctx.units) {
    if (!zoneActiveFor(ctx, e, x)) continue;
    const zone = zoneDistance(e, x, ctx.config);
    const d0 = Math.hypot(from.x - e.pos.x, from.y - e.pos.y);
    if (d0 > zone) continue;
    const d1 = Math.hypot(to.x - e.pos.x, to.y - e.pos.y);
    const contact = e.radius + x.radius + ZOC_CONTACT_SLACK;
    if (d1 > d0 + 1e-6 && d1 > contact) return e;
  }
  return null;
}

/** disengage 模式：X 從 from 移到 to 時離開了哪些敵人的控制區 */
export function disengagedFrom(ctx: ZocContext, x: Unit, from: Vec, to: Vec): Unit[] {
  if (ctx.config.zocMode !== 'disengage') return [];
  const out: Unit[] = [];
  for (const e of ctx.units) {
    if (!zoneActiveFor(ctx, e, x)) continue;
    const zone = zoneDistance(e, x, ctx.config);
    const d0 = Math.hypot(from.x - e.pos.x, from.y - e.pos.y);
    const d1 = Math.hypot(to.x - e.pos.x, to.y - e.pos.y);
    if (d0 <= zone && d1 > zone) out.push(e);
  }
  return out;
}

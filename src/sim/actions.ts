/**
 * 動作狀態機（準備 → 生效 → 恢復）與效果結算（SPEC §5、§6、§10.2）。
 */
import { applyArmor, CRIT_MULT, rollDamage, rollHit } from './combat';
import { DT, RANGE_TOLERANCE, secondsToTicks } from './constants';
import { SKILLS } from './data/skills';
import type { DamageType, SkillDef, UnitDef } from './data/types';
import { dist, norm, sub } from './math';
import type { Unit } from './unit';
import type { Projectile, World } from './world';
import { edgeDistance } from './zoc';

/** 打斷造成的硬直秒數 */
export const INTERRUPT_STUN = 0.5;
/** 近戰普攻生效時，目標可以稍微離開射程的容許距離 */
const MELEE_RELEASE_TOLERANCE = 0.5;

export interface ActionRequest {
  kind: 'attack' | 'skill';
  skillId?: string;
  targetId?: number;
  point?: { x: number; y: number };
}

export function startAction(world: World, u: Unit, req: ActionRequest): void {
  const windup = req.kind === 'attack' ? u.def.windup : SKILLS[req.skillId!].windup;
  const ticks = secondsToTicks(windup / u.def.attackSpeed);
  u.action = {
    kind: req.kind,
    skillId: req.skillId,
    targetId: req.targetId,
    point: req.point,
    phase: 'windup',
    ticksLeft: ticks,
    ticksTotal: ticks,
  };
  u.path = null;
  const tp = req.targetId !== undefined ? world.getUnit(req.targetId)?.pos : req.point;
  if (tp && (tp.x !== u.pos.x || tp.y !== u.pos.y)) u.facing = Math.atan2(tp.y - u.pos.y, tp.x - u.pos.x);
  world.emit({ type: 'actionStart', unitId: u.id, skillId: req.skillId, targetId: req.targetId, point: req.point });
}

export function enterRecovery(u: Unit, seconds: number): void {
  const ticks = secondsToTicks(seconds / u.def.attackSpeed);
  if (!u.action) return;
  u.action.phase = 'recovery';
  u.action.ticksLeft = ticks;
  u.action.ticksTotal = ticks;
}

/** 準備時間結束的那一個節拍：效果生效 */
export function finishWindup(world: World, u: Unit): void {
  const a = u.action!;
  if (a.kind === 'attack') {
    const t = world.getUnit(a.targetId!);
    if (!t || t.dead) {
      u.action = null;
      return;
    }
    if (u.isMelee) {
      if (edgeDistance(u, t) > u.def.range + MELEE_RELEASE_TOLERANCE) {
        // 目標已離開：揮空，動作直接結束
        u.action = null;
        return;
      }
      strike(world, u, t, { melee: true, mult: 1, damageType: basicDamageType(u.def) });
    } else {
      world.spawnProjectile(u, u.def.projectileKind ?? 'arrow', u.def.projectileSpeed ?? 20, { type: 'strike', melee: false, mult: 1, damageType: basicDamageType(u.def) }, { unit: t });
    }
    if (!u.dead && u.action) enterRecovery(u, u.def.recovery);
    return;
  }

  const def = SKILLS[a.skillId!];
  // 消耗一次使用；若沒有正在回復的冷卻就開始計算（冷卻從生效那一刻開始）
  u.charges[def.id] = Math.max(0, (u.charges[def.id] ?? 1) - 1);
  if ((u.cooldowns[def.id] ?? 0) <= 0) u.cooldowns[def.id] = u.skillCooldown(def.id, def.cooldown);
  const target = a.targetId !== undefined ? world.getUnit(a.targetId) : undefined;
  const dash = applySkillEffect(world, u, def, target, a.point);
  if (u.dead || !u.action) return;
  if (dash) {
    a.phase = 'dash';
    a.dashTime = 0;
    a.ticksLeft = 0;
    a.ticksTotal = 0;
    u.path = null;
    return;
  }
  afterSkill(world, u, def, target);
  enterRecovery(u, def.recovery);
}

/** 技能生效後的後續指令：對敵技能接著普攻該目標，否則恢復先前的普攻 */
function afterSkill(world: World, u: Unit, def: SkillDef, target: Unit | undefined): void {
  const resume = u.resumeOrder;
  if (def.target === 'enemy' && target && !target.dead) world.setOrder(u, { type: 'attack', targetId: target.id });
  else world.setOrder(u, resume && resume.type === 'attack' && !world.getUnit(resume.targetId)?.dead ? resume : null);
}

/** 回傳 true 表示進入衝刺階段 */
function applySkillEffect(world: World, u: Unit, def: SkillDef, t: Unit | undefined, point: { x: number; y: number } | undefined): boolean {
  const eff = def.effect;
  switch (eff.kind) {
    case 'strike':
      if (!t || t.dead) return false;
      if (eff.melee) {
        strike(world, u, t, { melee: true, damageType: eff.damageType ?? 'melee', mult: eff.mult, accBonus: eff.accBonus, flatDamage: eff.flatDamage, interrupts: eff.interrupts, stun: eff.stun, knockback: eff.knockback, skillId: def.id });
      } else {
        world.spawnProjectile(
          u,
          eff.projectileKind ?? 'arrow',
          eff.projectileSpeed ?? 24,
          { type: 'strike', melee: false, damageType: eff.damageType ?? 'projectile', mult: eff.mult, accBonus: eff.accBonus, flatDamage: eff.flatDamage, interrupts: eff.interrupts, stun: eff.stun, knockback: eff.knockback, skillId: def.id },
          { unit: t },
        );
      }
      return false;
    case 'aoe':
      if (!point) return false;
      if (eff.projectileSpeed) {
        world.spawnProjectile(u, eff.projectileKind ?? 'fireball', eff.projectileSpeed, { type: 'aoe', skillId: def.id }, { point });
      } else {
        explode(world, u, point, def);
      }
      return false;
    case 'root':
      if (!t || t.dead) return false;
      world.spawnProjectile(u, eff.projectileKind ?? 'frost', eff.projectileSpeed ?? 20, { type: 'root', duration: eff.duration, skillId: def.id }, { unit: t });
      return false;
    case 'heal': {
      if (!t || t.dead) return false;
      const amount = Math.min(eff.amount, t.maxHp - t.hp);
      t.hp += amount;
      u.stats.healing += amount;
      world.emit({ type: 'heal', sourceId: u.id, targetId: t.id, amount });
      return false;
    }
    case 'guard':
      if (!t || t.dead) return false;
      t.guardedBy = u.id;
      t.guardTime = eff.duration;
      t.guardChance = eff.chance;
      world.emit({ type: 'status', unitId: t.id, text: '守護' });
      return false;
    case 'bless':
      for (const a of world.units) {
        if (a.dead || a.team !== u.team || dist(a.pos, u.pos) > eff.radius) continue;
        a.blessTime = eff.duration;
        a.blessAccuracy = eff.accuracy;
        a.blessDefense = eff.defense;
        world.emit({ type: 'status', unitId: a.id, text: '祝福' });
      }
      return false;
    case 'charge':
    case 'tumble':
      return true;
  }
}

/** 衝刺階段（衝鋒、翻滾）：無視控制區 */
export function tickDash(world: World, u: Unit): void {
  const a = u.action!;
  const def = SKILLS[a.skillId!];
  const eff = def.effect;
  a.dashTime = (a.dashTime ?? 0) + DT;
  if (eff.kind === 'charge') {
    const t = world.getUnit(a.targetId!);
    if (!t || t.dead) {
      enterRecovery(u, def.recovery);
      afterSkill(world, u, def, undefined);
      return;
    }
    const inRange = (): boolean => edgeDistance(u, t) <= u.def.range + RANGE_TOLERANCE;
    if (!inRange()) {
      const grid = world.navFor(u);
      const slot = world.slots.claim(t.id, t.pos, t.radius, u.id, u.pos, u.radius, (p) => grid.isWalkable(p));
      const r = world.moveAlong(u, slot.pos, { speed: u.def.moveSpeed * eff.speedMult, ignoreZoc: true, ignoreRoot: true, stopDist: 0.05 });
      if (r === 'nopath' || a.dashTime > eff.maxDuration) {
        enterRecovery(u, def.recovery);
        afterSkill(world, u, def, t);
        return;
      }
    }
    if (inRange()) {
      strike(world, u, t, { melee: true, mult: 1, damageType: basicDamageType(u.def), skillId: def.id });
      if (u.dead || !u.action) return;
      enterRecovery(u, def.recovery);
      afterSkill(world, u, def, t);
    }
    return;
  }
  if (eff.kind === 'tumble') {
    const r = world.moveAlong(u, a.point!, { speed: eff.speed, ignoreZoc: true, ignoreRoot: true, stopDist: 0.05 });
    if (r === 'arrived' || r === 'nopath' || a.dashTime > 1.5) {
      enterRecovery(u, def.recovery);
      afterSkill(world, u, def, undefined);
    }
    return;
  }
  enterRecovery(u, def.recovery);
}

/** 普攻的傷害類型 */
export function basicDamageType(def: UnitDef): DamageType {
  return def.attackDamageType ?? (def.range < 1 ? 'melee' : 'projectile');
}

export interface StrikeParams {
  melee: boolean;
  damageType: DamageType;
  mult: number;
  accBonus?: number;
  flatDamage?: [number, number];
  interrupts?: boolean;
  stun?: number;
  knockback?: number;
  skillId?: string;
  freeAttack?: boolean;
}

/** 單體攻擊結算：命中判定 → 傷害 → 打斷／暈眩／擊退 */
export function strike(world: World, src: Unit, tgt: Unit, p: StrikeParams): void {
  if (tgt.dead) return;
  let target = tgt;
  // 守護：近戰攻擊有機率改由戰士承受
  if (p.melee && target.guardTime > 0 && target.guardedBy >= 0) {
    const g = world.getUnit(target.guardedBy);
    if (g && !g.dead && g !== src && g !== target && world.rng.chance(target.guardChance)) {
      world.emit({ type: 'guardRedirect', guardId: g.id, protectedId: target.id });
      target = g;
    }
  }
  const { result } = rollHit(world.rng, src.accuracy + (p.accBonus ?? 0), target.defense);
  if (result === 'miss') {
    world.emit({ type: 'miss', sourceId: src.id, targetId: target.id, skillId: p.skillId, freeAttack: p.freeAttack });
    if (target.team === 'enemy') world.triggerAggro();
    return;
  }
  const crit = result === 'crit';
  const base = rollDamage(world.rng, p.flatDamage ?? src.def.damage, p.mult * src.outgoingDamageMult);
  const final = applyArmor(base * (crit ? CRIT_MULT : 1), target.armor);
  applyDamage(world, target, final, p.damageType, src, { crit, skillId: p.skillId, freeAttack: p.freeAttack });
  if (target.dead) return;
  if (p.interrupts) interrupt(world, src, target);
  if (p.stun) applyStun(world, target, p.stun);
  if (p.knockback) knockback(world, src, target, p.knockback);
}

/**
 * 傷害結算的唯一入口（SPEC §19.6）。之後的隨從系統會在這裡插入「小隊抽選」與抗性步驟；
 * 範圍效果會對範圍內每個受體各自呼叫一次。
 */
export function applyDamage(
  world: World,
  target: Unit,
  amount: number,
  damageType: DamageType,
  src: Unit,
  opts: { crit?: boolean; skillId?: string; freeAttack?: boolean } = {},
): void {
  const { crit = false, skillId, freeAttack } = opts;
  const dealt = Math.min(amount, target.hp);
  target.hp -= amount;
  src.stats.damageDealt += dealt;
  target.stats.damageTaken += dealt;
  world.emit({ type: 'hit', sourceId: src.id, targetId: target.id, damage: amount, crit, damageType, skillId, freeAttack });
  if (target.team === 'enemy') world.triggerAggro();
  if (target.hp <= 0) kill(world, target, src);
}

export function kill(world: World, u: Unit, killer?: Unit): void {
  u.hp = 0;
  u.dead = true;
  u.action = null;
  u.order = null;
  u.nextOrder = undefined;
  u.resumeOrder = null;
  u.path = null;
  u.stunTime = 0;
  u.rootTime = 0;
  world.slots.release(u.id);
  world.slots.releaseTarget(u.id);
  if (killer && killer !== u) killer.stats.kills++;
  world.emit({ type: 'death', unitId: u.id, killerId: killer?.id });
}

/** 打斷：準備中的動作取消、不進冷卻，並硬直 0.5 秒 */
export function interrupt(world: World, src: Unit, t: Unit): boolean {
  if (!t.action || t.action.phase !== 'windup') return false;
  const { skillId, point } = t.action;
  t.action = null;
  if (!t.def.interruptStunImmune) t.stunTime = Math.max(t.stunTime, INTERRUPT_STUN);
  world.emit({ type: 'interrupt', sourceId: src.id, targetId: t.id, skillId, point });
  return true;
}

export function applyStun(world: World, t: Unit, seconds: number): void {
  t.stunTime = Math.max(t.stunTime, seconds);
  if (t.action) {
    t.action = null;
    if (t.nextOrder !== undefined) {
      world.setOrder(t, t.nextOrder);
      t.nextOrder = undefined;
    }
  }
  world.emit({ type: 'status', unitId: t.id, text: '暈眩' });
}

export function knockback(world: World, src: Unit, t: Unit, distance: number): void {
  let dir = norm(sub(t.pos, src.pos));
  if (dir.x === 0 && dir.y === 0) dir = { x: Math.cos(src.facing), y: Math.sin(src.facing) };
  const grid = world.navFor(t);
  const from = { x: t.pos.x, y: t.pos.y };
  let cur = from;
  const steps = Math.ceil(distance / 0.1);
  for (let i = 1; i <= steps; i++) {
    const d = Math.min(distance, i * 0.1);
    const np = { x: from.x + dir.x * d, y: from.y + dir.y * d };
    if (!grid.isWalkable(np)) break;
    cur = np;
  }
  t.pos = cur;
  t.path = null;
  world.emit({ type: 'knockback', unitId: t.id, from, to: { ...cur } });
}

/** 範圍傷害（火球、獄火）：不做命中判定，友軍傷害倍率見設定 */
export function explode(world: World, src: Unit, point: { x: number; y: number }, def: SkillDef): void {
  const eff = def.effect;
  if (eff.kind !== 'aoe') return;
  world.emit({ type: 'aoe', sourceId: src.id, point: { ...point }, radius: eff.radius, skillId: def.id });
  for (const u of world.units) {
    if (u.dead) continue;
    if (dist(u.pos, point) > eff.radius + u.radius * 0.5) continue;
    const ally = u.team === src.team;
    if (ally && !eff.friendlyFire) continue;
    const mult = (ally ? world.config.friendlyFireMultiplier : 1) * src.outgoingDamageMult;
    if (mult <= 0) continue;
    const dmg = rollDamage(world.rng, eff.damage, mult);
    applyDamage(world, u, applyArmor(dmg, u.armor), 'area', src, { skillId: def.id });
    if (!u.dead && eff.interrupts) interrupt(world, src, u);
  }
}

/** disengage 模式：離開控制區時被免費攻擊一次 */
export function freeAttack(world: World, e: Unit, x: Unit): void {
  if (e.dead || x.dead || e.stunTime > 0) return;
  strike(world, e, x, { melee: true, mult: 1, damageType: 'melee', freeAttack: true });
}

export function resolveProjectilePayload(world: World, src: Unit, p: Projectile, target: Unit | undefined): void {
  const pl = p.payload;
  switch (pl.type) {
    case 'strike':
      if (target) strike(world, src, target, pl);
      break;
    case 'aoe':
      explode(world, src, p.point!, SKILLS[pl.skillId]);
      break;
    case 'root':
      if (target && !target.dead) {
        target.rootTime = Math.max(target.rootTime, pl.duration);
        target.path = null;
        world.emit({ type: 'status', unitId: target.id, text: '定身' });
        if (target.team === 'enemy') world.triggerAggro();
      }
      break;
  }
}

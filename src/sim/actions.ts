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
import { T_SHALLOW } from './terrain';
import { TERRAIN } from './data/terrain';
import { COMBOS } from './data/combos';

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

/** 行動條速度：攻擊速度 × 全域倍率 × 詛咒減速 */
export function actionRate(world: World, u: Unit): number {
  return u.def.attackSpeed * world.config.actionSpeedMult * (u.curseTime > 0 ? 1 - u.curseSlow : 1);
}

export function startAction(world: World, u: Unit, req: ActionRequest): void {
  const windup = req.kind === 'attack' ? u.def.windup : SKILLS[req.skillId!].windup;
  const ticks = secondsToTicks(windup / actionRate(world, u));
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

export function enterRecovery(world: World, u: Unit, seconds: number): void {
  const ticks = secondsToTicks(seconds / actionRate(world, u));
  if (!u.action) return;
  u.action.phase = 'recovery';
  u.action.ticksLeft = ticks;
  u.action.ticksTotal = ticks;
}

/** 準備時間結束的那一個節拍：效果生效 */
export function finishWindup(world: World, u: Unit): void {
  const a = u.action!;
  // 攻擊或施法會暴露草叢中的位置，並解除煙霧彈的隱匿
  u.revealTime = TERRAIN.revealAfterAttack;
  u.stealthTime = 0;
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
      world.spawnProjectile(u, u.def.projectileKind ?? 'arrow', u.def.projectileSpeed ?? 20, { type: 'strike', melee: false, mult: 1, damageType: basicDamageType(u.def), arc: u.def.arcAttack }, { unit: t });
    }
    if (!u.dead && u.action) enterRecovery(world, u, u.def.recovery);
    return;
  }

  const def = SKILLS[a.skillId!];
  if (def.oncePerBattle) u.spentSkills.push(def.id);
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
  enterRecovery(world, u, def.recovery);
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
        strike(world, u, t, {
          melee: true, damageType: eff.damageType ?? 'melee', mult: eff.mult, accBonus: eff.accBonus, flatDamage: eff.flatDamage,
          interrupts: eff.interrupts, stun: eff.stun, knockback: eff.knockback, skillId: def.id,
          shatters: eff.shatters, behindMult: eff.behindMult, critVsStunned: eff.critVsStunned, wallStun: eff.wallStun,
        });
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
        // 祝福與戰吼共用同一組增益：重疊時各項取較高者
        const active = a.blessTime > 0;
        a.blessTime = Math.max(active ? a.blessTime : 0, eff.duration);
        a.blessAccuracy = Math.max(active ? a.blessAccuracy : 0, eff.accuracy);
        a.blessDefense = Math.max(active ? a.blessDefense : 0, eff.defense);
        world.emit({ type: 'status', unitId: a.id, text: def.name });
      }
      return false;
    case 'cone': {
      if (!point) return false;
      world.emit({ type: 'aoe', sourceId: u.id, point: { ...u.pos }, radius: eff.radius, skillId: def.id });
      const dir = Math.atan2(point.y - u.pos.y, point.x - u.pos.x);
      const half = (eff.angle / 2) * (Math.PI / 180);
      for (const t of world.units) {
        if (t.dead || t === u || (!eff.friendlyFire && t.team === u.team)) continue;
        const d = dist(t.pos, u.pos);
        if (d > eff.radius + t.radius) continue;
        let da = Math.atan2(t.pos.y - u.pos.y, t.pos.x - u.pos.x) - dir;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        // 貼身的單位就算角度偏一點也算在內
        if (Math.abs(da) > half + Math.atan2(t.radius, Math.max(d, 0.01))) continue;
        const dmg = rollDamage(world.rng, eff.damage, damageMultOf(world, u));
        applyDamage(world, t, applyArmor(dmg, t.armor), 'area', u, { skillId: def.id });
      }
      return false;
    }
    case 'warcry': {
      world.emit({ type: 'warcry', unitId: u.id });
      const pts = world.map.summonPoints ?? [];
      for (let i = 0; i < eff.summon.count; i++) {
        const p = pts.length ? pts[i % pts.length] : { x: world.map.width - 1, y: world.map.height / 2 };
        const s = world.spawnUnit(world.enemyDefFor(eff.summon.enemy), p, u.id);
        s.damageBuffMult = Math.max(s.damageBuffMult, 1);
      }
      for (const a of world.units) {
        if (a.dead || a.team !== u.team) continue;
        a.damageBuffMult = eff.damageBuff;
        a.damageBuffTime = eff.duration;
      }
      return false;
    }
    case 'whirlwind':
      world.emit({ type: 'aoe', sourceId: u.id, point: { ...u.pos }, radius: eff.radius, skillId: def.id });
      for (const t of [...world.units]) {
        if (t.dead || t.team === u.team || dist(t.pos, u.pos) > eff.radius + t.radius) continue;
        strike(world, u, t, { melee: true, damageType: 'melee', mult: eff.mult, shatters: eff.shatters, skillId: def.id });
        if (u.dead) break;
      }
      return false;
    case 'curse':
      if (!t || t.dead) return false;
      world.spawnProjectile(u, eff.projectileKind ?? 'curse', eff.projectileSpeed ?? 20, { type: 'curse', duration: eff.duration, actionSlow: eff.actionSlow, damageTakenPct: eff.damageTakenPct, skillId: def.id }, { unit: t });
      return false;
    case 'smoke':
      u.stealthTime = eff.duration;
      u.revealTime = 0;
      world.emit({ type: 'aoe', sourceId: u.id, point: { ...u.pos }, radius: 1.2, skillId: def.id });
      world.emit({ type: 'status', unitId: u.id, text: '煙霧' });
      return false;
    case 'zone':
      if (!point) return false;
      world.zones.push({ point: { ...point }, radius: eff.radius, time: eff.duration, moveMult: eff.moveMult, team: u.team, skillId: def.id });
      world.emit({ type: 'aoe', sourceId: u.id, point: { ...point }, radius: eff.radius, skillId: def.id });
      return false;
    case 'aoeHeal':
      if (!point) return false;
      if (eff.projectileSpeed) world.spawnProjectile(u, eff.projectileKind ?? 'flask', eff.projectileSpeed, { type: 'aoeHeal', skillId: def.id }, { point });
      else healArea(world, u, point, def);
      return false;
    case 'charge':
    case 'tumble':
      return true;
  }
}

/** 範圍治療：範圍內的友軍各自恢復 */
function healArea(world: World, src: Unit, point: { x: number; y: number }, def: SkillDef): void {
  const eff = def.effect;
  if (eff.kind !== 'aoeHeal') return;
  world.emit({ type: 'aoe', sourceId: src.id, point: { ...point }, radius: eff.radius, skillId: def.id });
  for (const a of world.units) {
    if (a.dead || a.team !== src.team || dist(a.pos, point) > eff.radius + a.radius * 0.5) continue;
    const amount = Math.min(eff.amount, a.maxHp - a.hp);
    if (amount <= 0) continue;
    a.hp += amount;
    src.stats.healing += amount;
    world.emit({ type: 'heal', sourceId: src.id, targetId: a.id, amount });
  }
}

/** 攻擊者是否在目標背後（夾角大於 COMBOS.behindAngleDeg） */
export function isBehind(src: Unit, target: Unit): boolean {
  const dx = src.pos.x - target.pos.x;
  const dy = src.pos.y - target.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const cos = (Math.cos(target.facing) * dx + Math.sin(target.facing) * dy) / len;
  return cos < Math.cos((COMBOS.behindAngleDeg * Math.PI) / 180);
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
      enterRecovery(world, u, def.recovery);
      afterSkill(world, u, def, undefined);
      return;
    }
    const inRange = (): boolean => edgeDistance(u, t) <= u.def.range + RANGE_TOLERANCE;
    if (!inRange()) {
      const grid = world.navFor(u);
      const slot = world.slots.claim(t.id, t.pos, t.radius, u.id, u.pos, u.radius, (p) => grid.isWalkable(p));
      const r = world.moveAlong(u, slot.pos, { speed: u.def.moveSpeed * eff.speedMult, ignoreZoc: true, ignoreRoot: true, stopDist: 0.05 });
      if (r === 'nopath' || a.dashTime > eff.maxDuration) {
        enterRecovery(world, u, def.recovery);
        afterSkill(world, u, def, t);
        return;
      }
    }
    if (inRange()) {
      strike(world, u, t, { melee: true, mult: 1, damageType: basicDamageType(u.def), skillId: def.id, knockback: eff.knockback });
      if (u.dead || !u.action) return;
      enterRecovery(world, u, def.recovery);
      afterSkill(world, u, def, t);
    }
    return;
  }
  if (eff.kind === 'tumble') {
    const r = world.moveAlong(u, a.point!, { speed: eff.speed, ignoreZoc: true, ignoreRoot: true, stopDist: 0.05 });
    if (r === 'arrived' || r === 'nopath' || a.dashTime > 1.5) {
      enterRecovery(world, u, def.recovery);
      afterSkill(world, u, def, undefined);
    }
    return;
  }
  enterRecovery(world, u, def.recovery);
}

/** 普攻的傷害類型 */
export function basicDamageType(def: UnitDef): DamageType {
  return def.attackDamageType ?? (def.range < 1 ? 'melee' : 'projectile');
}

/** 造成傷害的總倍率：單位自身（強化、增益）× 我方傷害倍率設定 */
export function damageMultOf(world: World, u: Unit): number {
  // 狂戰士：生命越低傷害越高
  const lowHp = u.def.lowHpDamageBonus ? 1 + u.def.lowHpDamageBonus * (1 - Math.max(0, u.hp) / u.maxHp) : 1;
  return u.outgoingDamageMult * lowHp * (u.team === 'hero' ? world.config.heroDamageMult : 1);
}

export interface StrikeParams {
  melee: boolean;
  /** 拋物線攻擊：不受掩體影響 */
  arc?: boolean;
  /** 發射位置（投射物）；省略時用攻擊者目前位置 */
  origin?: { x: number; y: number };
  damageType: DamageType;
  mult: number;
  accBonus?: number;
  flatDamage?: [number, number];
  interrupts?: boolean;
  stun?: number;
  knockback?: number;
  /** 碎冰：定身中的目標額外傷害並解除定身 */
  shatters?: boolean;
  /** 從背後攻擊的傷害倍率 */
  behindMult?: number;
  /** 暈眩中的目標必定爆擊 */
  critVsStunned?: boolean;
  /** 擊退撞牆時額外暈眩 */
  wallStun?: boolean;
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
  // 地形修正：淺水防禦下降、矮籬掩體、由低打高命中下降、高地傷害加成
  let defense = target.defense;
  let accuracy = src.accuracy + (p.accBonus ?? 0);
  let terrainMult = 1;
  if (!p.melee && !p.arc) {
    // 掩體：矮籬與「射入混戰」（路徑上有其他單位）取較高者
    const origin = p.origin ?? src.pos;
    const hedge = world.terrain.any && world.hasCover(origin, target) ? TERRAIN.hedgeCoverDefense : 0;
    const body = world.hasBodyCover(origin, target, src.id) ? TERRAIN.bodyCoverDefense : 0;
    defense += Math.max(hedge, body);
  }
  if (world.terrain.any) {
    if (world.terrain.has(target.pos, T_SHALLOW)) defense += TERRAIN.shallowDefense;
    if (!p.melee) {
      const srcHigh = world.onHigh(src);
      if (!srcHigh && world.onHigh(target)) accuracy += TERRAIN.lowToHighAccuracy;
      if (srcHigh) terrainMult = TERRAIN.highDamageMult;
    }
  }
  // 背刺暈眩中的目標：必定爆擊（不做命中判定）
  const forcedCrit = !!p.critVsStunned && target.stunTime > 0;
  const result = forcedCrit ? 'crit' : rollHit(world.rng, accuracy, defense).result;
  if (result === 'miss') {
    world.emit({ type: 'miss', sourceId: src.id, targetId: target.id, skillId: p.skillId, freeAttack: p.freeAttack });
    if (target.team === 'enemy') world.triggerAggro();
    return;
  }
  const crit = result === 'crit';
  let comboMult = 1;
  if (p.melee) {
    const behind = isBehind(src, target);
    if (behind && p.behindMult) comboMult *= p.behindMult;
    else if (behind && !p.skillId && src.def.backstabMult) comboMult *= src.def.backstabMult;
    if (p.shatters && target.rootTime > 0) {
      comboMult *= COMBOS.shatterMult;
      target.rootTime = 0;
      world.emit({ type: 'status', unitId: target.id, text: '碎冰' });
    }
  }
  const base = rollDamage(world.rng, p.flatDamage ?? src.def.damage, p.mult * damageMultOf(world, src) * terrainMult * comboMult);
  const final = applyArmor(base * (crit ? CRIT_MULT : 1), target.armor);
  applyDamage(world, target, final, p.damageType, src, { crit, skillId: p.skillId, freeAttack: p.freeAttack });
  if (target.dead) return;
  if (p.interrupts) interrupt(world, src, target);
  if (p.stun) applyStun(world, target, p.stun);
  if (p.knockback) {
    const hitWall = knockback(world, src, target, p.knockback);
    if (hitWall && p.wallStun && !target.dead) {
      world.emit({ type: 'status', unitId: target.id, text: '撞牆' });
      applyStun(world, target, COMBOS.wallStunSeconds);
    }
  }
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
  // 衰弱詛咒：受到傷害增加
  if (target.curseTime > 0) amount = Math.round(amount * (1 + target.curseVuln));
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
  if (skillId && SKILLS[skillId].lostOnInterrupt && !t.spentSkills.includes(skillId)) t.spentSkills.push(skillId);
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

/** 擊退；回傳 true 表示途中撞到障礙物 */
export function knockback(world: World, src: Unit, t: Unit, distance: number): boolean {
  let dir = norm(sub(t.pos, src.pos));
  if (dir.x === 0 && dir.y === 0) dir = { x: Math.cos(src.facing), y: Math.sin(src.facing) };
  const grid = world.navFor(t);
  const from = { x: t.pos.x, y: t.pos.y };
  let cur = from;
  const steps = Math.ceil(distance / 0.1);
  let hitWall = false;
  for (let i = 1; i <= steps; i++) {
    const d = Math.min(distance, i * 0.1);
    const np = { x: from.x + dir.x * d, y: from.y + dir.y * d };
    if (!grid.isWalkable(np)) {
      hitWall = true;
      break;
    }
    cur = np;
  }
  t.pos = cur;
  t.path = null;
  world.emit({ type: 'knockback', unitId: t.id, from, to: { ...cur } });
  return hitWall;
}

/** 範圍傷害（火球、獄火）：不做命中判定，友軍傷害倍率見設定 */
export function explode(world: World, src: Unit, point: { x: number; y: number }, def: SkillDef): void {
  const eff = def.effect;
  if (eff.kind !== 'aoe') return;
  world.emit({ type: 'aoe', sourceId: src.id, point: { ...point }, radius: eff.radius, skillId: def.id });
  if (eff.ignites) world.ignite(point, eff.radius, src.id);
  for (const u of world.units) {
    if (u.dead) continue;
    if (dist(u.pos, point) > eff.radius + u.radius * 0.5) continue;
    const ally = u.team === src.team;
    if (ally && !eff.friendlyFire) continue;
    const mult = (ally ? world.config.friendlyFireMultiplier : 1) * damageMultOf(world, src);
    if (mult <= 0) continue;
    const dmg = rollDamage(world.rng, eff.damage, mult);
    applyDamage(world, u, applyArmor(dmg, u.armor), 'area', src, { skillId: def.id });
    if (!u.dead && eff.interrupts) interrupt(world, src, u);
    if (!u.dead && eff.burns) {
      if (u.burnTime <= 0) u.burnTick = 1;
      u.burnTime = Math.max(u.burnTime, TERRAIN.burnDuration);
      u.burnSourceId = src.id;
      world.emit({ type: 'status', unitId: u.id, text: '燃燒' });
    }
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
      if (target) strike(world, src, target, { ...pl, origin: p.origin });
      break;
    case 'aoe':
      explode(world, src, p.point!, SKILLS[pl.skillId]);
      break;
    case 'curse':
      if (target && !target.dead) {
        target.curseTime = pl.duration;
        target.curseSlow = pl.actionSlow;
        target.curseVuln = pl.damageTakenPct;
        world.emit({ type: 'status', unitId: target.id, text: '詛咒' });
        if (target.team === 'enemy') world.triggerAggro();
      }
      break;
    case 'aoeHeal':
      healArea(world, src, p.point!, SKILLS[pl.skillId]);
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

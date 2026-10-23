/**
 * 動作狀態機（準備 → 生效 → 恢復）與效果結算（SPEC §5、§6、§10.2）。
 */
import { tr } from '../i18n/lang';
import { applyArmor, CRIT_MULT, rollDamage, rollHit } from './combat';
import { AFFINITY, BACKSTAB_ACCURACY, BASIC_ATTACK, critTierOf, DAMAGE_FORMULA, SKILL_ATTACK, SPEC_DEFENSE } from './data/damageTypes';
import type { AttackInfo, CritTier, DamageCategory } from './data/damageTypes';
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
import type { BasicAttackStyle } from './data/horde';
import { HORDE_ATTACKS, HORDE_CHAIN } from './data/horde';
import { addZone, wardReduction } from './zones';
import { advanceCycleOnCast, chargeCycleOnHit } from './cycle';
import { breakFocus, consumeFocus, focusing, startFocus } from './focus';

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

/** 行動條速度：攻擊速度 × 全域倍率 × 詛咒減速（怪群模式的英雄普攻另外加速） */
export function actionRate(world: World, u: Unit, kind?: 'attack' | 'skill'): number {
  let r = u.def.attackSpeed * world.config.actionSpeedMult * (u.curseTime > 0 ? 1 - u.curseSlow : 1) * (u.chillTime > 0 ? 1 - u.chillSlow : 1);
  if (kind === 'attack') r *= 1 + u.mods.attackSpeedPct;
  // 隨從（比照敵人小兵）吃敵人的攻速倍率，不吃英雄的
  if (kind === 'attack' && (u.team === 'enemy' || u.follower)) r *= world.config.enemyAttackSpeedMult;
  if (kind === 'attack' && u.isHero) {
    r *= world.config.basicAttackSpeedMult;
    const style = hordeStyle(world, u);
    // 狂戰士：生命越低攻速越快
    if (style?.kind === 'cleave' && style.lowHpSpeed) r *= 1 + style.lowHpSpeed * (1 - Math.max(0, u.hp) / u.maxHp);
  }
  return r;
}

/**
 * 英雄的普攻方式：怪群模式用 HORDE_ATTACKS；沉穩節奏用被動（職業被動提供，SPEC_SLICE5 §14）；戰術模式沒有。
 */
export function hordeStyle(world: World, u: Unit): BasicAttackStyle | undefined {
  if (!u.isHero) return undefined;
  if (world.config.battleStyle === 'horde') return HORDE_ATTACKS[u.def.id];
  if (world.config.battleStyle === 'deliberate') return u.passives.find((p) => p.attack)?.attack;
  return undefined;
}

/** 被動的普攻命中效果（SPEC_SLICE5 §14）：每第 N 擊、機率觸發的暈眩／定身 */
function passiveOnHit(world: World, src: Unit, t: Unit): void {
  src.basicHits++;
  for (const p of src.passives) {
    for (const e of p.onHit ?? []) {
      if (e.every && src.basicHits % e.every !== 0) continue;
      if (e.chance !== undefined && !world.rng.chance(e.chance)) continue;
      if (e.kind === 'stun') applyStun(world, t, e.duration ?? 0.5);
      else if (e.kind === 'root') {
        t.rootTime = Math.max(t.rootTime, e.duration ?? 1);
        t.path = null;
        world.emit({ type: 'status', unitId: t.id, text: tr("定身") });
      } else if (e.kind === 'burn') {
        if (t.burnTime <= 0) t.burnTick = 1;
        t.burnTime = Math.max(t.burnTime, e.duration ?? TERRAIN.burnDuration);
        t.burnSourceId = src.id;
        world.emit({ type: 'status', unitId: t.id, text: tr("燃燒") });
      } else if (e.kind === 'sunder') {
        t.sunderStacks = Math.min(e.maxStacks ?? 1, (t.sunderTime > 0 ? t.sunderStacks : 0) + 1);
        t.sunderArmor = Math.max(t.sunderTime > 0 ? t.sunderArmor : 0, e.armor ?? 1);
        t.sunderTime = e.duration ?? 4;
        world.emit({ type: 'status', unitId: t.id, text: tr("破甲 {0}", { 0: t.sunderStacks }) });
      } else if (e.lingering) {
        addZone(world, src, t.pos, e.radius ?? 1.5, e.lingering, p.id);
      }
      world.emit({ type: 'notice', unitId: src.id, text: p.name });
    }
  }
}

/** 技能冷卻（個別修飾 × 全域倍率） */
export function skillCooldownOf(world: World, u: Unit, skillId: string): number {
  return u.skillCooldown(skillId, SKILLS[skillId].cooldown) * world.config.skillCooldownMult;
}

export function startAction(world: World, u: Unit, req: ActionRequest): void {
  const windup = req.kind === 'attack' ? u.def.windup : SKILLS[req.skillId!].windup;
  let ticks = secondsToTicks(windup / actionRate(world, u, req.kind));
  // 擊殺重置／擊殺後立即射出：這一擊沒有準備時間
  if (req.kind === 'attack' && u.attackResetPending) {
    u.attackResetPending = false;
    ticks = 1;
  }
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
  if (!u.action) return;
  const ticks = secondsToTicks(seconds / actionRate(world, u, u.action.kind));
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
      const style = hordeStyle(world, u);
      if (style) hordeMelee(world, u, t, style);
      else strike(world, u, t, { melee: true, mult: 1, damageType: basicDamageType(u.def), basic: true });
    } else {
      const style = hordeStyle(world, u);
      world.spawnProjectile(
        u,
        u.basicProjectile,
        u.def.projectileSpeed ?? 20,
        { type: 'strike', melee: false, mult: 1, damageType: basicDamageType(u.def), arc: u.def.arcAttack, basic: true, pierceLeft: style?.kind === 'pierce' ? style.maxTargets - 1 : undefined },
        { unit: t },
      );
    }
    // 擊殺重置：不必等恢復
    if (!u.dead && u.action) enterRecovery(world, u, u.attackResetPending ? 0 : u.def.recovery);
    return;
  }

  const def = SKILLS[a.skillId!];
  if (def.oncePerBattle) u.spentSkills.push(def.id);
  // 消耗一次使用；若沒有正在回復的冷卻就開始計算（冷卻從生效那一刻開始）
  u.charges[def.id] = Math.max(0, (u.charges[def.id] ?? 1) - 1);
  if ((u.cooldowns[def.id] ?? 0) <= 0) u.cooldowns[def.id] = skillCooldownOf(world, u, def.id);
  // 集中中放出的傷害技能：用掉集中、威力放大（SPEC_CLASSES §2）
  const power = def.effect.kind === 'strike' && focusing(u) ? consumeFocus(world, u) : 1;
  // 技能循環：換下一招（SPEC_SLICE5 §16）
  advanceCycleOnCast(u, def.id);
  const target = a.targetId !== undefined ? world.getUnit(a.targetId) : undefined;
  const dash = applySkillEffect(world, u, def, target, a.point, power);
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

// ───────────── 怪群模式的普攻命中效果（SPEC_SLICE4 §3.1） ─────────────

const DEG = Math.PI / 180;

/** 近戰普攻：橫掃、聖鎚、刺擊 */
function hordeMelee(world: World, u: Unit, t: Unit, style: BasicAttackStyle): void {
  const base: StrikeParams = { melee: true, mult: 1, damageType: basicDamageType(u.def), basic: true };
  switch (style.kind) {
    case 'cleave': {
      u.attackCount++;
      const heavy = style.heavyEvery > 0 && u.attackCount % style.heavyEvery === 0;
      const p: StrikeParams = heavy ? { ...base, mult: style.heavyMult, knockback: style.heavyKnockback, skillId: 'cleave' } : base;
      const dir = Math.atan2(t.pos.y - u.pos.y, t.pos.x - u.pos.x);
      const half = (style.angle / 2) * DEG;
      const reach = u.def.range + MELEE_RELEASE_TOLERANCE;
      const victims = [t];
      for (const o of world.units) {
        if (o === t || o.dead || o.team === u.team || edgeDistance(u, o) > reach) continue;
        let da = Math.atan2(o.pos.y - u.pos.y, o.pos.x - u.pos.x) - dir;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) <= half) victims.push(o);
      }
      if (heavy) world.emit({ type: 'aoe', sourceId: u.id, point: { ...u.pos }, radius: reach + u.radius, skillId: 'cleave' });
      for (const v of victims) {
        strike(world, u, v, p);
        if (u.dead) break;
      }
      return;
    }
    case 'smite': {
      if (strike(world, u, t, { ...base, knockback: style.knockback, interrupts: style.interrupts })) healLowestAlly(world, u, style.heal, style.healRadius);
      return;
    }
    case 'reset':
      strike(world, u, t, base);
      if (t.dead) u.attackResetPending = true;
      return;
    default:
      strike(world, u, t, base);
  }
}

/** 回復生命（吸血、吸取用）；回傳實際回復量 */
function restoreHp(world: World, src: Unit, t: Unit, amount: number): number {
  const healed = Math.min(Math.round(amount), t.maxHp - t.hp);
  if (healed <= 0 || t.dead) return 0;
  t.hp += healed;
  src.stats.healing += healed;
  world.emit({ type: 'heal', sourceId: src.id, targetId: t.id, amount: healed });
  return healed;
}

/** 吸血技能：敵人走減傷公式；我方直接扣（不會扣到死）；吸到的量依 convert 轉成自己的生命 */
function drain(world: World, u: Unit, t: Unit, def: SkillDef): void {
  const eff = def.effect;
  if (eff.kind !== 'drain') return;
  const ally = t.team === u.team;
  const d = ally ? eff.ally : eff.enemy;
  const raw = world.rng.int(d.damage[0], d.damage[1]) * skillPower(world, u);
  const amount = ally ? Math.min(Math.max(1, Math.round(raw)), Math.max(0, t.hp - 1)) : mitigate(world, u, t, raw, def.id, 'spell');
  if (amount <= 0) return;
  const before = t.hp;
  applyDamage(world, t, amount, 'spell', u, { skillId: def.id });
  restoreHp(world, u, u, (before - Math.max(0, t.hp)) * d.convert);
}

/** 聖鎚：為附近生命比例最低的隊友（含自己）回復 */
function healLowestAlly(world: World, u: Unit, amount: number, radius: number): void {
  let best: Unit | null = null;
  for (const a of world.units) {
    if (a.dead || a.team !== u.team || a.hp >= a.maxHp || dist(a.pos, u.pos) > radius) continue;
    if (!best || a.hp / a.maxHp < best.hp / best.maxHp) best = a;
  }
  if (!best) return;
  const healed = Math.min(amount, best.maxHp - best.hp);
  best.hp += healed;
  u.stats.healing += healed;
  world.emit({ type: 'heal', sourceId: u.id, targetId: best.id, amount: healed });
}

/** 擲人落地：落點 radius 內、被丟的人那一隊的單位（含被丟的人）受到傷害 */
export function landHurl(world: World, src: Unit, thrown: Unit, point: { x: number; y: number }, def: SkillDef): void {
  const eff = def.effect;
  if (eff.kind !== 'hurl') return;
  world.emit({ type: 'aoe', sourceId: src.id, point: { ...point }, radius: eff.radius, skillId: def.id });
  for (const o of [...world.units]) {
    if (o.dead || o.team !== thrown.team || dist(o.pos, point) > eff.radius + o.radius * 0.5) continue;
    const dmg = rollDamage(world.rng, eff.damage, damageMultOf(world, src));
    applyDamage(world, o, mitigate(world, src, o, dmg, def.id, 'area'), 'area', src, { skillId: def.id });
  }
}

/** 範圍濺射：不做命中判定、不傷友軍；push > 0 時把範圍內的雜兵推開 */
function splashAround(world: World, src: Unit, point: { x: number; y: number }, exclude: Unit, radius: number, mult: number, push: number): void {
  world.emit({ type: 'aoe', sourceId: src.id, point: { ...point }, radius, skillId: 'splash' });
  for (const o of [...world.units]) {
    if (o.dead || o.team === src.team || dist(o.pos, point) > radius + o.radius * 0.5) continue;
    if (o !== exclude) {
      const dmg = rollDamage(world.rng, src.def.damage, mult * damageMultOf(world, src));
      applyDamage(world, o, mitigate(world, src, o, dmg, 'splash', 'area'), 'area', src, { skillId: 'splash' });
    }
    if (push > 0 && !o.dead && o.def.tier === 'fodder') knockbackFrom(world, src, point, o, push);
  }
}

/** 遠程普攻命中後的效果：穿透、爆裂、咒彈、拋瓶 */
function afterBasicRanged(world: World, src: Unit, target: Unit, hit: Unit | null, pl: Extract<Projectile['payload'], { type: 'strike' }>, origin: { x: number; y: number }): void {
  const style = hordeStyle(world, src);
  if (!style) return;
  switch (style.kind) {
    case 'pierce': {
      // 擊殺：下一箭立即射出
      if (target.dead && style.killRefire) {
        src.attackResetPending = true;
        if (src.action?.kind === 'attack' && src.action.phase === 'recovery') src.action.ticksLeft = 1;
      }
      if (!pl.pierceLeft || pl.pierceLeft <= 0) return;
      // 沿著飛行方向往前找下一名敵人
      const dir = norm(sub(target.pos, origin));
      if (dir.x === 0 && dir.y === 0) return;
      const hitIds = [...(pl.hitIds ?? []), target.id];
      let next: Unit | null = null;
      let bestT = Infinity;
      for (const o of world.units) {
        if (o.dead || o.team === src.team || hitIds.includes(o.id)) continue;
        const rx = o.pos.x - target.pos.x;
        const ry = o.pos.y - target.pos.y;
        const along = rx * dir.x + ry * dir.y;
        if (along <= 0 || along > style.reach) continue;
        const perp = Math.abs(rx * dir.y - ry * dir.x);
        if (perp > 0.5 + o.radius) continue;
        if (along < bestT) {
          bestT = along;
          next = o;
        }
      }
      if (!next) return;
      world.spawnProjectile(src, src.def.projectileKind ?? 'arrow', src.def.projectileSpeed ?? 20, { ...pl, mult: pl.mult * style.falloff, pierceLeft: pl.pierceLeft - 1, hitIds }, { unit: next }, { ...target.pos });
      return;
    }
    case 'blast':
      splashAround(world, src, target.pos, target, style.radius, style.splashMult, style.push);
      return;
    case 'splash':
      splashAround(world, src, target.pos, target, style.radius, style.splashMult, 0);
      return;
    case 'hex':
      if (hit && !hit.dead) applyHex(hit, style.duration, style.actionSlow, style.damageTakenPct, style.spreadRadius);
      return;
    default:
  }
}

function applyHex(t: Unit, duration: number, slow: number, vuln: number, spread: number): void {
  if (t.curseTime <= 0 || t.curseVuln <= vuln) {
    t.curseSlow = Math.max(t.curseTime > 0 ? t.curseSlow : 0, slow);
    t.curseVuln = Math.max(t.curseTime > 0 ? t.curseVuln : 0, vuln);
  }
  t.curseTime = Math.max(t.curseTime, duration);
  t.hexed = true;
  t.hexSpread = spread;
}

/** 怪群模式的死亡連鎖：咒彈擴散、燃燒的雜兵爆開 */
function deathChain(world: World, u: Unit): void {
  if (world.config.battleStyle === 'tactical') return;
  if (u.hexed) {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const o of world.units) {
      if (o.dead || o === u || o.team !== u.team) continue;
      const d = dist(o.pos, u.pos);
      if (d <= u.hexSpread && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) {
      applyHex(best, Math.max(u.curseTime, 1), u.curseSlow, u.curseVuln, u.hexSpread);
      world.emit({ type: 'status', unitId: best.id, text: tr("詛咒擴散") });
    }
  }
  if (world.config.battleStyle === 'horde' && u.def.tier === 'fodder' && u.burnTime > 0) {
    const src = world.getUnit(u.burnSourceId) ?? u;
    world.emit({ type: 'aoe', sourceId: src.id, point: { ...u.pos }, radius: HORDE_CHAIN.burningDeathRadius, skillId: 'burnBurst' });
    for (const o of [...world.units]) {
      if (o.dead || o === u || o.team !== u.team || dist(o.pos, u.pos) > HORDE_CHAIN.burningDeathRadius + o.radius) continue;
      applyDamage(world, o, HORDE_CHAIN.burningDeathDamage, 'area', src, { skillId: 'burn' });
    }
  }
}

/** 技能生效後的後續指令：對敵技能接著普攻該目標，否則恢復先前的普攻 */
function afterSkill(world: World, u: Unit, def: SkillDef, target: Unit | undefined): void {
  const resume = u.resumeOrder;
  // 攻擊移動中放的技能：放完繼續攻擊移動
  if (resume?.type === 'attackMove') world.setOrder(u, { ...resume, targetId: target && !target.dead && def.target === 'enemy' ? target.id : resume.targetId });
  else if (def.target === 'enemy' && target && !target.dead) world.setOrder(u, { type: 'attack', targetId: target.id });
  else world.setOrder(u, resume && resume.type === 'attack' && !world.getUnit(resume.targetId)?.dead ? resume : null);
}

/** 回傳 true 表示進入衝刺階段 */
function applySkillEffect(world: World, u: Unit, def: SkillDef, t: Unit | undefined, point: { x: number; y: number } | undefined, power = 1): boolean {
  const eff = def.effect;
  switch (eff.kind) {
    case 'focus':
      startFocus(world, u, def.id, eff.perSec, eff.maxSec);
      return false;
    case 'drain':
      if (t && !t.dead) drain(world, u, t, def);
      return false;
    case 'strike':
      if (!t || t.dead) return false;
      if (eff.melee) {
        strike(world, u, t, {
          melee: true, damageType: eff.damageType ?? 'melee', mult: eff.mult * power, accBonus: eff.accBonus, flatDamage: eff.flatDamage,
          interrupts: eff.interrupts, stun: eff.stun, knockback: eff.knockback, skillId: def.id,
          shatters: eff.shatters, behindMult: eff.behindMult, critVsStunned: eff.critVsStunned, wallStun: eff.wallStun,
        });
      } else {
        world.spawnProjectile(
          u,
          eff.projectileKind ?? 'arrow',
          eff.projectileSpeed ?? 24,
          { type: 'strike', melee: false, damageType: eff.damageType ?? 'projectile', mult: eff.mult * power, accBonus: eff.accBonus, flatDamage: eff.flatDamage, interrupts: eff.interrupts, stun: eff.stun, knockback: eff.knockback, skillId: def.id },
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
      const amount = Math.min(Math.round(eff.amount * skillPower(world, u)), t.maxHp - t.hp);
      t.hp += amount;
      u.stats.healing += amount;
      world.emit({ type: 'heal', sourceId: u.id, targetId: t.id, amount });
      return false;
    }
    case 'hurl': {
      // 擲人：抓住身邊的英雄（準備期間跑遠了就抓空），丟向準備開始時決定的落點
      if (!t || t.dead || !point || t.thrown) return false;
      if (edgeDistance(u, t) > world.skillRange(u, def) + 0.8) {
        world.emit({ type: 'notice', unitId: u.id, text: tr("抓空") });
        return false;
      }
      interrupt(world, u, t);
      t.action = null;
      world.setOrder(t, null);
      const grid = world.navGrid(t.radius);
      let to = { ...point };
      if (!grid.isWalkable(to)) {
        const c = grid.cellOf(to);
        const n = grid.nearestWalkableCell(c.cx, c.cy);
        if (n) to = grid.cellCenter(n.cx, n.cy);
      }
      t.thrown = { from: { ...t.pos }, to, t: 0, dur: eff.flight, srcId: u.id, skillId: def.id };
      // 飛行中與落地後都不能行動
      t.stunTime = Math.max(t.stunTime, eff.flight + eff.stun);
      world.emit({ type: 'status', unitId: t.id, text: tr("被抓起來！") });
      return false;
    }
    case 'guard':
      if (!t || t.dead) return false;
      t.guardedBy = u.id;
      t.guardTime = eff.duration;
      t.guardChance = eff.chance;
      world.emit({ type: 'status', unitId: t.id, text: tr("守護") });
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
    case 'enchant':
      // 和戰吼共用「暫時傷害增益」：重疊時取較高、時間取較長
      for (const a of world.units) {
        if (a.dead || a.team !== u.team || dist(a.pos, u.pos) > eff.radius) continue;
        const active = a.damageBuffTime > 0;
        a.damageBuffMult = Math.max(active ? a.damageBuffMult : 1, 1 + eff.damagePct * skillPower(world, u));
        a.damageBuffTime = Math.max(active ? a.damageBuffTime : 0, eff.duration);
        if (eff.attrs) {
          a.enchantAttrs = [...eff.attrs];
          a.enchantAttrTime = eff.duration;
        }
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
        applyDamage(world, t, mitigate(world, u, t, dmg, def.id, 'area'), 'area', u, { skillId: def.id });
      }
      return false;
    }
    case 'quake': {
      // 以自己為中心的範圍攻擊並往外擊退
      world.emit({ type: 'aoe', sourceId: u.id, point: { ...u.pos }, radius: eff.radius, skillId: def.id });
      const center = { ...u.pos };
      for (const o of [...world.units]) {
        if (o.dead || o.team === u.team || dist(o.pos, center) > eff.radius + o.radius) continue;
        const dmg = rollDamage(world.rng, eff.damage, damageMultOf(world, u));
        applyDamage(world, o, mitigate(world, u, o, dmg, def.id, 'area'), 'area', u, { skillId: def.id });
        if (!o.dead) knockbackFrom(world, u, center, o, eff.knockback);
      }
      return false;
    }
    case 'warcry': {
      world.emit({ type: 'warcry', unitId: u.id });
      const pts = world.map.summonPoints ?? [];
      const summon = world.config.battleStyle === 'deliberate' && eff.deliberateSummon ? eff.deliberateSummon : eff.summon;
      for (let i = 0; i < summon.count; i++) {
        const p = pts.length ? pts[i % pts.length] : { x: world.map.width - 1, y: world.map.height / 2 };
        const s = world.spawnUnit(world.enemyDefFor(summon.enemy), p, u.id);
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
      world.emit({ type: 'status', unitId: u.id, text: tr("煙霧") });
      return false;
    case 'zone':
      if (!point) return false;
      addZone(world, u, point, eff.radius, eff.lingering, def.id);
      if (eff.extra) addZone(world, u, point, eff.radius, eff.extra, def.id);
      world.emit({ type: 'aoe', sourceId: u.id, point: { ...point }, radius: eff.radius, skillId: def.id });
      return false;
    case 'aoeHeal':
      if (!point) return false;
      if (eff.projectileSpeed) world.spawnProjectile(u, eff.projectileKind ?? 'flask', eff.projectileSpeed, { type: 'aoeHeal', skillId: def.id }, { point });
      else healArea(world, u, point, def);
      return false;
    case 'charge':
    case 'tumble':
    case 'leap':
      return true;
    case 'rush': {
      if (!point) return false;
      // 朝目標點方向衝固定距離（預兆線畫的就是這一段）
      const a = u.action!;
      a.dashFrom = { ...u.pos };
      a.point = rushEnd(u.pos, point, eff.distance);
      a.hitIds = [];
      return true;
    }
    case 'curseBurst':
      if (!t || t.dead) return false;
      world.spawnProjectile(u, eff.projectileKind ?? 'curse', eff.projectileSpeed ?? 24, { type: 'curseBurst', skillId: def.id }, { unit: t });
      return false;
    case 'pull':
      if (!t || t.dead) return false;
      pullTo(world, u, t, eff.mult);
      return false;
    case 'summon':
      world.emit({ type: 'aoe', sourceId: u.id, point: { ...u.pos }, radius: eff.radius, skillId: def.id });
      for (let i = 0; i < eff.count; i++) {
        const ang = u.facing + (i / eff.count) * Math.PI * 2;
        const s = world.spawnUnit(world.enemyDefFor(eff.enemy), { x: u.pos.x + Math.cos(ang) * eff.radius, y: u.pos.y + Math.sin(ang) * eff.radius }, u.id);
        s.squad = u.squad;
        world.alertUnit(s);
      }
      return false;
    case 'explode': {
      world.emit({ type: 'aoe', sourceId: u.id, point: { ...u.pos }, radius: eff.radius, skillId: def.id });
      const center = { ...u.pos };
      for (const o of [...world.units]) {
        if (o.dead || o.team === u.team || dist(o.pos, center) > eff.radius + o.radius * 0.5) continue;
        const dmg = rollDamage(world.rng, eff.damage, damageMultOf(world, u));
        applyDamage(world, o, mitigate(world, u, o, dmg, def.id, 'area'), 'area', u, { skillId: def.id });
      }
      if (!u.dead) kill(world, u);
      return false;
    }
  }
}

/** 直線衝鋒的終點：從 from 朝 toward 方向 distance 公尺 */
export function rushEnd(from: { x: number; y: number }, toward: { x: number; y: number }, distance: number): { x: number; y: number } {
  let d = norm(sub(toward, from));
  if (d.x === 0 && d.y === 0) d = { x: 1, y: 0 };
  return { x: from.x + d.x * distance, y: from.y + d.y * distance };
}

/** 直線前進一步（衝鋒、跳躍）：不尋路，撞到障礙物就停；回傳 false 表示被擋住 */
function stepStraight(world: World, u: Unit, to: { x: number; y: number }, speed: number): boolean {
  const left = dist(u.pos, to);
  if (left < 1e-6) return true;
  const step = Math.min(left, speed * DT);
  const np = { x: u.pos.x + ((to.x - u.pos.x) / left) * step, y: u.pos.y + ((to.y - u.pos.y) / left) * step };
  if (!world.navFor(u).isWalkable(np)) return false;
  u.facing = Math.atan2(to.y - u.pos.y, to.x - u.pos.x);
  u.pos = np;
  u.movedThisTick = true;
  return true;
}

/** 鉤鎖：沒有視線就落空；否則把目標往自己身前拉（途中撞到障礙物就停），打斷準備並造成傷害 */
function pullTo(world: World, src: Unit, t: Unit, mult: number): void {
  if (!world.canSee(src, t)) {
    world.emit({ type: 'notice', unitId: src.id, text: tr("落空") });
    return;
  }
  const dir = norm(sub(src.pos, t.pos));
  const from = { ...t.pos };
  const want = Math.max(0, dist(src.pos, t.pos) - (src.radius + t.radius + 0.3));
  const grid = world.navFor(t);
  let cur = from;
  for (let d = 0.1; d <= want + 1e-6; d += 0.1) {
    const np = { x: from.x + dir.x * d, y: from.y + dir.y * d };
    if (!grid.isWalkable(np)) break;
    cur = np;
  }
  t.pos = cur;
  t.path = null;
  world.emit({ type: 'knockback', unitId: t.id, from, to: { ...cur } });
  world.emit({ type: 'status', unitId: t.id, text: tr("被鉤住") });
  interrupt(world, src, t);
  strike(world, src, t, { melee: false, arc: true, mult, damageType: 'melee', skillId: 'hook' });
}

/** 範圍治療：範圍內的友軍各自恢復 */
function healArea(world: World, src: Unit, point: { x: number; y: number }, def: SkillDef): void {
  const eff = def.effect;
  if (eff.kind !== 'aoeHeal') return;
  world.emit({ type: 'aoe', sourceId: src.id, point: { ...point }, radius: eff.radius, skillId: def.id });
  for (const a of world.units) {
    if (a.dead || a.team !== src.team || dist(a.pos, point) > eff.radius + a.radius * 0.5) continue;
    const amount = Math.min(Math.round(eff.amount * skillPower(world, src)), a.maxHp - a.hp);
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
  if (eff.kind === 'rush') {
    const moved = stepStraight(world, u, a.point!, eff.speed);
    // 撞到的英雄各受一次傷害（不做命中判定、不擊倒）
    for (const o of [...world.units]) {
      if (o.dead || o.team === u.team || a.hitIds!.includes(o.id)) continue;
      if (dist(o.pos, u.pos) > u.radius + o.radius + eff.width / 2 - 0.3) continue;
      a.hitIds!.push(o.id);
      const dmg = rollDamage(world.rng, eff.damage, damageMultOf(world, u));
      applyDamage(world, o, mitigate(world, u, o, dmg, def.id, 'melee'), 'melee', u, { skillId: def.id });
      if (u.dead) return;
    }
    // 側邊帶（橫掃衝鋒）：衝鋒方向右側 offset 公尺、寬 width 的平行帶
    if (eff.side && a.dashFrom) {
      const dir = norm(sub(a.point!, a.dashFrom));
      const right = { x: dir.y, y: -dir.x };
      const c = { x: u.pos.x + right.x * eff.side.offset, y: u.pos.y + right.y * eff.side.offset };
      for (const o of [...world.units]) {
        if (o.dead || o.team === u.team || a.hitIds!.includes(o.id)) continue;
        if (dist(o.pos, c) > o.radius + eff.side.width / 2) continue;
        a.hitIds!.push(o.id);
        const dmg = rollDamage(world.rng, eff.side.damage, damageMultOf(world, u));
        applyDamage(world, o, mitigate(world, u, o, dmg, def.id, 'melee'), 'melee', u, { skillId: def.id });
        if (u.dead) return;
      }
    }
    const arrived = dist(u.pos, a.point!) < 0.05;
    if (!moved || arrived || a.dashTime > eff.distance / eff.speed + 0.5) {
      // 撞牆：還沒衝到底就被擋住
      if (!moved && !arrived && eff.wallStun) {
        world.emit({ type: 'status', unitId: u.id, text: tr("撞牆") });
        applyStun(world, u, eff.wallStun, true);
        return;
      }
      enterRecovery(world, u, def.recovery);
      afterSkill(world, u, def, undefined);
    }
    return;
  }
  if (eff.kind === 'leap') {
    const moved = stepStraight(world, u, a.point!, eff.speed);
    if (!moved || dist(u.pos, a.point!) < 0.05 || a.dashTime > 2) {
      // 落地：打落點周圍的敵人
      world.emit({ type: 'aoe', sourceId: u.id, point: { ...u.pos }, radius: eff.radius, skillId: def.id });
      for (const o of [...world.units]) {
        if (o.dead || o.team === u.team || dist(o.pos, u.pos) > eff.radius + o.radius) continue;
        strike(world, u, o, { melee: true, mult: eff.mult, damageType: 'melee', skillId: def.id });
        if (u.dead || !u.action) return;
      }
      enterRecovery(world, u, def.recovery);
      afterSkill(world, u, def, undefined);
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

// ───────────── 物理／特殊與屬性相剋（SPEC_DAMAGE，只用在沉穩節奏） ─────────────

/** 這一招的類別與屬性：技能看技能表，普攻（與濺射）看單位的普攻表 */
export function attackInfo(src: Unit, skillId: string | undefined, damageType: DamageType): AttackInfo {
  const info: AttackInfo = (skillId && SKILL_ATTACK[skillId]) || BASIC_ATTACK[src.def.id] || { cat: damageType === 'spell' ? 'spec' : 'phys', attrs: [] };
  // 附魔帶的屬性（元素法師）：加進這一招的屬性，相剋取最有利的
  if (src.enchantAttrTime > 0 && src.enchantAttrs.length) return { cat: info.cat, attrs: [...new Set([...info.attrs, ...src.enchantAttrs])] };
  return info;
}

/**
 * 相剋取最有利的屬性（SPEC_CLASSES §2，Alan 2026-10-21）：一招有多個屬性時，只看對目標最有利的那一個——
 * 任一屬性打到弱點就算相剋（w = 1）；全部屬性都被抗才算被剋（r = 1）；其他是普通。
 */
export function matchup(target: Unit, info: AttackInfo): { w: number; r: number } {
  const a = AFFINITY[target.def.id];
  if (!a || info.attrs.length === 0) return { w: 0, r: 0 };
  if (info.attrs.some((x) => a.weak?.includes(x))) return { w: 1, r: 0 };
  if (info.attrs.every((x) => a.resist?.includes(x))) return { w: 0, r: 1 };
  return { w: 0, r: 0 };
}

/** 目標的防禦（物理含盾與祝福；特殊用特殊防禦表，祝福也算） */
export function defenseOf(target: Unit, cat: DamageCategory): number {
  if (cat === 'phys') return target.defense;
  return (SPEC_DEFENSE[target.def.id]?.defense ?? target.def.defense) + (target.def.specDefenseBonus ?? 0) + target.mods.defense + (target.blessTime > 0 ? target.blessDefense : 0);
}

/** 目標的護甲（物理含盾；特殊用特殊護甲表） */
export function armorOf(target: Unit, cat: DamageCategory): number {
  if (cat === 'phys') return target.armor;
  return (SPEC_DEFENSE[target.def.id]?.armor ?? target.def.armor) + (target.def.specArmorBonus ?? 0) + target.mods.armor - target.sunderAmount;
}

/** 打進去的傷害：傷害 × weakDamage^w × K ÷（K ＋ 護甲 × resistArmor^r） */
export function typedDamage(dmg: number, target: Unit, info: AttackInfo, m: { w: number; r: number }): number {
  const F = DAMAGE_FORMULA;
  const armor = Math.max(0, armorOf(target, info.cat)) * F.resistArmor ** m.r;
  return Math.max(1, Math.round((dmg * F.weakDamage ** m.w * F.k) / (F.k + armor)));
}

/** 不做命中判定的傷害（範圍、衝撞、詛咒爆裂）的減傷：沉穩節奏用新公式，舊模式照舊扣護甲 */
export function mitigate(world: World, src: Unit, target: Unit, dmg: number, skillId: string | undefined, damageType: DamageType): number {
  if (world.config.battleStyle !== 'deliberate') return applyArmor(dmg, target.armor);
  const info = attackInfo(src, skillId, damageType);
  return typedDamage(dmg, target, info, matchup(target, info));
}

/** 英雄技能的效果倍率（沉穩節奏 1.5；敵人與舊模式是 1） */
export function skillPower(world: World, u: Unit): number {
  return u.isHero ? world.config.heroSkillPowerMult : 1;
}

/** 造成傷害的總倍率：單位自身（強化、增益）× 我方傷害倍率設定 */
export function damageMultOf(world: World, u: Unit): number {
  // 狂戰士：生命越低傷害越高
  const lowHp = u.def.lowHpDamageBonus ? 1 + u.def.lowHpDamageBonus * (1 - Math.max(0, u.hp) / u.maxHp) : 1;
  return u.outgoingDamageMult * lowHp * (u.isHero ? world.config.heroDamageMult : 1);
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
  /** 這是普攻（觸發被動的命中效果） */
  basic?: boolean;
  skillId?: string;
  freeAttack?: boolean;
}

/** 單體攻擊結算：命中判定 → 傷害 → 打斷／暈眩／擊退。回傳實際受到攻擊的單位（未命中為 null） */
export function strike(world: World, src: Unit, tgt: Unit, p: StrikeParams): Unit | null {
  if (tgt.dead) return null;
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
  // 沉穩節奏（SPEC_DAMAGE）：物理／特殊看不同的防禦，相剋時目標防禦下降、被剋時上升
  const typed = world.config.battleStyle === 'deliberate';
  const info = typed ? attackInfo(src, p.skillId, p.damageType) : null;
  const mu = info ? matchup(target, info) : { w: 0, r: 0 };
  let defense = info ? defenseOf(target, info.cat) * DAMAGE_FORMULA.weakDefense ** mu.w * DAMAGE_FORMULA.resistDefense ** mu.r : target.defense;
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
  // 沉穩節奏：背刺改成加命中（BACKSTAB_ACCURACY），不再乘傷害倍率
  const behind = p.melee && isBehind(src, target);
  if (typed && behind && (p.behindMult || (!p.skillId && src.def.backstabMult))) accuracy += BACKSTAB_ACCURACY;
  // 背刺暈眩中的目標：必定爆擊（不做命中判定）
  // 角鬥士：打斷敵人後的下一擊必定爆擊
  const pendingCrit = src.critPending;
  src.critPending = false;
  const forcedCrit = (!!p.critVsStunned && target.stunTime > 0) || pendingCrit;
  const rolled = forcedCrit ? null : rollHit(world.rng, accuracy, defense);
  const result = rolled ? rolled.result : 'crit';
  if (result === 'miss') {
    world.emit({ type: 'miss', sourceId: src.id, targetId: target.id, skillId: p.skillId, freeAttack: p.freeAttack });
    if (target.team === 'enemy') world.triggerAggro(target);
    return null;
  }
  const crit = result === 'crit';
  // 爆擊分級（沉穩節奏）：判定結果越高越重；必定爆擊算最低一級
  const tier: CritTier | null = typed && crit ? (rolled ? critTierOf(rolled.roll) : critTierOf(100)) : null;
  const critMult = tier ? tier.mult : crit ? CRIT_MULT : 1;
  let comboMult = 1;
  // 舊模式：背刺乘傷害倍率
  if (behind && !typed) {
    if (p.behindMult) comboMult *= p.behindMult;
    else if (!p.skillId && src.def.backstabMult) comboMult *= src.def.backstabMult;
  }
  if (p.melee && p.shatters && target.rootTime > 0) {
    comboMult *= COMBOS.shatterMult;
    target.rootTime = 0;
    world.emit({ type: 'status', unitId: target.id, text: tr("碎冰") });
  }
  // 斬殺（被動）：對低生命的目標傷害提高
  for (const ps of src.passives) if (ps.execute && target.hp / target.maxHp < ps.execute.below) comboMult *= 1 + ps.execute.pct;
  const power = p.skillId && SKILLS[p.skillId] ? skillPower(world, src) : 1;
  const base = rollDamage(world.rng, p.flatDamage ?? src.def.damage, p.mult * damageMultOf(world, src) * terrainMult * comboMult * power);
  const final = info ? typedDamage(base * critMult, target, info, mu) : applyArmor(base * critMult, target.armor);
  if (info && (mu.w > 0 || mu.r > 0)) world.emit({ type: 'status', unitId: target.id, text: mu.w > 0 ? tr("有效！") : tr("抵抗") });
  applyDamage(world, target, final, p.damageType, src, { crit, skillId: p.skillId, freeAttack: p.freeAttack });
  if (target.dead) return target;
  if (p.basic && src.passives.length > 0) passiveOnHit(world, src, target);
  // 蓄力循環（法師）：普攻命中累積充能
  if (p.basic && src.cycle && chargeCycleOnHit(src)) world.emit({ type: 'notice', unitId: src.id, text: tr("{0}準備好了", { 0: SKILLS[src.cycle.steps[1]].name }) });
  if (target.dead) return target;
  if (tier && tier !== critTierOf(100)) world.emit({ type: 'status', unitId: target.id, text: tier.name });
  if (p.interrupts || tier?.interrupts) interrupt(world, src, target, p.interrupts ? p.skillId : undefined);
  if (p.stun || tier?.stun) applyStun(world, target, Math.max(p.stun ?? 0, tier?.stun ?? 0));
  if (p.knockback) {
    const hitWall = knockback(world, src, target, p.knockback);
    if (hitWall && p.wallStun && !target.dead) {
      world.emit({ type: 'status', unitId: target.id, text: tr("撞牆") });
      applyStun(world, target, COMBOS.wallStunSeconds);
    }
  }
  return target;
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
  const foe = src.team !== target.team;
  // 吸血光環：在光環裡打中敵人，傷害上升
  if (foe && src.drainAuraTime > 0) amount = Math.round(amount * (1 + src.drainAuraDamagePct));
  // 衰弱詛咒：受到傷害增加
  if (target.curseTime > 0) amount = Math.round(amount * (1 + target.curseVuln));
  // 凋零光環：受到傷害增加
  if (target.chillTime > 0 && target.chillVuln > 0) amount = Math.round(amount * (1 + target.chillVuln));
  // 聖域：範圍內的友軍減傷（取最強的一個）
  const ward = wardReduction(world, target);
  if (ward > 0) amount = Math.max(1, Math.round(amount * (1 - ward)));
  // 分擔（守護者）：一部分傷害改由光環主人承受
  if (foe && target.coverTime > 0 && amount > 1) {
    const guard = world.getUnit(target.coverBy);
    if (guard && !guard.dead && guard !== target) {
      const shared = Math.round(amount * target.coverPct);
      if (shared > 0) {
        amount -= shared;
        applyDamage(world, guard, shared, damageType, src, { skillId: 'cover' });
      }
    }
  }
  const dealt = Math.min(amount, target.hp);
  target.hp -= amount;
  src.stats.damageDealt += dealt;
  target.stats.damageTaken += dealt;
  world.emit({ type: 'hit', sourceId: src.id, targetId: target.id, damage: amount, crit, damageType, skillId, freeAttack });
  if (target.team === 'enemy') world.triggerAggro(target);
  // 集中：受到傷害就中斷
  if (dealt > 0 && focusing(target)) breakFocus(world, target);
  // 吸血（被動）與吸血光環：依造成的傷害回復自己；光環主人扣血（不會扣到死）
  if (foe && dealt > 0 && !src.dead) {
    const aura = src.drainAuraTime > 0;
    const steal = src.passives.reduce((m, ps) => m + (ps.lifesteal ?? 0), 0) + (aura ? src.drainAuraLifesteal : 0);
    if (steal > 0) restoreHp(world, src, src, dealt * steal);
    const owner = aura ? world.getUnit(src.drainAuraOwner) : undefined;
    if (owner && !owner.dead && src.drainAuraOwnerCost > 0) {
      const cost = Math.min(Math.round(dealt * src.drainAuraOwnerCost), owner.hp - 1);
      if (cost > 0) {
        owner.hp -= cost;
        world.emit({ type: 'hit', sourceId: owner.id, targetId: owner.id, damage: cost, crit: false, damageType: 'spell', skillId: 'drainAura' });
      }
    }
  }
  // 沉穩節奏：敵人記下誰打了自己（仇恨）
  if (src.team !== target.team && world.config.battleStyle === 'deliberate') target.threatLog.push({ id: src.id, amount: dealt, t: world.time });
  // 盾兵：生命跌破門檻就盾破
  if (target.shieldUp && target.hp > 0 && target.hp <= target.maxHp * target.def.shield!.hpFrac) {
    target.shieldBroken = true;
    world.emit({ type: 'status', unitId: target.id, text: tr("破盾") });
  }
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
  if (killer && killer !== u) {
    killer.stats.kills++;
    // 戰鬥結算的演出用：記下英雄打倒了哪些敵人（Alan 2026-10-22）
    if (killer.team !== u.team) killer.killList.push(u.def.id);
  }
  world.emit({ type: 'death', unitId: u.id, killerId: killer?.id });
  deathChain(world, u);
}

/** 打斷：準備中的動作取消、不進冷卻，並硬直 0.5 秒 */
export function interrupt(world: World, src: Unit, t: Unit, bySkill?: string): boolean {
  if (!t.action || t.action.phase !== 'windup') return false;
  // 只有指定的技能打得斷（魔王的冠軍：盾擊、瞄準射擊）
  if (t.def.interruptibleBy && !(bySkill && t.def.interruptibleBy.includes(bySkill))) return false;
  const { skillId, point } = t.action;
  t.action = null;
  if (skillId && SKILLS[skillId].lostOnInterrupt && !t.spentSkills.includes(skillId)) t.spentSkills.push(skillId);
  if (!t.def.interruptStunImmune) t.stunTime = Math.max(t.stunTime, INTERRUPT_STUN);
  world.emit({ type: 'interrupt', sourceId: src.id, targetId: t.id, skillId, point });
  if (src.team !== t.team && src.passives.some((p) => p.critAfterInterrupt)) {
    src.critPending = true;
    world.emit({ type: 'notice', unitId: src.id, text: tr("下一擊必定爆擊") });
  }
  return true;
}

export function applyStun(world: World, t: Unit, seconds: number, force = false): void {
  // 只有指定技能打得斷的單位（魔王的冠軍）也不吃一般的暈眩；撞牆暈眩用 force
  if (t.def.interruptibleBy && !force) return;
  t.stunTime = Math.max(t.stunTime, seconds);
  if (t.action) {
    t.action = null;
    if (t.nextOrder !== undefined) {
      world.setOrder(t, t.nextOrder);
      t.nextOrder = undefined;
    }
  }
  world.emit({ type: 'status', unitId: t.id, text: tr("暈眩") });
}

/** 擊退；回傳 true 表示途中撞到障礙物 */
export function knockback(world: World, src: Unit, t: Unit, distance: number): boolean {
  return knockbackFrom(world, src, src.pos, t, distance);
}

/** 從某點往外擊退（爆裂把雜兵推開也用這個）；怪群模式下撞到其他敵人時兩者都受傷 */
export function knockbackFrom(world: World, src: Unit, from0: { x: number; y: number }, t: Unit, distance: number): boolean {
  // 不會被擊退的單位（魔王的冠軍）
  if (t.def.knockbackImmune) return false;
  let dir = norm(sub(t.pos, from0));
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
  if (world.config.battleStyle === 'horde' && cur !== from) {
    const bumped = world.units.find((o) => o !== t && !o.dead && o.team === t.team && dist(o.pos, t.pos) < o.radius + t.radius);
    if (bumped) {
      applyDamage(world, bumped, HORDE_CHAIN.knockbackCollisionDamage, 'melee', src, { skillId: 'collide' });
      if (!t.dead) applyDamage(world, t, HORDE_CHAIN.knockbackCollisionDamage, 'melee', src, { skillId: 'collide' });
    }
  }
  return hitWall;
}

/** 範圍傷害（火球、獄火）：不做命中判定，友軍傷害倍率見設定 */
export function explode(world: World, src: Unit, point: { x: number; y: number }, def: SkillDef): void {
  const eff = def.effect;
  if (eff.kind !== 'aoe') return;
  world.emit({ type: 'aoe', sourceId: src.id, point: { ...point }, radius: eff.radius, skillId: def.id });
  if (eff.ignites) world.ignite(point, eff.radius, src.id);
  if (eff.lingering) addZone(world, src, point, eff.radius, eff.lingering, def.id);
  for (const u of world.units) {
    if (u.dead) continue;
    if (dist(u.pos, point) > eff.radius + u.radius * 0.5) continue;
    const ally = u.team === src.team;
    if (ally && !eff.friendlyFire) continue;
    const mult = (ally ? world.config.friendlyFireMultiplier : 1) * damageMultOf(world, src) * skillPower(world, src);
    if (mult <= 0) continue;
    const dmg = rollDamage(world.rng, eff.damage, mult);
    applyDamage(world, u, mitigate(world, src, u, dmg, def.id, 'area'), 'area', src, { skillId: def.id });
    if (!u.dead && eff.interrupts) interrupt(world, src, u, def.id);
    if (!u.dead && eff.burns) {
      if (u.burnTime <= 0) u.burnTick = 1;
      u.burnTime = Math.max(u.burnTime, TERRAIN.burnDuration);
      u.burnSourceId = src.id;
      world.emit({ type: 'status', unitId: u.id, text: tr("燃燒") });
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
      if (target) {
        const hit = strike(world, src, target, { ...pl, origin: p.origin });
        if (pl.basic) afterBasicRanged(world, src, target, hit, pl, p.origin);
      }
      break;
    case 'aoe':
      explode(world, src, p.point!, SKILLS[pl.skillId]);
      break;
    case 'curse':
      if (target && !target.dead) {
        target.curseTime = pl.duration;
        target.curseSlow = pl.actionSlow;
        target.curseVuln = pl.damageTakenPct;
        world.emit({ type: 'status', unitId: target.id, text: tr("詛咒") });
        if (target.team === 'enemy') world.triggerAggro(target);
      }
      break;
    case 'aoeHeal':
      healArea(world, src, p.point!, SKILLS[pl.skillId]);
      break;
    case 'curseBurst': {
      const eff = SKILLS[pl.skillId].effect;
      if (!target || target.dead || eff.kind !== 'curseBurst') break;
      const cursed = target.curseTime > 0;
      // 先解除詛咒再結算（引爆本身不吃詛咒的易傷）
      if (cursed) {
        target.curseTime = 0;
        target.hexed = false;
        world.emit({ type: 'status', unitId: target.id, text: tr("詛咒爆裂") });
      }
      const dmg = rollDamage(world.rng, cursed ? eff.damage : eff.uncursedDamage, damageMultOf(world, src) * skillPower(world, src));
      applyDamage(world, target, mitigate(world, src, target, dmg, pl.skillId, 'spell'), 'spell', src, { skillId: pl.skillId });
      break;
    }
    case 'root':
      if (target && !target.dead) {
        target.rootTime = Math.max(target.rootTime, pl.duration);
        target.path = null;
        world.emit({ type: 'status', unitId: target.id, text: tr("定身") });
        if (target.team === 'enemy') world.triggerAggro(target);
      }
      break;
  }
}

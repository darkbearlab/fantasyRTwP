import { SKILLS } from '../../sim/data/skills';
import type { SkillDef } from '../../sim/data/types';
import type { Vec } from '../../sim/math';
import type { Unit } from '../../sim/unit';
import type { BattleSession } from '../session';

/** 按下技能鍵：不需先選取英雄，直接進入該英雄該技能的瞄準模式（SPEC §11.2） */
export function beginSkill(session: BattleSession, slot: number, index: number, now: number): void {
  const hero = session.heroBySlot(slot);
  if (!hero) return;
  const skillId = hero.def.skills[index];
  const def = skillId ? SKILLS[skillId] : undefined;
  if (!def) return;
  if (hero.dead) {
    session.showToast(`${hero.def.name}已陣亡`, now);
    return;
  }
  const cd = hero.cooldowns[def.id] ?? 0;
  if (!hero.skillReady(def.id)) {
    session.showToast(`${hero.def.name}「${def.name}」冷卻中（${cd.toFixed(1)} 秒）`, now);
    return;
  }
  if (def.target === 'self') {
    session.targeting = null;
    session.enqueue({ type: 'skill', unitId: hero.id, skillId: def.id });
    return;
  }
  // 同一個技能再按一次：取消瞄準
  if (session.targeting && session.targeting.unitId === hero.id && session.targeting.skillId === def.id) {
    session.targeting = null;
    return;
  }
  session.targeting = { unitId: hero.id, skillId: def.id };
}

export function targetingDef(session: BattleSession): { caster: Unit; def: SkillDef } | null {
  const t = session.targeting;
  if (!t) return null;
  const caster = session.world.getUnit(t.unitId);
  if (!caster || caster.dead) {
    session.targeting = null;
    return null;
  }
  return { caster, def: SKILLS[t.skillId] };
}

export function validSkillTarget(def: SkillDef, caster: Unit, unit: Unit | undefined): boolean {
  if (!unit || unit.dead) return false;
  switch (def.target) {
    case 'enemy':
      return unit.team !== caster.team;
    case 'ally':
      return unit.team === caster.team && unit !== caster;
    case 'allyOrSelf':
      return unit.team === caster.team;
    default:
      return false;
  }
}

const TARGET_HINT: Record<string, string> = {
  enemy: '請點選敵人',
  ally: '請點選其他友軍',
  allyOrSelf: '請點選友軍',
};

/** 左鍵確認目標；成功回傳 true */
export function confirmTargeting(session: BattleSession, point: Vec, unit: Unit | undefined, now: number): boolean {
  const td = targetingDef(session);
  if (!td) return false;
  const { caster, def } = td;
  if (def.target === 'ground') {
    session.enqueue({ type: 'skill', unitId: caster.id, skillId: def.id, point: { x: point.x, y: point.y } });
    session.targeting = null;
    return true;
  }
  if (!validSkillTarget(def, caster, unit)) {
    session.showToast(TARGET_HINT[def.target] ?? '無效目標', now, 1000);
    return false;
  }
  session.enqueue({ type: 'skill', unitId: caster.id, skillId: def.id, targetId: unit!.id });
  session.targeting = null;
  return true;
}

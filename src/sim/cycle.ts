/**
 * 技能循環的狀態（SPEC_SLICE5 §16；資料在 data/cycles.ts）。
 * 畫面層用 currentActiveSkill 決定技能鈕顯示哪一招；sim 在技能生效、普攻命中時推進循環。
 */
import { CLASSES } from './data/classes';
import type { Unit } from './unit';

/** 這名單位現在的主動技能：有循環就是循環目前這一招，否則是職業專用技能（找不到就用第一個） */
export function currentActiveSkill(u: Unit): string | undefined {
  if (u.cycle) return u.cycle.steps[u.cycleStep];
  const sig = CLASSES[u.def.id]?.signature;
  return sig && u.def.skills.includes(sig) ? sig : u.def.skills[0];
}

/** 技能是循環的一部分、但不是目前這一招（不能放） */
export function offCycle(u: Unit, skillId: string): boolean {
  return !!u.cycle && u.cycle.steps.includes(skillId) && u.cycle.steps[u.cycleStep] !== skillId;
}

/** 技能生效：依序循環換下一招；蓄力循環放完強化版就歸零 */
export function advanceCycleOnCast(u: Unit, skillId: string): void {
  const c = u.cycle;
  if (!c || c.steps[u.cycleStep] !== skillId) return;
  if (c.mode === 'sequence') u.cycleStep = (u.cycleStep + 1) % c.steps.length;
  else if (u.cycleStep > 0) {
    u.cycleStep = 0;
    u.cycleCharge = 0;
  }
}

/** 普攻命中：蓄力循環累積充能，滿了換成第二招；回傳 true 表示剛好充滿 */
export function chargeCycleOnHit(u: Unit): boolean {
  const c = u.cycle;
  if (!c || c.mode !== 'charge' || u.cycleStep > 0) return false;
  u.cycleCharge = Math.min(c.chargeMax ?? 1, u.cycleCharge + 1);
  if (u.cycleCharge < (c.chargeMax ?? 1)) return false;
  u.cycleStep = 1;
  return true;
}

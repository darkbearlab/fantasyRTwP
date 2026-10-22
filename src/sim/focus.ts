/**
 * 集中（引導）狀態（SPEC_CLASSES §2，狙擊手用；通用機制，不寫職業特例）。
 * - 放出 `focus` 效果的技能進入集中，開始累積時間。
 * - 移動（離開開始的位置超過 FOCUS.moveTolerance）或受到傷害就中斷；有技能循環時回到集中那一招。
 * - 集中中放出的下一招傷害技能，威力 ×（1 ＋ 每秒加成 × min(集中秒數, 上限)），放完集中結束。
 */
import { tr } from '../i18n/lang';
import { dist } from './math';
import type { Unit } from './unit';
import type { World } from './world';

export const FOCUS = {
  /** 被推擠的小位移不算移動（公尺） */
  moveTolerance: 0.3,
};

export function startFocus(world: World, u: Unit, skillId: string, perSec: number, maxSec: number): void {
  u.focusStart = world.time;
  u.focusPos = { x: u.pos.x, y: u.pos.y };
  u.focusSkill = skillId;
  u.focusPerSec = perSec;
  u.focusMaxSec = maxSec;
  world.emit({ type: 'status', unitId: u.id, text: tr("集中") });
}

export function focusing(u: Unit): boolean {
  return u.focusStart >= 0;
}

/** 目前集中能給的威力倍率 */
export function focusMult(world: World, u: Unit): number {
  if (!focusing(u)) return 1;
  return 1 + u.focusPerSec * Math.min(u.focusMaxSec, world.time - u.focusStart);
}

/** 中斷集中；有技能循環時回到集中那一招 */
export function breakFocus(world: World, u: Unit): void {
  if (!focusing(u)) return;
  u.focusStart = -1;
  if (u.cycle) {
    const i = u.cycle.steps.indexOf(u.focusSkill);
    if (i >= 0) u.cycleStep = i;
  }
  world.emit({ type: 'status', unitId: u.id, text: tr("集中中斷") });
}

/** 放出下一招時用掉集中，回傳威力倍率 */
export function consumeFocus(world: World, u: Unit): number {
  const m = focusMult(world, u);
  u.focusStart = -1;
  return m;
}

/** 每節拍：離開開始的位置就中斷 */
export function tickFocus(world: World, u: Unit): void {
  if (focusing(u) && dist(u.pos, u.focusPos) > FOCUS.moveTolerance) breakFocus(world, u);
}

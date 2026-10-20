/**
 * 英雄在戰鬥中實際使用的技能（純函式，不 import Phaser／DOM）。
 * 沉穩節奏：每名英雄只有一招主動（或技能循環的每一招），舊版的三技能欄（HeroRecord.skills）不再使用；
 * 獎勵、事件、招募、路線圖面板都要用這裡的清單，才不會出現英雄用不到的舊技能（Alan 2026-10-20）。
 */
import { CLASSES } from '../sim/data/classes';
import { ACTIVE_CYCLES } from '../sim/data/cycles';
import { ACTIVE_SKILL_OVERRIDE } from '../sim/data/passives';
import type { HeroRecord, RunState } from './runState';

/** 沉穩節奏：職業唯一的主動技能（預設是專用技能，ACTIVE_SKILL_OVERRIDE 列出例外） */
export function activeSkillOf(classId: string): string {
  return ACTIVE_SKILL_OVERRIDE[classId] ?? CLASSES[classId].signature;
}

/** 沉穩節奏的技能清單：技能循環的每一招，或唯一的主動技能 */
export function deliberateSkillsOf(classId: string): string[] {
  const c = ACTIVE_CYCLES[classId];
  return c ? [...c.steps] : [activeSkillOf(classId)];
}

/** 這趟遠征裡，英雄在戰鬥中實際會用到的技能 */
export function battleSkillsOf(run: Pick<RunState, 'style'>, h: Pick<HeroRecord, 'classId' | 'skills'>): string[] {
  return run.style === 'deliberate' ? deliberateSkillsOf(h.classId) : h.skills;
}

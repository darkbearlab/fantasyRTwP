/**
 * 職業規則（SPEC_SLICE3 §1）：組隊（自選＋隨機）、技能欄替換。純函式，不修改傳入的物件。
 */
import { CLASS_ORDER, CLASSES, LINES } from '../sim/data/classes';
import { ECONOMY } from './data/economy';
import type { RunState } from './runState';
import { cloneRun, livingHeroes } from './runState';
import { rngFor } from './seed';

/** 組隊：picks 為玩家自選（最多 partyPicks 名），其餘由遠征種子隨機補滿 */
export function rollParty(seed: number, picks: string[]): string[] {
  if (picks.length > ECONOMY.partyPicks) throw new Error(`最多自選 ${ECONOMY.partyPicks} 名`);
  for (const id of picks) if (!CLASSES[id]) throw new Error(`未知的職業：${id}`);
  if (!ECONOMY.allowDuplicateClasses && new Set(picks).size !== picks.length) throw new Error('不能選重複的職業');
  const rng = rngFor(seed, 'party');
  const party = [...picks];
  while (party.length < ECONOMY.partySize) {
    const pool = ECONOMY.allowDuplicateClasses ? CLASS_ORDER : CLASS_ORDER.filter((id) => !party.includes(id));
    party.push(pool[rng.int(0, pool.length - 1)]);
  }
  return party;
}

/** 招募候選池：不允許重複職業時排除隊上存活者的職業 */
export function recruitPool(run: RunState): string[] {
  if (ECONOMY.allowDuplicateClasses) return CLASS_ORDER;
  const taken = new Set(livingHeroes(run).map(({ hero }) => hero.classId));
  const pool = CLASS_ORDER.filter((id) => !taken.has(id));
  return pool.length ? pool : CLASS_ORDER;
}

/** 技能欄是否合法：第 1 欄為專用技能，第 2、3 欄來自同系共用池且不重複 */
export function validLoadout(classId: string, skills: string[]): boolean {
  const c = CLASSES[classId];
  if (!c || skills.length !== 3 || skills[0] !== c.signature) return false;
  if (new Set(skills).size !== 3) return false;
  return skills.slice(1).every((s) => LINES[c.line].pool.includes(s));
}

/** 第 index 欄（1 或 2）可以換成哪些技能 */
export function swapOptions(classId: string, skills: string[], index: number): string[] {
  if (index !== 1 && index !== 2) return [];
  const c = CLASSES[classId];
  return LINES[c.line].pool.filter((s) => !skills.includes(s));
}

/** 休息節點替換技能欄（SPEC_SLICE3 §1.1：不佔三選一、可換任意次） */
export function swapSkill(run: RunState, slot: number, index: number, skillId: string): RunState {
  if (run.phase.kind !== 'rest') throw new Error('只能在休息節點替換技能');
  const h = run.party[slot];
  if (!h || h.dead) throw new Error('需要一名存活英雄');
  if (!swapOptions(h.classId, h.skills, index).includes(skillId)) throw new Error('不能裝備這個技能');
  const r = cloneRun(run);
  r.party[slot]!.skills[index] = skillId;
  return r;
}

/**
 * 職業規則（SPEC_SLICE3 §1）：組隊（自選＋隨機）、技能欄替換。純函式，不修改傳入的物件。
 */
import { CLASS_ORDER, CLASSES, LINES } from '../sim/data/classes';
import { ECONOMY } from './data/economy';
import type { RunState } from './runState';
import { cloneRun, livingHeroes } from './runState';
import { rngFor } from './seed';

/**
 * 組隊：picks 為玩家自選（最多 maxPicks 名），不足隊伍人數的由遠征種子隨機補滿。
 * 主要遠征目前四名全自選；隨機補位留給之後有隨機隊員的模式（傳入較小的 maxPicks）。
 */
export function rollParty(seed: number, picks: string[], maxPicks = ECONOMY.partyPicks): string[] {
  if (picks.length > maxPicks) throw new Error(`最多自選 ${maxPicks} 名`);
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

/**
 * 技能欄是否合法：一定帶著專用技能（位置不限，路線圖上可以調整順序），
 * 其他兩欄來自同系共用池且不重複
 */
export function validLoadout(classId: string, skills: string[]): boolean {
  const c = CLASSES[classId];
  if (!c || skills.length !== 3 || !skills.includes(c.signature)) return false;
  if (new Set(skills).size !== 3) return false;
  return skills.filter((s) => s !== c.signature).every((s) => LINES[c.line].pool.includes(s));
}

/** 第 index 欄可以換成哪些技能（專用技能那一欄不能換） */
export function swapOptions(classId: string, skills: string[], index: number): string[] {
  const c = CLASSES[classId];
  if (index < 0 || index >= skills.length || skills[index] === c.signature) return [];
  return LINES[c.line].pool.filter((s) => !skills.includes(s));
}

/** 只能在路線圖上調整順序（戰鬥、事件、獎勵、休息進行中不行） */
function assertOnMap(run: RunState): void {
  if (run.phase.kind !== 'map') throw new Error('只能在路線圖上調整順序');
}

/** 調整英雄順序：交換兩個隊伍欄位（數字鍵 1–4 對應欄位） */
export function swapHeroSlots(run: RunState, a: number, b: number): RunState {
  assertOnMap(run);
  if (a === b || a < 0 || b < 0 || a >= run.party.length || b >= run.party.length) return run;
  const r = cloneRun(run);
  [r.party[a], r.party[b]] = [r.party[b], r.party[a]];
  return r;
}

/** 調整某名英雄的技能順序：交換兩欄（決定戰鬥中的技能快捷鍵順序） */
export function swapSkillOrder(run: RunState, slot: number, a: number, b: number): RunState {
  assertOnMap(run);
  const h = run.party[slot];
  if (!h || a === b || a < 0 || b < 0 || a >= h.skills.length || b >= h.skills.length) return run;
  const r = cloneRun(run);
  const s = r.party[slot]!.skills;
  [s[a], s[b]] = [s[b], s[a]];
  return r;
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

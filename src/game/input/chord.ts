/**
 * 數字鍵二段式（Alan 試作）的判斷：純函式，方便測試。
 * - 沒有進行中的二段式：數字 1–slotCount 選英雄，並開始二段式
 * - 二段式進行中（未逾時）：數字 n 放那名英雄的第 n 個技能
 * - Shift＋數字：加選英雄，不進入、也不使用二段式
 */
export type DigitAction =
  | { kind: 'select'; slot: number; startChord: boolean }
  | { kind: 'skill'; slot: number; index: number }
  | { kind: 'noSkill'; slot: number; index: number }
  | { kind: 'none' };

export function decideDigit(
  chord: { slot: number; until: number } | null,
  now: number,
  n: number,
  shift: boolean,
  slotCount: number,
  skillCountOf: (slot: number) => number,
): DigitAction {
  const active = chord && now <= chord.until ? chord : null;
  if (active && !shift) {
    return n < skillCountOf(active.slot) ? { kind: 'skill', slot: active.slot, index: n } : { kind: 'noSkill', slot: active.slot, index: n };
  }
  if (n >= slotCount) return { kind: 'none' };
  return { kind: 'select', slot: n, startChord: !shift };
}

/**
 * 命中判定的門檻（SPEC §6.2）：擲 d100 ＋ 命中 − 防禦，低於 missBelow 沒中、達到 critAt 爆擊（爆擊等級的門檻跟著 critAt 平移）。
 */
export interface HitRule {
  missBelow: number;
  critAt: number;
}

/** 舊模式：命中率 51% ＋ 命中 − 防禦，另外 1% ＋ 命中 − 防禦 是爆擊 */
export const LEGACY_HIT_RULE: HitRule = { missBelow: 50, critAt: 100 };

/**
 * 「基礎命中率 b%」的規則（Alan 2026-10-25，沉穩節奏用 95）：命中率 ＝ b% ＋ 命中 − 防禦，超過 100% 的部分變成爆擊率。
 * 換成門檻：missBelow ＝ 101 − b、critAt ＝ 201 − b。
 */
export function hitBaseRule(base: number): HitRule {
  return { missBelow: 101 - base, critAt: 201 - base };
}

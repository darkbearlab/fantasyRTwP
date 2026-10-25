/**
 * 命中判定的門檻（SPEC §6.2）：擲 d100 ＋ 命中 − 防禦，低於 missBelow 沒中、達到 critAt 爆擊（爆擊等級的門檻跟著 critAt 平移）。
 * 現行：50／100（命中率＝51% ＋ 命中 − 防禦，超過 100 的部分是爆擊率）。
 * Alan 2026-10-25 試算「基礎 95%」：missBelow 6、critAt 106（命中率＝95% ＋ 命中 − 防禦，超過 100% 的部分變爆擊）。
 * 只是試算，預設維持現行（npm run herostats -- --hitBase 95 比較）。
 */
export const HIT_RULE = { missBelow: 50, critAt: 100 };

/** 「基礎命中率」換成門檻：基礎 b% ＝ 命中與防禦相等時的命中率 */
export function setHitBase(base: number): void {
  HIT_RULE.missBelow = 101 - base;
  HIT_RULE.critAt = 201 - base;
}

/**
 * 哪些節點用 finalbossblues 的程序生成地圖（LEVELS.deliberateGenerator＝'fbb' 時）。全部是初版預設，可調。
 *
 * 故事（STORY.md）有五張路線圖，目前只有一張：先把前幾層當「首都突圍」（城內），後面當「野外」。
 * 頭目關卡用專屬的頭目房（src/run/bossArena.ts）。
 */
import type { FbbLook } from '../fbbLevel';

export const FBB_LEVELS = {
  /** 這幾層（含）以前是城內（燃燒的王都） */
  townUntilLayer: 2,
  /** 野外各層的季節與時段（超出長度用最後一個） */
  fieldLooks: ['summer', 'summer', 'summer', 'fallDusk', 'fallDusk', 'winterOvercast'] as FbbLook[],
  /** 用模板拼接的節點類型（Alan 2026-10-21：頭目改走專屬的頭目房 bossArena.ts，不再用模板） */
  templateTiers: [] as string[],
};

/** 野外第 layer 層的季節；有章節時照章節的設定（SPEC_CAMPAIGN） */
export function fieldLookFor(layer: number, chapter?: { townUntilLayer: number; fieldLooks: FbbLook[] }): FbbLook {
  const L = chapter?.fieldLooks ?? FBB_LEVELS.fieldLooks;
  const town = chapter?.townUntilLayer ?? FBB_LEVELS.townUntilLayer;
  return L[Math.min(L.length - 1, Math.max(0, layer - town - 1))];
}

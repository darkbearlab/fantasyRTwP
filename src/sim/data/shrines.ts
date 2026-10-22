/**
 * 祭壇（Alan 2026-10-22：類似暗黑破壞神的祭壇）：英雄互動後，全隊（活著的）得到一段時間的增益。
 * 同時只有一種祭壇增益：新的蓋掉舊的。
 */
import type { ShrineKind } from './types';

export interface ShrineDef {
  name: string;
  /** 說明（滑鼠提示、戰鬥紀錄） */
  description: string;
  /** 畫面上的顏色 */
  color: number;
  /** 造成傷害倍率加成（0.25＝+25%） */
  damagePct?: number;
  defense?: number;
  armor?: number;
  accuracy?: number;
  moveSpeedPct?: number;
  /** 每秒回復最大生命的比例 */
  regenPct?: number;
}

export const SHRINE_RULES = {
  /** 增益持續秒數 */
  duration: 45,
};

export const SHRINES: Record<ShrineKind, ShrineDef> = {
  might: { name: '力量祭壇', description: '全隊造成傷害 +25%', color: 0xd64a3a, damagePct: 0.25 },
  stone: { name: '磐石祭壇', description: '全隊防禦 +15、護甲 +3', color: 0x9a8f7a, defense: 15, armor: 3 },
  eagle: { name: '鷹眼祭壇', description: '全隊命中 +20', color: 0xe8c45a, accuracy: 20 },
  swift: { name: '疾風祭壇', description: '全隊移動速度 +30%', color: 0x5ac8e8, moveSpeedPct: 0.3 },
  renewal: { name: '復甦祭壇', description: '全隊每秒回復 2% 最大生命', color: 0x6ad87a, regenPct: 0.02 },
};

/**
 * 一路向前（SPEC_SLICE7 §1）的旋鈕。
 */
import type { NodeType } from '../mapGen';

export const JOURNEY = {
  /** 沉穩節奏的遠征：沒有路線圖畫面、不能回頭、沒有魔王主力與冠軍；false＝舊的 FTL 式路線圖 */
  forward: true,
  /** 出口預告「前方有敵人以外的氣息」的節點類型（商人、事件；另外有被困英雄的戰鬥也算） */
  presence: ['shop', 'event'] as NodeType[],
  /** 商人站在出生點附近幾公尺（依序試，找不到空地就往外） */
  merchantDistances: [3, 2.5, 3.5, 4, 5, 2],
  /** 開局幾名英雄（SPEC_SLICE7 §4；滿隊仍是 ECONOMY.partySize） */
  startParty: 2,
  /**
   * 解救英雄（SPEC_SLICE7 §4）：一般戰鬥節點有 chance 的機率有一名英雄被困（不保證湊得滿）。
   * 被救的英雄是隊伍等級，加入前已經配好 (等級 − 1) × upgradesPerLevel 個升級，朝一個昇變分支走。
   */
  rescue: { chance: 0.35, minLayer: 1, upgradesPerLevel: 1, spotDistances: [1.5, 2, 2.5, 3, 1] },
  /**
   * 強度曲線（SPEC_SLICE7 §3.3）：敵人照「全程第幾層」成長，不照隊伍等級。
   * 敵人生命與傷害 ×（1 ＋ perDepth ×（全程層數 − 1））× 這一章的 chapterMult；全程層數＝前面各章的層數加總（不打折）＋本章層數。
   * 頭目的數值是照第 1 章最後一層設計的，所以頭目從第 1 章頭目那一層開始算。經驗值跟著這個強度，再乘 xpMult。
   * 實測：npm run curve（tools/journeyCurve.ts）。全部是佔位。
   */
  // 2026-10-24 用自動遠征（npm run curve，30 趟、腳本 AI）試出來的起點：第 1 章兩人能過、全滅平均分散在各章、等級接近預期曲線
  curve: { perDepth: 0.09, chapterMult: [0.55, 0.75, 0.95, 1.1, 1.25], xpMult: 0.4 },
  /** 陣亡就是沒了（SPEC_SLICE7 §5）：拿掉會復活的消耗品（商人不賣、不會掉） */
  removedConsumables: ['phoenix'],
};

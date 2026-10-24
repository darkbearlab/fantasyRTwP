/**
 * 一路向前（SPEC_SLICE7 §1）的旋鈕。
 */
import type { NodeType } from '../mapGen';

export const JOURNEY = {
  /** 沉穩節奏的遠征：沒有路線圖畫面、不能回頭、沒有魔王主力與冠軍；false＝舊的 FTL 式路線圖 */
  forward: true,
  /** 出口預告「前方有敵人以外的氣息」的節點類型（商人、事件；之後還有可以解救的英雄） */
  presence: ['shop', 'event'] as NodeType[],
  /** 商人站在出生點附近幾公尺（依序試，找不到空地就往外） */
  merchantDistances: [3, 2.5, 3.5, 4, 5, 2],
};

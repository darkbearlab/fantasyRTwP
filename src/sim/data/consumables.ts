/**
 * 消耗品（Alan 2026-10-21）：放在隊伍共用的包包裡，不分配給英雄；戰鬥中按包包鈕直接使用（不佔英雄的動作，共用冷卻），
 * 路線圖上也能用（煙霧彈除外）。回血以後主要靠這些和牧師的戰地救護。全部是佔位數值。
 *
 * target：hero＝一名活著的英雄、party＝全隊、fallen＝一名陣亡的英雄。
 */
export interface ConsumableDef {
  id: string;
  name: string;
  description: string;
  target: 'hero' | 'party' | 'fallen';
  /** 回復最大生命的比例 */
  heal?: number;
  /** 復活時的生命比例 */
  revive?: number;
  /** 全隊隱身秒數（煙霧） */
  stealth?: number;
  /** 戰鬥中、路線圖上能不能用 */
  inBattle: boolean;
  onMap: boolean;
  price: number;
}

export const CONSUMABLES: Record<string, ConsumableDef> = {
  potion: { id: 'potion', name: '治療藥水', description: '一名英雄回復 40% 生命', target: 'hero', heal: 0.4, inBattle: true, onMap: true, price: 30 },
  elixir: { id: 'elixir', name: '群體藥劑', description: '全隊回復 20% 生命', target: 'party', heal: 0.2, inBattle: true, onMap: true, price: 50 },
  phoenix: { id: 'phoenix', name: '鳳凰羽毛', description: '陣亡的英雄以 30% 生命復活（戰鬥中也能用）', target: 'fallen', revive: 0.3, inBattle: true, onMap: true, price: 90 },
  smoke: { id: 'smoke', name: '煙霧彈', description: '全隊隱身 3 秒（脫離戰鬥用；只能在戰鬥中用）', target: 'party', stealth: 3, inBattle: true, onMap: false, price: 40 },
};

export const BAG = {
  /** 包包能放幾個消耗品 */
  capacity: 6,
  /** 戰鬥中使用的共用冷卻（秒） */
  cooldown: 3,
  /** 遠征開始時的包包 */
  start: ['potion', 'potion'],
};

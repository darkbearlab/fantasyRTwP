/**
 * 戰役的五個章節（SPEC_CAMPAIGN，Alan 2026-10-21）：一趟遠征＝五章，每章一張 FTL 式路線圖，打倒該章頭目進下一章。
 * - 帶到下一章：隊伍、等級、升級、昇變、道具、包包、金幣。每章重來：路線圖、魔王主力、冠軍。
 * - 章節之間全隊回滿生命，陣亡的英雄不復活。
 * - 敵人強度看「全程深度」：前面各章的層數加總 × depthCarry ＋ 本章層數。
 * 第 3～5 章是室內地圖（indoor；頭目房先沿用野外）；第 3～5 章的敵人陣營與頭目還沒做（先用帝國叛軍與戰爭領主）。
 */
import type { FbbLook } from '../fbbLevel';
import type { IndoorTheme } from '../indoorGen';

export interface ChapterDef {
  id: string;
  name: string;
  /** 路線圖層數（含頭目層；Alan：越後面越長） */
  layers: number;
  /** 前幾層是城內地圖，其餘是野外 */
  townUntilLayer: number;
  /** 野外各層的季節與時段（超出長度用最後一個） */
  fieldLooks: FbbLook[];
  /** 章節開始時的過場文字（一行一段） */
  intro: string[];
  /** 敵方陣營（data/factions.ts） */
  faction: string;
  /** 室內地圖的版面（第 3～5 章；Alan 2026-10-22）：有的話頭目以外的戰鬥都用室內地圖 */
  indoor?: IndoorTheme;
}

export const CHAPTER_RULES = {
  /**
   * 前面各章的層數有多少比例算進敵人強度（1＝完全累加）。
   * Alan 2026-10-22：試算發現全部累加時第 4、5 章敵人強度通膨、玩家跟不上 → 減半；各章的難度主要靠新陣營本身
   */
  depthCarry: 0.45,
};

export const CHAPTERS: ChapterDef[] = [
  {
    id: 'capital', name: '首都突圍', layers: 5, townUntilLayer: 3, fieldLooks: ['fallDusk'], faction: 'empire',
    intro: ['王都陷入火海。', '國王選擇與將士同進退，把最後的希望交給了你們四人：', '找到傳說中的魔法水晶，用它的力量打倒魔王。', '先活著離開這座城。'],
  },
  {
    id: 'wilds', name: '荒野', layers: 6, townUntilLayer: 0, fieldLooks: ['summer', 'summer', 'summer', 'fallDusk', 'fallDusk', 'fallDusk'], faction: 'orcs',
    intro: ['回頭望去，王都的火光染紅了半邊天。', '水晶的傳說指向北方的古老神殿。', '魔王的大軍正沿著大道北上——得搶在他們前面。'],
  },
  {
    id: 'dungeon', name: '試煉地城', layers: 7, townUntilLayer: 0, fieldLooks: ['winterOvercast'], faction: 'empire', indoor: 'temple',
    intro: ['神殿的大門在你們面前打開。', '守護水晶的衛士們沒有殺意，只是靜靜地擋在路上。', '它們在考驗你們。'],
  },
  {
    id: 'tunnels', name: '密道', layers: 8, townUntilLayer: 0, fieldLooks: ['winterOvercast'], faction: 'empire', indoor: 'cave',
    intro: ['水晶在懷中微微發熱。', '通往魔王城的大路早已被封死，只剩下地底的密道。', '黑暗裡，有東西在爬。'],
  },
  {
    id: 'castle', name: '魔王城', layers: 9, townUntilLayer: 0, fieldLooks: ['winterOvercast'], faction: 'empire', indoor: 'castle',
    intro: ['魔王城就在眼前。', '一路追著你們的那名冠軍，此刻正站在城門的另一端。', '這是最後一戰。'],
  },
];

/** 第 i 章（從 0 開始；超出範圍用最後一章） */
export function chapterAt(i: number | undefined): ChapterDef {
  return CHAPTERS[Math.min(CHAPTERS.length - 1, Math.max(0, i ?? 0))];
}

/** 第 i 章之前累積的深度（敵人層數加成） */
export function chapterDepth(i: number | undefined): number {
  let d = 0;
  for (let k = 0; k < Math.min(i ?? 0, CHAPTERS.length); k++) d += CHAPTERS[k].layers;
  return Math.round(d * CHAPTER_RULES.depthCarry);
}

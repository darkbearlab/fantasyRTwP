/**
 * 昇變分支（SPEC_CLASSES §1、§3，Alan 2026-10-21）。只用在沉穩節奏；全部是佔位數值。
 * - 每個基本職業三個分支，每個分支 branchSize 個專屬升級（在 UPGRADES，branch 欄位指回這裡）。
 * - 同一個分支選滿 threshold 個就自動昇變成 evolvesTo；昇變後其他分支關閉，三選一不再出這名英雄的專屬升級。
 */
export const BRANCH_RULES = {
  /** 選滿幾個就昇變 */
  threshold: 3,
  /** 抽專屬升級時，已經在走某個分支的話，有這個機率從選最多的分支抽 */
  leadBias: 0.7,
  /** 升級三選一裡，專屬升級的格數（其餘是通用） */
  exclusiveSlots: 2,
};

export interface BranchDef {
  id: string;
  name: string;
  /** 昇變後的職業（HEROES／CLASSES 的 id） */
  evolvesTo: string;
  /** 昇變時的一句台詞 */
  line: string;
}

/** 基本職業 → 三個分支 */
export const BRANCHES: Record<string, BranchDef[]> = {
  warrior: [
    { id: 'guardian', name: '守護者', evolvesTo: 'guardian', line: '我的盾在，誰都別想過去。' },
    // SPEC_CHARACTERS §4：角鬥士擱置，這個分支改成聖騎士（戰士底）；分支 id 不變，舊升級照用
    { id: 'gladiator', name: '聖騎士', evolvesTo: 'paladin', line: '聖光在此，邪惡退散。' },
  ],
  // 決鬥者（阿許卡，SPEC_CHARACTERS §4）：狂戰士的分支從戰士搬過來；分支 id 不變，舊升級照用
  fencer: [
    { id: 'liberator', name: '解放者', evolvesTo: 'liberator', line: '打破過鎖鏈的人，就是自由的。' },
    { id: 'berserker', name: '狂戰士', evolvesTo: 'berserker', line: '血……還不夠！' },
  ],
  ranger: [
    { id: 'cutthroat', name: '刺客', evolvesTo: 'cutthroat', line: '近一點，再近一點。' },
    { id: 'sniper', name: '狙擊手', evolvesTo: 'sniper', line: '呼吸、瞄準……放。' },
    { id: 'arbalest', name: '大遊俠', evolvesTo: 'arbalest', line: '箭雨，來了。' },
  ],
  // SPEC_CHARACTERS §4：法師（奧爾德斯）的兩條線是大法師、死靈法師；元素師、戰法師搬給下位元素師（芬恩）。分支 id 不變，舊升級照用
  mage: [
    { id: 'elementalist', name: '大法師', evolvesTo: 'archmage', line: '我教過的，都還在你們身上。' },
    { id: 'deathMage', name: '死靈法師', evolvesTo: 'necromancer', line: '起來吧。還不是休息的時候。' },
  ],
  adept: [
    { id: 'adeptElement', name: '元素師', evolvesTo: 'elementalist', line: '師父教的，我一次都沒忘。' },
    { id: 'battlemage', name: '戰法師', evolvesTo: 'battlemage', line: '咒語念完了，換斧頭說話。' },
  ],
  cleric: [
    // SPEC_CHARACTERS §4：聖騎士搬到戰士，這個分支改成大祭司；分支 id 不變，舊升級照用
    { id: 'paladin', name: '大祭司', evolvesTo: 'highPriest', line: '我不信神。但這句話，我得對得起。' },
    { id: 'zealot', name: '狂信者', evolvesTo: 'zealot', line: '信仰會讓你們更強！' },
    { id: 'heretic', name: '邪教徒', evolvesTo: 'heretic', line: '你們的血，借我用用。' },
  ],
};

/** 開局可以選的職業（沉穩節奏只選四個基本職業，進階職業靠昇變） */
export const STARTER_CLASSES = ['warrior', 'ranger', 'mage', 'cleric'];

/** 分支定義 */
export function branchDef(baseClass: string, branchId: string): BranchDef | undefined {
  return BRANCHES[baseClass]?.find((b) => b.id === branchId);
}

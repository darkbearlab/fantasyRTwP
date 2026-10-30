/**
 * 配方昇變（SPEC_SLICE7 §3.2）：每種昇變一份配方＝「這幾種升級都拿到」＋「其中一種升滿」。
 * 只用在一路向前的遠征（舊模式照舊用 branches.ts 的「同一分支選滿三個」）。全部是佔位：
 * 目前每份配方都是那個分支原本的三個專屬升級，升滿的那一個要拿兩次（共四次選擇）；之後可以改成跨分支、加通用升級。
 */
export const RECIPE_RULES = {
  /** 湊到配方後：choice＝升級時多一張「昇變」卡讓玩家選（Alan：預設用選的）；auto＝湊到就自動昇變 */
  mode: 'choice' as 'choice' | 'auto',
  /** 每個英雄每次升級的三選一裡，職業升級的格數（其餘是通用） */
  classSlots: 2,
  /** 保底（SPEC_SLICE7 §3.2）：從第幾級開始，職業升級優先出配方還缺的；0＝不保底 */
  pityFromLevel: 0,
};

/**
 * 職業升級可以拿幾次（升滿＝拿到這個次數）；沒列的職業升級只能拿一次（多半是被動，重複拿沒有效果）。
 * 通用升級照舊不限次數。
 */
export const UPGRADE_MAX_RANK: Record<string, number> = {
  gdShell: 2, glBash: 2, glFocus: 2, glEdge: 2, bkFury: 2, bkFrenzy: 2,
  ctClose1: 2, ctClose2: 2, ctClose3: 2, snPower: 2, snReach: 2, snSteady: 2, abRapid1: 2, abRapid2: 2, abReload: 2,
  elEnchant: 2, elFlame: 2, elFrost: 2, adFlame: 2, bmVigor: 2, bmPlate: 2, bmGrit: 2,
  plVigor: 2, plHammer: 2, plWard: 2, zeZeal: 2, htBlood: 2,
};

export interface RecipeDef {
  id: string;
  /** 基本職業 */
  base: string;
  /** 昇變後的職業 */
  evolvesTo: string;
  /** 這幾種升級都要拿到 */
  requires: string[];
  /** 其中這一種要升滿（UPGRADE_MAX_RANK） */
  maxed: string;
}

export const RECIPES: RecipeDef[] = [
  { id: 'guardian', base: 'warrior', evolvesTo: 'guardian', requires: ['gdTaunt', 'gdAura', 'gdShell'], maxed: 'gdShell' },
  { id: 'gladiator', base: 'warrior', evolvesTo: 'paladin', requires: ['glBash', 'glFocus', 'glEdge'], maxed: 'glEdge' },
  { id: 'berserker', base: 'warrior', evolvesTo: 'berserker', requires: ['bkFury', 'bkFrenzy', 'bkThirst'], maxed: 'bkFury' },
  { id: 'cutthroat', base: 'ranger', evolvesTo: 'cutthroat', requires: ['ctClose1', 'ctClose2', 'ctClose3'], maxed: 'ctClose1' },
  { id: 'sniper', base: 'ranger', evolvesTo: 'sniper', requires: ['snPower', 'snReach', 'snSteady'], maxed: 'snPower' },
  { id: 'arbalest', base: 'ranger', evolvesTo: 'arbalest', requires: ['abRapid1', 'abRapid2', 'abReload'], maxed: 'abReload' },
  { id: 'elementalist', base: 'mage', evolvesTo: 'archmage', requires: ['elEnchant', 'elFlame', 'elFrost'], maxed: 'elFlame' },
  { id: 'deathMage', base: 'mage', evolvesTo: 'necromancer', requires: ['dmWide', 'dmDeep', 'dmFrail'], maxed: 'dmWide' },
  { id: 'adeptElement', base: 'adept', evolvesTo: 'elementalist', requires: ['adFlame', 'adSpark', 'adFocus'], maxed: 'adFlame' },
  { id: 'battlemage', base: 'adept', evolvesTo: 'battlemage', requires: ['bmVigor', 'bmPlate', 'bmGrit'], maxed: 'bmVigor' },
  { id: 'paladin', base: 'cleric', evolvesTo: 'highPriest', requires: ['plVigor', 'plHammer', 'plWard'], maxed: 'plHammer' },
  { id: 'zealot', base: 'cleric', evolvesTo: 'zealot', requires: ['zeFervor', 'zeReach', 'zeZeal'], maxed: 'zeZeal' },
  { id: 'heretic', base: 'cleric', evolvesTo: 'heretic', requires: ['htDark', 'htBlood', 'htHunger'], maxed: 'htBlood' },
];

/** 選了就昇變的那張卡（UPGRADES 裡的 id） */
export const evolveUpgradeId = (recipeId: string) => `evolve_${recipeId}`;

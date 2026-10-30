/**
 * 具名角色（SPEC_CHARACTERS §3，Alan 2026-10-30）：每個角色固定一個骨架職業，昇變分成救贖與墮落兩條線。
 * 職業的數值、技能、被動照舊在 src/sim/data；這裡只有角色本身（名字、稱號、職業、關係）。
 * 柯林的兩條線都是正面的，redeem／fall 只是欄位名稱。
 */
export type AscensionRule = 'choice' | 'bothPositive' | 'mentor' | 'pairedRival';

export interface CharacterDef {
  id: string;
  name: string;
  enName: string;
  title: string;
  enTitle: string;
  /** 骨架職業（基本職業） */
  baseClass: string;
  /** 救贖線的進階職業 */
  redeem: string;
  /** 墮落線的進階職業 */
  fall: string;
  /** 昇變方向怎麼決定（SPEC_CHARACTERS §5.2） */
  ascension: AscensionRule;
  /** 特殊關係 */
  bond?: { with: string; kind: 'mentor' | 'apprentice' | 'rival' | 'debt' };
}

const c = (d: CharacterDef): CharacterDef => d;

export const CHARACTERS: Record<string, CharacterDef> = {
  corin: c({ id: 'corin', name: '柯林', enName: 'Corin', title: '國王最後的護衛', enTitle: "The King's Last Guard", baseClass: 'warrior', redeem: 'guardian', fall: 'paladin', ascension: 'bothPositive' }),
  sylwen: c({ id: 'sylwen', name: '希爾雯', enName: 'Sylwen', title: '失去家園的精靈', enTitle: 'The Homeless Elf', baseClass: 'ranger', redeem: 'arbalest', fall: 'cutthroat', ascension: 'pairedRival', bond: { with: 'durgan', kind: 'rival' } }),
  aldous: c({ id: 'aldous', name: '奧爾德斯', enName: 'Aldous', title: '和弟子走散的法師', enTitle: 'The Mage Who Lost His Apprentice', baseClass: 'mage', redeem: 'archmage', fall: 'necromancer', ascension: 'mentor', bond: { with: 'fenn', kind: 'mentor' } }),
  benedict: c({ id: 'benedict', name: '班尼迪克', enName: 'Benedict', title: '破戒的神職人員', enTitle: 'The Lapsed Priest', baseClass: 'cleric', redeem: 'highPriest', fall: 'heretic', ascension: 'choice', bond: { with: 'ashka', kind: 'debt' } }),
  fenn: c({ id: 'fenn', name: '芬恩', enName: 'Fenn', title: '法師弟子', enTitle: "The Mage's Apprentice", baseClass: 'adept', redeem: 'elementalist', fall: 'battlemage', ascension: 'choice', bond: { with: 'aldous', kind: 'apprentice' } }),
  ashka: c({ id: 'ashka', name: '阿許卡', enName: 'Ashka', title: '逃脫的奴隸', enTitle: 'The Escaped Slave', baseClass: 'fencer', redeem: 'liberator', fall: 'berserker', ascension: 'choice', bond: { with: 'benedict', kind: 'debt' } }),
  durgan: c({ id: 'durgan', name: '杜爾根', enName: 'Durgan', title: '矮人雕刻師', enTitle: 'The Dwarf Carver', baseClass: 'totemist', redeem: 'totemElder', fall: 'totemBearer', ascension: 'pairedRival', bond: { with: 'sylwen', kind: 'rival' } }),
};

/** 組隊畫面與解救的顯示順序 */
export const CHARACTER_ORDER = ['corin', 'sylwen', 'aldous', 'benedict', 'fenn', 'ashka', 'durgan'];

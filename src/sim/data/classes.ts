/**
 * 職業體系（SPEC_SLICE3 §1）：四條職業系，各有 Archetype 與變體（平行關係、不能轉職）。
 * 每名英雄 3 個技能欄：第 1 欄是專用技能（固定），第 2、3 欄從該系的共用池裝備。
 */
export type ClassLine = 'warrior' | 'ranger' | 'mage' | 'cleric';

export interface LineDef {
  id: ClassLine;
  name: string;
  /** 共用技能池（Archetype 的專用技能也在池中） */
  pool: string[];
}

export interface ClassDef {
  /** 與 HEROES 的 id 相同 */
  id: string;
  line: ClassLine;
  /** 定位（組隊畫面顯示） */
  role: string;
  /** 專用技能（第 1 欄） */
  signature: string;
  /** 預設裝備的第 2、3 欄 */
  defaultPool: [string, string];
  variant?: boolean;
  /** 昇變來的進階職業：原本的基本職業（SPEC_CLASSES） */
  evolvedFrom?: string;
}

export const LINES: Record<ClassLine, LineDef> = {
  warrior: { id: 'warrior', name: '戰士系', pool: ['shieldBash', 'charge', 'guard', 'battleCry'] },
  ranger: { id: 'ranger', name: '遊俠系', pool: ['aimedShot', 'stunArrow', 'tumble', 'smokeBomb'] },
  mage: { id: 'mage', name: '法師系', pool: ['fireball', 'iceBind', 'arcaneMissile', 'swamp'] },
  cleric: { id: 'cleric', name: '牧師系', pool: ['heal', 'bless', 'holySmite', 'healFlask'] },
};

export const CLASSES: Record<string, ClassDef> = {
  warrior: { id: 'warrior', line: 'warrior', role: '卡位前排', signature: 'guard', defaultPool: ['shieldBash', 'charge'] },
  ranger: { id: 'ranger', line: 'ranger', role: '機動遠程', signature: 'tumble', defaultPool: ['aimedShot', 'stunArrow'] },
  mage: { id: 'mage', line: 'mage', role: '範圍爆發', signature: 'fireball', defaultPool: ['iceBind', 'arcaneMissile'] },
  cleric: { id: 'cleric', line: 'cleric', role: '治療輔助', signature: 'heal', defaultPool: ['bless', 'holySmite'] },
  berserker: { id: 'berserker', line: 'warrior', role: '衝陣輸出：不產生控制區，生命越低傷害越高', signature: 'whirlwind', defaultPool: ['charge', 'shieldBash'], variant: true },
  rogue: { id: 'rogue', line: 'ranger', role: '繞背刺殺（近戰）：不產生控制區，背後普攻 ×1.5', signature: 'backstab', defaultPool: ['smokeBomb', 'tumble'], variant: true },
  hexer: { id: 'hexer', line: 'mage', role: '控場、削弱', signature: 'curse', defaultPool: ['iceBind', 'swamp'], variant: true },
  alchemist: { id: 'alchemist', line: 'cleric', role: '投擲道具：普攻拋物線（不需視線、無視掩體）', signature: 'firebomb', defaultPool: ['healFlask', 'bless'], variant: true },
  // ── 昇變後的進階職業（SPEC_CLASSES §3）：evolvedFrom 是基本職業；狂戰士回收舊的變體 ──
  guardian: { id: 'guardian', line: 'warrior', role: '守護：替光環內的隊友分擔傷害；反制敵人的大招', signature: 'shieldCounter', defaultPool: ['shieldBash', 'charge'], variant: true, evolvedFrom: 'warrior' },
  gladiator: { id: 'gladiator', line: 'warrior', role: '決鬥：盾擊打斷後必定爆擊', signature: 'shieldBash', defaultPool: ['charge', 'guard'], variant: true, evolvedFrom: 'warrior' },
  cutthroat: { id: 'cutthroat', line: 'ranger', role: '近戰刺殺：潛行接近，偷襲必中、高等級爆擊', signature: 'stealth', defaultPool: ['smokeBomb', 'tumble'], variant: true, evolvedFrom: 'ranger' },
  sniper: { id: 'sniper', line: 'ranger', role: '集中後一擊必殺', signature: 'aimedShot', defaultPool: ['stunArrow', 'tumble'], variant: true, evolvedFrom: 'ranger' },
  arbalest: { id: 'arbalest', line: 'ranger', role: '齊射：短時間內極快的連射', signature: 'sureShot', defaultPool: ['stunArrow', 'tumble'], variant: true, evolvedFrom: 'ranger' },
  elementalist: { id: 'elementalist', line: 'mage', role: '普攻火＋寒雙屬性，累積層數放大火球', signature: 'greatFireball', defaultPool: ['iceBind', 'arcaneMissile'], variant: true, evolvedFrom: 'adept' },
  adept: { id: 'adept', line: 'mage', role: '普攻累積層數，滿了放大火球', signature: 'greatFireball', defaultPool: ['iceBind', 'arcaneMissile'] },
  archmage: { id: 'archmage', line: 'mage', role: '全隊不限距離的附魔', signature: 'grandEnchant', defaultPool: ['iceBind', 'arcaneMissile'], variant: true, evolvedFrom: 'mage' },
  necromancer: { id: 'necromancer', line: 'mage', role: '詛咒敵人，讓死去的敵人站起來作戰', signature: 'curse', defaultPool: ['iceBind', 'swamp'], variant: true, evolvedFrom: 'mage' },
  deathMage: { id: 'deathMage', line: 'mage', role: '寒氣光環削弱敵人、詛咒爆裂', signature: 'curse', defaultPool: ['iceBind', 'swamp'], variant: true, evolvedFrom: 'mage' },
  battlemage: { id: 'battlemage', line: 'mage', role: '近戰：只附魔自己，普攻破甲', signature: 'selfEnchant', defaultPool: ['iceBind', 'arcaneMissile'], variant: true, evolvedFrom: 'adept' },
  paladin: { id: 'paladin', line: 'warrior', role: '聖域・審判：範圍打斷、失衡，同時護住隊友', signature: 'holyGround', defaultPool: ['shieldBash', 'charge'], variant: true, evolvedFrom: 'warrior' },
  highPriest: { id: 'highPriest', line: 'cleric', role: '更大、更久的聖域', signature: 'grandSanctuary', defaultPool: ['bless', 'holySmite'], variant: true, evolvedFrom: 'cleric' },
  zealot: { id: 'zealot', line: 'cleric', role: '光環同時加攻擊、命中、防禦', signature: 'sanctuary', defaultPool: ['bless', 'holySmite'], variant: true, evolvedFrom: 'cleric' },
  heretic: { id: 'heretic', line: 'cleric', role: '以戰養戰：吸血、血印、吸血光環', signature: 'bloodDrain', defaultPool: ['bless', 'heal'], variant: true, evolvedFrom: 'cleric' },
};

/** 組隊與招募可選的職業（顯示順序） */
export const CLASS_ORDER = ['warrior', 'berserker', 'ranger', 'rogue', 'mage', 'hexer', 'cleric', 'alchemist'];

/** 預設技能欄：[專用, 共用, 共用] */
export function defaultLoadout(classId: string): string[] {
  const c = CLASSES[classId];
  return [c.signature, ...c.defaultPool];
}

/**
 * 物理／特殊與屬性相剋（SPEC_DAMAGE.md，Alan 2026-10-21）。只用在沉穩節奏；全部是佔位數值。
 *
 * - 每一招有「類別」（phys 物理／spec 特殊：決定看哪一組防禦與護甲）與一個或多個「屬性」。
 * - 目標對每個屬性可以「抗」（被剋）或「弱」（相剋）。這一招的屬性中有 w 個相剋、r 個被剋：
 *   打進去：1d100 ＋ 命中 − 防禦 × weakDefense^w × resistDefense^r ≥ 50
 *   傷害：傷害 × weakDamage^w × K ÷（K ＋ 護甲 × resistArmor^r）
 * - 矩陣保留彈性：屬性清單與各表都在這裡，之後加新屬性只改資料。
 */
export type DamageCategory = 'phys' | 'spec';

/** 屬性：武器形態（物理、特殊都可以帶）與元素 */
export const ATTRIBUTES = {
  cut: '切割',
  cleave: '劈砍',
  blunt: '衝擊',
  pierce: '穿刺',
  fire: '火',
  cold: '寒',
  holy: '聖',
  dark: '暗',
} as const;
export type Attribute = keyof typeof ATTRIBUTES;

export interface AttackInfo {
  cat: DamageCategory;
  attrs: Attribute[];
}

export const DAMAGE_FORMULA = {
  /** 比例減傷的常數 K */
  k: 10,
  /** 相剋：目標防禦倍率（每個相剋的屬性乘一次） */
  weakDefense: 0.5,
  /** 被剋：目標防禦倍率 */
  resistDefense: 1.5,
  /** 相剋：傷害倍率 */
  weakDamage: 1.5,
  /** 被剋：目標護甲倍率 */
  resistArmor: 1.5,
};

const A = (cat: DamageCategory, ...attrs: Attribute[]): AttackInfo => ({ cat, attrs });

/** 普攻（依單位 def.id）；沒列的：攻擊是法術就當特殊、否則物理，沒有屬性 */
export const BASIC_ATTACK: Record<string, AttackInfo> = {
  // 英雄
  warrior: A('phys', 'cut'),
  ranger: A('phys', 'pierce'),
  mage: A('spec', 'fire', 'blunt'),
  cleric: A('phys', 'blunt'),
  berserker: A('phys', 'cleave'),
  rogue: A('phys', 'cut'),
  hexer: A('spec', 'dark'),
  alchemist: A('phys', 'blunt'),
  // 敵人
  shieldbearer: A('phys', 'pierce'),
  raider: A('phys', 'cut'),
  axeman: A('phys', 'cleave'),
  archer: A('phys', 'pierce'),
  charger: A('phys', 'pierce'),
  assassin: A('phys', 'cut'),
  hooker: A('phys', 'pierce'),
  priest: A('spec', 'holy'),
  summoner: A('spec', 'dark'),
  caster: A('spec', 'fire', 'blunt'),
  bomber: A('phys', 'blunt'),
  exploder: A('phys', 'blunt'),
  minion: A('phys', 'cut'),
  lurker: A('phys', 'cleave'),
  warlord: A('phys', 'cleave'),
};

/** 技能（依技能 id）；沒列的：照施放者的普攻 */
export const SKILL_ATTACK: Record<string, AttackInfo> = {
  shieldBash: A('phys', 'blunt'),
  sureShot: A('phys', 'pierce'),
  aimedShot: A('phys', 'pierce'),
  flashFireball: A('spec', 'fire', 'blunt'),
  greatFireball: A('spec', 'fire', 'blunt'),
  fireball: A('spec', 'fire', 'blunt'),
  fireFlask: A('spec', 'fire'),
  firebomb: A('spec', 'fire', 'blunt'),
  curseBurst: A('spec', 'dark', 'blunt'),
  holySmite: A('spec', 'holy'),
  hellfire: A('spec', 'fire'),
  bomb: A('phys', 'blunt'),
  selfDestruct: A('phys', 'blunt'),
  sweep: A('phys', 'cleave'),
  hurl: A('phys', 'blunt'),
  rush: A('phys', 'pierce'),
  ram: A('phys', 'blunt'),
  leap: A('phys', 'cut'),
  hook: A('phys', 'pierce'),
};

/** 抗性與弱點（依單位 def.id） */
export const AFFINITY: Record<string, { resist?: Attribute[]; weak?: Attribute[] }> = {
  shieldbearer: { resist: ['cut', 'pierce'], weak: ['blunt'] },
  archer: { weak: ['cut'] },
  charger: { resist: ['cleave'], weak: ['blunt'] },
  assassin: { weak: ['blunt'] },
  priest: { resist: ['holy'], weak: ['dark'] },
  summoner: { resist: ['dark'], weak: ['holy'] },
  caster: { resist: ['fire'], weak: ['cold'] },
  bomber: { weak: ['fire'] },
  exploder: { resist: ['cut', 'pierce'], weak: ['fire', 'holy'] },
  minion: { resist: ['cut', 'pierce'], weak: ['blunt', 'holy'] },
  thrall: { resist: ['cut', 'pierce'], weak: ['blunt', 'holy'] },
  lurker: { weak: ['cold'] },
  warlord: { resist: ['cut', 'cleave'], weak: ['holy'] },
};

/** 特殊防禦／特殊護甲（依單位 def.id）；沒列的：特殊防禦＝物理防禦的基本值、特殊護甲＝物理護甲的基本值 */
export const SPEC_DEFENSE: Record<string, { defense: number; armor: number }> = {
  warrior: { defense: 20, armor: 2 },
  ranger: { defense: 25, armor: 2 },
  mage: { defense: 35, armor: 4 },
  cleric: { defense: 35, armor: 4 },
  berserker: { defense: 20, armor: 2 },
  rogue: { defense: 25, armor: 2 },
  hexer: { defense: 35, armor: 4 },
  alchemist: { defense: 28, armor: 2 },
  priest: { defense: 35, armor: 3 },
  summoner: { defense: 35, armor: 3 },
  caster: { defense: 35, armor: 3 },
};

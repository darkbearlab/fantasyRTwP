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
  // 進階職業（SPEC_CLASSES §3）
  guardian: A('phys', 'pierce'),
  gladiator: A('phys', 'cut'),
  fencer: A('phys', 'pierce'),
  totemist: A('phys', 'blunt'),
  totemElder: A('phys', 'blunt'),
  totemBearer: A('phys', 'blunt'),
  liberator: A('phys', 'pierce'),
  cutthroat: A('phys', 'cut'),
  sniper: A('phys', 'pierce'),
  arbalest: A('phys', 'pierce'),
  // 元素法師：普攻同時是火＋寒（相剋取最有利的）
  elementalist: A('spec', 'fire', 'cold', 'blunt'),
  adept: A('spec', 'fire'),
  archmage: A('spec', 'fire', 'cold', 'blunt'),
  necromancer: A('spec', 'fire'),
  deathMage: A('spec', 'dark', 'cold'),
  battlemage: A('phys', 'cleave'),
  paladin: A('phys', 'blunt'),
  zealot: A('phys', 'pierce'),
  highPriest: A('phys', 'blunt'),
  heretic: A('spec', 'dark'),
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
  goblin: A('phys', 'cut'),
  orcWarrior: A('phys', 'cleave'),
  orcShaman: A('spec', 'fire'),
  goblinSlinger: A('phys', 'blunt'),
  ogre: A('phys', 'blunt'),
  orcChief: A('phys', 'cleave'),
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
  drainLife: A('spec', 'dark'),
  holySmite: A('spec', 'holy'),
  hellfire: A('spec', 'fire'),
  bomb: A('phys', 'blunt'),
  selfDestruct: A('phys', 'blunt'),
  sweep: A('phys', 'cleave'),
  hurl: A('phys', 'blunt'),
  clubSweep: A('phys', 'blunt'),
  sentinelSweep: A('phys', 'cleave'),
  sentinelRush: A('phys', 'blunt'),
  sentinelStomp: A('phys', 'blunt'),
  sentinelSweepRush: A('phys', 'cleave'),
  sentinelBreath: A('spec', 'fire', 'dark'),
  chiefLeap: A('phys', 'cleave'),
  boulder: A('phys', 'blunt'),
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
  goblin: { weak: ['cleave', 'fire'] },
  orcShaman: { weak: ['cut'] },
  ogre: { resist: ['blunt'], weak: ['pierce', 'fire'] },
  warTotem: { resist: ['pierce', 'cut'], weak: ['blunt', 'fire'] },
  orcChief: { resist: ['cleave'], weak: ['pierce', 'holy'] },
  champion: { resist: ['cut', 'dark'], weak: ['holy'] },
  hollowArmor: { resist: ['cut', 'pierce'], weak: ['blunt'] },
  golem: { resist: ['cut', 'pierce'], weak: ['blunt'] },
  templeKnight: { resist: ['holy'], weak: ['dark'] },
  crystalGuardian: { resist: ['holy', 'cut'], weak: ['dark', 'blunt'] },
  swarmling: { weak: ['fire', 'cleave'] },
  bugNest: { resist: ['pierce'], weak: ['fire'] },
  caveBeast: { resist: ['blunt'], weak: ['fire', 'holy'] },
  demonElite: { resist: ['dark', 'fire'], weak: ['holy'] },
  demonGuard: { resist: ['dark', 'cut', 'pierce'], weak: ['holy', 'blunt'] },
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
  guardian: { defense: 22, armor: 3 },
  gladiator: { defense: 22, armor: 2 },
  fencer: { defense: 24, armor: 2 },
  totemist: { defense: 30, armor: 5 },
  totemElder: { defense: 32, armor: 6 },
  totemBearer: { defense: 32, armor: 6 },
  liberator: { defense: 26, armor: 3 },
  cutthroat: { defense: 25, armor: 2 },
  sniper: { defense: 25, armor: 2 },
  arbalest: { defense: 25, armor: 2 },
  elementalist: { defense: 38, armor: 4 },
  adept: { defense: 38, armor: 4 },
  archmage: { defense: 38, armor: 4 },
  necromancer: { defense: 38, armor: 4 },
  deathMage: { defense: 38, armor: 4 },
  battlemage: { defense: 35, armor: 4 },
  paladin: { defense: 38, armor: 5 },
  zealot: { defense: 36, armor: 4 },
  highPriest: { defense: 38, armor: 5 },
  heretic: { defense: 38, armor: 4 },
  priest: { defense: 35, armor: 3 },
  summoner: { defense: 35, armor: 3 },
  caster: { defense: 35, armor: 3 },
};

/**
 * 爆擊分級（SPEC_CLASSES §2，Alan 2026-10-21；只用在沉穩節奏）：打進去的判定結果（1d100 ＋ 命中 − 防禦…）
 * 越高，爆擊越重。由高到低排列，取第一個達到門檻的。interrupts：打斷準備中的動作；
 * stagger：額外的失衡定額（SPEC_STAGGER：「致命」原本暈眩 0.5 秒，改成失衡）。
 */
export interface CritTier {
  min: number;
  name: string;
  mult: number;
  interrupts?: boolean;
  stagger?: number;
}
export const CRIT_TIERS: CritTier[] = [
  { min: 150, name: '致命', mult: 2.5, stagger: 15 },
  { min: 120, name: '重擊', mult: 2, interrupts: true, stagger: 8 },
  { min: 100, name: '爆擊', mult: 1.5 },
];

/** 判定結果對應的爆擊等級（沒有爆擊回傳 null） */
export function critTierOf(roll: number, critAt = 100): CritTier | null {
  // 爆擊門檻（data/hit.ts）不是 100 時，各等級的門檻一起平移
  return CRIT_TIERS.find((t) => roll >= t.min + critAt - 100) ?? null;
}

/** 背刺（沉穩節奏）：從背後攻擊改成加命中，不再另外乘傷害倍率；命中高了自然容易打出高等級爆擊 */
export const BACKSTAB_ACCURACY = 40;

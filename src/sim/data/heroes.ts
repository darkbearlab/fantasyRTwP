import type { UnitDef } from './types';

/** 英雄資料（SPEC §10.1）。skills 是預設技能欄，第 1 欄為專用技能（SPEC_SLICE3 §1.1，見 classes.ts） */
export const HEROES: Record<string, UnitDef> = {
  warrior: {
    id: 'warrior', name: '戰士', letter: 'W', color: 0x3a7bd5, team: 'hero',
    maxHp: 140, armor: 6, accuracy: 30, defense: 40, damage: [10, 16],
    range: 0.3, windup: 0.5, recovery: 0.9, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4,
    projectsZoc: true,
    skills: ['guard', 'shieldBash', 'charge'],
  },
  ranger: {
    id: 'ranger', name: '遊俠', letter: 'R', color: 0x3fae4a, team: 'hero',
    maxHp: 80, armor: 2, accuracy: 40, defense: 30, damage: [8, 14],
    range: 12, windup: 0.6, recovery: 1.0, attackSpeed: 1, moveSpeed: 3.5, radius: 0.4,
    projectsZoc: false, projectileSpeed: 24, projectileKind: 'arrow', personality: 'guerrilla',
    skills: ['tumble', 'aimedShot', 'stunArrow'],
  },
  mage: {
    id: 'mage', name: '法師', letter: 'M', color: 0x9b59d0, team: 'hero',
    maxHp: 60, armor: 0, accuracy: 30, defense: 20, damage: [6, 10],
    range: 10, windup: 0.6, recovery: 1.0, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4,
    projectsZoc: false, projectileSpeed: 18, projectileKind: 'bolt', attackDamageType: 'spell', personality: 'guerrilla',
    skills: ['fireball', 'iceBind', 'arcaneMissile'],
  },
  cleric: {
    id: 'cleric', name: '牧師', letter: 'C', color: 0xe0b33a, team: 'hero',
    maxHp: 90, armor: 3, accuracy: 25, defense: 30, damage: [6, 10],
    range: 0.3, windup: 0.5, recovery: 0.9, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4,
    projectsZoc: true,
    skills: ['heal', 'bless', 'holySmite'],
  },
  // ── 切片 3 第一批變體（SPEC_SLICE3 §1.4） ──
  berserker: {
    id: 'berserker', name: '狂戰士', letter: 'Z', color: 0xd35400, team: 'hero',
    maxHp: 125, armor: 4, accuracy: 32, defense: 32, damage: [11, 17],
    range: 0.3, windup: 0.45, recovery: 0.8, attackSpeed: 1, moveSpeed: 3.2, radius: 0.4,
    projectsZoc: false, lowHpDamageBonus: 0.5, personality: 'aggressive',
    skills: ['whirlwind', 'charge', 'shieldBash'],
  },
  rogue: {
    id: 'rogue', name: '盜賊', letter: 'T', color: 0x2c9c8a, team: 'hero',
    maxHp: 85, armor: 2, accuracy: 40, defense: 36, damage: [8, 13],
    range: 0.3, windup: 0.4, recovery: 0.8, attackSpeed: 1, moveSpeed: 3.8, radius: 0.4,
    projectsZoc: false, backstabMult: 1.5,
    skills: ['backstab', 'smokeBomb', 'tumble'],
  },
  hexer: {
    id: 'hexer', name: '咒術師', letter: 'H', color: 0x7d3c98, team: 'hero',
    maxHp: 65, armor: 0, accuracy: 32, defense: 22, damage: [5, 9],
    range: 10, windup: 0.6, recovery: 1.0, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4,
    projectsZoc: false, projectileSpeed: 18, projectileKind: 'curse', attackDamageType: 'spell', personality: 'guerrilla',
    skills: ['curse', 'iceBind', 'swamp'],
  },
  alchemist: {
    id: 'alchemist', name: '煉金術士', letter: 'Y', color: 0x8fbf3a, team: 'hero',
    maxHp: 85, armor: 2, accuracy: 28, defense: 28, damage: [6, 10],
    range: 8, windup: 0.6, recovery: 1.0, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4,
    projectsZoc: false, projectileSpeed: 14, projectileKind: 'flask', arcAttack: true, personality: 'guerrilla',
    skills: ['firebomb', 'healFlask', 'bless'],
  },
  // ── 昇變後的進階職業（SPEC_CLASSES §3；只用在沉穩節奏，數值佔位）──
  ...evolved(),
};

/** 進階職業：從基本職業（或回收的變體）複製，再改差異 */
function evolved(): Record<string, UnitDef> {
  const W: Omit<UnitDef, 'id' | 'name' | 'letter' | 'color'> = {
    team: 'hero', maxHp: 140, armor: 6, accuracy: 30, defense: 40, damage: [10, 16],
    range: 0.3, windup: 0.5, recovery: 0.9, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4, projectsZoc: true, skills: ['shieldBash'],
  };
  const R: typeof W = {
    team: 'hero', maxHp: 80, armor: 2, accuracy: 40, defense: 30, damage: [8, 14],
    range: 12, windup: 0.6, recovery: 1.0, attackSpeed: 1, moveSpeed: 3.5, radius: 0.4,
    projectsZoc: false, projectileSpeed: 24, projectileKind: 'arrow', personality: 'guerrilla', skills: ['sureShot'],
  };
  const M: typeof W = {
    team: 'hero', maxHp: 60, armor: 0, accuracy: 30, defense: 20, damage: [6, 10],
    range: 10, windup: 0.6, recovery: 1.0, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4,
    projectsZoc: false, projectileSpeed: 18, projectileKind: 'bolt', attackDamageType: 'spell', personality: 'guerrilla', skills: ['enchant'],
  };
  const C: typeof W = {
    team: 'hero', maxHp: 90, armor: 3, accuracy: 25, defense: 30, damage: [6, 10],
    range: 0.3, windup: 0.5, recovery: 0.9, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4, projectsZoc: true, skills: ['sanctuary'],
  };
  const list: UnitDef[] = [
    { ...W, id: 'guardian', name: '守護者', letter: 'G', color: 0x2f5fb0, maxHp: 160, armor: 7, skills: ['shieldCounter'] },
    { ...W, id: 'gladiator', name: '角鬥士', letter: 'L', color: 0x5aa0e6, accuracy: 36, damage: [11, 17], skillMods: { shieldBash: { charges: 2 } } },
    { ...R, id: 'cutthroat', name: '刺客', letter: 'K', color: 0x2c9c8a, maxHp: 85, accuracy: 44, defense: 36, damage: [8, 13], range: 0.3, windup: 0.4, recovery: 0.8, moveSpeed: 3.8, projectileSpeed: undefined, projectileKind: undefined, personality: undefined, backstabMult: 1.5, skills: ['stealth'] },
    { ...R, id: 'sniper', name: '狙擊手', letter: 'S', color: 0x2e8b3a, accuracy: 45, damage: [9, 15], skills: ['focus', 'aimedShot'] },
    // 大遊俠（原連弩手，SPEC_CHARACTERS §4.1）：平常和遊俠差不多，主動齊射時連射；數值佔位
    { ...R, id: 'arbalest', name: '大遊俠', letter: 'A', color: 0x7cc576, maxHp: 90, accuracy: 44, damage: [9, 15], skills: ['volley'] },
    // 元素師（芬恩的救贖線，SPEC_CHARACTERS §4.1）：主動改成累積層數的大火球
    { ...M, id: 'elementalist', name: '元素師', letter: 'E', color: 0xc062e0, skills: ['flashFireball', 'greatFireball'] },
    // 下位元素師（芬恩的骨架職業）、大法師、死靈法師（奧爾德斯的兩條線）；數值佔位
    { ...M, id: 'adept', name: '下位元素師', letter: 'F', color: 0xe07a3a, skills: ['flashFireball', 'greatFireball'] },
    { ...M, id: 'archmage', name: '大法師', letter: 'A', color: 0x9a7be8, maxHp: 75, accuracy: 34, defense: 24, skills: ['grandEnchant'] },
    { ...M, id: 'necromancer', name: '死靈法師', letter: 'N', color: 0x4f2a6e, maxHp: 70, accuracy: 32, defense: 22, skills: ['curse', 'curseBurst'] },
    { ...M, id: 'deathMage', name: '死亡法師', letter: 'D', color: 0x6b2f8a, maxHp: 65, accuracy: 32, defense: 22, damage: [5, 9], projectileKind: 'curse', skills: ['curse', 'curseBurst'] },
    { ...M, id: 'battlemage', name: '戰法師', letter: 'B', color: 0x8e5fc0, maxHp: 110, armor: 4, defense: 32, damage: [9, 14], range: 0.3, windup: 0.5, recovery: 0.9, projectileSpeed: undefined, projectileKind: undefined, attackDamageType: undefined, personality: undefined, projectsZoc: true, skills: ['selfEnchant'] },
    // 聖騎士改成戰士底（SPEC_CHARACTERS §4.1）；數值佔位
    { ...W, id: 'paladin', name: '聖騎士', letter: 'P', color: 0xf0d060, maxHp: 150, armor: 6, skills: ['holyGround'] },
    { ...C, id: 'zealot', name: '狂信者', letter: 'Z', color: 0xd0902a, accuracy: 30 },
    // 大祭司（SPEC_CHARACTERS §4.1）：數值膨脹版的牧師；數值佔位
    { ...C, id: 'highPriest', name: '大祭司', letter: 'H', color: 0xf5e6a0, maxHp: 110, armor: 4, defense: 34, skills: ['grandSanctuary'] },
    { ...C, id: 'heretic', name: '邪教徒', letter: 'X', color: 0x8b1e3f, maxHp: 80, range: 8, windup: 0.6, recovery: 1.0, projectileSpeed: 18, projectileKind: 'curse', attackDamageType: 'spell', personality: 'guerrilla', projectsZoc: false, skills: ['drainLife'] },
  ];
  return Object.fromEntries(list.map((d) => [d.id, d]));
}

/** 英雄欄位順序（決定快捷鍵列） */
export const HERO_ORDER = ['warrior', 'ranger', 'mage', 'cleric'];

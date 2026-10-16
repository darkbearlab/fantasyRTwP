import type { UnitDef } from './types';

/** 英雄資料（SPEC §10.1） */
export const HEROES: Record<string, UnitDef> = {
  warrior: {
    id: 'warrior', name: '戰士', letter: 'W', color: 0x3a7bd5, team: 'hero',
    maxHp: 140, armor: 6, accuracy: 30, defense: 40, damage: [10, 16],
    range: 0.3, windup: 0.5, recovery: 0.9, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4,
    projectsZoc: true,
    skills: ['shieldBash', 'guard', 'charge'],
  },
  ranger: {
    id: 'ranger', name: '遊俠', letter: 'R', color: 0x3fae4a, team: 'hero',
    maxHp: 80, armor: 2, accuracy: 40, defense: 30, damage: [8, 14],
    range: 12, windup: 0.6, recovery: 1.0, attackSpeed: 1, moveSpeed: 3.5, radius: 0.4,
    projectsZoc: false, projectileSpeed: 24, projectileKind: 'arrow', personality: 'guerrilla',
    skills: ['aimedShot', 'stunArrow', 'tumble'],
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
};

/** 英雄欄位順序（決定快捷鍵列） */
export const HERO_ORDER = ['warrior', 'ranger', 'mage', 'cleric'];

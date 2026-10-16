import type { UnitDef } from './types';

/**
 * 敵人資料（SPEC §10.3）。數值為實作者自訂起始值，依英雄表比例設計，
 * 目標：合理操作下勝率高、亂按會輸（SPEC §17-3 待確認）。
 */
export const ENEMIES: Record<string, UnitDef> = {
  brute: {
    id: 'brute', name: '蠻兵', letter: 'B', color: 0xc0392b, team: 'enemy', ai: 'brute',
    maxHp: 105, armor: 4, accuracy: 25, defense: 30, damage: [9, 14],
    range: 0.3, windup: 0.7, recovery: 1.1, attackSpeed: 1, moveSpeed: 2.6, radius: 0.45,
    projectsZoc: true,
    skills: [],
  },
  skirmisher: {
    id: 'skirmisher', name: '刺客', letter: 'K', color: 0xe8743b, team: 'enemy', ai: 'skirmisher',
    maxHp: 55, armor: 1, accuracy: 40, defense: 40, damage: [8, 13],
    range: 0.3, windup: 0.4, recovery: 0.7, attackSpeed: 1, moveSpeed: 4.3, radius: 0.38,
    projectsZoc: false,
    skills: [],
  },
  archer: {
    id: 'archer', name: '弓手', letter: 'A', color: 0xd35d6e, team: 'enemy', ai: 'archer',
    maxHp: 50, armor: 1, accuracy: 35, defense: 25, damage: [6, 10],
    range: 10, windup: 0.7, recovery: 1.1, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4,
    projectsZoc: false, projectileSpeed: 22, projectileKind: 'arrow',
    skills: [],
  },
  caster: {
    id: 'caster', name: '術士', letter: 'S', color: 0x8e1b3a, team: 'enemy', ai: 'caster',
    maxHp: 60, armor: 0, accuracy: 30, defense: 20, damage: [5, 9],
    range: 10, windup: 0.8, recovery: 1.2, attackSpeed: 1, moveSpeed: 2.8, radius: 0.4,
    projectsZoc: false, projectileSpeed: 16, projectileKind: 'bolt', attackDamageType: 'spell',
    skills: ['hellfire'],
  },
};

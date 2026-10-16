import type { UnitDef } from './types';

/**
 * 敵人資料（SPEC §10.3）。數值為實作者自訂起始值，依英雄表比例設計，
 * 目標：合理操作下勝率高、亂按會輸（SPEC §17-3 待確認）。
 */
export const ENEMIES: Record<string, UnitDef> = {
  brute: {
    id: 'brute', name: '蠻兵', letter: 'B', color: 0xc0392b, team: 'enemy', ai: 'brute',
    maxHp: 105, armor: 4, accuracy: 25, defense: 30, damage: [7, 11],
    range: 0.3, windup: 0.7, recovery: 1.1, attackSpeed: 1, moveSpeed: 2.6, radius: 0.45,
    projectsZoc: true,
    skills: [],
  },
  skirmisher: {
    id: 'skirmisher', name: '刺客', letter: 'K', color: 0xe8743b, team: 'enemy', ai: 'skirmisher',
    maxHp: 55, armor: 1, accuracy: 40, defense: 40, damage: [6, 10],
    range: 0.3, windup: 0.4, recovery: 0.7, attackSpeed: 1, moveSpeed: 4.3, radius: 0.38,
    projectsZoc: false,
    skills: [],
  },
  archer: {
    id: 'archer', name: '弓手', letter: 'A', color: 0xd35d6e, team: 'enemy', ai: 'archer',
    maxHp: 50, armor: 1, accuracy: 30, defense: 25, damage: [4, 7],
    range: 8, windup: 0.7, recovery: 1.1, attackSpeed: 1, moveSpeed: 3.0, radius: 0.4,
    projectsZoc: false, projectileSpeed: 22, projectileKind: 'arrow',
    skills: [],
  },
  caster: {
    id: 'caster', name: '術士', letter: 'S', color: 0x8e1b3a, team: 'enemy', ai: 'caster',
    maxHp: 60, armor: 0, accuracy: 30, defense: 20, damage: [4, 7],
    range: 10, windup: 0.8, recovery: 1.2, attackSpeed: 1, moveSpeed: 2.8, radius: 0.4,
    projectsZoc: false, projectileSpeed: 16, projectileKind: 'bolt', attackDamageType: 'spell',
    skills: ['hellfire'],
  },
  // ── 切片 3 新敵人（SPEC_SLICE3 §3） ──
  siege: {
    id: 'siege', name: '攻城兵', letter: 'X', color: 0x9c4a1a, team: 'enemy', ai: 'siege',
    maxHp: 150, armor: 6, accuracy: 25, defense: 25, damage: [8, 12],
    range: 0.3, windup: 0.8, recovery: 1.2, attackSpeed: 1, moveSpeed: 2.4, radius: 0.5,
    projectsZoc: true, ignoresZoc: true,
    skills: ['ram'],
  },
  bomber: {
    id: 'bomber', name: '投彈手', letter: 'O', color: 0xc77a2e, team: 'enemy', ai: 'bomber',
    maxHp: 55, armor: 1, accuracy: 30, defense: 25, damage: [4, 7],
    range: 7, windup: 0.9, recovery: 1.3, attackSpeed: 1, moveSpeed: 2.8, radius: 0.4,
    projectsZoc: false, projectileSpeed: 12, projectileKind: 'flask', arcAttack: true,
    skills: ['bomb'],
  },
  lurker: {
    id: 'lurker', name: '潛行者', letter: 'V', color: 0x6b3a5a, team: 'enemy', ai: 'lurker',
    maxHp: 50, armor: 1, accuracy: 40, defense: 40, damage: [7, 11],
    range: 0.3, windup: 0.35, recovery: 0.7, attackSpeed: 1, moveSpeed: 4.5, radius: 0.38,
    projectsZoc: false, startsHidden: true,
    skills: [],
  },
  /** 頭目：戰爭領主（SPEC_SLICE2 §7.3） */
  warlord: {
    id: 'warlord', name: '戰爭領主', letter: 'L', color: 0x7a0d0d, team: 'enemy', ai: 'boss',
    maxHp: 630, armor: 6, accuracy: 35, defense: 35, damage: [12, 18],
    range: 0.4, windup: 0.8, recovery: 1.2, attackSpeed: 1, moveSpeed: 2.4, radius: 0.7,
    projectsZoc: true,
    skills: ['sweep', 'warcry'],
  },
};

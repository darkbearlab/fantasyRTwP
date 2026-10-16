import type { SkillDef } from './types';

/** 技能資料（SPEC §10.2，以及敵方術士的範圍法術） */
export const SKILLS: Record<string, SkillDef> = {
  // ── 戰士 ──
  shieldBash: {
    id: 'shieldBash', name: '盾擊', description: '近戰：傷害 ×0.8，打斷，暈眩 1 秒',
    target: 'enemy', range: 0.3, windup: 0.3, recovery: 0.8, cooldown: 8, requiresLos: false,
    effect: { kind: 'strike', melee: true, mult: 0.8, interrupts: true, stun: 1.0 },
  },
  guard: {
    id: 'guard', name: '守護', description: '6 秒內，友軍受到的近戰攻擊有 50% 改由戰士承受',
    target: 'ally', range: 5, windup: 0.2, recovery: 0.5, cooldown: 15, requiresLos: false,
    effect: { kind: 'guard', duration: 6, chance: 0.5 },
  },
  charge: {
    id: 'charge', name: '衝鋒', description: '以 3 倍速衝到敵人身邊（無視控制區），抵達時攻擊一次',
    target: 'enemy', range: 12, windup: 0.2, recovery: 0.6, cooldown: 12, requiresLos: true, ignoresZoc: true,
    effect: { kind: 'charge', speedMult: 3, maxDuration: 2.5 },
  },
  // ── 遊俠 ──
  aimedShot: {
    id: 'aimedShot', name: '瞄準射擊', description: '傷害 ×2.0，命中 +30',
    target: 'enemy', range: 12, windup: 1.5, recovery: 1.0, cooldown: 6, requiresLos: true,
    effect: { kind: 'strike', melee: false, mult: 2.0, accBonus: 30, projectileSpeed: 30, projectileKind: 'arrow' },
  },
  stunArrow: {
    id: 'stunArrow', name: '震懾箭', description: '傷害 ×0.5，打斷',
    target: 'enemy', range: 12, windup: 0.3, recovery: 0.6, cooldown: 8, requiresLos: true,
    effect: { kind: 'strike', melee: false, mult: 0.5, interrupts: true, projectileSpeed: 30, projectileKind: 'arrow' },
  },
  tumble: {
    id: 'tumble', name: '翻滾', description: '快速位移到 6 m 內的指定點（無視控制區）',
    target: 'ground', range: 6, windup: 0.1, recovery: 0.4, cooldown: 10, requiresLos: false, ignoresZoc: true,
    effect: { kind: 'tumble', speed: 12 },
  },
  // ── 法師 ──
  fireball: {
    id: 'fireball', name: '火球', description: '半徑 2.5 m 範圍傷害 18–26，會傷到友軍',
    target: 'ground', range: 12, windup: 2.0, recovery: 1.2, cooldown: 12, requiresLos: true,
    effect: { kind: 'aoe', radius: 2.5, damage: [18, 26], friendlyFire: true, projectileSpeed: 16, projectileKind: 'fireball' },
  },
  iceBind: {
    id: 'iceBind', name: '冰縛', description: '定身 4 秒（不能移動，可攻擊）',
    target: 'enemy', range: 10, windup: 0.8, recovery: 0.8, cooldown: 10, requiresLos: true,
    effect: { kind: 'root', duration: 4, projectileSpeed: 20, projectileKind: 'frost' },
  },
  arcaneMissile: {
    id: 'arcaneMissile', name: '奧術飛彈', description: '傷害 8–12，打斷',
    target: 'enemy', range: 10, windup: 0.2, recovery: 0.6, cooldown: 5, requiresLos: true,
    effect: { kind: 'strike', melee: false, mult: 1, flatDamage: [8, 12], damageType: 'spell', interrupts: true, projectileSpeed: 26, projectileKind: 'missile' },
  },
  // ── 牧師 ──
  heal: {
    id: 'heal', name: '治療', description: '恢復 35 生命',
    target: 'allyOrSelf', range: 10, windup: 1.0, recovery: 0.8, cooldown: 6, requiresLos: true,
    effect: { kind: 'heal', amount: 35 },
  },
  bless: {
    id: 'bless', name: '祝福', description: '自身周圍 6 m 友軍 10 秒內命中 +15、防禦 +10',
    target: 'self', range: 0, windup: 0.6, recovery: 0.8, cooldown: 20, requiresLos: false,
    effect: { kind: 'bless', radius: 6, duration: 10, accuracy: 15, defense: 10 },
  },
  holySmite: {
    id: 'holySmite', name: '聖光震擊', description: '近戰：傷害 ×1.2，擊退 2 m',
    target: 'enemy', range: 0.3, windup: 0.4, recovery: 0.8, cooldown: 10, requiresLos: false,
    effect: { kind: 'strike', melee: true, mult: 1.2, knockback: 2 },
  },
  // ── 頭目：戰爭領主 ──
  sweep: {
    id: 'sweep', name: '橫掃', description: '前方扇形範圍攻擊，準備 1.5 秒，可打斷',
    target: 'ground', range: 3, windup: 1.5, recovery: 1.0, cooldown: 7, requiresLos: false, telegraph: true,
    effect: { kind: 'cone', radius: 3.6, angle: 110, damage: [18, 26], friendlyFire: false },
  },
  warcry: {
    id: 'warcry', name: '戰吼', description: '召喚 3 名蠻兵，全體敵人 10 秒內傷害 +20%；準備 2.0 秒，被打斷就不能再用',
    target: 'self', range: 0, windup: 2.0, recovery: 1.0, cooldown: 999, requiresLos: false, telegraph: true,
    oncePerBattle: true, lostOnInterrupt: true,
    effect: { kind: 'warcry', summon: { enemy: 'brute', count: 3 }, damageBuff: 1.2, duration: 10 },
  },
  // ── 敵方術士 ──
  hellfire: {
    id: 'hellfire', name: '獄火', description: '準備 2.5 秒後，半徑 2.5 m 範圍傷害 12–18',
    target: 'ground', range: 10, windup: 2.5, recovery: 1.5, cooldown: 12, requiresLos: true, telegraph: true,
    effect: { kind: 'aoe', radius: 2.5, damage: [12, 18], friendlyFire: false },
  },
};

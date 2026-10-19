import type { SkillDef } from './types';

/** 技能資料（SPEC §10.2，以及敵方術士的範圍法術） */
export const SKILLS: Record<string, SkillDef> = {
  // ── 戰士 ──
  shieldBash: {
    id: 'shieldBash', name: '盾擊', description: '近戰：傷害 ×0.8，打斷，暈眩 1 秒；可碎冰',
    target: 'enemy', range: 0.3, windup: 0.3, recovery: 0.8, cooldown: 8, requiresLos: false,
    effect: { kind: 'strike', melee: true, mult: 0.8, interrupts: true, stun: 1.0, shatters: true },
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
    effect: { kind: 'aoe', radius: 2.5, damage: [18, 26], friendlyFire: true, ignites: true, projectileSpeed: 16, projectileKind: 'fireball' },
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
    id: 'holySmite', name: '聖光震擊', description: '近戰：傷害 ×1.2，擊退 2 m；撞牆暈眩、可碎冰',
    target: 'enemy', range: 0.3, windup: 0.4, recovery: 0.8, cooldown: 10, requiresLos: false,
    effect: { kind: 'strike', melee: true, mult: 1.2, knockback: 2, shatters: true, wallStun: true },
  },
  // ── 共用池（切片 3 新增） ──
  battleCry: {
    id: 'battleCry', name: '戰吼', description: '自身周圍 6 m 友軍 8 秒內命中 +15',
    target: 'self', range: 0, windup: 0.4, recovery: 0.6, cooldown: 18, requiresLos: false,
    effect: { kind: 'bless', radius: 6, duration: 8, accuracy: 15, defense: 0 },
  },
  smokeBomb: {
    id: 'smokeBomb', name: '煙霧彈', description: '2.5 秒內無視控制區、敵人看不到你（2 m 內除外，攻擊會解除）',
    target: 'self', range: 0, windup: 0.1, recovery: 0.3, cooldown: 16, requiresLos: false,
    effect: { kind: 'smoke', duration: 2.5 },
  },
  swamp: {
    id: 'swamp', name: '沼澤', description: '半徑 2.5 m 區域 8 秒內敵人移動 ×0.5（減速，不算定身）',
    target: 'ground', range: 10, windup: 0.8, recovery: 0.8, cooldown: 14, requiresLos: true,
    effect: { kind: 'zone', radius: 2.5, lingering: { duration: 8, affects: 'enemy', effects: [{ kind: 'slow', moveMult: 0.5 }], style: 'swamp' } },
  },
  healFlask: {
    id: 'healFlask', name: '治療藥瓶', description: '拋物線投擲（不需視線）：半徑 2 m 友軍恢復 20 生命',
    target: 'ground', range: 10, windup: 0.8, recovery: 0.8, cooldown: 12, requiresLos: false,
    effect: { kind: 'aoeHeal', radius: 2, amount: 20, projectileSpeed: 14, projectileKind: 'flask' },
  },
  // ── 變體專用（切片 3） ──
  whirlwind: {
    id: 'whirlwind', name: '旋風斬', description: '打周圍 1.8 m 內所有敵人，傷害 ×0.9；可碎冰',
    target: 'self', range: 0, windup: 0.5, recovery: 0.8, cooldown: 8, requiresLos: false,
    effect: { kind: 'whirlwind', radius: 1.8, mult: 0.9, shatters: true },
  },
  backstab: {
    id: 'backstab', name: '背刺', description: '近戰：從背後攻擊傷害 ×2.5（正面 ×1）；暈眩中的目標必定爆擊；可碎冰',
    target: 'enemy', range: 0.3, windup: 0.3, recovery: 0.7, cooldown: 8, requiresLos: false,
    effect: { kind: 'strike', melee: true, mult: 1, behindMult: 2.5, critVsStunned: true, shatters: true },
  },
  curse: {
    id: 'curse', name: '衰弱詛咒', description: '8 秒內目標行動條慢 40%、受到傷害 +15%',
    target: 'enemy', range: 10, windup: 0.6, recovery: 0.8, cooldown: 14, requiresLos: true,
    effect: { kind: 'curse', duration: 8, actionSlow: 0.4, damageTakenPct: 0.15, projectileSpeed: 20, projectileKind: 'curse' },
  },
  firebomb: {
    id: 'firebomb', name: '火焰瓶', description: '拋物線投擲（不需視線）：半徑 2 m 傷害 10–14，點燃草叢、使敵人燃燒',
    target: 'ground', range: 10, windup: 0.8, recovery: 0.8, cooldown: 10, requiresLos: false,
    effect: { kind: 'aoe', radius: 2, damage: [10, 14], friendlyFire: false, ignites: true, burns: true, projectileSpeed: 14, projectileKind: 'flask' },
  },
  // ── 沉穩節奏（SPEC_SLICE5 v0.4）：煉金術士的火焰瓶會在地上留下持續燃燒的區域 ──
  fireFlask: {
    id: 'fireFlask', name: '火焰瓶', description: '拋物線投擲（不需視線）：半徑 2 m 傷害 10–14，地上燃燒 5 秒，站在火裡的敵人持續燃燒',
    target: 'ground', range: 10, windup: 0.8, recovery: 0.8, cooldown: 10, requiresLos: false,
    effect: { kind: 'aoe', radius: 2, damage: [10, 14], friendlyFire: false, ignites: true, burns: true, lingering: { duration: 5, affects: 'enemy', effects: [{ kind: 'burn' }], style: 'fire' }, projectileSpeed: 14, projectileKind: 'flask' },
  },
  // ── 切片 3 新敵人 ──
  ram: {
    id: 'ram', name: '撞擊', description: '衝向英雄（無視控制區），抵達時攻擊並擊退 2 m',
    target: 'enemy', range: 9, windup: 0.6, recovery: 1.0, cooldown: 10, requiresLos: true, ignoresZoc: true,
    effect: { kind: 'charge', speedMult: 2.5, maxDuration: 2.5, knockback: 2 },
  },
  bomb: {
    id: 'bomb', name: '投彈', description: '拋物線投擲（不需視線）：半徑 1.5 m 傷害 6–9',
    target: 'ground', range: 7, windup: 1.0, recovery: 1.2, cooldown: 6, requiresLos: false,
    effect: { kind: 'aoe', radius: 1.5, damage: [6, 9], friendlyFire: false, projectileSpeed: 12, projectileKind: 'flask' },
  },
  // ── 頭目：戰爭領主 ──
  sweep: {
    id: 'sweep', name: '橫掃', description: '前方扇形範圍攻擊，準備 1.5 秒，可打斷',
    target: 'ground', range: 3, windup: 1.5, recovery: 1.0, cooldown: 7, requiresLos: false, telegraph: true,
    effect: { kind: 'cone', radius: 3.6, angle: 110, damage: [14, 20], friendlyFire: false },
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

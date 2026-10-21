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
  // ── 昇變用的通用機制（SPEC_CLASSES §2；還沒有職業使用，數值佔位） ──
  focus: {
    id: 'focus', name: '集中', description: '進入集中：每秒讓下一發威力 +25%（最多 4 秒）；移動或受傷就中斷',
    target: 'self', range: 0, windup: 0.2, recovery: 0.2, cooldown: 2, requiresLos: false,
    effect: { kind: 'focus', perSec: 0.25, maxSec: 4 },
  },
  // ── 進階職業的主動（SPEC_CLASSES §3，數值佔位） ──
  elementalEnchant: {
    id: 'elementalEnchant', name: '元素附魔', description: '6 m 內的隊友（含自己）10 秒內傷害 +30%，攻擊多帶火＋寒屬性（相剋取最有利的）',
    target: 'self', range: 0, windup: 0.6, recovery: 0.8, cooldown: 20, requiresLos: false,
    effect: { kind: 'enchant', radius: 6, duration: 10, damagePct: 0.3, attrs: ['fire', 'cold'] },
  },
  selfEnchant: {
    id: 'selfEnchant', name: '戰意附魔', description: '只附魔自己：10 秒內傷害 +60%',
    target: 'self', range: 0, windup: 0.4, recovery: 0.6, cooldown: 16, requiresLos: false,
    effect: { kind: 'enchant', radius: 0.5, duration: 10, damagePct: 0.6 },
  },
  holyGround: {
    id: 'holyGround', name: '聖域・審判', description: '地上一圈聖光：5 秒內，範圍內的友軍受到的傷害 −30%、敵人移動變慢 40%',
    target: 'ground', range: 6, windup: 0.6, recovery: 0.8, cooldown: 12, requiresLos: false,
    effect: {
      kind: 'zone', radius: 2.5,
      lingering: { duration: 5, affects: 'ally', effects: [{ kind: 'ward', reduction: 0.3 }], style: 'holy' },
      extra: { duration: 5, affects: 'enemy', effects: [{ kind: 'slow', moveMult: 0.6 }] },
    },
  },
  drainLife: {
    id: 'drainLife', name: '吸血', description: '從敵人或友軍身上吸取生命補給自己；吸友軍吸得比較多，但都不是 1:1',
    target: 'unit', range: 8, windup: 0.6, recovery: 0.8, cooldown: 10, requiresLos: true,
    effect: { kind: 'drain', enemy: { damage: [12, 16], convert: 0.5 }, ally: { damage: [16, 20], convert: 0.6 } },
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
  /** 牧師的主動（Alan 2026-10-21：換掉治療藥瓶，回血改靠戰後的被動與消耗品） */
  sanctuary: {
    id: 'sanctuary', name: '聖域', description: '地上一圈聖光：5 秒內，範圍內的友軍受到的傷害 −30%',
    target: 'ground', range: 6, windup: 0.6, recovery: 0.8, cooldown: 12, requiresLos: false,
    effect: { kind: 'zone', radius: 2.5, lingering: { duration: 5, affects: 'ally', effects: [{ kind: 'ward', reduction: 0.3 }], style: 'holy' } },
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
  // Alan 2026-10-20：施法節奏比照法師火球——不用準備、直接丟出（有飛行時間），恢復 1.2 秒、冷卻 12 秒
  fireFlask: {
    id: 'fireFlask', name: '火焰瓶', description: '立即拋出（不需視線）：半徑 2 m 傷害 10–14，落點地面燃燒 5 秒，站在火裡的敵人持續燃燒',
    target: 'ground', range: 10, windup: 0, recovery: 1.2, cooldown: 12, requiresLos: false,
    effect: { kind: 'aoe', radius: 2, damage: [10, 14], friendlyFire: false, ignites: true, burns: true, lingering: { duration: 5, affects: 'enemy', effects: [{ kind: 'burn' }], style: 'fire' }, projectileSpeed: 14, projectileKind: 'flask' },
  },
  // ── 沉穩節奏的法師火球（Alan 2026-10-20：不用準備、直接丟出，仍有出手動作與飛行時間；放完進冷卻。範圍與傷害同 fireball） ──
  flashFireball: {
    id: 'flashFireball', name: '火球', description: '立即丟出火球，飛到目標點爆炸：半徑 2.5 m 範圍傷害 18–26，會傷到友軍',
    target: 'ground', range: 12, windup: 0, recovery: 1.2, cooldown: 12, requiresLos: true,
    effect: { kind: 'aoe', radius: 2.5, damage: [18, 26], friendlyFire: true, ignites: true, projectileSpeed: 16, projectileKind: 'fireball' },
  },
  // ── Alan 2026-10-20 英雄技能重整（沉穩節奏；數值佔位） ──
  sureShot: {
    id: 'sureShot', name: '瞄準射擊', description: '傷害 ×2.0、命中 +60（幾乎必中），打斷目標',
    target: 'enemy', range: 12, windup: 1.5, recovery: 1.0, cooldown: 6, requiresLos: true,
    effect: { kind: 'strike', melee: false, mult: 2.0, accBonus: 60, interrupts: true, projectileSpeed: 30, projectileKind: 'arrow' },
  },
  enchant: {
    id: 'enchant', name: '附魔', description: '6 m 內的隊友（含自己）10 秒內造成的傷害 +30%',
    target: 'self', range: 0, windup: 0.6, recovery: 0.8, cooldown: 20, requiresLos: false,
    effect: { kind: 'enchant', radius: 6, duration: 10, damagePct: 0.3 },
  },
  // ── 技能循環的第二招（SPEC_SLICE5 §16） ──
  greatFireball: {
    id: 'greatFireball', name: '大火球', description: '（充能 5 層後）準備完成後立即爆炸：半徑 3.5 m 範圍傷害 30–40，會傷到友軍',
    target: 'ground', range: 12, windup: 2.0, recovery: 1.2, cooldown: 4, requiresLos: true,
    effect: { kind: 'aoe', radius: 3.5, damage: [30, 40], friendlyFire: true, ignites: true },
  },
  curseBurst: {
    id: 'curseBurst', name: '詛咒爆裂', description: '引爆目標身上的詛咒：傷害 20–28 並解除詛咒；目標沒有詛咒時只有 6–9',
    target: 'enemy', range: 10, windup: 0.5, recovery: 0.8, cooldown: 3, requiresLos: true,
    effect: { kind: 'curseBurst', damage: [20, 28], uncursedDamage: [6, 9], projectileSpeed: 24, projectileKind: 'curse' },
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
  hurl: {
    id: 'hurl', name: '擲人', description: '抓起身邊的一名英雄，丟向遠處另一名英雄；落點有預兆圈，落地時範圍傷害，被丟的人暈眩',
    target: 'enemy', range: 0.6, windup: 1.0, recovery: 1.0, cooldown: 12, requiresLos: false, telegraph: true,
    effect: { kind: 'hurl', radius: 2.0, damage: [14, 20], flight: 0.6, stun: 0.8, minDist: 4, maxDist: 11 },
  },
  warcry: {
    id: 'warcry', name: '戰吼', description: '召喚 3 名援軍（沉穩節奏是屍僕雜魚，舊模式是蠻兵），全體敵人 10 秒內傷害 +20%；準備 2.0 秒，被打斷就不能再用',
    target: 'self', range: 0, windup: 2.0, recovery: 1.0, cooldown: 999, requiresLos: false, telegraph: true,
    oncePerBattle: true, lostOnInterrupt: true,
    effect: { kind: 'warcry', summon: { enemy: 'brute', count: 3 }, deliberateSummon: { enemy: 'minion', count: 3 }, damageBuff: 1.2, duration: 10 },
  },
  // ── 沉穩節奏的新敵人（SPEC_SLICE5 §15.2；全部有預兆；準備時間 ×1.8、冷卻 ×2 後才是實際秒數） ──
  rush: {
    id: 'rush', name: '直線衝鋒', description: '地面預兆線約 1.5 秒後直線衝鋒 8 m，撞到的英雄受傷（不擊倒）',
    target: 'ground', range: 8, windup: 0.85, recovery: 1.2, cooldown: 5, requiresLos: true, telegraph: true,
    effect: { kind: 'rush', distance: 8, speed: 11, width: 1.2, damage: [10, 15] },
  },
  leap: {
    id: 'leap', name: '跳躍突進', description: '落點預兆圈約 0.8 秒後跳到目標點，落地時攻擊周圍',
    target: 'ground', range: 9, windup: 0.45, recovery: 0.8, cooldown: 5, requiresLos: true, telegraph: true,
    effect: { kind: 'leap', speed: 12, radius: 1.3, mult: 1.3 },
  },
  hook: {
    id: 'hook', name: '鉤鎖', description: '預兆線約 1 秒後把目標拉到身前（需要視線，被擋住就落空）',
    target: 'enemy', range: 8, windup: 0.55, recovery: 1.0, cooldown: 6, requiresLos: true, telegraph: true,
    effect: { kind: 'pull', mult: 0.6 },
  },
  // ── 魔王的冠軍（Alan 2026-10-22；數值佔位） ──
  sentinelSweep: {
    id: 'sentinelSweep', name: '扇形揮擊', description: '前方扇形範圍攻擊',
    target: 'ground', range: 2.5, windup: 0.8, recovery: 0.6, cooldown: 2, requiresLos: false, telegraph: true,
    effect: { kind: 'cone', radius: 3.4, angle: 120, damage: [14, 20], friendlyFire: false },
  },
  sentinelRush: {
    id: 'sentinelRush', name: '直線衝鋒', description: '直線衝鋒 9 m，撞到的英雄受傷；撞牆會自己暈眩',
    target: 'ground', range: 9, windup: 0.9, recovery: 0.8, cooldown: 4, requiresLos: true, telegraph: true,
    effect: { kind: 'rush', distance: 9, speed: 12, width: 1.4, damage: [14, 20], wallStun: 2 },
  },
  sentinelStomp: {
    id: 'sentinelStomp', name: '馬匹震地', description: '以自己為中心的範圍攻擊並擊退',
    target: 'self', range: 0, windup: 0.8, recovery: 0.6, cooldown: 4, requiresLos: false, telegraph: true,
    effect: { kind: 'quake', radius: 2.6, damage: [10, 15], knockback: 2.2 },
  },
  sentinelSweepRush: {
    id: 'sentinelSweepRush', name: '橫掃衝鋒', description: '直線衝鋒，武器橫在右側一起帶過去：衝鋒路徑和旁邊的一條帶狀區域都有傷害；撞牆會自己暈眩',
    target: 'ground', range: 9, windup: 1.1, recovery: 0.9, cooldown: 6, requiresLos: true, telegraph: true,
    effect: { kind: 'rush', distance: 9, speed: 12, width: 1.4, damage: [12, 18], wallStun: 2, side: { offset: 2, width: 1.6, damage: [14, 20] } },
  },
  sentinelBreath: {
    id: 'sentinelBreath', name: '吐息', description: '細長扇形的火焰與黑暗吐息（火＋暗屬性）',
    target: 'ground', range: 6, windup: 1.4, recovery: 1.0, cooldown: 6, requiresLos: false, telegraph: true,
    effect: { kind: 'cone', radius: 7, angle: 34, damage: [16, 24], friendlyFire: false },
  },
  // ── 第 2 章：獸人部落（數值佔位） ──
  frenzy: {
    id: 'frenzy', name: '狂暴', description: '6 m 內的同伴 8 秒內傷害 +25%；準備 1.2 秒，可打斷',
    target: 'self', range: 0, windup: 1.2, recovery: 1.0, cooldown: 14, requiresLos: false, telegraph: true,
    effect: { kind: 'enchant', radius: 6, duration: 8, damagePct: 0.25 },
  },
  clubSweep: {
    id: 'clubSweep', name: '巨棒橫掃', description: '前方扇形範圍攻擊並擊退，準備 1.2 秒，可打斷',
    target: 'ground', range: 2.5, windup: 1.2, recovery: 1.0, cooldown: 7, requiresLos: false, telegraph: true,
    effect: { kind: 'cone', radius: 2.8, angle: 100, damage: [12, 17], friendlyFire: false },
  },
  orcWarcry: {
    id: 'orcWarcry', name: '戰吼', description: '叫來 4 名哥布林，全體敵人 10 秒內傷害 +20%；準備 2.0 秒，被打斷就不能再用',
    target: 'self', range: 0, windup: 2.0, recovery: 1.0, cooldown: 999, requiresLos: false, telegraph: true,
    oncePerBattle: true, lostOnInterrupt: true,
    effect: { kind: 'warcry', summon: { enemy: 'goblin', count: 4 }, damageBuff: 1.2, duration: 10 },
  },
  chiefLeap: {
    id: 'chiefLeap', name: '跳斬', description: '落點預兆圈後跳到後排，落地時攻擊周圍',
    target: 'ground', range: 11, windup: 0.9, recovery: 1.2, cooldown: 10, requiresLos: true, telegraph: true,
    effect: { kind: 'leap', speed: 11, radius: 2, mult: 1.5 },
  },
  boulder: {
    id: 'boulder', name: '投擲巨石', description: '拋物線投擲（不需視線）：落點預兆圈，半徑 2.2 m 傷害 14–20',
    target: 'ground', range: 13, windup: 1.6, recovery: 1.2, cooldown: 9, requiresLos: false, telegraph: true,
    effect: { kind: 'aoe', radius: 2.2, damage: [14, 20], friendlyFire: false, projectileSpeed: 10, projectileKind: 'flask' },
  },
  mend: {
    id: 'mend', name: '治癒禱言', description: '準備約 2.5 秒（可打斷）後恢復一名同伴 30 生命',
    target: 'ally', range: 9, windup: 1.4, recovery: 1.0, cooldown: 4, requiresLos: true, telegraph: true,
    effect: { kind: 'heal', amount: 30 },
  },
  summonThralls: {
    id: 'summonThralls', name: '召喚屍僕', description: '召喚圈約 1.5 秒後在身邊召喚 3 隻屍僕；每 15 秒一次',
    target: 'self', range: 0, windup: 0.85, recovery: 1.0, cooldown: 7.5, requiresLos: false, telegraph: true,
    effect: { kind: 'summon', enemy: 'minion', count: 3, radius: 1.8 },
  },
  selfDestruct: {
    id: 'selfDestruct', name: '自爆', description: '倒數約 2 秒後以自己為中心爆炸（半徑 2.2 m），然後死亡',
    target: 'self', range: 0, windup: 1.1, recovery: 0, cooldown: 99, requiresLos: false, telegraph: true,
    effect: { kind: 'explode', radius: 2.2, damage: [14, 20] },
  },
  // ── 敵方術士 ──
  hellfire: {
    id: 'hellfire', name: '獄火', description: '準備 2.5 秒後，半徑 2.5 m 範圍傷害 12–18',
    target: 'ground', range: 10, windup: 2.5, recovery: 1.5, cooldown: 12, requiresLos: true, telegraph: true,
    effect: { kind: 'aoe', radius: 2.5, damage: [12, 18], friendlyFire: false },
  },
};

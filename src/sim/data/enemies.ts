import type { TargetingWeights, UnitDef } from './types';

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
  // ── 切片 4 怪群試作：雜兵（SPEC_SLICE4 §1.1；名稱與數值皆為佔位） ──
  thrall: {
    id: 'thrall', name: '屍僕', letter: 't', color: 0x8a6d5a, team: 'enemy', ai: 'horde', tier: 'fodder',
    maxHp: 12, armor: 0, accuracy: 20, defense: 10, damage: [3, 5],
    range: 0.3, windup: 0.6, recovery: 0.9, attackSpeed: 1, moveSpeed: 2.6, radius: 0.35,
    projectsZoc: false,
    skills: [],
  },
  skitter: {
    id: 'skitter', name: '竄行者', letter: 'k', color: 0xa0784a, team: 'enemy', ai: 'horde', tier: 'fodder',
    maxHp: 8, armor: 0, accuracy: 25, defense: 15, damage: [2, 4],
    range: 0.3, windup: 0.4, recovery: 0.7, attackSpeed: 1, moveSpeed: 3.9, radius: 0.32,
    projectsZoc: false,
    skills: [],
  },
  slinger: {
    id: 'slinger', name: '投石兵', letter: 'g', color: 0x9a8f6a, team: 'enemy', ai: 'horde', tier: 'fodder',
    maxHp: 8, armor: 0, accuracy: 20, defense: 10, damage: [3, 4],
    range: 6, windup: 0.8, recovery: 1.2, attackSpeed: 1, moveSpeed: 2.6, radius: 0.35,
    projectsZoc: false, projectileSpeed: 16, projectileKind: 'bolt',
    skills: [],
  },
  /** 巢穴：不會動、不會攻擊；被摧毀後所屬生成點停止生成 */
  nest: {
    id: 'nest', name: '巢穴', letter: 'N', color: 0x5a3a2a, team: 'enemy', ai: 'nest',
    maxHp: 150, armor: 2, accuracy: 0, defense: 0, damage: [0, 0],
    range: 0, windup: 1, recovery: 1, attackSpeed: 1, moveSpeed: 0, radius: 0.9,
    projectsZoc: false, immovable: true,
    skills: [],
  },
  // ── 沉穩節奏的新敵人（SPEC_SLICE5 §15.2，v0.4；外觀借用現有素材，數值佔位） ──
  // 技能的準備時間在沉穩節奏下會再 ×1.8、冷卻 ×2（DELIBERATE_PACE），資料值是換算前的
  /** 盾兵：生命高於一半前物理防禦、護甲較高（盾破後恢復一般）；抗切割、穿刺，怕衝擊（data/damageTypes.ts） */
  shieldbearer: {
    id: 'shieldbearer', name: '盾兵', letter: 'D', color: 0x8a5a3a, team: 'enemy', ai: 'brute',
    maxHp: 120, armor: 4, accuracy: 25, defense: 25, damage: [6, 10],
    range: 0.3, windup: 0.7, recovery: 1.1, attackSpeed: 1, moveSpeed: 2.4, radius: 0.48,
    projectsZoc: true, shield: { hpFrac: 0.5, defense: 20, armor: 4 },
    skills: [],
  },
  /** 衝鋒兵：預兆線後直線衝鋒，撞到的英雄受傷（v0.4：不擊倒）；借攻城兵外觀 */
  charger: {
    id: 'charger', name: '衝鋒兵', letter: 'C', color: 0x9c4a1a, team: 'enemy', ai: 'charger',
    maxHp: 130, armor: 5, accuracy: 25, defense: 25, damage: [7, 11],
    range: 0.3, windup: 0.8, recovery: 1.2, attackSpeed: 1, moveSpeed: 2.4, radius: 0.5,
    projectsZoc: true,
    skills: ['rush'],
  },
  /** 刺客：優先後排；跳躍突進（落點預兆圈） */
  assassin: {
    id: 'assassin', name: '刺客', letter: 'K', color: 0xe8743b, team: 'enemy', ai: 'assassin',
    maxHp: 60, armor: 1, accuracy: 40, defense: 40, damage: [6, 10],
    range: 0.3, windup: 0.4, recovery: 0.7, attackSpeed: 1, moveSpeed: 4.0, radius: 0.38,
    projectsZoc: false, targeting: { distance: 1, lowHp: 1.2, backline: 1.5, sticky: 0.6 },
    skills: ['leap'],
  },
  /** 鉤手：鉤鎖把一名後排英雄拉到身前（預兆線）；借刺客外觀 */
  hooker: {
    id: 'hooker', name: '鉤手', letter: 'H', color: 0xb05a7a, team: 'enemy', ai: 'hooker',
    maxHp: 75, armor: 2, accuracy: 30, defense: 30, damage: [6, 9],
    range: 0.3, windup: 0.6, recovery: 1.0, attackSpeed: 1, moveSpeed: 3.0, radius: 0.42,
    projectsZoc: false, targeting: { distance: 1, backline: 1.2 },
    skills: ['hook'],
  },
  /** 祭司：治療同伴（長準備，可打斷）；借術士外觀 */
  priest: {
    id: 'priest', name: '祭司', letter: 'P', color: 0xc9a227, team: 'enemy', ai: 'priest',
    maxHp: 60, armor: 0, accuracy: 30, defense: 20, damage: [3, 6],
    range: 8, windup: 0.8, recovery: 1.2, attackSpeed: 1, moveSpeed: 2.8, radius: 0.4,
    projectsZoc: false, projectileSpeed: 16, projectileKind: 'bolt', attackDamageType: 'spell',
    skills: ['mend'],
  },
  /** 召喚師：每 15 秒召喚 3 隻屍僕（召喚圈）；借術士外觀 */
  summoner: {
    id: 'summoner', name: '召喚師', letter: 'M', color: 0x6a2a8a, team: 'enemy', ai: 'summoner',
    maxHp: 65, armor: 0, accuracy: 30, defense: 20, damage: [3, 6],
    range: 8, windup: 0.8, recovery: 1.2, attackSpeed: 1, moveSpeed: 2.6, radius: 0.4,
    projectsZoc: false, projectileSpeed: 16, projectileKind: 'bolt', attackDamageType: 'spell',
    skills: ['summonThralls'],
  },
  /** 自爆屍：貼近後倒數自爆（範圍預兆圈） */
  exploder: {
    id: 'exploder', name: '自爆屍', letter: 'e', color: 0x7a8a3a, team: 'enemy', ai: 'exploder',
    maxHp: 30, armor: 0, accuracy: 20, defense: 10, damage: [2, 3],
    range: 0.3, windup: 0.6, recovery: 0.9, attackSpeed: 1, moveSpeed: 3.0, radius: 0.38,
    projectsZoc: false,
    skills: ['selfDestruct'],
  },
  /**
   * 劍兵（小波次的雜魚，Alan 2026-10-21）：生命低、跑得快、傷害高，優先撲後排。
   * 被戰士架住（嘲諷、貼身擋路）就很快倒下；沒架住就會重創後排。數值全部佔位。
   */
  raider: {
    id: 'raider', name: '劍兵', letter: 'r', color: 0xb5523a, team: 'enemy', ai: 'brute',
    maxHp: 34, armor: 0, accuracy: 35, defense: 20, damage: [7, 11],
    range: 0.3, windup: 0.45, recovery: 0.8, attackSpeed: 1, moveSpeed: 3.4, radius: 0.4,
    projectsZoc: false, targeting: { distance: 1, lowHp: 0.6, backline: 1.4, threat: 0.3, sticky: 0.5 },
    skills: [],
  },
  /** 斧兵（小波次的雜魚）：比劍兵硬一點、慢一點、砍得更重；同樣優先撲後排。數值全部佔位 */
  axeman: {
    id: 'axeman', name: '斧兵', letter: 'x', color: 0x9a3d2a, team: 'enemy', ai: 'brute',
    maxHp: 48, armor: 2, accuracy: 30, defense: 20, damage: [9, 14],
    range: 0.3, windup: 0.7, recovery: 1.0, attackSpeed: 1, moveSpeed: 3.0, radius: 0.45,
    projectsZoc: false, targeting: { distance: 1, lowHp: 0.4, backline: 1.0, threat: 0.4, sticky: 0.6 },
    skills: [],
  },
  /** 召喚出來的屍僕（只作為召喚物；完整敵人 AI，不是怪群模式的雜兵） */
  minion: {
    id: 'minion', name: '屍僕', letter: 't', color: 0x8a6d5a, team: 'enemy', ai: 'brute',
    maxHp: 18, armor: 0, accuracy: 20, defense: 10, damage: [3, 5],
    range: 0.3, windup: 0.6, recovery: 0.9, attackSpeed: 1, moveSpeed: 2.6, radius: 0.35,
    projectsZoc: false,
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

/** 敵人選目標的預設權重（SPEC_SLICE5 §15.1；各敵人可用 def.targeting 覆寫；數值佔位） */
export const ENEMY_TARGETING: TargetingWeights = {
  distance: 1,
  lowHp: 0.3,
  backline: 0,
  threat: 0.6,
  marked: 0.2,
  sticky: 0.4,
};

/** 敵人選目標的換算基準（沉穩節奏）；警覺距離沿用 SimConfig.enemyAggroRange（英雄進入且看得到就警覺，同小隊一起） */
export const ENEMY_ALERT = {
  /** 距離因子：這個距離以外為 0 */
  distanceFull: 20,
  /** 仇恨：計算最近幾秒的傷害、滿分是多少傷害 */
  threatWindow: 5,
  threatFull: 40,
  /** 近戰被擋路：目標還在這麼遠（邊緣距離）以外、身邊貼著另一名英雄，就改打擋路的 */
  blockedFar: 2.5,
  blockedContact: 0.6,
};

/** 敵人階級：頭目（rank 或 ai 為 boss）、精英隊長、一般 */
export function enemyRank(def: UnitDef): 'boss' | 'elite' | 'normal' {
  if (def.rank === 'boss' || def.ai === 'boss') return 'boss';
  return def.rank === 'elite' ? 'elite' : 'normal';
}

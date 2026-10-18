/**
 * 怪群模式的調整值（SPEC_SLICE4；全部是佔位，試玩後再調）。
 */
export const HORDE = {
  /** 流場重算間隔（節拍）：10 節拍 ≈ 0.33 秒 */
  flowInterval: 10,
  /** 流場格子大小（公尺）：比導航格子粗，只負責遠距離的大方向；近距離改為直接追擊 */
  flowCell: 1.0,
  /** 流場使用的膨脹半徑（雜兵最大半徑） */
  flowRadius: 0.4,
  /** 雜兵重新挑選目標的間隔（秒） */
  retargetInterval: 0.5,
  /** 離目標這麼近且直線可走時，不看流場、直接走向目標（公尺） */
  directChaseRange: 4,
};

// ───────────── 第 2 階段：英雄端（SPEC_SLICE4 §3、§4） ─────────────

/** 怪群遭遇建立戰鬥時套用的設定（佔位值） */
export const HORDE_CONFIG = {
  battleStyle: 'horde' as const,
  /** 普攻準備＋恢復時間的速度倍率（英雄） */
  basicAttackSpeedMult: 1.6,
  /** 技能冷卻倍率 */
  skillCooldownMult: 0.6,
  /** 閒置自動普攻的駐守拴繩放寬 */
  heroLeashRange: 4,
};

/**
 * 普攻命中效果（SPEC_SLICE4 §3.1）：依英雄 def.id。只在怪群模式生效。
 * - cleave：前方扇形內所有敵人；每 heavyEvery 擊是重擊（傷害 ×heavyMult、擊退）
 * - pierce：箭穿過最多 maxTargets 名敵人，每穿一名傷害 ×falloff；擊殺時下一箭立即射出
 * - blast：命中點小範圍傷害（不傷友軍），範圍內的雜兵被推開
 * - smite：單體＋擊退；每次命中為附近生命最低的隊友回復生命
 * - reset：擊殺時重置下一擊的準備時間
 * - hex：在目標身上留下小詛咒；目標死亡時詛咒擴散給周圍 1 名敵人
 * - splash：命中點小範圍傷害（拋物線普攻）
 */
export type BasicAttackStyle =
  | { kind: 'cleave'; angle: number; heavyEvery: number; heavyMult: number; heavyKnockback: number; lowHpSpeed?: number }
  | { kind: 'pierce'; maxTargets: number; falloff: number; reach: number; killRefire: boolean }
  | { kind: 'blast'; radius: number; splashMult: number; push: number }
  | { kind: 'smite'; knockback: number; heal: number; healRadius: number }
  | { kind: 'reset' }
  | { kind: 'hex'; duration: number; actionSlow: number; damageTakenPct: number; spreadRadius: number }
  | { kind: 'splash'; radius: number; splashMult: number };

export const HORDE_ATTACKS: Record<string, BasicAttackStyle> = {
  warrior: { kind: 'cleave', angle: 110, heavyEvery: 3, heavyMult: 1.4, heavyKnockback: 1 },
  berserker: { kind: 'cleave', angle: 110, heavyEvery: 3, heavyMult: 1.4, heavyKnockback: 1, lowHpSpeed: 0.6 },
  ranger: { kind: 'pierce', maxTargets: 3, falloff: 0.7, reach: 5, killRefire: true },
  mage: { kind: 'blast', radius: 1.2, splashMult: 0.7, push: 0.5 },
  cleric: { kind: 'smite', knockback: 0.8, heal: 3, healRadius: 6 },
  rogue: { kind: 'reset' },
  hexer: { kind: 'hex', duration: 5, actionSlow: 0.15, damageTakenPct: 0.1, spreadRadius: 3 },
  alchemist: { kind: 'splash', radius: 1, splashMult: 0.7 },
};

/** 嘲諷光環半徑（SPEC_SLICE4 §4；Alan 決定只有戰士）。有光環的英雄，控制區在怪群模式對雜兵無效 */
export const HORDE_TAUNT: Record<string, number> = { warrior: 4 };

/** 視線與戰爭迷霧（SPEC_SLICE4 §6；佔位） */
export const HORDE_VISION = {
  /** 英雄視野半徑（公尺） */
  heroSightRange: 12,
  /** 迷霧格子大小（公尺） */
  cell: 1,
  /** 每幾節拍重算一次（6 節拍 = 0.2 秒） */
  interval: 6,
};

/** 連鎖反應（SPEC_SLICE4 §3.3） */
export const HORDE_CHAIN = {
  /** 被擊退的敵人撞到其他敵人時，兩者各受的傷害 */
  knockbackCollisionDamage: 3,
  /** 燃燒中的雜兵死亡時，對周圍敵人（同陣營）造成的火焰傷害與半徑 */
  burningDeathDamage: 3,
  burningDeathRadius: 1,
};

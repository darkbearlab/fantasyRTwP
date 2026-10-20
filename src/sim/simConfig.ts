/**
 * 模擬層可調整設定。預設值由 src/config.ts 匯出給遊戲使用；
 * 執行中只能透過 `setConfig` 指令修改（畫面層不得直接改 sim）。
 */
export type ZocMode = 'pin' | 'disengage' | 'off';
/**
 * 戰鬥模式：deliberate＝沉穩節奏（SPEC_SLICE5，目前的主要模式）；
 * tactical＝切片 2／3 的戰術戰鬥、horde＝切片 4 的怪群試作（兩者封存，規則照舊）
 */
export type BattleStyle = 'tactical' | 'horde' | 'deliberate';

export interface SimConfig {
  /** 戰鬥模式（怪群遭遇會自動設成 horde） */
  battleStyle: BattleStyle;
  /** 控制區模式（SPEC §7） */
  zocMode: ZocMode;
  /**
   * §7.1「近戰進行中規則失效」例外（SPEC §17-1 待確認）。
   * true：E 自己正在與「其他」單位近戰時，E 的控制區對 X 暫時失效。
   */
  zocEngagedException: boolean;
  /** 控制區向外延伸的距離（公尺），控制區半徑 = 單位半徑 + 此值 */
  zocRange: number;
  /** 火球等範圍法術對友軍的傷害倍率（SPEC §17-2 待確認，預設全額） */
  friendlyFireMultiplier: number;
  /** 英雄閒置時自動普攻的距離（近戰用，公尺；SPEC §17-4） */
  heroIdleAggroRange: number;
  /** 駐守點拴繩距離：閒置自動普攻不得讓英雄離開駐守點超過此距離（SPEC §10.4） */
  heroLeashRange: number;
  /** 好戰性格：看得到且在此距離（邊緣距離）內的敵人就主動出擊 */
  heroAggressiveRange: number;
  /** 游擊性格：敵人進入此距離（邊緣距離）就逃跑 */
  heroFleeRange: number;
  /** 游擊性格：每次逃跑的距離 */
  heroFleeDistance: number;
  /** 節奏：敵我雙方準備／恢復時間的速度倍率（< 1 代表行動條累積較慢） */
  actionSpeedMult: number;
  /** 我方（英雄）造成傷害的倍率 */
  heroDamageMult: number;
  /** 節奏：敵我雙方一般移動速度的倍率（衝鋒、翻滾等技能位移不受影響；參考柏德之門／永恆之柱放慢） */
  moveSpeedMult: number;
  /** 敵人察覺距離：任一英雄進入此距離就開始進攻 */
  enemyAggroRange: number;
  /** 戰鬥開始後幾秒，敵人無論如何都會開始進攻 */
  enemyAggroTime: number;
  /** 英雄普攻準備＋恢復的速度倍率（怪群模式 1.6） */
  basicAttackSpeedMult: number;
  /** 技能冷卻倍率（怪群模式 0.6） */
  skillCooldownMult: number;
  /**
   * 交戰距離倍率（沉穩節奏 0.6，Alan：整體交戰距離縮短）：套用在 1 m 以上的普攻射程與技能施放距離。
   * 近戰（< 1 m）、範圍半徑、視野不受影響；換算一律經過 scaleRange。
   */
  rangeMult: number;
  /** 攻擊移動：途中自動接戰的距離（邊緣距離，公尺） */
  attackMoveRange: number;
  /**
   * 攻擊移動找目標的基準：self＝途中接戰身邊的敵人（舊模式）；
   * point＝只打目標點附近的敵人，途中不接戰（沉穩節奏：這樣才能脫離戰鬥）
   */
  attackMoveFocus: 'self' | 'point';
  /** 戰爭迷霧開關（只對啟用迷霧的怪群遭遇有效；除錯面板可以關掉比較） */
  fogOfWar: boolean;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  battleStyle: 'tactical',
  zocMode: 'pin',
  zocEngagedException: true,
  zocRange: 1.0,
  friendlyFireMultiplier: 1.0,
  heroIdleAggroRange: 6,
  heroLeashRange: 1.5,
  actionSpeedMult: 0.85,
  heroDamageMult: 1.2,
  moveSpeedMult: 0.8,
  heroAggressiveRange: 10,
  heroFleeRange: 4,
  heroFleeDistance: 4,
  // 拉開交戰：敵人開場不會立刻衝過來，給玩家部陣時間（Alan 決定方向；數值佔位）
  enemyAggroRange: 10,
  enemyAggroTime: 20,
  basicAttackSpeedMult: 1,
  skillCooldownMult: 1,
  rangeMult: 1,
  attackMoveRange: 6,
  attackMoveFocus: 'self',
  fogOfWar: true,
};

/** 射程換算（交戰距離倍率）：近戰（< 1 m）不縮 */
export function scaleRange(config: SimConfig, range: number): number {
  return range >= 1 ? range * config.rangeMult : range;
}

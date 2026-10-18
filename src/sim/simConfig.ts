/**
 * 模擬層可調整設定。預設值由 src/config.ts 匯出給遊戲使用；
 * 執行中只能透過 `setConfig` 指令修改（畫面層不得直接改 sim）。
 */
export type ZocMode = 'pin' | 'disengage' | 'off';
/** 戰鬥模式（SPEC_SLICE4）：tactical＝原本的戰術戰鬥；horde＝怪群試作 */
export type BattleStyle = 'tactical' | 'horde';

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
};

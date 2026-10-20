/**
 * 小衝突導演（Alan 2026-10-21，類似 Left 4 Dead 的 AI 導演）：探索途中一直有小波次的敵人從不同方向湧上來，
 * 遊戲不會冷場；每一波人不多（2～3 名），處理得好就很快結束，但壓力一直都在。沒有總數上限。
 * 只用在沉穩節奏的 finalbossblues 程序生成地圖（城內、野外）；預先安排好的據點、檢查點照舊。全部是佔位值。
 */
export interface SkirmishEnemy {
  enemy: string;
  weight: number;
  /** 從第幾層開始出現 */
  minLayer: number;
  /** 估計的處理秒數（4 名英雄好好應對時，從看到到打倒；用來湊「一波十秒」） */
  seconds: number;
}

export interface SkirmishDef {
  /** 開戰後第一波（秒） */
  firstDelay: [number, number];
  /**
   * 波與波之間（秒）。Alan：交戰中計時要停——只有「沒在打」的時間才算，打完至少再喘 calmAfterCombat 秒才來下一波。
   */
  interval: [number, number];
  /** 交戰中：有已警覺、還活著的敵人在英雄這個距離（公尺）內 */
  combatRange: number;
  /** 打完後至少隔幾秒才出下一波 */
  calmAfterCombat: number;
  /** 導演叫來、還活著的敵人達到這個數就先不出新的一波（避免越滾越多、把隊伍困死） */
  maxAlive: number;
  /** 每波人數 */
  packSize: [number, number];
  /** 一波的處理秒數上限（Alan：從看到敵人開始算十秒） */
  secondsBudget: number;
  /** 出現的距離（公尺，離最近的英雄）；一定在視野外 */
  spawnDistance: [number, number];
  /** 嘗試的方向數；挑和最近幾波方向差最多的 */
  directions: number;
  /** 路徑不能比直線繞太遠（倍率） */
  maxPathFactor: number;
  /** 記住最近幾波的方向 */
  recentWaves: number;
  /** 接戰距離（公尺）：看得到、而且這麼近的英雄才照一般 AI 選目標；之前沿流場往隊伍走 */
  engageRange: number;
  pool: SkirmishEnemy[];
}

export const SKIRMISH: SkirmishDef = {
  firstDelay: [8, 12],
  interval: [12, 18],
  combatRange: 12,
  calmAfterCombat: 5,
  maxAlive: 5,
  packSize: [2, 3],
  secondsBudget: 10,
  spawnDistance: [13, 20],
  directions: 12,
  maxPathFactor: 1.8,
  recentWaves: 3,
  engageRange: 9,
  // seconds：估計處理秒數。2026-10-21 用自動玩家實測（全隊打最近的、不卡位、不放技能）第 1 層兩名劍兵約 6～10 秒，照這個抓
  pool: [
    { enemy: 'raider', weight: 5, minLayer: 1, seconds: 3.5 },
    { enemy: 'axeman', weight: 3, minLayer: 1, seconds: 5 },
    { enemy: 'archer', weight: 2, minLayer: 1, seconds: 6 },
    { enemy: 'exploder', weight: 1, minLayer: 1, seconds: 2 },
    { enemy: 'caster', weight: 1, minLayer: 3, seconds: 6 },
  ],
};

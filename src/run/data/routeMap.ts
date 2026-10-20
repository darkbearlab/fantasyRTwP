/**
 * FTL 式路線圖（SPEC_SLICE6 §4）的旋鈕。Alan：形狀要留夠多旋鈕、地圖要夠寬才閃得開冠軍。全部是佔位數值。
 */
export const ROUTE_MAP = {
  /** 層數（含頭目層） */
  layers: 8,
  /** 每層節點數（最後一層固定只有頭目） */
  width: [4, 5] as [number, number],
  /** 每個節點往下一層最多連幾條 */
  maxForwardLinks: 2,
  /** 同一層相鄰兩個節點連線的機率（橫向移動） */
  lateralChance: 0.45,
  /** 節點類型的數量（依整張圖） */
  elites: [2, 3] as [number, number],
  events: [3, 5] as [number, number],
  shops: [1, 2] as [number, number],
  /** 倒數第二層以外再多放幾個休息 */
  extraRests: [1, 2] as [number, number],

  /** 魔王主力（SPEC_SLICE6 §4） */
  force: {
    /** 一開始佔領幾個節點（從頭目前一層開始） */
    startNodes: 1,
    /** 每幾回合擴散一次（一回合＝移動一個節點） */
    spreadEvery: 2,
    /** 每次擴散佔領幾個節點 */
    spreadPerTick: 1,
    /** Alan：節點被重複訪問時，主力往那個節點額外蔓延幾格 */
    revisitExtra: 1,
    /** 被佔領節點的戰鬥：敵人層數加成、點數預算倍率 */
    layerBonus: 2,
    budgetMult: 1.5,
  },

  /** 魔王的冠軍（SPEC_SLICE6 §4） */
  champion: {
    count: 1,
    /** 起始位置在第幾層附近（比例，0＝第一層、1＝頭目前一層） */
    startDepth: 0.55,
    /** 和玩家的距離（節點數）在這以內就發現玩家，之後一直追 */
    detectRange: 1,
    /** 沒發現玩家時，每回合移動的機率 */
    wanderChance: 0.6,
    /** Alan：在休息節點休息時，冠軍看到營火的煙，立刻往玩家多走幾格 */
    restSmokeSteps: 1,
    /** 被打倒後幾回合重新出現（從主力佔領的節點） */
    respawnTurns: 8,
    /** 冠軍本人（精英隊長的強化版）與層數加成 */
    enemy: 'charger',
    layerBonus: 3,
  },
};

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
    /** 一開始佔領幾個節點 */
    startNodes: 1,
    /**
     * 從哪裡開始（Alan 2026-10-21：主力從玩家後方往前蔓延，和頭目形成前後包夾）：
     * rear＝第一層（玩家出發的那一層）；bossSide＝頭目前一層（舊做法）。之後每次擴散都朝玩家所在的節點。
     */
    startFrom: 'rear' as 'rear' | 'bossSide',
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
    /** 冠軍本人（Alan 2026-10-22：以獵人身分加入當下的地圖，不再是專屬的冠軍戰）與層數加成 */
    enemy: 'champion',
    layerBonus: 3,
    /** 開戰後幾秒從他來的方向進場（營火的煙引來、或在沒有戰鬥的節點被追上時：arriveNow 秒） */
    arriveDelay: 15,
    arriveNow: 2,
    /** Alan：每一章多學一招（第 i 章用前 moves[i] 個招式；第 5 章＝魔王第一階段的全套） */
    moveOrder: ['sentinelSweep', 'sentinelRush', 'sentinelStomp', 'sentinelSweepRush', 'sentinelBreath'],
    moves: [2, 3, 4, 5, 5],
    /** Alan：台詞漸進——前兩章不說話，拿到水晶後才開口（參考《斑鳩》，少而冷） */
    lines: [undefined, undefined, '……那顆光。', '還在逃嗎。', '這一次，也一樣。'] as (string | undefined)[],
  },
};

/** 遠征的經濟與規則數值（SPEC_SLICE2 §2、§4、§5、§9）。§14 待確認事項都在這裡調整。 */
export const ECONOMY = {
  /** 路線圖層數（含頭目層） */
  mapLayers: 8,
  partySize: 4,
  startGold: 50,
  goldPerBattle: 30,
  goldPerElite: 60,
  goldPerBoss: 0,
  /** 跳過強化改拿的金幣 */
  skipRewardGold: 15,
  reviveCost: 80,
  /** 復活後的生命比例 */
  reviveHpRatio: 0.5,
  recruitCost: 100,
  /** 招募時抽幾名候選 */
  recruitCandidates: 2,
  /** 組隊：玩家自選幾名，其餘隨機（Alan：主要遠征改成四名全自選；隨機隊員留給之後的模式，改回 2 即可） */
  partyPicks: 4,
  /** 隊伍（組隊、招募）是否允許重複職業（SPEC_SLICE3 §9-3） */
  allowDuplicateClasses: false,
  /** 越晚加入越強：招募時獲得 floor(層數 / lateJoinLayersPerUpgrade) 個隨機強化（SPEC_SLICE3 §1.3、§9-4） */
  lateJoinLayersPerUpgrade: 2,
  /** 戰後整補：勝利後存活者回復「本場損失生命」的比例（參考永恆之柱的耐力／生命；Alan 決定 0.5） */
  postBattleRecoveryRatio: 0.5,
  /** 紮營恢復最大生命的比例 */
  campHealRatio: 0.4,
  rewardChoices: 3,
  eliteRewardChoices: 4,
  /**
   * 經驗值與隊伍等級（SPEC_SLICE6 §3，只用在沉穩節奏）：經驗值只來自擊殺；升級後回路線圖前三選一，升幾級選幾次。全部佔位。
   * 升到下一級需要 toNext.base ＋ toNext.perLevel × (目前等級 − 1)。
   */
  xp: {
    perEnemy: {
      minion: 2,
      raider: 5,
      axeman: 7,
      exploder: 6,
      shieldbearer: 10,
      archer: 10,
      assassin: 10,
      bomber: 10,
      hooker: 10,
      charger: 14,
      priest: 12,
      lurker: 12,
      summoner: 14,
      warlord: 60,
    } as Record<string, number>,
    default: 10,
    /** 精英隊長的倍率 */
    captainMult: 3,
    toNext: { base: 50, perLevel: 25 },
  },
  trainChoices: 3,
  /** 敵人數值隨層數成長：1 + layerScaling × (layer − 1) */
  layerScaling: 0.05,
  /** 裝備道具（SPEC_SLICE5 §17）：每名英雄的道具欄數 */
  itemSlots: 2,
  /** 打贏節點時掉落道具的機率（依節點類型；事件戰鬥算 battle）、精英掉落稀有道具的機率 */
  itemDropChance: { battle: 0.3, elite: 1, event: 0.3 } as Record<string, number>,
  eliteRareChance: 0.5,
  battleRareChance: 0.15,
  /** 商人（沉穩節奏的遠征）：路線圖上的商人節點數量（第 2 層起）、貨架上幾件、其中稀有幾件 */
  shopNodes: [1, 2] as [number, number],
  shopStock: 4,
  shopRareStock: 1,
  /** 精英隊長的強化倍率 */
  captain: { hpMult: 2.5, damageMult: 1.4, radiusBonus: 0.1 },
};

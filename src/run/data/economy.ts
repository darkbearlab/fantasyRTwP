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
  /** 組隊：玩家自選幾名，其餘隨機（SPEC_SLICE3 §1.2） */
  partyPicks: 2,
  /** 隊伍（組隊、招募）是否允許重複職業（SPEC_SLICE3 §9-3） */
  allowDuplicateClasses: false,
  /** 越晚加入越強：招募時獲得 floor(層數 / lateJoinLayersPerUpgrade) 個隨機強化（SPEC_SLICE3 §1.3、§9-4） */
  lateJoinLayersPerUpgrade: 2,
  /** 紮營恢復最大生命的比例 */
  campHealRatio: 0.4,
  rewardChoices: 3,
  eliteRewardChoices: 4,
  trainChoices: 3,
  /** 敵人數值隨層數成長：1 + layerScaling × (layer − 1) */
  layerScaling: 0.05,
  /** 精英隊長的強化倍率 */
  captain: { hpMult: 2.5, damageMult: 1.4, radiusBonus: 0.1 },
};

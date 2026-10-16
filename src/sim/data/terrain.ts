/** 戰術地形數值（SPEC_SLICE3 §2）。全部是佔位數值。 */
export const TERRAIN = {
  /** 淺水移動倍率 */
  shallowMoveMult: 0.4,
  /** 站在淺水中的防禦修正 */
  shallowDefense: -10,
  /** 跨越矮籬的移動倍率 */
  hedgeMoveMult: 0.5,
  /** 矮籬掩體：防禦加成 */
  hedgeCoverDefense: 15,
  /** 矮籬掩體：目標（或攻擊者）與矮籬的距離門檻（公尺） */
  hedgeCoverRange: 1.5,
  /** 高地上的遠程單位：射程加成 */
  highRangeBonus: 2,
  /** 高地上的遠程單位：傷害倍率 */
  highDamageMult: 1.15,
  /** 由低處射向高地：命中修正 */
  lowToHighAccuracy: -10,
  /** 草叢：敵人在此距離內（中心距離）就看得到 */
  brushRevealDistance: 2,
  /** 攻擊後暴露的秒數 */
  revealAfterAttack: 2,
  /** 草叢燃燒：持續秒數 */
  fireDuration: 5,
  /** 草叢燃燒：延燒到相鄰草叢的間隔（秒） */
  fireSpreadInterval: 0.5,
  /** 燃燒狀態：持續秒數 */
  burnDuration: 4,
  /** 燃燒狀態：每秒傷害 */
  burnDamagePerSecond: 4,
};

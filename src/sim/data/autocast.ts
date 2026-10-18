/**
 * 技能自動施放的條件（SPEC_SLICE4 §3.4）：依技能效果種類。沒有列出的種類（衝鋒、翻滾、煙霧等）不能自動施放。
 * - cluster：射程內找敵人最密集的點，半徑內至少 minEnemies 名才施放；有友軍傷害的技能，範圍內有友軍就不放
 * - around：自身周圍半徑內至少 minEnemies 名敵人
 * - cone：朝最近的敵人，扇形內至少 minEnemies 名
 * - healAlly：射程內有友軍生命低於 hpBelow（取最低者）
 * - healArea：某個友軍周圍半徑內至少 minAllies 名生命低於 hpBelow
 * - buffParty：半徑內至少 minAllies 名友軍，且 enemyNear 公尺內有敵人，且自己沒有同類增益
 * - attackTarget：對目前的普攻目標施放（preferElite：只對精英）
 * - guardAlly：有友軍生命低於 hpBelow 且被敵人貼身
 */
export type AutocastRule =
  | { rule: 'cluster'; minEnemies: number }
  | { rule: 'around'; minEnemies: number }
  | { rule: 'cone'; minEnemies: number }
  | { rule: 'healAlly'; hpBelow: number }
  | { rule: 'healArea'; minAllies: number; hpBelow: number }
  | { rule: 'buffParty'; minAllies: number; enemyNear: number }
  | { rule: 'attackTarget'; preferElite: boolean }
  | { rule: 'guardAlly'; hpBelow: number };

export const AUTOCAST: Record<string, AutocastRule> = {
  aoe: { rule: 'cluster', minEnemies: 3 },
  zone: { rule: 'cluster', minEnemies: 3 },
  whirlwind: { rule: 'around', minEnemies: 3 },
  cone: { rule: 'cone', minEnemies: 3 },
  heal: { rule: 'healAlly', hpBelow: 0.5 },
  aoeHeal: { rule: 'healArea', minAllies: 2, hpBelow: 0.7 },
  bless: { rule: 'buffParty', minAllies: 2, enemyNear: 8 },
  strike: { rule: 'attackTarget', preferElite: false },
  root: { rule: 'attackTarget', preferElite: true },
  curse: { rule: 'attackTarget', preferElite: true },
  guard: { rule: 'guardAlly', hpBelow: 0.6 },
};

/** 自動施放的檢查間隔（秒） */
export const AUTOCAST_INTERVAL = 0.25;

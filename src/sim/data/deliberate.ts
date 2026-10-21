/**
 * 沉穩節奏（SPEC_SLICE5 §1）：整體變慢，敵我同樣套用。全部是佔位數值。
 * 倍率相對於預設設定（DEFAULT_SIM_CONFIG），建立戰鬥時換算成 SimConfig 的修改。
 */
import type { SimConfig } from '../simConfig';
import { DEFAULT_SIM_CONFIG } from '../simConfig';

export const DELIBERATE_PACE = {
  /** 移動速度倍率 */
  move: 0.6,
  /** 行動（準備＋恢復）時間倍率：越大越慢 */
  actionTime: 1.8,
  /** 技能冷卻倍率 */
  cooldown: 2,
  /** 交戰距離倍率（Alan：整體交戰距離縮短）：普攻射程、技能施放距離、敵人察覺距離、攻擊移動接戰距離 */
  range: 0.6,
  /**
   * Alan 2026-10-21（手感：「很真實世界，但作為遊戲太泥濘」）：
   * 一般敵人生命倍率（精英隊長、頭目不受影響）、英雄技能效果倍率（冷卻不動）、英雄普攻速度倍率。
   */
  enemyHpMult: 0.5,
  heroSkillPower: 1.5,
  heroAttackSpeed: 1.5,
  /** 敵人普攻速度倍率（Alan 2026-10-21：對標英雄的普攻速度成長） */
  enemyAttackSpeed: 1.5,
};

/** 沉穩節奏的戰鬥設定（相對於 base，預設是 DEFAULT_SIM_CONFIG） */
export function deliberateConfig(base: SimConfig = DEFAULT_SIM_CONFIG): Partial<SimConfig> {
  return {
    battleStyle: 'deliberate',
    // Alan：攻擊移動只打目標點附近的敵人（才能脫離）；取消控制區，改由敵人 AI 決定目標優先度
    attackMoveFocus: 'point',
    zocMode: 'off',
    moveSpeedMult: base.moveSpeedMult * DELIBERATE_PACE.move,
    actionSpeedMult: base.actionSpeedMult / DELIBERATE_PACE.actionTime,
    skillCooldownMult: base.skillCooldownMult * DELIBERATE_PACE.cooldown,
    rangeMult: base.rangeMult * DELIBERATE_PACE.range,
    enemyAggroRange: base.enemyAggroRange * DELIBERATE_PACE.range,
    attackMoveRange: base.attackMoveRange * DELIBERATE_PACE.range,
    basicAttackSpeedMult: base.basicAttackSpeedMult * DELIBERATE_PACE.heroAttackSpeed,
    heroSkillPowerMult: base.heroSkillPowerMult * DELIBERATE_PACE.heroSkillPower,
    enemyAttackSpeedMult: base.enemyAttackSpeedMult * DELIBERATE_PACE.enemyAttackSpeed,
  };
}

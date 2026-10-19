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
};

/** 沉穩節奏的戰鬥設定（相對於 base，預設是 DEFAULT_SIM_CONFIG） */
export function deliberateConfig(base: SimConfig = DEFAULT_SIM_CONFIG): Partial<SimConfig> {
  return {
    battleStyle: 'deliberate',
    moveSpeedMult: base.moveSpeedMult * DELIBERATE_PACE.move,
    actionSpeedMult: base.actionSpeedMult / DELIBERATE_PACE.actionTime,
    skillCooldownMult: base.skillCooldownMult * DELIBERATE_PACE.cooldown,
  };
}

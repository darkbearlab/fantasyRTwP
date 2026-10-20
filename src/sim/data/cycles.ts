/**
 * 技能循環（SPEC_SLICE5 §16）：沉穩節奏下每名英雄只有一個技能鈕，按下的是「循環目前這一招」。
 * - sequence：依序輪流（放完 A 換 B，放完 B 回到 A）
 * - charge：普攻命中累積充能，滿了第一招換成強化版；放完強化版歸零
 * v0.4：先只做法師、咒術師。數值佔位。
 */
export interface ActiveCycle {
  mode: 'sequence' | 'charge';
  steps: string[];
  /** charge：滿幾層換成第二招 */
  chargeMax?: number;
}

export const ACTIVE_CYCLES: Record<string, ActiveCycle> = {
  // 法師：火球；普攻命中累積充能，滿 5 層變成大火球
  mage: { mode: 'charge', steps: ['fireball', 'greatFireball'], chargeMax: 5 },
  // 咒術師：衰弱詛咒 → 詛咒爆裂（引爆目標身上的詛咒）→ 衰弱詛咒…
  hexer: { mode: 'sequence', steps: ['curse', 'curseBurst'] },
};

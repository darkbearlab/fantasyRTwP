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
  // 法師（2026-10-20 Alan）：拿掉充能／大火球循環，回到單一火球（flashFireball，見 ACTIVE_SKILL_OVERRIDE）。
  // charge 模式保留給之後其他職業使用；大火球 greatFireball 的資料還留在 skills.ts。
  // 咒術師：衰弱詛咒 → 詛咒爆裂（引爆目標身上的詛咒）→ 衰弱詛咒…
  hexer: { mode: 'sequence', steps: ['curse', 'curseBurst'] },
  // 死亡法師（SPEC_CLASSES §3）：回收咒術師的詛咒 → 詛咒爆裂
  deathMage: { mode: 'sequence', steps: ['curse', 'curseBurst'] },
  // 芬恩（SPEC_CHARACTERS §4.1）：普攻累積層數，滿了第一招換成大火球；元素師累積得更快。數值佔位
  adept: { mode: 'charge', steps: ['flashFireball', 'greatFireball'], chargeMax: 5 },
  elementalist: { mode: 'charge', steps: ['flashFireball', 'greatFireball'], chargeMax: 4 },
  // 死靈法師（SPEC_CHARACTERS §4.1）：回收死亡法師的詛咒 → 詛咒爆裂
  necromancer: { mode: 'sequence', steps: ['curse', 'curseBurst'] },
  // 狙擊手（SPEC_CLASSES §3）：集中 → 瞄準射擊；集中越久這一發越痛，移動或被打就中斷（回到集中）
  sniper: { mode: 'sequence', steps: ['focus', 'aimedShot'] },
};

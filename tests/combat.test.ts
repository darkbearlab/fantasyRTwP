import { describe, expect, it } from 'vitest';
import { applyArmor, hitFromRoll } from '../src/sim/combat';

describe('命中與傷害公式（SPEC §6）', () => {
  it('roll 門檻：<50 未命中、50–99 命中、≥100 爆擊', () => {
    expect(hitFromRoll(49)).toBe('miss');
    expect(hitFromRoll(50)).toBe('hit');
    expect(hitFromRoll(99)).toBe('hit');
    expect(hitFromRoll(100)).toBe('crit');
  });

  it('護甲固定減免，但最多減免 75%', () => {
    expect(applyArmor(16, 6)).toBe(10);
    expect(applyArmor(8, 6)).toBe(2); // max(2, ceil(2)) = 2
    expect(applyArmor(10, 20)).toBe(3); // ceil(10 × 0.25) = 3
  });
});

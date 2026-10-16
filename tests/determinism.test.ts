import { describe, expect, it } from 'vitest';
import { createBattle } from '../src/sim/battle';
import { HeroScript } from '../tools/heroScript';

function simulate(seed: number, seconds: number): string {
  const w = createBattle(seed);
  const s = new HeroScript(w);
  while (w.time < seconds && !w.result) {
    s.update();
    w.step();
  }
  return w.snapshot();
}

describe('決定論（SPEC §3.2）', () => {
  it('同種子＋同指令 → 最終狀態完全一致', () => {
    expect(simulate(42, 40)).toBe(simulate(42, 40));
  });

  it('不同種子 → 結果不同', () => {
    expect(simulate(42, 40)).not.toBe(simulate(43, 40));
  });
});

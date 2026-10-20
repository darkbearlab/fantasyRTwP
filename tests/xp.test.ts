import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/run/data/economy';
import { applyBattleResult, availableNodes, chooseNode, chooseReward, continueFromReward } from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun } from '../src/run/runState';
import { gainXp, xpForKill, xpForKills, xpToNext } from '../src/run/xp';

function inBattle(style: 'deliberate' | 'tactical'): RunState {
  let r = createRun(5, { style });
  r = chooseNode(r, availableNodes(r)[0].id);
  expect(r.phase.kind).toBe('battle');
  return r;
}

const win = (r: RunState, killed: { enemy: string; captain: boolean }[]) =>
  applyBattleResult(r, { won: true, time: 10, killed, heroes: r.party.flatMap((h, slot) => (h ? [{ slot, hp: h.hp, dead: false, kills: 0, damageDealt: 0, damageTaken: 0 }] : [])) });

describe('經驗值與升級（SPEC_SLICE6 §3）', () => {
  it('擊殺經驗值：依敵人、隊長加倍；升級門檻遞增', () => {
    expect(xpForKill('shieldbearer', false)).toBe(ECONOMY.xp.perEnemy.shieldbearer);
    expect(xpForKill('shieldbearer', true)).toBe(ECONOMY.xp.perEnemy.shieldbearer * ECONOMY.xp.captainMult);
    expect(xpForKill('沒有這種敵人', false)).toBe(ECONOMY.xp.default);
    expect(xpToNext(2)).toBeGreaterThan(xpToNext(1));
    expect(xpForKills([{ enemy: 'archer', captain: false }, { enemy: 'minion', captain: false }])).toBe(ECONOMY.xp.perEnemy.archer + ECONOMY.xp.perEnemy.minion);
  });

  it('一次升好幾級：等級、剩餘經驗值、待選次數都正確', () => {
    const r = createRun(1);
    const amount = xpToNext(1) + xpToNext(2) + 3;
    expect(gainXp(r, amount)).toBe(2);
    expect(r.level).toBe(3);
    expect(r.xp).toBe(3);
    expect(r.pendingLevelUps).toBe(2);
  });

  it('沒有升級：戰果畫面沒有三選一，繼續就回路線圖', () => {
    const r = win(inBattle('deliberate'), [{ enemy: 'minion', captain: false }]);
    expect(r.phase.kind === 'reward' && r.phase.options).toEqual([]);
    expect(r.phase.kind === 'reward' && r.phase.xpGained).toBe(ECONOMY.xp.perEnemy.minion);
    expect(continueFromReward(r).phase.kind).toBe('map');
  });

  it('升兩級：依序選兩次（第 2 級、第 3 級），選完回路線圖', () => {
    const many = Array.from({ length: 20 }, () => ({ enemy: 'shieldbearer', captain: false }));
    let r = win(inBattle('deliberate'), many);
    const level = r.level!;
    expect(level).toBeGreaterThanOrEqual(3);
    const ups = r.pendingLevelUps!;
    for (let i = 0; i < ups; i++) {
      expect(r.phase.kind).toBe('reward');
      if (r.phase.kind !== 'reward') return;
      expect(r.phase.levelUpTo).toBe(level - ups + 1 + i);
      expect(r.phase.options.length).toBe(ECONOMY.rewardChoices);
      r = chooseReward(r, 'skip');
    }
    expect(r.phase.kind).toBe('map');
    expect(r.pendingLevelUps).toBe(0);
  });

  it('封存的戰術模式維持每場三選一', () => {
    const r = win(inBattle('tactical'), []);
    expect(r.phase.kind === 'reward' && r.phase.options.length).toBeGreaterThan(0);
    expect(r.phase.kind === 'reward' && r.phase.xpGained).toBeUndefined();
  });
});

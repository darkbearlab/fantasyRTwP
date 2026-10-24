import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/run/data/events';
import { chooseEventOption, conditionMet, eventOptions } from '../src/run/events';
import type { RunState } from '../src/run/runState';
import { createRun } from '../src/run/runState';
import { leaveNode } from '../src/run/progression';

/** 把遠征放進指定事件（測試用） */
function inEvent(eventId: string, patch: (r: RunState) => void = () => {}): RunState {
  const r = createRun(9, { forward: false });
  const node = r.map.nodes.find((n) => n.type === 'event')!;
  r.currentNodeId = node.id;
  r.phase = { kind: 'event', nodeId: node.id, eventId, resolved: false };
  patch(r);
  return r;
}

/** 讓所有條件都成立：有錢、有牧師、有空欄位 */
const rich = (r: RunState) => {
  r.gold = 500;
  r.party[1] = null;
};

describe('事件（SPEC_SLICE2 §6、§11-6）', () => {
  it('共有 6 個事件，每個 2–3 個選項，機率加總為 1', () => {
    expect(Object.keys(EVENTS).length).toBe(6);
    for (const ev of Object.values(EVENTS)) {
      expect(ev.options.length).toBeGreaterThanOrEqual(2);
      expect(ev.options.length).toBeLessThanOrEqual(3);
      for (const o of ev.options) expect(o.outcomes.reduce((s, x) => s + x.chance, 0)).toBeCloseTo(1);
    }
  });

  for (const ev of Object.values(EVENTS)) {
    ev.options.forEach((opt, i) => {
      it(`${ev.title}：「${opt.label}」可以選擇並產生結果`, () => {
        const r = inEvent(ev.id, rich);
        const after = chooseEventOption(r, i);
        if (after.phase.kind === 'battle') {
          expect(after.phase.fromEvent).toBe(true);
        } else {
          expect(after.phase).toMatchObject({ kind: 'event', resolved: true });
          expect(leaveNode(after).phase.kind).toBe('map');
        }
        expect(after.journal.length).toBe(r.journal.length + 1);
      });
      if (opt.condition) {
        it(`${ev.title}：「${opt.label}」條件不符時不可選`, () => {
          const r = inEvent(ev.id, (s) => {
            s.gold = 0;
            s.party[3] = null; // 沒有牧師
          });
          // 隊伍是滿的（欄位 4 空出來就有空位，所以 hasEmptySlot 另外處理）
          if (opt.condition!.hasEmptySlot) r.party[3] = { ...r.party[0]! };
          expect(conditionMet(r, opt.condition)).toBe(false);
          expect(eventOptions(r)[i].available).toBe(false);
          expect(() => chooseEventOption(r, i)).toThrow();
        });
      }
    });
  }

  it('效果：花錢買藥水 → 扣金幣、全隊回血', () => {
    const r = inEvent('caravan', (s) => {
      s.gold = 100;
      for (const h of s.party) h!.hp = 20;
    });
    const after = chooseEventOption(r, 0);
    expect(after.gold).toBe(60);
    expect(after.party[0]!.hp).toBe(20 + 42);
  });

  it('效果：事件扣血不會讓英雄死亡', () => {
    const r = inEvent('nightRaid', (s) => {
      for (const h of s.party) h!.hp = 2;
    });
    const after = chooseEventOption(r, 1);
    for (const h of after.party) {
      expect(h!.hp).toBeGreaterThanOrEqual(1);
      expect(h!.dead).toBe(false);
    }
  });

  it('效果：巡禮者的祝福在下一場戰鬥生效後清除', () => {
    const after = chooseEventOption(inEvent('lostPilgrim', rich), 0);
    expect(after.nextBattleBuff).toEqual({ accuracy: 12 });
  });

  it('同種子、同選擇 → 同結果', () => {
    expect(JSON.stringify(chooseEventOption(inEvent('skullPile'), 0))).toBe(JSON.stringify(chooseEventOption(inEvent('skullPile'), 0)));
  });
});

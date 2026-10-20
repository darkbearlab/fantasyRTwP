import { describe, expect, it } from 'vitest';
import { campfireTalk } from '../src/run/campfire';
import { CAMPFIRE_SOLO, CAMPFIRE_TALKS } from '../src/run/data/campfire';
import { finishCampfire } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import type { RunState } from '../src/run/runState';

function restRun(seed = 3): RunState {
  const r = createRun(seed);
  r.phase = { kind: 'rest', nodeId: 7, used: false, recruited: false, recruitCandidates: [], trainOptions: [] };
  return r;
}

describe('營火對話', () => {
  it('同一個節點每次都一樣；說話的人都是存活英雄；佔位字都換掉', () => {
    const r = restRun();
    const a = campfireTalk(r, 7);
    expect(a.length).toBeGreaterThan(0);
    expect(campfireTalk(r, 7)).toEqual(a);
    const alive = new Set(r.party.map((h, i) => (h && !h.dead ? i : -1)));
    for (const l of a) {
      expect(alive.has(l.slot)).toBe(true);
      expect(l.text).not.toMatch(/\{\d\}/);
    }
  });

  it('人數不夠的對話不會被選到；只剩一人時自言自語；沒有人就沒有對話', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = restRun(seed);
      r.party[2]!.dead = true;
      r.party[3]!.dead = true;
      const slots = new Set(campfireTalk(r, seed).map((l) => l.slot));
      expect(slots.has(2) || slots.has(3)).toBe(false);
    }
    const solo = restRun();
    for (let i = 1; i < 4; i++) solo.party[i]!.dead = true;
    const lines = campfireTalk(solo, 1);
    expect(lines.every((l) => l.slot === 0)).toBe(true);
    expect(CAMPFIRE_SOLO.some((t) => t.lines.length === lines.length)).toBe(true);
    const none = restRun();
    for (const h of none.party) h!.dead = true;
    expect(campfireTalk(none, 1)).toEqual([]);
  });

  it('台詞資料：說話者編號都在人數內', () => {
    for (const t of [...CAMPFIRE_TALKS, ...CAMPFIRE_SOLO]) for (const l of t.lines) expect(l.s).toBeLessThan(t.speakers);
  });

  it('看完對話後標記 talked，不改原本的狀態', () => {
    const r = restRun();
    const r2 = finishCampfire(r);
    expect(r2.phase.kind === 'rest' && r2.phase.talked).toBe(true);
    expect(r.phase.kind === 'rest' && r.phase.talked).toBeFalsy();
  });
});

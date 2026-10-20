import { describe, expect, it } from 'vitest';
import { createBattleFromRun, deliberateLevelId } from '../src/run/battle';
import { createRun } from '../src/run/runState';
import type { RunState } from '../src/run/runState';
import { DT } from '../src/sim/constants';
import { SKIRMISH } from '../src/sim/data/skirmish';
import type { World } from '../src/sim/world';

/** 沉穩節奏遠征的第 layer 層戰鬥（finalbossblues 程序生成地圖） */
function battleAt(seed: number, layer: number): World {
  const r: RunState = createRun(seed, { style: 'deliberate' });
  const node = r.map.nodes.find((n) => n.layer === layer)!;
  r.currentNodeId = node.id;
  r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
  return createBattleFromRun(r);
}

describe('小衝突導演', () => {
  it('城內與野外地圖都有導演；一波 2～3 人、在視野外出現、一出現就進入戰鬥、方向會換', () => {
    for (const layer of [1, 4]) {
      const w = battleAt(3, layer);
      expect(w.skirmish).not.toBeNull();
      const waves = new Map<string, { x: number; y: number }[]>();
      for (let t = 0; t < 70 / DT; t++) {
        for (const ev of w.step()) {
          if (ev.type !== 'spawn' || !ev.waveId?.startsWith('wave')) continue;
          const u = w.getUnit(ev.unitId)!;
          expect(u.alerted).toBe(true);
          expect(w.vision!.isVisible(u.pos)).toBe(false);
          (waves.get(ev.waveId) ?? waves.set(ev.waveId, []).get(ev.waveId)!).push({ ...u.pos });
        }
      }
      expect(waves.size).toBeGreaterThanOrEqual(2);
      for (const ps of waves.values()) expect(ps.length).toBeGreaterThanOrEqual(1);
      for (const ps of waves.values()) expect(ps.length).toBeLessThanOrEqual(SKIRMISH.packSize[1]);
    }
  });
  it('波次的敵人會走到隊伍身邊（城內窄巷也不會卡住）', () => {
    const w = battleAt(3, 1);
    const heroes = w.units.filter((u) => u.team === 'hero');
    let closest = Infinity;
    for (let t = 0; t < 60 / DT; t++) {
      w.step();
      for (const u of w.units) if (u.squad?.startsWith('wave') && !u.dead) for (const h of heroes) closest = Math.min(closest, Math.hypot(u.pos.x - h.pos.x, u.pos.y - h.pos.y));
    }
    expect(closest).toBeLessThan(2);
  });
  it('交戰中不出新的一波（Alan：計時在交戰中停止）', () => {
    const w = battleAt(9, 1);
    let spawnedWhileFighting = 0;
    let fighting = false;
    for (let t = 0; t < 120 / DT; t++) {
      const evs = w.step();
      if (fighting && evs.some((e) => e.type === 'spawn' && e.waveId?.startsWith('wave'))) spawnedWhileFighting++;
      if (w.tick % 5 === 0) fighting = w.skirmish!.inCombat(w);
    }
    expect(spawnedWhileFighting).toBe(0);
  });
  it('頭目關卡（模板地圖）沒有導演', () => {
    const r: RunState = createRun(5, { style: 'deliberate' });
    const node = r.map.nodes.find((n) => n.type === 'boss')!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('boss'), fromEvent: false };
    expect(createBattleFromRun(r).skirmish).toBeNull();
  });
});

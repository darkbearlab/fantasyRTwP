import { describe, expect, it } from 'vitest';
import { createBattleFromRun, deliberateLevelId } from '../src/run/battle';
import { createRun } from '../src/run/runState';
import type { RunState } from '../src/run/runState';
import { DT } from '../src/sim/constants';
import { SKIRMISH } from '../src/sim/data/skirmish';
import type { World } from '../src/sim/world';

/** 沉穩節奏遠征的第 layer 層戰鬥（finalbossblues 程序生成地圖） */
function battleAt(seed: number, layer: number): World {
  const r: RunState = createRun(seed, { forward: false, style: 'deliberate' });
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
      fighting = w.skirmish!.inCombat(w);
    }
    expect(spawnedWhileFighting).toBe(0);
  }, 20000); // 模擬 120 秒，全部測試一起跑時可能超過預設的 5 秒
  it('頭目關卡（模板地圖）沒有導演', () => {
    const r: RunState = createRun(5, { style: 'deliberate' });
    const node = r.map.nodes.find((n) => n.type === 'boss')!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('boss'), fromEvent: false };
    expect(createBattleFromRun(r).skirmish).toBeNull();
  });
});

describe('頭目房與頭目登場（Alan 2026-10-21）', () => {
  function bossBattle(seed: number) {
    const r: RunState = createRun(seed, { style: 'deliberate' });
    const node = r.map.nodes.find((n) => n.type === 'boss')!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('boss'), fromEvent: false };
    return createBattleFromRun(r);
  }
  it('頭目房：專屬地圖、有援軍進場點、打倒頭目才算贏、沒有小波次', () => {
    const w = bossBattle(5);
    expect(w.map.art?.kind).toBe('fbbField');
    expect(w.map.exitLock).toBe('boss');
    expect(w.map.summonPoints?.length).toBeGreaterThan(0);
    expect(w.units.some((u) => u.def.id === 'warlord')).toBe(true);
    expect(w.skirmish).toBeNull();
    // 往前走一點就是頭目：出生點到頭目不到 25 m
    const h = w.units.find((u) => u.team === 'hero')!;
    const b = w.units.find((u) => u.def.id === 'warlord')!;
    expect(Math.hypot(h.pos.x - b.pos.x, h.pos.y - b.pos.y)).toBeLessThan(25);
  });
  it('頭目第一次被看到：發出 bossSighted，頭目身邊暫時有視線', () => {
    const w = bossBattle(5);
    const heroes = w.units.filter((u) => u.team === 'hero');
    const b = w.units.find((u) => u.def.id === 'warlord')!;
    w.enqueue({ type: 'move', unitIds: heroes.map((u) => u.id), point: { x: b.pos.x - 7, y: b.pos.y } });
    let sighted = false;
    for (let t = 0; t < 40 / DT && !sighted; t++) for (const ev of w.step()) if (ev.type === 'bossSighted' && ev.unitId === b.id) sighted = true;
    expect(sighted).toBe(true);
    // 頭目身後（離英雄更遠）的地方也看得到
    expect(w.vision!.isVisible({ x: b.pos.x + 2, y: b.pos.y })).toBe(true);
  });
});

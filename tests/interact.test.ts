import { describe, expect, it } from 'vitest';
import type { HordeSetup, InteractableDef, MapDef } from '../src/sim/data/types';
import { World } from '../src/sim/world';
import { HOLD, PASSIVE, makeWorld, run } from './helpers';

/** 中間一道牆（x = 10），只有 y 9–11 的門口；門關著時左右完全不通 */
function doorMap(extra: InteractableDef[] = [], door: Partial<InteractableDef> = {}): MapDef {
  return {
    id: 'door-test',
    name: '測試',
    width: 20,
    height: 20,
    obstacles: [
      { x: 10, y: 0, w: 1, h: 9 },
      { x: 10, y: 11, w: 1, h: 9 },
    ],
    heroSpawns: [],
    enemySpawns: [],
    interactables: [{ id: 'gate', kind: 'door', name: '鐵門', x: 10, y: 9, w: 1, h: 2, ...door }, ...extra],
  };
}

const hero = (x: number, y: number) => ({ defId: 'warrior', pos: { x, y } });
/** 遠處不動的敵人（沒有敵人時戰鬥會立刻結束） */
const dummy = { defId: 'brute', pos: { x: 18, y: 2 } };

describe('門（SPEC_SLICE4 §15.1）', () => {
  it('關著的門擋路：走不過去；打開後可以通過', () => {
    const w = makeWorld([hero(5, 10), dummy], {}, doorMap(), 1, HOLD);
    w.enqueue({ type: 'move', unitIds: [1], point: { x: 15, y: 10 } });
    run(w, 10 * 30);
    expect(w.getUnit(1)!.pos.x).toBeLessThan(10);
    w.setDoor(w.interactables.get('gate')!, true);
    w.enqueue({ type: 'move', unitIds: [1], point: { x: 15, y: 10 } });
    run(w, 10 * 30);
    expect(w.getUnit(1)!.pos.x).toBeGreaterThan(14);
  });

  it('互動指令：英雄走到門邊開門，之後可以穿過去', () => {
    const w = makeWorld([hero(4, 4), dummy], {}, doorMap(), 1, HOLD);
    w.enqueue({ type: 'interact', unitId: 1, objectId: 'gate' });
    const evs = run(w, 10 * 30);
    expect(evs.some((e) => e.type === 'interact' && e.objectId === 'gate')).toBe(true);
    expect(evs.some((e) => e.type === 'door' && e.objectId === 'gate' && e.open)).toBe(true);
    expect(w.interactables.get('gate')!.open).toBe(true);
    // 英雄停在門的左側（互動距離內），沒有穿過去
    const u = w.getUnit(1)!;
    expect(u.pos.x).toBeLessThan(10);
    expect(u.order).toBeNull();
  });

  it('再互動一次就關門；門口有人時關不上', () => {
    const w = makeWorld([hero(9, 10), hero(10.5, 10), dummy], {}, doorMap([], { open: true }), 1, HOLD);
    w.enqueue({ type: 'interact', unitId: 1, objectId: 'gate' });
    const evs = run(w, 5);
    expect(evs.some((e) => e.type === 'door' && e.blocked)).toBe(true);
    expect(w.interactables.get('gate')!.open).toBe(true);
    // 門口的人離開後就關得上
    w.enqueue({ type: 'move', unitIds: [2], point: { x: 15, y: 10 } });
    run(w, 3 * 30);
    w.enqueue({ type: 'interact', unitId: 1, objectId: 'gate' });
    run(w, 3 * 30);
    expect(w.interactables.get('gate')!.open).toBe(false);
  });

  it('關著的門擋視線，打開後看得到', () => {
    const w = makeWorld([hero(8, 10), dummy], {}, doorMap(), 1, HOLD);
    const u = w.getUnit(1)!;
    expect(w.canSeePoint(u, { x: 13, y: 10 })).toBe(false);
    w.setDoor(w.interactables.get('gate')!, true);
    expect(w.canSeePoint(u, { x: 13, y: 10 })).toBe(true);
  });

  it('上鎖的門不能直接開；拉下拉桿才會打開，拉桿只能拉一次', () => {
    const lever: InteractableDef = { id: 'lever', kind: 'lever', name: '拉桿', x: 6, y: 14, w: 0.5, h: 0.5, actions: [{ type: 'openDoor', door: 'gate' }] };
    const w = makeWorld([hero(5, 10), dummy], {}, doorMap([lever], { locked: true }), 1, HOLD);
    w.enqueue({ type: 'interact', unitId: 1, objectId: 'gate' });
    const evs = run(w, 3 * 30);
    expect(evs.some((e) => e.type === 'notice' && e.text === '上鎖了')).toBe(true);
    expect(w.interactables.get('gate')!.open).toBe(false);
    w.enqueue({ type: 'interact', unitId: 1, objectId: 'lever' });
    run(w, 5 * 30);
    expect(w.interactables.get('lever')!.open).toBe(true);
    expect(w.interactables.get('gate')!.open).toBe(true);
    w.enqueue({ type: 'interact', unitId: 1, objectId: 'lever' });
    const again = run(w, 5);
    expect(again.some((e) => e.type === 'notice' && e.text === '已經用過了')).toBe(true);
  });

  it('波次可以接在互動後面（觸發條件 interact）；雜兵的流場會被門擋住', () => {
    const lever: InteractableDef = { id: 'lever', kind: 'lever', x: 6, y: 14, w: 0.5, h: 0.5, actions: [{ type: 'openDoor', door: 'gate' }] };
    const horde: HordeSetup = {
      spawners: [{ id: 'e', x: 16, y: 10, radius: 1 }],
      waves: [{ id: 'ambush', trigger: { type: 'interact', id: 'lever' }, spawns: [{ spawner: 'e', enemy: 'thrall', count: 3 }] }],
      objective: { type: 'exit', rect: { x: 0, y: 0, w: 1, h: 1 } },
    };
    const w = new World({ seed: 2, map: doorMap([lever]), spawns: [hero(5, 10)], config: PASSIVE, idleBehavior: HOLD, horde });
    expect(Number.isFinite(w.flowDistanceAt({ x: 16, y: 10 }))).toBe(false);
    const before = run(w, 30);
    expect(before.some((e) => e.type === 'waveStart')).toBe(false);
    w.enqueue({ type: 'interact', unitId: 1, objectId: 'lever' });
    const evs = run(w, 6 * 30);
    expect(evs.some((e) => e.type === 'waveStart' && e.waveId === 'ambush')).toBe(true);
    expect(Number.isFinite(w.flowDistanceAt({ x: 16, y: 10 }))).toBe(true);
  });

  it('決定論：門的狀態在快照裡', () => {
    const snap = () => {
      const w = makeWorld([hero(4, 4), dummy], {}, doorMap(), 1, HOLD);
      w.enqueue({ type: 'interact', unitId: 1, objectId: 'gate' });
      run(w, 6 * 30);
      return w.snapshot();
    };
    expect(snap()).toBe(snap());
    expect(snap()).toContain('"gate",true');
  });
});

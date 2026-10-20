import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import type { MapDef } from '../src/sim/data/types';
import { enemyDef } from '../src/run/battle';
import { generateTemplateLevel } from '../src/run/templateLevelGen';
import { createRun } from '../src/run/runState';
import { applyBattleResult, availableNodes, chooseNode } from '../src/run/progression';
import { floodFrom } from '../src/run/levelGen';
import { NavGrid } from '../src/sim/nav/grid';
import { OPEN_MAP, PASSIVE, run } from './helpers';

const MAP: MapDef = { ...OPEN_MAP, id: 'exits', width: 20, height: 12, exits: [{ id: 'node:7', x: 16, y: 4, w: 4, h: 4 }] };

const heroes = (x: number) => [
  { defId: 'warrior', pos: { x, y: 5 } },
  { defId: 'ranger', pos: { x, y: 6 } },
];

describe('出口制（SPEC_SLICE6 §2）', () => {
  it('全員到齊才離開：只有一人在出口時提示、不結束；全員進去就勝利並記下出口', () => {
    const w = new World({ seed: 1, map: MAP, config: PASSIVE, spawns: [...heroes(2), { defId: 'brute', pos: { x: 2, y: 10 } }] });
    w.getUnit(1)!.pos = { x: 18, y: 5 };
    const evs = run(w, 2);
    expect(w.result).toBeNull();
    expect(evs.some((e) => e.type === 'exitWaiting' && e.inside === 1 && e.total === 2 && !e.locked)).toBe(true);
    w.getUnit(2)!.pos = { x: 18, y: 6 };
    const end = run(w, 2);
    expect(w.result).toBe('hero');
    expect(w.exitId).toBe('node:7');
    expect(end.some((e) => e.type === 'battleEnd' && e.exitId === 'node:7')).toBe(true);
  });

  it('有出口時，敵人全滅也不會自動結束（要走到出口）', () => {
    const w = new World({ seed: 1, map: MAP, config: PASSIVE, spawns: [...heroes(2), { defId: 'brute', pos: { x: 2, y: 10 } }] });
    w.getUnit(3)!.hp = 0;
    w.getUnit(3)!.dead = true;
    run(w, 5);
    expect(w.result).toBeNull();
  });

  it('精英關卡：隊長還活著時出口封住；打倒隊長才能離開', () => {
    const map: MapDef = { ...MAP, exitLock: 'captain' };
    const w = new World({ seed: 1, map, config: PASSIVE, spawns: [...heroes(18), { defId: 'shieldbearer', def: enemyDef('shieldbearer', 1, true), pos: { x: 2, y: 10 } }] });
    w.getUnit(1)!.pos = { x: 18, y: 5 };
    w.getUnit(2)!.pos = { x: 18, y: 6 };
    const evs = run(w, 2);
    expect(w.result).toBeNull();
    expect(evs.some((e) => e.type === 'exitWaiting' && e.locked)).toBe(true);
    const c = w.getUnit(3)!;
    c.hp = 0;
    c.dead = true;
    run(w, 2);
    expect(w.result).toBe('hero');
  });

  it('最後的頭目戰（沒有出口）：打倒頭目就勝利，護衛還活著也一樣', () => {
    const map: MapDef = { ...OPEN_MAP, id: 'boss', exitLock: 'boss' };
    const w = new World({ seed: 1, map, config: PASSIVE, spawns: [...heroes(2), { defId: 'warlord', pos: { x: 15, y: 6 } }, { defId: 'shieldbearer', pos: { x: 15, y: 9 } }] });
    run(w, 2);
    expect(w.result).toBeNull();
    const b = w.getUnit(3)!;
    b.hp = 0;
    b.dead = true;
    run(w, 2);
    expect(w.result).toBe('hero');
  });

  it('生成：出口數＝下一層節點數、排在遠端、走得到；精英關卡上鎖', () => {
    for (let s = 1; s <= 8; s++) {
      for (const n of [1, 2, 3]) {
        const exits = [...Array(n).keys()].map((i) => ({ id: `node:${i}` }));
        const lv = generateTemplateLevel(s * 31, { tier: s % 2 ? 'battle' : 'elite', layer: 3, exits });
        const m = lv.mapDef;
        expect(m.exits?.map((e) => e.id)).toEqual(exits.map((e) => e.id));
        expect(m.exitLock).toBe(s % 2 ? undefined : 'captain');
        const nav = new NavGrid(m.width, m.height, 0.5, 0.55, m.obstacles);
        const reach = floodFrom(nav, m.heroSpawns[0]);
        for (const e of m.exits!) {
          expect(e.x + e.w).toBe(m.width);
          const c = nav.cellOf({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
          expect(reach[c.cy * nav.cols + c.cx], `s${s} n${n} ${e.id}`).toBe(1);
        }
        // 由左到右（y 遞增）
        const ys = m.exits!.map((e) => e.y);
        expect([...ys].sort((a, b) => a - b)).toEqual(ys);
      }
    }
  });

  it('遠征：從出口離開後，路線圖上只能前往那個節點；前往後恢復正常', () => {
    let r = createRun(5);
    const first = availableNodes(r)[0];
    r = chooseNode(r, first.id);
    if (r.phase.kind !== 'battle') return;
    const target = r.map.nodes[first.id].next[r.map.nodes[first.id].next.length - 1];
    r = applyBattleResult(r, { won: true, time: 10, exitNodeId: target, heroes: r.party.flatMap((h, slot) => (h ? [{ slot, hp: h.hp, dead: false, kills: 0, damageDealt: 0, damageTaken: 0 }] : [])) });
    r = { ...r, phase: { kind: 'map' } };
    expect(availableNodes(r).map((n) => n.id)).toEqual([target]);
    r = chooseNode(r, target);
    expect(r.exitTo).toBeNull();
  });
});

/** 探索獎勵（Alan 2026-10-22）：第 3～5 章室內地圖的寶箱、地上的道具、祭壇 */
import { describe, expect, it } from 'vitest';
import type { InteractableDef, MapDef } from '../src/sim/data/types';
import { BAG } from '../src/sim/data/consumables';
import { SHRINE_RULES, SHRINES } from '../src/sim/data/shrines';
import { DT } from '../src/sim/constants';
import { placeTreasure } from '../src/run/treasure';
import { TREASURE } from '../src/run/data/treasure';
import { generateIndoor } from '../src/run/indoorGen';
import { indoorEncounter, navOk } from '../src/run/fbbLevel';
import { battleOutcomeFromWorld, createBattleFromRun, deliberateLevelId, encounterFor } from '../src/run/battle';
import { applyBattleResult } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import { HOLD, makeWorld, run } from './helpers';

function lootMap(objs: InteractableDef[]): MapDef {
  return { id: 'loot-test', name: '測試', width: 20, height: 20, obstacles: [], heroSpawns: [], enemySpawns: [], interactables: objs };
}
const hero = (x: number, y: number) => ({ defId: 'warrior', pos: { x, y } });
const dummy = { defId: 'brute', pos: { x: 18, y: 18 } };

describe('放置', () => {
  it('同一個種子放在同一個地方；離出生點夠遠、不在牆上、彼此有距離', () => {
    for (const theme of ['temple', 'cave', 'castle'] as const)
      for (const seed of [1, 7, 42]) {
        const lv = generateIndoor(theme, seed, { layer: 3, entry: 'bottom', exits: [{ id: 'a', edge: 'top' }] });
        const input = { grid: lv.grid, spawn: lv.heroSpawns[0], exits: lv.exits, taken: new Set<string>(), layer: 3 };
        const a = placeTreasure(seed, input);
        expect(placeTreasure(seed, input)).toEqual(a);
        expect(a.filter((s) => s.kind === 'chest').length, `${theme} ${seed}`).toBeGreaterThan(0);
        for (const s of a) {
          expect(lv.grid[s.y][s.x]).toBe('.');
          expect(Math.abs(s.x - lv.heroSpawns[0].x) + Math.abs(s.y - lv.heroSpawns[0].y)).toBeGreaterThanOrEqual(TREASURE.minDistance);
          if (s.kind === 'shrine') expect(s.shrine && SHRINES[s.shrine]).toBeTruthy();
          else expect(s.loot).toBeTruthy();
        }
        for (const s of a) for (const t of a) if (s !== t) expect(Math.abs(s.x - t.x) + Math.abs(s.y - t.y)).toBeGreaterThanOrEqual(TREASURE.spacing);
      }
  });

  it('室內遭遇：第一次造訪有寶箱，之後沒有；出生點走得到每個寶箱', () => {
    const opts = { tier: 'battle' as const, layer: 3, exits: [{ id: 'node:1', edge: 'top' as const }], entry: 'bottom' as const, theme: 'temple' as const };
    const first = indoorEncounter(5, { ...opts, treasure: true });
    const again = indoorEncounter(5, { ...opts, treasure: false });
    const kinds = (e: typeof first) => (e.mapDef!.interactables ?? []).map((i) => i.kind);
    expect(kinds(first)).toContain('chest');
    expect(kinds(again).filter((k) => k !== 'door')).toEqual([]);
    expect(navOk(first)).toBe(true);
  });

  it('第 3～5 章的戰鬥用室內地圖', () => {
    for (const [chapter, theme] of [
      [2, 'temple'],
      [3, 'cave'],
      [4, 'castle'],
    ] as const) {
      const r = createRun(3, { style: 'deliberate' });
      r.chapter = chapter;
      const node = r.map.nodes.find((n) => n.layer === 2)!;
      r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
      const enc = encounterFor(r, node.id, deliberateLevelId('battle'));
      const art = enc.mapDef!.art as { kind: string; level: { theme: string } };
      expect(art.kind).toBe('fbbIndoor');
      expect(art.level.theme).toBe(theme);
    }
  });
});

describe('寶箱與地上的道具', () => {
  it('回血立刻生效；消耗品放進包包；裝備、經驗值、金幣留到戰後', () => {
    const w = makeWorld(
      [hero(5, 5), dummy],
      {},
      lootMap([
        { id: 'c1', kind: 'chest', x: 6, y: 5, w: 0.8, h: 0.8, loot: { kind: 'heal', pct: 0.5 } },
        { id: 'c2', kind: 'chest', x: 6, y: 7, w: 0.8, h: 0.8, loot: { kind: 'item', id: 'x' } },
        { id: 'p1', kind: 'pickup', x: 4, y: 5, w: 0.5, h: 0.5, loot: { kind: 'consumable', id: 'potion', gold: 15 } },
        { id: 'p2', kind: 'pickup', x: 4, y: 7, w: 0.5, h: 0.5, loot: { kind: 'xp', amount: 30 } },
      ]),
      1,
      HOLD,
    );
    const u = w.getUnit(1)!;
    u.hp = 10;
    w.bag = [];
    for (const id of ['c1', 'c2', 'p1', 'p2']) {
      w.enqueue({ type: 'interact', unitId: 1, objectId: id });
      run(w, 5 * 30);
    }
    expect(u.hp).toBe(Math.min(u.maxHp, 10 + Math.round(u.maxHp * 0.5)));
    expect(w.bag).toEqual(['potion']);
    expect(w.loot).toEqual([
      { kind: 'item', id: 'x' },
      { kind: 'xp', amount: 30 },
    ]);
    // 只能打開一次
    const c1 = w.interactables.get('c1')!;
    expect(c1.open).toBe(true);
    expect(w.interactables.usable(c1)).toBe(false);
  });

  it('包包滿了：消耗品換成金幣', () => {
    const w = makeWorld([hero(5, 5), dummy], {}, lootMap([{ id: 'p', kind: 'pickup', x: 6, y: 5, w: 0.5, h: 0.5, loot: { kind: 'consumable', id: 'potion', gold: 15 } }]), 1, HOLD);
    w.bag = new Array(BAG.capacity).fill('smoke');
    w.enqueue({ type: 'interact', unitId: 1, objectId: 'p' });
    const evs = run(w, 5 * 30);
    expect(w.bag.length).toBe(BAG.capacity);
    expect(w.loot).toEqual([{ kind: 'gold', amount: 15 }]);
    expect(evs.some((e) => e.type === 'loot' && e.toGold)).toBe(true);
  });

  it('戰後結算：裝備進背包、經驗值和金幣入帳', () => {
    const r = createRun(11, { style: 'deliberate' });
    const node = r.map.layers[0].map((id) => r.map.nodes[id])[0];
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
    const w = createBattleFromRun(r);
    w.result = 'hero';
    const base = applyBattleResult(r, battleOutcomeFromWorld(w));
    w.loot.push({ kind: 'item', id: 'ironShield' }, { kind: 'xp', amount: 40 }, { kind: 'gold', amount: 20 });
    const got = applyBattleResult(r, battleOutcomeFromWorld(w));
    expect(got.inventory?.filter((i) => i === 'ironShield').length).toBe((base.inventory?.filter((i) => i === 'ironShield').length ?? 0) + 1);
    expect(got.gold).toBe(base.gold + 20);
    const xpOf = (s: typeof got) => (s.phase.kind === 'reward' ? (s.phase.xpGained ?? 0) : 0);
    expect(xpOf(got)).toBe(xpOf(base) + 40);
  });
});

describe('祭壇', () => {
  it('全隊得到增益，時間到就消失；只能用一次', () => {
    const w = makeWorld([hero(5, 5), hero(5, 6), dummy], {}, lootMap([{ id: 's', kind: 'shrine', x: 6, y: 5, w: 0.9, h: 0.9, shrine: 'eagle' }]), 1, HOLD);
    const a = w.getUnit(1)!;
    const b = w.getUnit(2)!;
    const acc = b.accuracy;
    w.enqueue({ type: 'interact', unitId: 1, objectId: 's' });
    run(w, 3 * 30);
    expect(a.shrine).toBe('eagle');
    expect(b.accuracy).toBe(acc + SHRINES.eagle.accuracy!);
    expect(w.interactables.usable(w.interactables.get('s')!)).toBe(false);
    run(w, Math.ceil(SHRINE_RULES.duration / DT));
    expect(b.accuracy).toBe(acc);
  });

  it('復甦祭壇：每秒回復最大生命的一部分', () => {
    const w = makeWorld([hero(5, 5), dummy], {}, lootMap([{ id: 's', kind: 'shrine', x: 6, y: 5, w: 0.9, h: 0.9, shrine: 'renewal' }]), 1, HOLD);
    const u = w.getUnit(1)!;
    u.hp = 10;
    w.enqueue({ type: 'interact', unitId: 1, objectId: 's' });
    run(w, 3 * 30);
    const before = u.hp;
    run(w, Math.round(5 / DT));
    expect(u.hp).toBeGreaterThanOrEqual(Math.min(u.maxHp, before + Math.floor(u.maxHp * SHRINES.renewal.regenPct! * 5) - 1));
    expect(Number.isInteger(u.hp)).toBe(true);
  });
});

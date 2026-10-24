/** 一路向前（SPEC_SLICE7 §1、§2）：沒有路線圖、出口直接接下一張圖、出口預告、地圖上的商人 */
import { describe, expect, it } from 'vitest';
import type { BattleOutcome } from '../src/run/battle';
import { createBattleFromRun, currentEncounter } from '../src/run/battle';
import { DELIBERATE_PACE } from '../src/sim/data/deliberate';
import { buyConsumable, canBuyConsumable } from '../src/run/consumables';
import { buyItem, canBuy, shopOf } from '../src/run/items';
import { STOP_TYPES, journeyDepth, journeyStrength, previewOf, rescueAt, startNodeOf } from '../src/run/journey';
import { rollShopStock } from '../src/run/items';
import { rngFor } from '../src/run/seed';
import { startChapter } from '../src/run/campaign';
import { JOURNEY } from '../src/run/data/journey';
import { CHAPTERS } from '../src/run/data/chapters';
import { ENEMIES } from '../src/sim/data/enemies';
import { applyBattleResult, availableNodes, chooseNode, chooseReward, continueFromReward, leaveNode } from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun } from '../src/run/runState';
import { BAG } from '../src/sim/data/consumables';

const won = (r: RunState, exitNodeId?: number): BattleOutcome => ({
  won: true,
  exitNodeId,
  killed: [],
  time: 10,
  heroes: r.party.flatMap((h, slot) => (h ? [{ slot, hp: h.hp, dead: false, kills: 0, damageDealt: 0, damageTaken: 0 }] : [])),
});

/** 一張站著商人的戰鬥地圖（商人節點現在是途中停靠；地圖上的商人保留給之後用） */
function merchantMap(): RunState {
  const run = createRun(1, { style: 'deliberate' });
  const r = chooseNode(run, run.map.layers[0][0]);
  if (r.phase.kind === 'battle') r.phase.shop = { stock: rollShopStock(rngFor(1, 'shop')), sold: [] };
  return r;
}

describe('一路向前', () => {
  it('沉穩節奏的遠征預設一路向前：沒有魔王主力與冠軍，只能往下一層走', () => {
    let r = createRun(3, { style: 'deliberate' });
    expect(r.forward).toBe(true);
    expect(r.overworld).toBeUndefined();
    const first = availableNodes(r)[0];
    r = chooseNode(r, first.id);
    r = { ...r, phase: { kind: 'map' } };
    // 只往後面的層走；休息、商人、事件折進路上，不是能選的圖
    for (const n of availableNodes(r)) {
      expect(n.layer).toBeGreaterThan(first.layer);
      expect(STOP_TYPES).not.toContain(n.type);
    }
  });

  it('地圖的出口只通往下一層', () => {
    let r = createRun(4, { style: 'deliberate' });
    r = chooseNode(r, availableNodes(r)[0].id);
    const w = createBattleFromRun(r);
    const next = r.map.nodes[r.currentNodeId!].next.map((id) => `node:${id}`);
    expect((w.map.exits ?? []).map((e) => e.id).sort()).toEqual([...next].sort());
  });

  it('從出口離開：選完升級直接進那張圖，不回路線圖', () => {
    let r = createRun(5, { style: 'deliberate' });
    r = chooseNode(r, availableNodes(r)[0].id);
    const to = r.map.nodes[r.currentNodeId!].next[0];
    r = applyBattleResult(r, won(r, to));
    for (let i = 0; i < 10 && r.phase.kind === 'reward'; i++) r = r.phase.options.length ? chooseReward(r, 'skip') : continueFromReward(r);
    expect(r.currentNodeId).toBe(to);
    expect(r.phase.kind).not.toBe('map');
  });

  it('出口預告：說地形、威脅、敵人以外的氣息，不說是商人或事件', () => {
    const r = createRun(6, { style: 'deliberate' });
    for (const n of r.map.nodes) {
      const p = previewOf(r, n.id);
      expect(p.terrain.length).toBeGreaterThan(0);
      expect(p.presence).toBe(n.type === 'shop' || n.type === 'event' || rescueAt(r, n.id));
      expect(p.threat).toBe(n.type === 'elite' ? 'elite' : n.type === 'boss' ? 'boss' : null);
      expect(Object.keys(p)).not.toContain('type');
    }
  });
});

describe('地圖上的商人（目前遠征流程沒用到，保留給之後）', () => {
  it('商人節點是一張有商人的戰鬥地圖；商人可以一直交易', () => {
    let r = merchantMap();
    expect(r.phase.kind).toBe('battle');
    expect(shopOf(r)?.stock.length).toBeGreaterThan(0);
    const w = createBattleFromRun(r);
    const m = w.interactables.get('merchant')!;
    expect(m.def.kind).toBe('merchant');
    const hero = w.heroes()[0];
    w.interact(hero, m);
    w.interact(hero, m);
    expect(m.uses).toBe(2);
    expect(w.interactables.usable(m)).toBe(true);
  });

  it('買裝備放進背包；買消耗品只扣金幣（放進包包由 sim 處理）；戰鬥中不放', () => {
    let r = merchantMap();
    r = { ...r, gold: 999 };
    const item = shopOf(r)!.stock[0];
    expect(canBuy(r, item)).toBe(true);
    const a = buyItem(r, item);
    expect(a.inventory).toContain(item);
    expect(shopOf(a)!.sold).toContain(item);
    const bagBefore = [...(r.bag ?? [])];
    const b = buyConsumable(r, 'potion', 0);
    expect(b.gold).toBeLessThan(r.gold);
    expect(b.bag).toEqual(bagBefore);
    expect(canBuyConsumable(r, 'potion', BAG.capacity)).toBe(false);

    const w = createBattleFromRun(r);
    const n = w.bag.length;
    w.enqueue({ type: 'stockBag', itemId: 'potion' });
    w.step();
    expect(w.bag.length).toBe(Math.min(n + 1, BAG.capacity));
    w.inCombat = true;
    w.enqueue({ type: 'stockBag', itemId: 'potion' });
    w.step();
    expect(w.bag.length).toBe(Math.min(n + 1, BAG.capacity));
  });
});

describe('強度曲線（SPEC_SLICE7 §3.3）', () => {
  it('敵人照全程深度變強、乘上章節倍率；頭目從第 1 章頭目那一層開始算', () => {
    const r = createRun(7, { style: 'deliberate' });
    const C = JOURNEY.curve;
    const first = r.map.nodes[r.map.layers[0][0]];
    expect(journeyDepth(r, first)).toBe(1);
    expect(journeyStrength(r, first)).toBeCloseTo(C.chapterMult[0]);
    const boss = r.map.nodes.find((n) => n.type === 'boss')!;
    expect(journeyStrength(r, boss)).toBeCloseTo(C.chapterMult[0]);
    // 第 3 章第 2 層：前兩章的層數全部算進去
    const r3 = { ...r, chapter: 2 };
    const n2 = r.map.nodes[r.map.layers[1][0]];
    expect(journeyDepth(r3, n2)).toBe(CHAPTERS[0].layers + CHAPTERS[1].layers + 2);
    expect(journeyStrength(r3, n2)).toBeCloseTo((1 + C.perDepth * (journeyDepth(r3, n2) - 1)) * C.chapterMult[2]);
  });

  it('戰鬥裡的敵人數值跟著強度走', () => {
    let r = createRun(8, { style: 'deliberate' });
    r = chooseNode(r, availableNodes(r)[0].id);
    const w = createBattleFromRun(r);
    const e = w.units.find((u) => u.team === 'enemy' && u.def.id === 'raider');
    if (!e) return;
    const s = journeyStrength(r, r.map.nodes[r.currentNodeId!]);
    expect(e.def.damageMult ?? 1).toBeCloseTo((ENEMIES.raider.damageMult ?? 1) * s);
  });
});

describe('章節開頭', () => {
  it('一路向前：看完過場直接進第一張圖（不經過「前方的路」畫面）', () => {
    const r = startChapter(createRun(12, { style: 'deliberate', intro: true }));
    expect(r.phase.kind).toBe('battle');
    expect(r.currentNodeId).toBe(startNodeOf(r));
  });
});

describe('途中停靠（休息、商人、事件）', () => {
  it('休息、商人、事件變成「走進下一張圖之前路上經過的地方」；每章的地圖數不變', () => {
    for (let s = 1; s <= 10; s++) {
      const r = createRun(s, { style: 'deliberate', forward: false });
      const f = createRun(s, { style: 'deliberate' });
      expect(f.map.nodes.length).toBe(r.map.nodes.length);
      for (const n of f.map.nodes) {
        expect(STOP_TYPES).not.toContain(n.type);
        if (STOP_TYPES.includes(r.map.nodes[n.id].type)) expect(n.stop).toBe(r.map.nodes[n.id].type);
      }
    }
  });

  it('走進有停靠的出口：先停（商人／休息），離開後直接進那張圖；出口預告有寫', () => {
    for (let s = 1; s < 60; s++) {
      const run = createRun(s, { style: 'deliberate' });
      const to = run.map.nodes.find((n) => (n.stop === 'rest' || n.stop === 'shop') && run.map.nodes.some((p) => p.next.includes(n.id) && !p.stop && p.type === 'battle'));
      if (!to) continue;
      const from = run.map.nodes.find((p) => p.next.includes(to.id) && !p.stop && p.type === 'battle')!;
      const before = run.map.nodes.find((n) => n.next.includes(from.id));
      let r: RunState = chooseNode({ ...run, currentNodeId: before?.id ?? null, phase: { kind: 'map' } }, from.id);
      const p = previewOf(r, to.id);
      expect(p.campfire || p.wayPresence).toBe(true);
      r = applyBattleResult(r, won(r, to.id));
      for (let i = 0; i < 10 && r.phase.kind === 'reward'; i++) r = r.phase.options.length ? chooseReward(r, 'skip') : continueFromReward(r);
      expect(r.phase.kind).toBe(to.stop);
      r = leaveNode(r);
      expect(r.phase.kind).toBe('battle');
      expect(r.currentNodeId).toBe(to.id);
      return;
    }
    throw new Error('找不到休息或商人的停靠');
  });
});

describe('敵人強度的級距（Alan 2026-10-24，佔位）', () => {
  it('前期的一般敵人生命向下對齊到基準值（盾兵和劍兵一樣）；精英隊長不受影響', () => {
    let r = createRun(9, { style: 'deliberate' });
    r = chooseNode(r, startNodeOf(r));
    const w = createBattleFromRun(r);
    const s = journeyStrength(r, r.map.nodes[r.currentNodeId!]);
    for (const u of w.units.filter((x) => x.team === 'enemy' && x.def.rank !== 'elite' && x.def.rank !== 'boss'))
      expect(u.def.maxHp).toBeLessThanOrEqual(Math.round(JOURNEY.hpBaseline.hp * s * DELIBERATE_PACE.enemyHpMult) + 1);
  });

  it('一般敵人的數量照 countMult 增加', () => {
    let r = createRun(10, { style: 'deliberate' });
    r = chooseNode(r, startNodeOf(r));
    const enc = currentEncounter(r);
    const w = createBattleFromRun(r);
    const normal = enc.enemies.filter((e) => !e.captain).length;
    const now = w.units.filter((u) => u.team === 'enemy' && u.def.rank !== 'elite').length;
    expect(now).toBeGreaterThan(normal);
    expect(now).toBeLessThanOrEqual(Math.ceil(normal * JOURNEY.countMult) + 2);
  });
});

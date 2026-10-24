/** 一路向前（SPEC_SLICE7 §1、§2）：沒有路線圖、出口直接接下一張圖、出口預告、地圖上的商人 */
import { describe, expect, it } from 'vitest';
import type { BattleOutcome } from '../src/run/battle';
import { createBattleFromRun } from '../src/run/battle';
import { buyConsumable, canBuyConsumable } from '../src/run/consumables';
import { buyItem, canBuy, shopOf } from '../src/run/items';
import { journeyDepth, journeyStrength, previewOf, rescueAt, startNodeOf } from '../src/run/journey';
import { startChapter } from '../src/run/campaign';
import { JOURNEY } from '../src/run/data/journey';
import { CHAPTERS } from '../src/run/data/chapters';
import { ENEMIES } from '../src/sim/data/enemies';
import { applyBattleResult, availableNodes, chooseNode, chooseReward, continueFromReward } from '../src/run/progression';
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

/** 一趟有商人的遠征，站在商人前一個節點 */
function besideShop(): RunState {
  for (let s = 1; s < 80; s++) {
    const r = createRun(s, { style: 'deliberate' });
    const shop = r.map.nodes.find((n) => n.type === 'shop');
    const prev = shop && r.map.nodes.find((n) => n.next.includes(shop.id));
    if (!shop || !prev) continue;
    r.currentNodeId = prev.id;
    r.exitTo = shop.id;
    return r;
  }
  throw new Error('找不到有商人的遠征');
}

describe('一路向前', () => {
  it('沉穩節奏的遠征預設一路向前：沒有魔王主力與冠軍，只能往下一層走', () => {
    let r = createRun(3, { style: 'deliberate' });
    expect(r.forward).toBe(true);
    expect(r.overworld).toBeUndefined();
    const first = availableNodes(r)[0];
    r = chooseNode(r, first.id);
    r = { ...r, phase: { kind: 'map' } };
    for (const n of availableNodes(r)) expect(n.layer).toBe(first.layer + 1);
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

describe('地圖上的商人', () => {
  it('商人節點是一張有商人的戰鬥地圖；商人可以一直交易', () => {
    let r = besideShop();
    r = chooseNode({ ...r, phase: { kind: 'map' } }, r.exitTo!);
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
    let r = besideShop();
    r = chooseNode({ ...r, phase: { kind: 'map' } }, r.exitTo!);
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

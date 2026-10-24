import { describe, expect, it } from 'vitest';
import { createBattleFromRun } from '../src/run/battle';
import { ECONOMY } from '../src/run/data/economy';
import { buyItem, canBuy, canEquip, equipItem, rollItemDrop, unequipItem } from '../src/run/items';
import { validateMap } from '../src/run/mapGen';
import { validateRouteMap } from '../src/run/routeMap';
import { ROUTE_MAP } from '../src/run/data/routeMap';
import { applyBattleResult, chooseNode, leaveNode } from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun } from '../src/run/runState';
import { rngFor } from '../src/run/seed';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { ENEMIES } from '../src/sim/data/enemies';
import { ITEMS } from '../src/sim/data/items';
import { HOLD, makeWorld, run } from './helpers';

const D = deliberateConfig();
/** 標靶：打不死、不還手、好命中 */
const dummy = { ...ENEMIES.minion, maxHp: 9999, defense: -100, damage: [0, 0] as [number, number] };

function toShop(seed = 1): RunState {
  for (let s = seed; s < seed + 50; s++) {
    // 舊的商人節點（一路向前的商人在地圖上，見 journey.test.ts）
    const r = createRun(s, { forward: false });
    const shop = r.map.nodes.find((n) => n.type === 'shop');
    if (!shop) continue;
    // 直接把目前位置放在商人的相鄰節點（測試用）；移開主力與冠軍，只測商人
    const prev = r.map.nodes.find((n) => (n.links ?? n.next).includes(shop.id))!;
    r.currentNodeId = prev.id;
    if (r.overworld) {
      r.overworld.force = [];
      r.overworld.champion.node = null;
      r.overworld.champion.respawnAt = 999;
    }
    return chooseNode(r, shop.id);
  }
  throw new Error('找不到商人');
}

describe('裝備道具（SPEC_SLICE5 §17）', () => {
  it('沉穩節奏的路線圖有 1–2 個商人；舊模式沒有', () => {
    for (let s = 1; s <= 20; s++) {
      const r = createRun(s);
      const shops = r.map.nodes.filter((n) => n.type === 'shop').length;
      expect(shops).toBeGreaterThanOrEqual(1);
      expect(shops).toBeLessThanOrEqual(ROUTE_MAP.shops[1]);
      // 沉穩節奏用 FTL 式路線圖（SPEC_SLICE6 §4）
      expect(validateRouteMap(r.map)).toEqual([]);
      expect(validateMap(createRun(s, { layers: 8 }).map)).toEqual([]);
      expect(createRun(s, { style: 'tactical' }).map.nodes.some((n) => n.type === 'shop')).toBe(false);
    }
  });

  it('商人：貨架、購買扣金幣、放進背包；金幣不足買不了；可以離開', () => {
    let r = toShop();
    if (r.phase.kind !== 'shop') throw new Error();
    expect(r.phase.stock.length).toBe(ECONOMY.shopStock);
    expect(r.phase.stock.filter((id) => ITEMS[id].rarity === 'rare').length).toBe(ECONOMY.shopRareStock);
    const stock = r.phase.stock;
    r = { ...r, gold: 200 };
    const cheap = [...stock].sort((a, b) => ITEMS[a].price - ITEMS[b].price)[0];
    const after = buyItem(r, cheap);
    expect(after.gold).toBe(200 - ITEMS[cheap].price);
    expect(after.inventory).toContain(cheap);
    expect(canBuy(after, cheap)).toBe(false);
    expect(canBuy({ ...r, gold: 0 }, cheap)).toBe(false);
    expect(leaveNode(after).phase.kind).toBe('map');
  });

  it('裝備與卸下：每名英雄最多 2 格', () => {
    let r: RunState = { ...createRun(3), inventory: ['ironShield', 'swiftBoots', 'hawkEye'] };
    r = equipItem(r, 0, 'ironShield');
    r = equipItem(r, 0, 'swiftBoots');
    expect(r.party[0]!.items).toEqual(['ironShield', 'swiftBoots']);
    expect(canEquip(r, 0, 'hawkEye')).toBe(false);
    expect(() => equipItem(r, 0, 'hawkEye')).toThrow();
    r = unequipItem(r, 0, 'ironShield');
    expect(r.inventory).toEqual(['hawkEye', 'ironShield']);
    expect(canEquip(r, 0, 'hawkEye')).toBe(true);
  });

  it('戰鬥：裝備的道具變成英雄的被動（數值修正）', () => {
    let r: RunState = { ...createRun(3, { party: ['warrior', 'cleric', 'mage', 'ranger'] }), inventory: ['swiftBoots', 'leatherArmor'] };
    r = equipItem(equipItem(r, 0, 'swiftBoots'), 0, 'leatherArmor');
    const w = createBattleFromRun(chooseNode(r, r.map.layers[0][0]));
    const war = w.units.find((u) => u.heroSlot === 0)!;
    expect(war.passives.map((p) => p.id)).toEqual(expect.arrayContaining(['item:swiftBoots', 'item:leatherArmor']));
    expect(war.armor).toBe(war.def.armor + 2);
    expect(war.mods.moveSpeedPct).toBeCloseTo(0.15);
  });

  it('道具效果：鐵盾每 3 擊暈眩、沼澤苔留下減速區、火焰之刃點燃、鷹眼斬殺加傷', () => {
    const hit = (item: string, ticks = 25 * 30) => {
      const w = makeWorld([{ defId: 'warrior', pos: { x: 5, y: 6 }, items: [item] }, { defId: 'minion', def: dummy, pos: { x: 6, y: 6 } }], D, undefined, 3, HOLD);
      w.enqueue({ type: 'attack', unitIds: [1], targetId: 2 });
      return { w, evs: run(w, ticks) };
    };
    const shield = hit('ironShield');
    const hits = shield.evs.filter((e) => e.type === 'hit' && e.sourceId === 1 && !e.skillId).length;
    const stuns = shield.evs.filter((e) => e.type === 'notice' && e.text === '鐵盾').length;
    expect(hits).toBeGreaterThanOrEqual(3);
    expect(stuns).toBe(Math.floor(shield.w.getUnit(1)!.basicHits / 3));
    const moss = hit('swampMoss');
    expect(moss.evs.some((e) => e.type === 'notice' && e.text === '沼澤苔')).toBe(true);
    const fire = hit('flameBlade', 60 * 30);
    expect(fire.evs.some((e) => e.type === 'status' && e.unitId === 2 && e.text === '燃燒')).toBe(true);
    // 鷹眼：低生命目標的期望傷害較高（同種子比較）
    const dmg = (items: string[]) => {
      const w = makeWorld([{ defId: 'warrior', pos: { x: 5, y: 6 }, items }, { defId: 'minion', def: dummy, pos: { x: 6, y: 6 }, hp: 1000 }], D, undefined, 3, HOLD);
      w.enqueue({ type: 'attack', unitIds: [1], targetId: 2 });
      return run(w, 20 * 30).filter((e) => e.type === 'hit' && e.sourceId === 1 && e.targetId === 2).reduce((s, e) => s + (e as { damage: number }).damage, 0);
    };
    expect(dmg(['hawkEye'])).toBeGreaterThan(dmg([]));
  });

  it('掉落：精英勝利必掉道具並放進背包；舊模式不掉', () => {
    expect(rollItemDrop(rngFor(1, 'x'), 'elite')).not.toBeNull();
    for (const style of ['deliberate', 'tactical'] as const) {
      const r = createRun(9, { style, party: ['warrior', 'cleric', 'mage', 'ranger'] });
      const node = r.map.nodes.find((n) => n.type === 'elite')!;
      const b: RunState = { ...r, currentNodeId: node.id, phase: { kind: 'battle', nodeId: node.id, encounterId: style === 'deliberate' ? 'dlevel:elite' : 'bridgeFlank', fromEvent: false } };
      const after = applyBattleResult(b, { won: true, time: 30, heroes: [0, 1, 2, 3].map((slot) => ({ slot, hp: 50, dead: false, kills: 0, damageDealt: 0, damageTaken: 0 })) });
      if (after.phase.kind !== 'reward') throw new Error();
      if (style === 'deliberate') {
        expect(after.phase.item).toBeDefined();
        expect(after.inventory).toContain(after.phase.item);
      } else expect(after.phase.item).toBeUndefined();
    }
  });
});

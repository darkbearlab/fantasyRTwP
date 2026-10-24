/**
 * 裝備道具的遠征規則（SPEC_SLICE5 §17）：背包、裝備／卸下、商人、戰鬥掉落。純函式（舊狀態 → 新狀態）。
 * 道具的效果是被動（src/sim/data/items.ts），只在沉穩節奏的戰鬥生效。
 */
import { tr } from '../i18n/lang';
import { HEROES } from '../sim/data/heroes';
import type { ItemRarity } from '../sim/data/items';
import { ITEMS } from '../sim/data/items';
import type { Rng } from '../sim/rng';
import { ECONOMY } from './data/economy';
import type { RunState } from './runState';
import { cloneRun } from './runState';

export const itemsOf = (r: RunState, slot: number): string[] => r.party[slot]?.items ?? [];

function pool(rarity: ItemRarity): string[] {
  return Object.values(ITEMS)
    .filter((i) => i.rarity === rarity)
    .map((i) => i.id);
}

/** 抽一件道具（rareChance：稀有的機率） */
export function rollItem(rng: Rng, rareChance: number): string {
  const p = pool(rng.chance(rareChance) ? 'rare' : 'common');
  return p[rng.int(0, p.length - 1)];
}

/** 商人的貨架：一般與稀有各若干件，不重複 */
export function rollShopStock(rng: Rng): string[] {
  const take = (rarity: ItemRarity, n: number) => {
    const p = [...pool(rarity)];
    const out: string[] = [];
    while (out.length < n && p.length) out.push(p.splice(rng.int(0, p.length - 1), 1)[0]);
    return out;
  };
  return [...take('common', ECONOMY.shopStock - ECONOMY.shopRareStock), ...take('rare', ECONOMY.shopRareStock)];
}

/** 這次勝利會掉落道具嗎（依節點類型；精英必掉、稀有機率較高） */
export function rollItemDrop(rng: Rng, kind: 'battle' | 'elite' | 'event'): string | null {
  if (!rng.chance(ECONOMY.itemDropChance[kind] ?? 0)) return null;
  return rollItem(rng, kind === 'elite' ? ECONOMY.eliteRareChance : ECONOMY.battleRareChance);
}

/** 目前的貨架：商人節點，或地圖上的商人（SPEC_SLICE7 §2） */
export function shopOf(run: RunState): { stock: string[]; sold: string[] } | undefined {
  const p = run.phase;
  return p.kind === 'shop' ? p : p.kind === 'battle' ? p.shop : undefined;
}

export function canBuy(run: RunState, itemId: string): boolean {
  const p = shopOf(run);
  return !!p && p.stock.includes(itemId) && !p.sold.includes(itemId) && run.gold >= ITEMS[itemId].price;
}

/** 在商人那裡買一件道具（放進背包） */
export function buyItem(run: RunState, itemId: string): RunState {
  if (!canBuy(run, itemId)) throw new Error('買不了（不在貨架上、已售出或金幣不足）');
  const r = cloneRun(run);
  shopOf(r)!.sold.push(itemId);
  r.gold -= ITEMS[itemId].price;
  (r.inventory ??= []).push(itemId);
  r.journal.push(tr("向商人買了「{0}」。", { 0: ITEMS[itemId].name }));
  return r;
}

export function canEquip(run: RunState, slot: number, itemId: string): boolean {
  const h = run.party[slot];
  return !!h && !h.dead && (run.inventory ?? []).includes(itemId) && itemsOf(run, slot).length < ECONOMY.itemSlots;
}

/** 從背包裝備到一名英雄身上 */
export function equipItem(run: RunState, slot: number, itemId: string): RunState {
  if (!canEquip(run, slot, itemId)) throw new Error('不能裝備（沒有這件道具、英雄陣亡或道具欄已滿）');
  const r = cloneRun(run);
  const inv = r.inventory!;
  inv.splice(inv.indexOf(itemId), 1);
  (r.party[slot]!.items ??= []).push(itemId);
  return r;
}

/** 卸下放回背包 */
export function unequipItem(run: RunState, slot: number, itemId: string): RunState {
  const h = run.party[slot];
  if (!h || !(h.items ?? []).includes(itemId)) throw new Error('這名英雄沒有裝備這件道具');
  const r = cloneRun(run);
  const items = r.party[slot]!.items!;
  items.splice(items.indexOf(itemId), 1);
  (r.inventory ??= []).push(itemId);
  return r;
}

/** 道具的一行說明 */
export function itemLabel(itemId: string): string {
  const d = ITEMS[itemId];
  return tr("{0}{1}：{2}", { 0: d.rarity === 'rare' ? '★' : '', 1: d.name, 2: d.passive.description });
}

/** 陣亡英雄的道具不會消失：留在身上，復活後照樣生效（給畫面顯示用） */
export function heroName(run: RunState, slot: number): string {
  const h = run.party[slot];
  return h ? HEROES[h.classId].name : '';
}

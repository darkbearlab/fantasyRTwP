/**
 * 消耗品的遠征規則（Alan 2026-10-21）：包包、商人、掉落、在路線圖上使用。純函式（舊狀態 → 新狀態）。
 * 戰鬥中的使用在 sim（World.useConsumable），戰後剩下的寫回 RunState.bag。
 */
import { BAG, CONSUMABLES } from '../sim/data/consumables';
import type { Rng } from '../sim/rng';
import { maxHpOf } from './upgrades';
import type { RunState } from './runState';
import { cloneRun } from './runState';

export const bagOf = (r: RunState): string[] => r.bag ?? [];
export const bagFull = (r: RunState): boolean => bagOf(r).length >= BAG.capacity;

/** 放進包包（滿了就放不下，回傳 false） */
export function addToBag(r: RunState, id: string): boolean {
  if (bagFull(r)) return false;
  (r.bag ??= []).push(id);
  return true;
}

/** 商人賣的消耗品（每種都有，不限數量，只受包包大小與金幣限制） */
export const SHOP_CONSUMABLES = Object.keys(CONSUMABLES);

export function canBuyConsumable(run: RunState, id: string): boolean {
  return run.phase.kind === 'shop' && !!CONSUMABLES[id] && run.gold >= CONSUMABLES[id].price && !bagFull(run);
}

export function buyConsumable(run: RunState, id: string): RunState {
  if (!canBuyConsumable(run, id)) throw new Error('買不了（金幣不足或包包滿了）');
  const r = cloneRun(run);
  r.gold -= CONSUMABLES[id].price;
  addToBag(r, id);
  r.journal.push(`向商人買了「${CONSUMABLES[id].name}」。`);
  return r;
}

/** 打贏後的消耗品掉落（機率依節點類型；精英、頭目必掉） */
export const CONSUMABLE_DROP = { chance: { battle: 0.35, elite: 1, event: 0.35 } as Record<string, number>, weights: { potion: 5, elixir: 2, phoenix: 1, smoke: 2 } as Record<string, number> };

export function rollConsumableDrop(rng: Rng, kind: 'battle' | 'elite' | 'event'): string | null {
  if (!rng.chance(CONSUMABLE_DROP.chance[kind] ?? 0)) return null;
  const entries = Object.entries(CONSUMABLE_DROP.weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = rng.range(0, total);
  for (const [id, w] of entries) if ((x -= w) < 0) return id;
  return entries[0][0];
}

/** 在路線圖上能不能用（slot：目標英雄的欄位；全隊的不用給） */
export function canUseOnMap(run: RunState, id: string, slot?: number): boolean {
  const def = CONSUMABLES[id];
  if (!def || !def.onMap || !bagOf(run).includes(id)) return false;
  if (def.target === 'party') return run.party.some((h) => h && !h.dead && h.hp < maxHpOf(h));
  const h = slot !== undefined ? run.party[slot] : null;
  if (!h) return false;
  return def.target === 'fallen' ? h.dead : !h.dead && h.hp < maxHpOf(h);
}

export function useOnMap(run: RunState, id: string, slot?: number): RunState {
  if (!canUseOnMap(run, id, slot)) throw new Error('現在不能用');
  const r = cloneRun(run);
  const def = CONSUMABLES[id];
  r.bag!.splice(r.bag!.indexOf(id), 1);
  const heal = (h: NonNullable<RunState['party'][number]>, frac: number) => (h.hp = Math.min(maxHpOf(h), h.hp + Math.round(maxHpOf(h) * frac)));
  if (def.target === 'party') {
    for (const h of r.party) if (h && !h.dead && def.heal) heal(h, def.heal);
  } else {
    const h = r.party[slot!]!;
    if (def.target === 'fallen') {
      h.dead = false;
      h.hp = Math.max(1, Math.round(maxHpOf(h) * (def.revive ?? 0.3)));
    } else if (def.heal) heal(h, def.heal);
  }
  r.journal.push(`用了「${def.name}」。`);
  return r;
}

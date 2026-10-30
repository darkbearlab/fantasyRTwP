/**
 * 背包與裝備（SPEC_SLICE5 §17）：每名英雄武器、防具、飾品各一格（Alan 2026-10-29）；背包裡的道具點英雄名字裝備、身上的道具點「卸下」放回背包。
 * 路線圖與商人畫面共用。只透過 src/run/items 的純函式改變遠征狀態。
 */
import { heroName } from '../../run/characters';
import { tr } from '../../i18n';
import { bagOf, canUseOnMap, useOnMap } from '../../run/consumables';
import { BAG, CONSUMABLES } from '../../sim/data/consumables';
import { canEquip, equipItem, itemInSlot, itemLabel, itemLabelWithSlot, slotName, unequipItem } from '../../run/items';
import type { RunState } from '../../run/runState';
import { HEROES } from '../../sim/data/heroes';
import { ITEM_SLOTS, ITEMS } from '../../sim/data/items';
import { hex } from '../render/palette';
import { button, el } from './dom';

/** 消耗品（Alan 2026-10-21）：隊伍共用的包包，路線圖上可以直接用（煙霧彈只能在戰鬥中用） */
export function consumablePanel(run: RunState, onChange: (r: RunState) => void): HTMLElement {
  const box = el('div', 'bag-panel');
  const bag = bagOf(run);
  box.appendChild(el('div', 'bag-title', tr("🧪 包包（消耗品 {0}／{1}）", { 0: bag.length, 1: BAG.capacity })));
  if (bag.length === 0) box.appendChild(el('div', 'bag-empty', tr("包包是空的。打贏戰鬥有機會撿到，商人那裡也買得到。")));
  for (const id of [...new Set(bag)]) {
    const def = CONSUMABLES[id];
    const n = bag.filter((x) => x === id).length;
    const it = el('div', 'bag-item');
    it.appendChild(el('span', 'bag-desc', tr("{0} ×{1}：{2}", { 0: def.name, 1: n, 2: def.description })));
    const btns = el('div', 'bag-btns');
    if (!def.onMap) btns.appendChild(el('span', 'bag-note', tr("戰鬥中才能用")));
    else if (def.target === 'party') btns.appendChild(button(tr("使用"), 'small', () => onChange(useOnMap(run, id)), !canUseOnMap(run, id)));
    else
      run.party.forEach((h, slot) => {
        if (!h || (def.target === 'fallen') !== h.dead) return;
        btns.appendChild(button(tr("給{0}", { 0: heroName(h) }), 'small', () => onChange(useOnMap(run, id, slot)), !canUseOnMap(run, id, slot)));
      });
    it.appendChild(btns);
    box.appendChild(it);
  }
  return box;
}

export function bagPanel(run: RunState, onChange: (r: RunState) => void): HTMLElement {
  const box = el('div', 'bag-panel');
  box.appendChild(consumablePanel(run, onChange));
  box.appendChild(equipmentPanel(run, onChange));
  return box;
}

/** 裝備與背包裡的道具；locked＝戰鬥中，按鈕全部不能按（SPEC_SLICE7 §2） */
export function equipmentPanel(run: RunState, onChange: (r: RunState) => void, locked = false): HTMLElement {
  const box = el('div', 'bag-panel');
  box.appendChild(el('div', 'bag-title', tr("🎒 裝備（每名英雄武器、防具、飾品各 1 格）")));
  run.party.forEach((h, slot) => {
    if (!h) return;
    const row = el('div', `bag-hero${h.dead ? ' dead' : ''}`);
    const name = el('div', 'bag-name', tr("{0}{1}", { 0: heroName(h), 1: h.dead ? tr("（陣亡）") : '' }));
    name.style.color = hex(HEROES[h.classId].color);
    row.appendChild(name);
    for (const part of ITEM_SLOTS) {
      const id = itemInSlot(h, part);
      const it = el('div', `bag-item${!id ? ' empty' : ITEMS[id].rarity === 'rare' ? ' rare' : ''}`);
      it.appendChild(el('span', 'bag-slot', tr("{0}：", { 0: slotName(part) })));
      if (id) it.append(el('span', 'bag-desc', itemLabel(id)), button(tr("卸下"), 'small', () => onChange(unequipItem(run, slot, id)), locked));
      else it.appendChild(el('span', 'bag-desc', tr("（空）")));
      row.appendChild(it);
    }
    box.appendChild(row);
  });
  const inv = run.inventory ?? [];
  box.appendChild(el('div', 'bag-title', tr("背包（{0}）", { 0: inv.length })));
  if (inv.length === 0) box.appendChild(el('div', 'bag-empty', tr("背包是空的。打贏戰鬥有機會撿到道具，商人那裡也買得到。")));
  inv.forEach((id) => {
    const it = el('div', `bag-item${ITEMS[id].rarity === 'rare' ? ' rare' : ''}`);
    it.appendChild(el('span', 'bag-desc', itemLabelWithSlot(id)));
    const btns = el('div', 'bag-btns');
    run.party.forEach((h, slot) => {
      if (!h || h.dead) return;
      // 那個部位已經有道具：換下來放回背包
      const old = itemInSlot(h, ITEMS[id].slot);
      const label = old ? tr("給{0}（換下{1}）", { 0: heroName(h), 1: ITEMS[old].name }) : tr("給{0}", { 0: heroName(h) });
      btns.appendChild(button(label, 'small', () => onChange(equipItem(run, slot, id)), locked || !canEquip(run, slot, id)));
    });
    it.appendChild(btns);
    box.appendChild(it);
  });
  return box;
}

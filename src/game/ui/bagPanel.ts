/**
 * 背包與裝備（SPEC_SLICE5 §17）：每名英雄 2 個道具欄；背包裡的道具點英雄名字裝備、身上的道具點「卸下」放回背包。
 * 路線圖與商人畫面共用。只透過 src/run/items 的純函式改變遠征狀態。
 */
import { ECONOMY } from '../../run/data/economy';
import { canEquip, equipItem, itemLabel, unequipItem } from '../../run/items';
import type { RunState } from '../../run/runState';
import { HEROES } from '../../sim/data/heroes';
import { ITEMS } from '../../sim/data/items';
import { hex } from '../render/palette';
import { button, el } from './dom';

export function bagPanel(run: RunState, onChange: (r: RunState) => void): HTMLElement {
  const box = el('div', 'bag-panel');
  box.appendChild(el('div', 'bag-title', '🎒 裝備（每名英雄 2 格）'));
  run.party.forEach((h, slot) => {
    if (!h) return;
    const row = el('div', `bag-hero${h.dead ? ' dead' : ''}`);
    const name = el('div', 'bag-name', `${HEROES[h.classId].name}${h.dead ? '（陣亡）' : ''}`);
    name.style.color = hex(HEROES[h.classId].color);
    row.appendChild(name);
    const items = h.items ?? [];
    for (const id of items) {
      const it = el('div', `bag-item${ITEMS[id].rarity === 'rare' ? ' rare' : ''}`);
      it.append(el('span', 'bag-desc', itemLabel(id)), button('卸下', 'small', () => onChange(unequipItem(run, slot, id))));
      row.appendChild(it);
    }
    for (let i = items.length; i < ECONOMY.itemSlots; i++) row.appendChild(el('div', 'bag-item empty', '（空）'));
    box.appendChild(row);
  });
  const inv = run.inventory ?? [];
  box.appendChild(el('div', 'bag-title', `背包（${inv.length}）`));
  if (inv.length === 0) box.appendChild(el('div', 'bag-empty', '背包是空的。打贏戰鬥有機會撿到道具，商人那裡也買得到。'));
  inv.forEach((id) => {
    const it = el('div', `bag-item${ITEMS[id].rarity === 'rare' ? ' rare' : ''}`);
    it.appendChild(el('span', 'bag-desc', itemLabel(id)));
    const btns = el('div', 'bag-btns');
    run.party.forEach((h, slot) => {
      if (!h || h.dead) return;
      btns.appendChild(button(`給${HEROES[h.classId].name}`, 'small', () => onChange(equipItem(run, slot, id)), !canEquip(run, slot, id)));
    });
    it.appendChild(btns);
    box.appendChild(it);
  });
  return box;
}

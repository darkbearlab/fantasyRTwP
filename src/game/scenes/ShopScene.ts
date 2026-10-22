import { tr } from '../../i18n';
import { buyItem, canBuy, itemLabel } from '../../run/items';
import { SHOP_CONSUMABLES, bagOf, buyConsumable, canBuyConsumable } from '../../run/consumables';
import { BAG, CONSUMABLES } from '../../sim/data/consumables';
import { leaveNode } from '../../run/progression';
import { ITEMS } from '../../sim/data/items';
import { bagPanel } from '../ui/bagPanel';
import { button, el } from '../ui/dom';
import { advance, getRun, setRun } from '../runFlow';
import { DomScene } from './DomScene';

/** 商人（SPEC_SLICE5 §17）：用金幣買道具，買到的放進背包，可以馬上裝備 */
export class ShopScene extends DomScene {
  protected screenClass = 'panel-screen';

  constructor() {
    super('Shop');
  }

  protected build(): void {
    const run = getRun(this);
    if (run.phase.kind !== 'shop') return;
    const p = run.phase;
    const box = el('div', 'panel wide');
    box.append(el('h2', '', tr("💰 商人")), el('div', 'meta', tr("💰 {0} 金幣", { 0: run.gold })));
    const set = (r: typeof run) => {
      setRun(this, r);
      this.rebuild();
    };
    const shelf = el('div', 'shop-shelf');
    for (const id of p.stock) {
      const sold = p.sold.includes(id);
      const row = el('div', `shop-item${ITEMS[id].rarity === 'rare' ? ' rare' : ''}${sold ? ' sold' : ''}`);
      row.append(el('span', 'bag-desc', itemLabel(id)), button(sold ? tr("已售出") : tr("買（{0} 金幣）", { 0: ITEMS[id].price }), 'small', () => set(buyItem(getRun(this), id)), !canBuy(run, id)));
      shelf.appendChild(row);
    }
    box.appendChild(shelf);
    // 消耗品：每種都有，不限數量（只受包包大小與金幣限制）
    const cshelf = el('div', 'shop-shelf');
    cshelf.appendChild(el('div', 'bag-title', tr("🧪 消耗品（包包 {0}／{1}）", { 0: bagOf(run).length, 1: BAG.capacity })));
    for (const id of SHOP_CONSUMABLES) {
      const d = CONSUMABLES[id];
      const row = el('div', 'shop-item');
      row.append(el('span', 'bag-desc', tr("{0}：{1}", { 0: d.name, 1: d.description })), button(tr("買（{0} 金幣）", { 0: d.price }), 'small', () => set(buyConsumable(getRun(this), id)), !canBuyConsumable(run, id)));
      cshelf.appendChild(row);
    }
    box.appendChild(cshelf);
    box.appendChild(bagPanel(run, set));
    box.appendChild(button(tr("離開"), 'primary', () => advance(this, leaveNode(getRun(this)))));
    this.root.appendChild(box);
  }
}

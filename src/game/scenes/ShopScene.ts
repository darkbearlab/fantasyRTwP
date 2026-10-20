import { buyItem, canBuy, itemLabel } from '../../run/items';
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
    box.append(el('h2', '', '💰 商人'), el('div', 'meta', `💰 ${run.gold} 金幣`));
    const set = (r: typeof run) => {
      setRun(this, r);
      this.rebuild();
    };
    const shelf = el('div', 'shop-shelf');
    for (const id of p.stock) {
      const sold = p.sold.includes(id);
      const row = el('div', `shop-item${ITEMS[id].rarity === 'rare' ? ' rare' : ''}${sold ? ' sold' : ''}`);
      row.append(el('span', 'bag-desc', itemLabel(id)), button(sold ? '已售出' : `買（${ITEMS[id].price} 金幣）`, 'small', () => set(buyItem(getRun(this), id)), !canBuy(run, id)));
      shelf.appendChild(row);
    }
    box.appendChild(shelf);
    box.appendChild(bagPanel(run, set));
    box.appendChild(button('離開', 'primary', () => advance(this, leaveNode(getRun(this)))));
    this.root.appendChild(box);
  }
}

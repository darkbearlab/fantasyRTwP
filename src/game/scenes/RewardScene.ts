import { ECONOMY } from '../../run/data/economy';
import { chooseReward } from '../../run/progression';
import { itemLabel } from '../../run/items';
import { button, el } from '../ui/dom';
import { upgradePicker } from '../ui/upgradePicker';
import { advance, getRun } from '../runFlow';
import { DomScene } from './DomScene';

/** 戰後獎勵（SPEC_SLICE2 §9）：金幣＋三選一強化（精英四選一），可跳過拿金幣 */
export class RewardScene extends DomScene {
  protected screenClass = 'panel-screen';

  constructor() {
    super('Reward');
  }

  protected build(): void {
    const run = getRun(this);
    if (run.phase.kind !== 'reward') return;
    const p = run.phase;
    const box = el('div', 'panel wide');
    box.append(el('h2', '', '戰鬥勝利'));
    // 掉落的道具（SPEC_SLICE5 §17）：已放進背包，回到路線圖再裝備
    if (p.item) box.appendChild(el('div', 'item-drop', `🎁 撿到道具：${itemLabel(p.item)}（已放進背包，在路線圖的「背包」裝備）`));
    box.appendChild(el('div', 'meta', `獲得 ${p.gold} 金幣（目前 ${run.gold}）。選擇一個強化${p.elite ? '（精英：四選一，至少一個稀有）' : ''}：`));
    box.appendChild(upgradePicker(run, p.options, (c) => advance(this, chooseReward(getRun(this), c))));
    const row = el('div', 'btn-row');
    row.appendChild(button(`跳過（+${ECONOMY.skipRewardGold} 金幣）`, '', () => advance(this, chooseReward(getRun(this), 'skip'))));
    box.appendChild(row);
    this.root.appendChild(box);
  }
}

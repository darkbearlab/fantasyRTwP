import { CONSUMABLES } from '../../sim/data/consumables';
import { ECONOMY } from '../../run/data/economy';
import { chooseReward, continueFromReward } from '../../run/progression';
import { xpBar } from '../ui/xpBar';
import { itemLabel } from '../../run/items';
import { button, el } from '../ui/dom';
import { upgradePicker } from '../ui/upgradePicker';
import { advance, getRun } from '../runFlow';
import { DomScene } from './DomScene';
import { showEvolutions } from '../ui/evolutionShow';

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
    const levelUp = p.levelUpTo !== undefined;
    // 經驗值制（SPEC_SLICE6 §3）：連續升級時後面幾次只顯示升級
    const results = p.xpGained !== undefined || !levelUp;
    box.append(el('h2', '', results ? '戰鬥勝利' : `升級！第 ${p.levelUpTo} 級`));
    if (results) {
      // 掉落的道具（SPEC_SLICE5 §17）：已放進背包，回到路線圖再裝備
      if (p.item) box.appendChild(el('div', 'item-drop', `🎁 撿到道具：${itemLabel(p.item)}（已放進背包，在路線圖的「背包」裝備）`));
      if (p.consumable) box.appendChild(el('div', 'item-drop', `🧪 撿到消耗品：${CONSUMABLES[p.consumable].name}（${CONSUMABLES[p.consumable].description}；已放進包包）`));
      box.appendChild(el('div', 'meta', `獲得 ${p.gold} 金幣（目前 ${run.gold}）。`));
      if (p.xpGained !== undefined) box.appendChild(xpBar(run, p.xpGained));
    }
    if (p.options.length === 0) {
      // 沒有升級：只看戰果
      const row = el('div', 'btn-row');
      row.appendChild(button('繼續', 'primary', () => advance(this, continueFromReward(getRun(this)))));
      box.appendChild(row);
      this.root.appendChild(box);
      return;
    }
    const remain = run.pendingLevelUps ?? 0;
    const title = levelUp ? `升到第 ${p.levelUpTo} 級：選擇一個強化${remain > 1 ? `（還有 ${remain - 1} 次升級）` : ''}` : `選擇一個強化${p.elite ? '（精英：四選一，至少一個稀有）' : ''}`;
    box.appendChild(el('div', 'step-title', title));
    box.appendChild(upgradePicker(run, p.options, (c) => advance(this, chooseReward(getRun(this), c)), undefined, p.optionSlots));
    const row = el('div', 'btn-row');
    row.appendChild(button(`跳過（+${ECONOMY.skipRewardGold} 金幣）`, '', () => advance(this, chooseReward(getRun(this), 'skip'))));
    box.appendChild(row);
    this.root.appendChild(box);
    // 連續升級時，上一次選完就昇變的英雄在這裡演出（SPEC_CLASSES §5）
    showEvolutions(this, this.root, () => this.rebuild());
  }
}

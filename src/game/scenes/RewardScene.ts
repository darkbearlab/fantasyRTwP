import { HEROES } from '../../sim/data/heroes';
import { tr } from '../../i18n';
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
    box.append(el('h2', '', results ? tr("戰鬥勝利") : tr("升級！第 {0} 級", { 0: p.levelUpTo })));
    if (results) {
      // 掉落的道具（SPEC_SLICE5 §17）：已放進背包，回到路線圖再裝備
      if (p.item) box.appendChild(el('div', 'item-drop', tr("🎁 撿到道具：{0}（已放進背包，在路線圖的「背包」裝備）", { 0: itemLabel(p.item) })));
      if (p.consumable) box.appendChild(el('div', 'item-drop', tr("🧪 撿到消耗品：{0}（{1}；已放進包包）", { 0: CONSUMABLES[p.consumable].name, 1: CONSUMABLES[p.consumable].description })));
      box.appendChild(el('div', 'meta', tr("獲得 {0} 金幣（目前 {1}）。", { 0: p.gold, 1: run.gold })));
      if (p.xpGained !== undefined) box.appendChild(xpBar(run, p.xpGained));
    }
    if (p.options.length === 0) {
      // 沒有升級：只看戰果
      const row = el('div', 'btn-row');
      row.appendChild(button(tr("繼續"), 'primary', () => advance(this, continueFromReward(getRun(this)))));
      box.appendChild(row);
      this.root.appendChild(box);
      return;
    }
    const remain = run.pendingLevelUps ?? 0;
    const hero = p.pickSlot !== undefined ? run.party[p.pickSlot] : null;
    // 一路向前（SPEC_SLICE7 §3.1）：每名英雄各自三選一
    const title = hero
      ? tr("升到第 {0} 級：{1}選擇一個強化{2}", { 0: p.levelUpTo, 1: HEROES[hero.classId].name, 2: (run.heroPicks?.length ?? 0) > 1 ? tr("（還有 {0} 次）", { 0: run.heroPicks!.length - 1 }) : '' })
      : levelUp
        ? tr("升到第 {0} 級：選擇一個強化{1}", { 0: p.levelUpTo, 1: remain > 1 ? tr("（還有 {0} 次升級）", { 0: remain - 1 }) : '' })
        : tr("選擇一個強化{0}", { 0: p.elite ? tr("（精英：四選一，至少一個稀有）") : '' });
    box.appendChild(el('div', 'step-title', title));
    box.appendChild(upgradePicker(run, p.options, (c) => advance(this, chooseReward(getRun(this), c)), p.pickSlot, p.optionSlots));
    const row = el('div', 'btn-row');
    row.appendChild(button(tr("跳過（+{0} 金幣）", { 0: ECONOMY.skipRewardGold }), '', () => advance(this, chooseReward(getRun(this), 'skip'))));
    box.appendChild(row);
    this.root.appendChild(box);
    // 連續升級時，上一次選完就昇變的英雄在這裡演出（SPEC_CLASSES §5）
    showEvolutions(this, this.root, () => this.rebuild());
  }
}

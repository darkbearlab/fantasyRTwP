import { HEROES } from '../../sim/data/heroes';
import { ECONOMY } from '../../run/data/economy';
import { canRecruit, canRevive, leaveNode, restCamp, restRecruit, restRevive, restTrain } from '../../run/progression';
import { hex } from '../render/palette';
import { button, el } from '../ui/dom';
import { partyPanel } from '../ui/partyPanel';
import { upgradePicker } from '../ui/upgradePicker';
import { advance, getRun, setRun } from '../runFlow';
import { firstEmptySlot } from '../../run/runState';
import { DomScene } from './DomScene';

type Mode = 'menu' | 'revive' | 'train';

/** 休息（SPEC_SLICE2 §5）：紮營／救人／訓練 三選一，另可額外招募 */
export class RestScene extends DomScene {
  protected screenClass = 'panel-screen';
  private mode: Mode = 'menu';

  constructor() {
    super('Rest');
  }

  protected build(): void {
    const run = getRun(this);
    if (run.phase.kind !== 'rest') return;
    const p = run.phase;
    const box = el('div', 'panel wide');
    box.append(el('h2', '', '🔥 營火'), el('div', 'meta', `💰 ${run.gold} 金幣`));
    const set = (r: typeof run) => {
      setRun(this, r);
      this.mode = 'menu';
      this.rebuild();
    };

    if (!p.used) {
      if (this.mode === 'menu') {
        box.appendChild(el('div', 'step-title', '選擇一項（三選一）：'));
        const row = el('div', 'rest-options');
        row.appendChild(button(`紮營：全隊恢復 ${ECONOMY.campHealRatio * 100}% 生命`, 'rest-option', () => set(restCamp(getRun(this)))));
        row.appendChild(button(`救人：花 ${ECONOMY.reviveCost} 金幣復活一名陣亡者（${ECONOMY.reviveHpRatio * 100}% 生命）`, 'rest-option', () => {
          this.mode = 'revive';
          this.rebuild();
        }, !canRevive(run)));
        row.appendChild(button('訓練：一名英雄從 3 個強化中選 1', 'rest-option', () => {
          this.mode = 'train';
          this.rebuild();
        }));
        box.appendChild(row);
      } else if (this.mode === 'revive') {
        box.appendChild(el('div', 'step-title', '要救誰？'));
        box.appendChild(partyPanel(run, { pickable: (s) => canRevive(run, s), onPick: (s) => set(restRevive(getRun(this), s)) }));
        box.appendChild(button('返回', 'small', () => ((this.mode = 'menu'), this.rebuild())));
      } else {
        box.appendChild(el('div', 'step-title', '訓練：選擇強化'));
        box.appendChild(upgradePicker(run, p.trainOptions, (c) => set(restTrain(getRun(this), c.slot!, c.upgradeId, c.skillId))));
        box.appendChild(button('返回', 'small', () => ((this.mode = 'menu'), this.rebuild())));
      }
    } else box.appendChild(el('div', 'event-result', p.resultText ?? ''));

    // 招募（不佔三選一）
    const rec = el('div', 'recruit');
    rec.appendChild(el('div', 'step-title', `招募（${ECONOMY.recruitCost} 金幣，填入第一個空欄位）：`));
    const slot = firstEmptySlot(run);
    const replaced = slot >= 0 ? run.party[slot] : null;
    if (replaced?.dead) rec.appendChild(el('div', 'meta warn-text', `新英雄會取代欄位 ${slot + 1} 陣亡的${HEROES[replaced.classId].name}（之後就不能再救他）。`));
    const recRow = el('div', 'btn-row');
    if (p.recruited) recRow.appendChild(el('span', 'meta', '本次已招募。'));
    else
      for (const cls of p.recruitCandidates) {
        const d = HEROES[cls];
        const b = button(`${d.letter} ${d.name}`, 'recruit-btn', () => set(restRecruit(getRun(this), cls)), !canRecruit(run));
        b.style.borderColor = hex(d.color);
        recRow.appendChild(b);
      }
    rec.appendChild(recRow);
    box.appendChild(rec);

    box.appendChild(partyPanel(run));
    box.appendChild(button(p.used ? '繼續上路' : '不休息，繼續上路', p.used ? 'primary' : '', () => advance(this, leaveNode(getRun(this)))));
    this.root.appendChild(box);
  }
}

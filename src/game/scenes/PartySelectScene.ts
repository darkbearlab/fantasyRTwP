import { CLASS_ORDER } from '../../sim/data/classes';
import { ECONOMY } from '../../run/data/economy';
import { rollParty } from '../../run/classes';
import { createRun } from '../../run/runState';
import { button, el } from '../ui/dom';
import { classCard, classChip } from '../ui/classInfo';
import { advance, switchTo } from '../runFlow';
import { DomScene } from './DomScene';

/** 組隊（SPEC_SLICE3 §1.2、§5）：自選 2 名，其餘由遠征種子隨機補上 */
export class PartySelectScene extends DomScene {
  protected screenClass = 'panel-screen';
  private seed = 1;
  private picks: string[] = [];

  constructor() {
    super('PartySelect');
  }

  protected build(data?: object): void {
    const d = data as { seed?: number } | undefined;
    if (d?.seed !== undefined) {
      this.seed = d.seed;
      this.picks = [];
    }
    const need = ECONOMY.partyPicks;
    const box = el('div', 'panel wide');
    box.append(el('h2', '', '組隊'), el('div', 'meta', `選 ${need} 名英雄，另外 ${ECONOMY.partySize - need} 名隨機加入。（種子 ${this.seed}）`));
    const grid = el('div', 'class-grid');
    for (const id of CLASS_ORDER) {
      const selected = this.picks.includes(id);
      grid.appendChild(
        classCard(id, {
          selected,
          dim: !selected && this.picks.length >= need,
          tag: selected ? `第 ${this.picks.indexOf(id) + 1} 名` : undefined,
          onClick: () => {
            if (selected) this.picks = this.picks.filter((p) => p !== id);
            else if (this.picks.length < need) this.picks.push(id);
            this.rebuild();
          },
        }),
      );
    }
    box.appendChild(grid);
    if (this.picks.length === need) {
      const party = rollParty(this.seed, this.picks);
      box.appendChild(el('div', 'step-title', '出發隊伍：'));
      const row = el('div', 'party-chips');
      party.forEach((id, i) => row.appendChild(classChip(id, i < need ? '自選' : '隨機')));
      box.appendChild(row);
    }
    const btns = el('div', 'btn-row');
    btns.append(
      button('返回標題', 'small', () => switchTo(this, 'Title')),
      button('出發', 'primary', () => advance(this, createRun(this.seed, { party: rollParty(this.seed, this.picks) })), this.picks.length !== need),
    );
    box.appendChild(btns);
    this.root.appendChild(box);
  }
}

import { tr } from '../../i18n';
import { canAcceptRescue, resolveRescue } from '../../run/progression';
import { HEROES } from '../../sim/data/heroes';
import { button, el } from '../ui/dom';
import { partyPanel } from '../ui/partyPanel';
import { advance, getRun } from '../runFlow';
import { DomScene } from './DomScene';

/** 解救的英雄（SPEC_SLICE7 §4）：跟著離開了地圖，決定要不要讓他加入；加入前的升級已經配好，不能改 */
export class RescueScene extends DomScene {
  protected screenClass = 'panel-screen';

  constructor() {
    super('Rescue');
  }

  protected build(): void {
    const run = getRun(this);
    if (run.phase.kind !== 'rescue') return;
    const hero = run.phase.hero;
    const box = el('div', 'panel');
    box.append(
      el('h2', '', tr("救出了{0}", { 0: HEROES[hero.classId].name })),
      el('div', 'meta', tr("他跟著你們離開了戰場。要讓他加入嗎？（他之前的成長已經定了，加入後的升級由你決定）")),
    );
    // 用隊伍面板的樣子顯示他（等級、生命、升級）
    box.appendChild(partyPanel({ ...run, party: [hero] }));
    const full = !canAcceptRescue(run);
    if (full) box.appendChild(el('div', 'meta warn-text', tr("隊伍已滿：他只能道謝後離開。")));
    const row = el('div', 'btn-row');
    row.append(
      button(tr("讓他離開"), 'small', () => advance(this, resolveRescue(getRun(this), false))),
      button(tr("讓他加入"), 'primary', () => advance(this, resolveRescue(getRun(this), true)), full),
    );
    box.appendChild(row);
    this.root.appendChild(box);
  }
}

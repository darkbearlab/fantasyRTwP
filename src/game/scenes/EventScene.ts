import { tr } from '../../i18n';
import { EVENTS } from '../../run/data/events';
import { chooseEventOption, conditionText, eventOptions } from '../../run/events';
import { leaveNode } from '../../run/progression';
import { button, el } from '../ui/dom';
import { partyPanel } from '../ui/partyPanel';
import { advance, getRun, setRun } from '../runFlow';
import { DomScene } from './DomScene';

/** 事件（SPEC_SLICE2 §6） */
export class EventScene extends DomScene {
  protected screenClass = 'panel-screen';

  constructor() {
    super('Event');
  }

  protected build(): void {
    const run = getRun(this);
    if (run.phase.kind !== 'event') return;
    const ev = EVENTS[run.phase.eventId];
    const box = el('div', 'panel event-panel');
    box.append(el('h2', '', ev.title), el('div', 'event-text', ev.text));
    if (!run.phase.resolved) {
      const list = el('div', 'event-options');
      eventOptions(run).forEach(({ option, available }, i) => {
        const label = available ? option.label : tr("{0}（{1}）", { 0: option.label, 1: conditionText(option.condition) });
        list.appendChild(
          button(label, 'event-option', () => {
            const next = chooseEventOption(getRun(this), i);
            if (next.phase.kind === 'battle') advance(this, next);
            else {
              setRun(this, next);
              this.rebuild();
            }
          }, !available),
        );
      });
      box.appendChild(list);
    } else {
      box.appendChild(el('div', 'event-result', run.phase.resultText ?? ''));
      box.appendChild(button(tr("繼續"), 'primary', () => advance(this, leaveNode(getRun(this)))));
    }
    box.appendChild(el('div', 'meta', tr("💰 {0} 金幣", { 0: run.gold })));
    box.appendChild(partyPanel(run));
    this.root.appendChild(box);
  }
}

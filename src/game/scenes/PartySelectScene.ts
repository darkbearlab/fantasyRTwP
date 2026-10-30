import { tr } from '../../i18n';
import { deliberateSkillsOf } from '../../run/loadout';
import { HEROES } from '../../sim/data/heroes';
import { CHARACTERS } from '../../run/data/characters';
import { availableCharacters, characterName, characterTitle } from '../../run/characters';
import { LEVELS } from '../../run/data/levels';
import { ECONOMY } from '../../run/data/economy';
import { classChoices, rollParty } from '../../run/classes';
import { createRun } from '../../run/runState';
import { button, el } from '../ui/dom';
import { classCard, classChip } from '../ui/classInfo';
import { advance, switchTo } from '../runFlow';
import { DomScene } from './DomScene';
import { JOURNEY } from '../../run/data/journey';

/** 組隊（SPEC_SLICE3 §1.2、§5）：自選 partyPicks 名（目前 4 名全自選），不足隊伍人數的由遠征種子隨機補上 */
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
    // 一路向前（SPEC_SLICE7 §4）：開局只有兩人，其他人在路上解救
    const forward = LEVELS.expeditionStyle === 'deliberate' && JOURNEY.forward;
    const need = forward ? JOURNEY.startParty : ECONOMY.partyPicks;
    const box = el('div', 'panel wide');
    const rest = forward ? 0 : ECONOMY.partySize - need;
    const meta = forward
      ? tr("選 {0} 名英雄出發；其他隊友要在路上解救。點選順序就是隊伍順序。（種子 {1}）", { 0: need, 1: this.seed })
      : tr("選 {0} 名英雄{1}。點選順序就是隊伍順序（數字鍵 1–{2}）。（種子 {3}）", { 0: need, 1: rest > 0 ? tr("，另外 {0} 名隨機加入", { 0: rest }) : '', 2: ECONOMY.partySize, 3: this.seed });
    box.append(el('h2', '', tr("組隊")), el('div', 'meta', meta));
    const grid = el('div', 'class-grid');
    // 一路向前：選具名角色（SPEC_CHARACTERS §3.2，不能重複）；封存模式照舊選職業
    for (const id of forward ? availableCharacters() : classChoices(LEVELS.expeditionStyle)) {
      const selected = this.picks.includes(id);
      const order = this.picks.map((p, i) => (p === id ? i + 1 : 0)).filter(Boolean);
      const ch = forward ? CHARACTERS[id] : undefined;
      grid.appendChild(
        classCard(ch ? ch.baseClass : id, {
          selected,
          dim: !selected && this.picks.length >= need,
          tag: selected ? tr("第 {0} 名", { 0: order.join('・') }) : undefined,
          name: ch ? characterName(ch) : undefined,
          subtitle: ch ? `${characterTitle(ch)}・${HEROES[ch.baseClass].name}` : undefined,
          active: ch ? deliberateSkillsOf(ch.baseClass)[0] : undefined,
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
      const party = forward ? this.picks : rollParty(this.seed, this.picks);
      box.appendChild(el('div', 'step-title', tr("出發隊伍：")));
      const row = el('div', 'party-chips');
      party.forEach((id, i) => row.appendChild(CHARACTERS[id] ? classChip(CHARACTERS[id].baseClass, tr("自選"), characterName(CHARACTERS[id])) : classChip(id, i < need ? tr("自選") : tr("隨機"))));
      box.appendChild(row);
    }
    const btns = el('div', 'btn-row');
    btns.append(
      button(tr("返回標題"), 'small', () => switchTo(this, 'Title')),
      button(tr("出發"), 'primary', () => advance(this, createRun(this.seed, { party: forward ? this.picks : rollParty(this.seed, this.picks), intro: true })), this.picks.length !== need),
    );
    box.appendChild(btns);
    this.root.appendChild(box);
  }
}

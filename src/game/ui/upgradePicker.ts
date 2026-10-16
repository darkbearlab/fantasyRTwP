import { HEROES } from '../../sim/data/heroes';
import { SKILLS } from '../../sim/data/skills';
import { UPGRADES } from '../../run/data/upgrades';
import type { RunState } from '../../run/runState';
import { button, el, noFocus } from './dom';
import { partyPanel } from './partyPanel';

export interface UpgradeChoice {
  upgradeId: string;
  slot?: number;
  skillId?: string;
}

/**
 * 強化選擇器：選強化 →（給一名英雄的）選英雄 →（需要技能的）選技能。
 * 全隊強化選了就直接確定。
 */
export function upgradePicker(run: RunState, options: string[], onDone: (c: UpgradeChoice) => void, fixedSlot?: number): HTMLElement {
  const box = el('div', 'upgrade-picker');
  let picked: string | null = null;
  let slot: number | undefined = fixedSlot;

  const render = () => {
    box.innerHTML = '';
    const cards = el('div', 'upgrade-cards');
    for (const id of options) {
      const u = UPGRADES[id];
      const c = el('div', `upgrade-card${u.rare ? ' rare' : ''}${picked === id ? ' picked' : ''}`);
      c.append(el('div', 'up-name', `${u.rare ? '★ ' : ''}${u.name}`), el('div', 'up-desc', u.description), el('div', 'up-scope', u.scope === 'party' ? '全隊' : u.needsSkill ? '一名英雄・一個技能' : '一名英雄'));
      noFocus(c);
      c.addEventListener('click', () => {
        picked = id;
        if (u.scope === 'party') {
          onDone({ upgradeId: id });
          return;
        }
        render();
      });
      cards.appendChild(c);
    }
    box.appendChild(cards);
    if (!picked) return;
    const u = UPGRADES[picked];
    if (slot === undefined) {
      box.appendChild(el('div', 'step-title', `「${u.name}」要給誰？`));
      box.appendChild(
        partyPanel(run, {
          pickable: (s) => !!run.party[s] && !run.party[s]!.dead,
          onPick: (s) => {
            if (!u.needsSkill) onDone({ upgradeId: picked!, slot: s });
            else {
              slot = s;
              render();
            }
          },
        }),
      );
      return;
    }
    if (u.needsSkill) {
      const h = run.party[slot]!;
      box.appendChild(el('div', 'step-title', `${HEROES[h.classId].name}的哪個技能？`));
      const row = el('div', 'btn-row');
      for (const sk of h.skills) row.appendChild(button(SKILLS[sk].name, '', () => onDone({ upgradeId: picked!, slot, skillId: sk })));
      box.appendChild(row);
      if (fixedSlot === undefined)
        row.appendChild(
          button('換人', 'small', () => {
            slot = undefined;
            render();
          }),
        );
    } else onDone({ upgradeId: picked, slot });
  };
  render();
  return box;
}

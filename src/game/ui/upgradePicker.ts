import { tr } from '../../i18n';
import { HEROES } from '../../sim/data/heroes';
import { SKILLS } from '../../sim/data/skills';
import { UPGRADES } from '../../run/data/upgrades';
import type { RunState } from '../../run/runState';
import { button, el, noFocus } from './dom';
import { partyPanel } from './partyPanel';
import { battleSkillsOf } from '../../run/loadout';
import { BRANCH_RULES, branchDef } from '../../run/data/branches';
import { branchProgress } from '../../run/upgrades';

export interface UpgradeChoice {
  upgradeId: string;
  slot?: number;
  skillId?: string;
}

/**
 * 強化選擇器：選強化 →（給一名英雄的）選英雄 →（需要技能的）選技能。
 * 全隊強化選了就直接確定。
 */
export function upgradePicker(run: RunState, options: string[], onDone: (c: UpgradeChoice) => void, fixedSlot?: number, optionSlots?: (number | null)[]): HTMLElement {
  const box = el('div', 'upgrade-picker');
  let picked: string | null = null;
  let slot: number | undefined = fixedSlot;

  const render = () => {
    box.innerHTML = '';
    const cards = el('div', 'upgrade-cards');
    options.forEach((id, i) => {
      const u = UPGRADES[id];
      // 專屬升級（SPEC_CLASSES §1）：固定給抽到的英雄，顯示分支與進度；選了會昇變的那一張特別標示
      const own = optionSlots?.[i];
      if (own !== undefined && own !== null && u.branch) {
        const h = run.party[own]!;
        const b = branchDef(u.branch.classId, u.branch.id)!;
        const n = branchProgress(h)[b.id] ?? 0;
        const evolves = n + 1 >= BRANCH_RULES.threshold;
        const c = el('div', `upgrade-card exclusive${evolves ? ' evolve' : ''}`);
        const bar = '■'.repeat(n) + '□'.repeat(Math.max(0, BRANCH_RULES.threshold - n));
        c.append(
          el('div', 'up-hero', `${own + 1}. ${HEROES[h.classId].name}`),
          el('div', 'up-name', u.name),
          el('div', 'up-desc', u.description),
          el('div', 'up-branch', tr("{0} {1}（{2}／{3}）", { 0: b.name, 1: bar, 2: n, 3: BRANCH_RULES.threshold })),
          el('div', 'up-scope', evolves ? tr("昇變！→ {0}", { 0: HEROES[b.evolvesTo].name }) : tr("專屬升級")),
        );
        noFocus(c);
        c.addEventListener('click', () => onDone({ upgradeId: id, slot: own }));
        cards.appendChild(c);
        return;
      }
      const c = el('div', `upgrade-card${u.rare ? ' rare' : ''}${picked === id ? ' picked' : ''}`);
      c.append(el('div', 'up-name', `${u.rare ? '★ ' : ''}${u.name}`), el('div', 'up-desc', u.description), el('div', 'up-scope', u.scope === 'party' ? tr("全隊") : u.needsSkill ? tr("一名英雄・一個技能") : tr("一名英雄")));
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
    });
    box.appendChild(cards);
    if (!picked) return;
    const u = UPGRADES[picked];
    if (slot === undefined) {
      box.appendChild(el('div', 'step-title', tr("「{0}」要給誰？", { 0: u.name })));
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
      box.appendChild(el('div', 'step-title', tr("{0}的哪個技能？", { 0: HEROES[h.classId].name })));
      const row = el('div', 'btn-row');
      for (const sk of battleSkillsOf(run, h)) row.appendChild(button(SKILLS[sk].name, '', () => onDone({ upgradeId: picked!, slot, skillId: sk })));
      box.appendChild(row);
      if (fixedSlot === undefined)
        row.appendChild(
          button(tr("換人"), 'small', () => {
            slot = undefined;
            render();
          }),
        );
    } else onDone({ upgradeId: picked, slot });
  };
  render();
  return box;
}

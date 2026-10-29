import { tr } from '../../i18n';
import { HEROES } from '../../sim/data/heroes';
import { SKILLS } from '../../sim/data/skills';
import { PERSONALITY_LABEL } from '../../sim/ai/idleBehavior';
import type { Personality } from '../../sim/data/types';
import { UPGRADES } from '../../run/data/upgrades';
import type { RunState } from '../../run/runState';
import { itemRankBonus } from '../../run/items';
import { branchProgress, canEvolve, classPassivesOf, maxHpOf, maxRankOf, rankOf, recipeDone, recipesOf } from '../../run/upgrades';
import { CLASS_PASSIVE_RANKS, PASSIVES } from '../../sim/data/passives';
import { BRANCH_RULES, BRANCHES } from '../../run/data/branches';
import { battleSkillsOf } from '../../run/loadout';
import { hex } from '../render/palette';
import { className } from './classInfo';
import { el, noFocus } from './dom';

export const PERSONALITY_CYCLE: Personality[] = ['steadfast', 'aggressive', 'guerrilla'];

export interface PartyPanelOptions {
  /** 點性格標籤切換（只有路線圖上可以） */
  onPersonality?: (slot: number, next: Personality) => void;
  /** 點英雄（選擇強化對象等） */
  onPick?: (slot: number) => void;
  pickable?: (slot: number) => boolean;
  highlight?: number;
  /** 路線圖：調整英雄順序（和上一／下一欄交換） */
  onSwapHero?: (a: number, b: number) => void;
  /** 路線圖：調整技能順序（第 a、b 欄交換） */
  onSwapSkill?: (slot: number, a: number, b: number) => void;
}

/** 隊伍面板：頭像、生命條、陣亡標記、性格、強化 */
export function partyPanel(run: RunState, opts: PartyPanelOptions = {}): HTMLElement {
  const box = el('div', 'party-panel');
  run.party.forEach((h, slot) => {
    const row = el('div', 'party-row');
    if (!h) {
      row.classList.add('empty');
      row.append(el('div', 'portrait small empty-slot', String(slot + 1)), el('div', 'party-info', tr("（空欄位）")));
      box.appendChild(row);
      return;
    }
    const def = HEROES[h.classId];
    const portrait = el('div', 'portrait small', def.letter);
    portrait.style.background = hex(def.color);
    const info = el('div', 'party-info');
    const name = el('div', 'party-name');
    name.append(el('span', '', `${slot + 1}. ${className(h.classId)}`));
    const tag = el('span', `personality ${h.personality}`, PERSONALITY_LABEL[h.personality]);
    if (opts.onPersonality && !h.dead) {
      noFocus(tag);
      tag.title = tr("點擊切換閒置性格");
      tag.addEventListener('click', (ev) => {
        ev.stopPropagation();
        opts.onPersonality!(slot, PERSONALITY_CYCLE[(PERSONALITY_CYCLE.indexOf(h.personality) + 1) % PERSONALITY_CYCLE.length]);
      });
    }
    name.appendChild(tag);
    const max = maxHpOf(h);
    const hp = el('div', 'hp');
    const fill = el('div', 'fill');
    fill.style.width = `${h.dead ? 0 : (h.hp / max) * 100}%`;
    if (h.hp / max < 0.3) fill.classList.add('low');
    hp.append(fill, el('span', 'hptext', h.dead ? tr("陣亡") : `${h.hp} / ${max}`));
    info.append(name, hp);
    // 昇變分支的進度（SPEC_CLASSES §5）；昇變後標出原本的職業
    const base = h.baseClass;
    if (run.forward) {
      // 職業被動的等級（Alan 2026-10-25）
      // 道具加的等級另外標出來（Alan 2026-10-29）
      const ranks = classPassivesOf(h, true)
        .filter((p) => CLASS_PASSIVE_RANKS[p.id])
        .map((p) => ({ ...p, plus: itemRankBonus(h, p.id) }))
        .filter((p) => p.rank + p.plus > 0);
      if (ranks.length) info.appendChild(el('div', 'party-branches', ranks.map((p) => `${PASSIVES[p.id].name} Lv${p.rank + p.plus}${p.plus ? tr("（道具 +{0}）", { 0: p.plus }) : ''}`).join('・')));
      // 配方昇變（SPEC_SLICE7 §3.2）：每份配方一行，拿到的升級亮起來，要升滿的那個標出等級
      const recipes = recipesOf(h);
      if (recipes.length) {
        const box2 = el('div', 'party-branches recipes');
        for (const rc of recipes) {
          const parts = rc.requires.map((id) => {
            const n = rankOf(h, id);
            const max = id === rc.maxed ? maxRankOf(id) : 1;
            return `${UPGRADES[id].name}${max > 1 ? ` ${n}/${max}` : n > 0 ? '✓' : ''}`;
          });
          const done = recipeDone(h, rc);
          const line = el('span', `branch${rc.requires.some((id) => rankOf(h, id) > 0) ? ' on' : ''}${done ? ' ready' : ''}`, tr("{0}：{1}", { 0: `${HEROES[rc.evolvesTo].name}${done ? tr("（可以昇變）") : ''}`, 1: parts.join('・') }));
          box2.appendChild(line);
        }
        info.appendChild(box2);
      } else if (base) info.appendChild(el('div', 'party-branches', tr("昇變自{0}", { 0: HEROES[base].name })));
    } else if (run.style === 'deliberate') {
      if (canEvolve(h)) {
        const prog = branchProgress(h);
        const line = el('div', 'party-branches');
        for (const b of BRANCHES[h.classId]) {
          const n = prog[b.id] ?? 0;
          line.appendChild(el('span', `branch${n > 0 ? ' on' : ''}`, `${b.name} ${'■'.repeat(n)}${'□'.repeat(Math.max(0, BRANCH_RULES.threshold - n))}`));
        }
        info.appendChild(line);
      } else if (base) info.appendChild(el('div', 'party-branches', tr("昇變自{0}", { 0: HEROES[base].name })));
    }
    // 技能順序（戰鬥中「選人後再按數字」與 Q E R 的對應）；路線圖上可以調整
    if (opts.onSwapSkill || opts.onSwapHero) {
      const skills = el('div', 'party-skills');
      // 沉穩節奏：只列戰鬥中實際用到的技能（舊的三技能欄不顯示），也不能調整順序
      const deliberate = run.style === 'deliberate';
      battleSkillsOf(run, h).forEach((sk, i) => {
        if (i > 0 && opts.onSwapSkill && !deliberate) {
          const left = el('button', 'order-btn', '◀');
          left.title = tr("和前一個技能交換順序");
          noFocus(left);
          left.addEventListener('click', (ev) => {
            ev.stopPropagation();
            opts.onSwapSkill!(slot, i - 1, i);
          });
          skills.appendChild(left);
        }
        skills.appendChild(el('span', 'party-skill', `${i + 1} ${SKILLS[sk]?.name ?? sk}`));
      });
      info.appendChild(skills);
    }
    if (h.upgrades.length) {
      const ups = el('div', 'party-ups', h.upgrades.map((u) => UPGRADES[u.id]?.name ?? u.id).join('・'));
      info.appendChild(ups);
    }
    row.append(portrait, info);
    if (opts.onSwapHero) {
      const box2 = el('div', 'order-col');
      for (const [label, other, tip] of [
        ['▲', slot - 1, tr("往上移（數字鍵變小）")],
        ['▼', slot + 1, tr("往下移（數字鍵變大）")],
      ] as const) {
        const b = el('button', 'order-btn', label);
        b.title = tip;
        noFocus(b);
        b.disabled = other < 0 || other >= run.party.length;
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          opts.onSwapHero!(slot, other);
        });
        box2.appendChild(b);
      }
      row.appendChild(box2);
    }
    if (h.dead) row.classList.add('dead');
    if (opts.highlight === slot) row.classList.add('picked');
    if (opts.onPick && (!opts.pickable || opts.pickable(slot))) {
      row.classList.add('pickable');
      noFocus(row);
      row.addEventListener('click', () => opts.onPick!(slot));
    }
    box.appendChild(row);
  });
  return box;
}

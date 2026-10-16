import { HEROES } from '../../sim/data/heroes';
import { PERSONALITY_LABEL } from '../../sim/ai/idleBehavior';
import type { Personality } from '../../sim/data/types';
import { UPGRADES } from '../../run/data/upgrades';
import type { RunState } from '../../run/runState';
import { maxHpOf } from '../../run/upgrades';
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
}

/** 隊伍面板：頭像、生命條、陣亡標記、性格、強化 */
export function partyPanel(run: RunState, opts: PartyPanelOptions = {}): HTMLElement {
  const box = el('div', 'party-panel');
  run.party.forEach((h, slot) => {
    const row = el('div', 'party-row');
    if (!h) {
      row.classList.add('empty');
      row.append(el('div', 'portrait small empty-slot', String(slot + 1)), el('div', 'party-info', '（空欄位）'));
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
      tag.title = '點擊切換閒置性格';
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
    hp.append(fill, el('span', 'hptext', h.dead ? '陣亡' : `${h.hp} / ${max}`));
    info.append(name, hp);
    if (h.upgrades.length) {
      const ups = el('div', 'party-ups', h.upgrades.map((u) => UPGRADES[u.id]?.name ?? u.id).join('・'));
      info.appendChild(ups);
    }
    row.append(portrait, info);
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

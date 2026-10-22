import { tr } from '../../i18n';
import { CLASSES, LINES } from '../../sim/data/classes';
import { HEROES } from '../../sim/data/heroes';
import { SKILLS } from '../../sim/data/skills';
import { hex } from '../render/palette';
import { el, noFocus } from './dom';

/** 職業顯示名稱：變體附上所屬系（SPEC_SLICE3 §5） */
export function className(classId: string): string {
  const c = CLASSES[classId];
  const name = HEROES[classId].name;
  return c?.variant ? tr("{0}（{1}）", { 0: name, 1: LINES[c.line].name }) : name;
}

/** 職業卡：名稱、系、定位、專用技能 */
export function classCard(classId: string, opts: { selected?: boolean; dim?: boolean; onClick?: () => void; tag?: string } = {}): HTMLElement {
  const c = CLASSES[classId];
  const d = HEROES[classId];
  const card = el('div', 'class-card');
  if (opts.selected) card.classList.add('selected');
  if (opts.dim) card.classList.add('dim');
  card.style.borderColor = opts.selected ? hex(d.color) : '';
  const head = el('div', 'class-head');
  const portrait = el('div', 'portrait small', d.letter);
  portrait.style.background = hex(d.color);
  const title = el('div', 'class-title');
  title.append(el('div', 'class-name', d.name), el('div', 'class-line', tr("{0}{1}", { 0: LINES[c.line].name, 1: c.variant ? tr("・變體") : '' })));
  head.append(portrait, title);
  if (opts.tag) head.appendChild(el('span', 'class-tag', opts.tag));
  const sig = SKILLS[c.signature];
  card.append(head, el('div', 'class-role', c.role), el('div', 'class-sig', tr("專用：{0}", { 0: sig.name })), el('div', 'class-desc', sig.description));
  if (opts.onClick) {
    noFocus(card);
    card.classList.add('clickable');
    card.addEventListener('click', opts.onClick);
  }
  return card;
}

/** 精簡的職業標籤（組隊結果用） */
export function classChip(classId: string, tag?: string): HTMLElement {
  const d = HEROES[classId];
  const chip = el('div', 'class-chip');
  chip.style.borderColor = hex(d.color);
  const portrait = el('div', 'portrait small', d.letter);
  portrait.style.background = hex(d.color);
  chip.append(portrait, el('span', 'class-name', d.name));
  if (tag) chip.appendChild(el('span', 'class-tag', tag));
  return chip;
}

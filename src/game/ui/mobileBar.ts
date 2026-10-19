/**
 * 行動版的英雄列（SPEC_SLICE5 §8，Alan 的畫面構想）：
 * - 下緣四張卡片對應四名英雄；上半是名字與生命值（點一下選取／再點一下取消），下半是唯一的主動技能鈕（讀秒冷卻）。
 * - 行動條改成卡片的「水位」：準備動作時由下往上填滿，填滿那一刻行動生效。
 * - 暫停鈕是一個不斷轉動的沙漏，放在四張卡片那一欄的正上方中間；暫停時停止轉動並換顏色。
 * 只讀 session 的狀態；操作透過 session（enqueue、targeting、selection）。
 */
import { skillCooldownOf } from '../../sim/actions';
import { CLASSES } from '../../sim/data/classes';
import { HEROES } from '../../sim/data/heroes';
import { SKILLS } from '../../sim/data/skills';
import type { Unit } from '../../sim/unit';
import { beginSkill } from '../input/targeting';
import type { BattleSession } from '../session';
import { hex } from '../render/palette';

interface MobileCard {
  unit: Unit;
  root: HTMLElement;
  fill: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  skillBtn: HTMLElement;
  skillName: HTMLElement;
  cdText: HTMLElement;
  cdCover: HTMLElement;
  skillId: string | undefined;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** 沙漏圖示（SVG，顏色跟著 currentColor 變） */
const HOURGLASS_SVG =
  '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path fill="currentColor" d="M6 2h12v2h-1v3.2c0 1.4-.7 2.7-1.9 3.5L13.4 12l1.7 1.3c1.2.8 1.9 2.1 1.9 3.5V20h1v2H6v-2h1v-3.2c0-1.4.7-2.7 1.9-3.5L10.6 12 8.9 10.7C7.7 9.9 7 8.6 7 7.2V4H6V2zm3 2v3.2c0 .8.4 1.5 1 1.9L12 10.6l2-1.5c.6-.4 1-1.1 1-1.9V4H9zm3 9.4-2 1.5c-.6.4-1 1.1-1 1.9V20h6v-3.2c0-.8-.4-1.5-1-1.9l-2-1.5z"/></svg>';

/** 每名英雄唯一的主動技能：職業的專用技能（找不到就用第一個） */
export function activeSkillIndex(u: Unit): number {
  const sig = CLASSES[u.def.id]?.signature;
  const i = sig ? u.def.skills.indexOf(sig) : -1;
  return i >= 0 ? i : 0;
}

export interface MobileBarHost {
  session(): BattleSession;
  now(): number;
  centerOn(unitId: number): void;
}

export class MobileHeroBar {
  readonly root: HTMLElement;
  private cards: MobileCard[] = [];
  private row: HTMLElement;
  private pauseBtn: HTMLElement;
  private pauseLabel: HTMLElement;

  constructor(private host: MobileBarHost) {
    this.root = el('div', 'm-bar interactive');
    this.pauseBtn = el('button', 'm-pause');
    this.pauseBtn.innerHTML = HOURGLASS_SVG;
    this.pauseBtn.title = '暫停／繼續（空白鍵）';
    this.pauseBtn.tabIndex = -1;
    this.pauseBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
    this.pauseBtn.addEventListener('click', () => {
      const s = this.host.session();
      if (!s.world.result) s.setPaused(!s.paused);
    });
    this.pauseLabel = el('div', 'm-pause-label');
    const pauseCol = el('div', 'm-pause-col');
    pauseCol.append(this.pauseLabel, this.pauseBtn);
    this.row = el('div', 'm-cards');
    this.root.append(pauseCol, this.row);
  }

  build(s: BattleSession): void {
    this.row.innerHTML = '';
    this.cards = [];
    const heroes = s.world.units.filter((u) => u.team === 'hero').sort((a, b) => a.heroSlot - b.heroSlot);
    // 遠征中陣亡或空的欄位也佔一張卡，位置不會錯
    if (s.partySlots) {
      s.partySlots.forEach((info, slot) => {
        if (heroes.some((u) => u.heroSlot === slot)) return;
        const card = el('div', 'm-card empty');
        card.style.order = String(slot);
        const def = info ? HEROES[info.classId] : null;
        card.appendChild(el('div', 'm-head', def ? `${def.name}（陣亡）` : '（空欄位）'));
        this.row.appendChild(card);
      });
    }
    for (const u of heroes) {
      const root = el('div', 'm-card');
      root.style.order = String(u.heroSlot);
      root.style.setProperty('--hero', hex(u.def.color));
      const fill = el('div', 'm-fill');
      const head = el('button', 'm-head');
      head.tabIndex = -1;
      const name = el('span', 'm-name', u.def.name);
      const hp = el('div', 'm-hp');
      const hpFill = el('div', 'fill');
      const hpText = el('span', 'hptext');
      hp.append(hpFill, hpText);
      head.append(name, hp);
      head.addEventListener('mousedown', (ev) => ev.preventDefault());
      // 點名字：選取／取消選取（可以同時選多名）
      head.addEventListener('click', () => {
        const s2 = this.host.session();
        if (u.dead) return;
        const i = s2.selection.indexOf(u.id);
        if (i >= 0) s2.selection.splice(i, 1);
        else s2.selection.push(u.id);
      });
      head.addEventListener('dblclick', () => this.host.centerOn(u.id));
      const idx = activeSkillIndex(u);
      const skillId = u.def.skills[idx];
      const def = skillId ? SKILLS[skillId] : undefined;
      const skillBtn = el('button', 'm-skill');
      skillBtn.tabIndex = -1;
      const skillName = el('span', 'sname', def?.name ?? '—');
      const cdText = el('span', 'cd');
      const cdCover = el('div', 'cdcover');
      skillBtn.append(cdCover, skillName, cdText);
      if (def) skillBtn.title = `${def.name}\n${def.description}`;
      skillBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
      // 點技能：發動唯一的主動技能（需要目標時進入瞄準，再點一次取消）
      skillBtn.addEventListener('click', () => {
        if (u.dead) return;
        beginSkill(this.host.session(), u.heroSlot, idx, this.host.now());
      });
      root.append(fill, head, skillBtn);
      this.row.appendChild(root);
      this.cards.push({ unit: u, root, fill, hpFill, hpText, skillBtn, skillName, cdText, cdCover, skillId });
    }
  }

  update(s: BattleSession): void {
    this.pauseBtn.classList.toggle('paused', s.paused);
    const label = s.paused && !s.world.result ? (s.pauseReason ? `暫停：${s.pauseReason}` : '暫停中') : '';
    if (this.pauseLabel.textContent !== label) this.pauseLabel.textContent = label;
    const sel = new Set(s.selection);
    for (const c of this.cards) {
      const u = c.unit;
      c.root.classList.toggle('selected', sel.has(u.id));
      c.root.classList.toggle('dead', u.dead);
      const frac = Math.max(0, u.hp / u.maxHp);
      c.hpFill.style.width = `${frac * 100}%`;
      c.hpFill.classList.toggle('low', frac < 0.3);
      c.hpText.textContent = `${Math.max(0, u.hp)} / ${u.maxHp}`;
      // 水位：準備動作的進度，填滿時行動生效；恢復期間水位歸零
      const a = u.action;
      const level = a && a.phase === 'windup' ? u.actionProgress : 0;
      c.fill.style.height = `${level * 100}%`;
      c.fill.classList.toggle('skill', !!a?.skillId);
      if (!c.skillId) continue;
      const cd = u.cooldowns[c.skillId] ?? 0;
      const ready = u.skillReady(c.skillId);
      const total = skillCooldownOf(s.world, u, c.skillId);
      c.cdCover.style.height = ready ? '0' : `${Math.min(1, cd / total) * 100}%`;
      c.cdText.textContent = !ready && cd > 0 ? `${Math.ceil(cd)}` : '';
      c.skillBtn.classList.toggle('cooling', !ready);
      c.skillBtn.classList.toggle('targeting', s.targeting?.unitId === u.id && s.targeting.skillId === c.skillId);
    }
  }
}

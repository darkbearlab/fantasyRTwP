/**
 * 行動版的英雄列（SPEC_SLICE5 §8，Alan 的畫面構想）：
 * - 下緣四張卡片對應四名英雄；上半是名字與生命值（點一下選取／再點一下取消），下半是唯一的主動技能鈕（讀秒冷卻）。
 * - 行動條改成卡片的「水位」：準備動作時由下往上填滿，填滿那一刻行動生效。
 * - 暫停鈕是一個不斷轉動的沙漏，放在四張卡片那一欄的正上方中間；暫停時停止轉動並換顏色。
 * - 全選鈕（Alan）：有存活英雄沒被選取時按下＝全選；已經全選時按下＝全部取消。
 * - 沙漏與全選鈕的位置、順序由 GAME_CONFIG.mobileControls 決定（預設：靠左，沙漏、全選）。
 * 只讀 session 的狀態；操作透過 session（enqueue、targeting、selection）。
 */
import { GAME_CONFIG } from '../../config';
import { skillCooldownOf } from '../../sim/actions';
import { currentActiveSkill } from '../../sim/cycle';
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
  status: HTMLElement;
  skillBtn: HTMLElement;
  skillName: HTMLElement;
  cdText: HTMLElement;
  cdCover: HTMLElement;
  hint: HTMLElement;
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

/** 英雄身上的狀態（SPEC_SLICE5 §14：技能效果要看得見） */
const STATUS_ICONS: [(u: Unit) => boolean, string][] = [
  [(u) => u.stunTime > 0, '💫'],
  [(u) => u.rootTime > 0, '❄'],
  [(u) => u.burnTime > 0, '🔥'],
  [(u) => u.curseTime > 0, '☠'],
  [(u) => u.blessTime > 0, '✨'],
  [(u) => u.guardTime > 0, '🛡'],
  [(u) => u.stealthTime > 0 && Number.isFinite(u.stealthTime), '🌫'],
];

/**
 * 頭像（Alan：之後放真的頭像；平時是朝左的側臉，被選取時轉成正面，參考魔鬥士 Commandos）。
 * 有像素素材時：直接用英雄 sprite 的側面（朝左）與正面待機格（CSS 背景裁切，見 .m-sprite）。
 * 沒有素材時：色塊佔位——側臉只有一隻眼睛和朝左的鼻子，正面是兩隻眼睛。
 */
function portrait(sheetUrl?: string): HTMLElement {
  const box = el('div', 'm-portrait');
  if (sheetUrl) {
    for (const view of ['side', 'front']) {
      const s = el('div', `m-sprite ${view}`);
      s.style.backgroundImage = `url("${sheetUrl}")`;
      box.appendChild(s);
    }
    return box;
  }
  const face = el('div', 'm-face');
  face.append(el('span', 'eye l'), el('span', 'eye r'), el('span', 'nose'));
  box.appendChild(face);
  return box;
}

function statusIcons(u: Unit): string {
  if (u.dead) return '';
  return STATUS_ICONS.filter(([on]) => on(u))
    .map(([, icon]) => icon)
    .join('');
}

/** 每名英雄唯一的技能鈕對應的技能索引：技能循環目前這一招，否則是職業專用技能（sim 的 currentActiveSkill） */
export function activeSkillIndex(u: Unit): number {
  const id = currentActiveSkill(u);
  const i = id ? u.def.skills.indexOf(id) : -1;
  return i >= 0 ? i : 0;
}

/** 技能鈕上的小字：蓄力進度或下一招 */
function cycleHint(u: Unit): string {
  const c = u.cycle;
  if (!c) return '';
  if (c.mode === 'charge') return u.cycleStep > 0 ? '強化！' : `⚡${u.cycleCharge}/${c.chargeMax}`;
  return `→ ${SKILLS[c.steps[(u.cycleStep + 1) % c.steps.length]].name}`;
}

export interface MobileBarHost {
  session(): BattleSession;
  /** 英雄頭像用的 sprite sheet 網址（沒有像素素材時 undefined → 色塊頭像） */
  portraitUrl?(defId: string): string | undefined;
  now(): number;
  centerOn(unitId: number): void;
}

export class MobileHeroBar {
  readonly root: HTMLElement;
  private cards: MobileCard[] = [];
  private row: HTMLElement;
  private pauseBtn: HTMLElement;
  private pauseLabel: HTMLElement;
  private selectAllBtn: HTMLElement;

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
    this.selectAllBtn = el('button', 'm-selall', '全選');
    this.selectAllBtn.tabIndex = -1;
    this.selectAllBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
    this.selectAllBtn.addEventListener('click', () => this.toggleSelectAll());
    // 控制鈕列：依設定排列，對齊卡片列的左／中／右
    const mc = GAME_CONFIG.mobileControls;
    const buttons: Record<string, HTMLElement> = { pause: this.pauseBtn, selectAll: this.selectAllBtn };
    const pauseRow = el('div', 'm-pause-row');
    for (const k of mc.order) if (buttons[k]) pauseRow.appendChild(buttons[k]);
    const pauseCol = el('div', `m-pause-col align-${mc.align}`);
    pauseCol.append(this.pauseLabel, pauseRow);
    this.row = el('div', 'm-cards');
    // 控制鈕列與卡片列包在一起，寬度跟著卡片列
    const dock = el('div', 'm-dock');
    dock.append(pauseCol, this.row);
    this.root.append(dock);
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
      // 用 div 而不是 button：iOS（WebKit）的 button 當 flex 容器時，沒有文字的子元素（頭像、生命條）寬度會變成 0、整個看不到
      const head = el('div', 'm-head');
      head.setAttribute('role', 'button');
      head.tabIndex = -1;
      const name = el('span', 'm-name', u.def.name);
      const hp = el('div', 'm-hp');
      const hpFill = el('div', 'fill');
      const hpText = el('span', 'hptext');
      hp.append(hpFill, hpText);
      const status = el('span', 'm-status');
      head.append(portrait(this.host.portraitUrl?.(u.def.id)), name, status, hp);
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
      const skillId = currentActiveSkill(u);
      const def = skillId ? SKILLS[skillId] : undefined;
      const skillBtn = el('button', 'm-skill');
      skillBtn.tabIndex = -1;
      const skillName = el('span', 'sname', def?.name ?? '—');
      const cdText = el('span', 'cd');
      const cdCover = el('div', 'cdcover');
      const hint = el('span', 'm-hint');
      skillBtn.append(cdCover, skillName, hint, cdText);
      if (def) skillBtn.title = `${def.name}\n${def.description}`;
      skillBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
      // 點技能：發動唯一的主動技能（需要目標時進入瞄準，再點一次取消）
      skillBtn.addEventListener('click', () => {
        if (u.dead) return;
        beginSkill(this.host.session(), u.heroSlot, activeSkillIndex(u), this.host.now());
      });
      root.append(fill, head, skillBtn);
      this.row.appendChild(root);
      this.cards.push({ unit: u, root, fill, hpFill, hpText, status, skillBtn, skillName, cdText, cdCover, hint, skillId });
    }
  }

  /** 存活英雄是否全部被選取（沒有存活英雄時視為否） */
  private allSelected(s: BattleSession): boolean {
    const alive = s.world.units.filter((u) => u.team === 'hero' && !u.dead);
    return alive.length > 0 && alive.every((u) => s.selection.includes(u.id));
  }

  /** 全選鈕：有人沒選到就全選，已經全選就全部取消 */
  private toggleSelectAll(): void {
    const s = this.host.session();
    if (s.world.result) return;
    if (this.allSelected(s)) s.selection = [];
    else s.selection = s.world.units.filter((u) => u.team === 'hero' && !u.dead).sort((a, b) => a.heroSlot - b.heroSlot).map((u) => u.id);
  }

  update(s: BattleSession): void {
    this.pauseBtn.classList.toggle('paused', s.paused);
    const all = this.allSelected(s);
    this.selectAllBtn.classList.toggle('active', all);
    const selLabel = all ? '取消' : '全選';
    if (this.selectAllBtn.textContent !== selLabel) this.selectAllBtn.textContent = selLabel;
    this.selectAllBtn.title = all ? '取消選取所有英雄' : '選取所有英雄';
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
      const st = statusIcons(u);
      if (c.status.textContent !== st) c.status.textContent = st;
      // 水位：準備動作的進度，填滿時行動生效；恢復期間水位歸零
      const a = u.action;
      const level = a && a.phase === 'windup' ? u.actionProgress : 0;
      c.fill.style.height = `${level * 100}%`;
      c.fill.classList.toggle('skill', !!a?.skillId);
      // 技能循環：技能鈕換成目前這一招
      const cur = currentActiveSkill(u);
      if (cur !== c.skillId && cur) {
        c.skillId = cur;
        const d = SKILLS[cur];
        c.skillName.textContent = d.name;
        c.skillBtn.title = `${d.name}\n${d.description}`;
        c.skillBtn.classList.remove('flash');
        void c.skillBtn.offsetWidth;
        c.skillBtn.classList.add('flash');
      }
      const h = cycleHint(u);
      if (c.hint.textContent !== h) c.hint.textContent = h;
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

/** 不在戰鬥中時顯示用的英雄卡（營火等畫面）：欄位、職業、生命、主動技能名稱 */
export interface StaticHeroCard {
  slot: number;
  classId: string;
  hp: number;
  maxHp: number;
  dead: boolean;
  skillName: string;
}

/**
 * 和戰鬥中一樣的底部英雄面板，但只是外觀：上面蓋一層半透明黑色，按不到也不會穿過去（Alan：營火畫面保留面板，不要空空的）。
 * slots：隊伍欄位數（空欄位也佔一張卡）。
 */
export function staticHeroBar(cards: StaticHeroCard[], slots: number, portraitUrl?: (classId: string) => string | undefined): HTMLElement {
  const root = el('div', 'm-bar m-static');
  const pause = el('div', 'm-pause');
  pause.innerHTML = HOURGLASS_SVG;
  const selAll = el('div', 'm-selall', '全選');
  const buttons: Record<string, HTMLElement> = { pause, selectAll: selAll };
  const mc = GAME_CONFIG.mobileControls;
  const pauseRow = el('div', 'm-pause-row');
  for (const k of mc.order) if (buttons[k]) pauseRow.appendChild(buttons[k]);
  const pauseCol = el('div', `m-pause-col align-${mc.align}`);
  pauseCol.append(el('div', 'm-pause-label'), pauseRow);
  const row = el('div', 'm-cards');
  for (let slot = 0; slot < slots; slot++) {
    const c = cards.find((x) => x.slot === slot);
    if (!c || c.dead) {
      const card = el('div', 'm-card empty');
      card.appendChild(el('div', 'm-head', c ? `${HEROES[c.classId].name}（陣亡）` : '（空欄位）'));
      row.appendChild(card);
      continue;
    }
    const card = el('div', 'm-card');
    card.style.setProperty('--hero', hex(HEROES[c.classId].color));
    const head = el('div', 'm-head');
    const hp = el('div', 'm-hp');
    const hpFill = el('div', 'fill');
    hpFill.style.width = `${Math.max(0, (c.hp / c.maxHp) * 100)}%`;
    hp.append(hpFill, el('span', 'hptext', `${c.hp} / ${c.maxHp}`));
    head.append(portrait(portraitUrl?.(c.classId)), el('span', 'm-name', HEROES[c.classId].name), el('span', 'm-status'), hp);
    const skill = el('div', 'm-skill');
    skill.appendChild(el('span', 'sname', c.skillName));
    card.append(el('div', 'm-fill'), head, skill);
    row.appendChild(card);
  }
  const dock = el('div', 'm-dock');
  dock.append(pauseCol, row);
  // 半透明黑色遮罩：吃掉所有點擊，不會穿到後面的畫面
  const block = el('div', 'm-block');
  block.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  root.append(dock, block);
  return root;
}

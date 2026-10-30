/**
 * 行動版的英雄列（SPEC_SLICE5 §8，Alan 的畫面構想）：
 * - 下緣四張卡片對應四名英雄；上半是名字與生命值（點一下選取／再點一下取消），下半是唯一的主動技能鈕（讀秒冷卻）。
 * - 行動條改成卡片的「水位」：準備動作時由下往上填滿，填滿那一刻行動生效。
 * - 暫停鈕是一個不斷轉動的沙漏，放在四張卡片那一欄的正上方中間；暫停時停止轉動並換顏色。
 * - 全選鈕（Alan）：有存活英雄沒被選取時按下＝全選；已經全選時按下＝全部取消。
 * - 沙漏與全選鈕的位置、順序由 GAME_CONFIG.mobileControls 決定（預設：靠左，沙漏、全選）。
 * 只讀 session 的狀態；操作透過 session（enqueue、targeting、selection）。
 */
import { tr } from '../../i18n';
import { GAME_CONFIG } from '../../config';
import { skillCooldownOf } from '../../sim/actions';
import { currentActiveSkill } from '../../sim/cycle';
import { HEROES } from '../../sim/data/heroes';
import { SKILLS } from '../../sim/data/skills';
import type { Unit } from '../../sim/unit';
import { BAG, CONSUMABLES } from '../../sim/data/consumables';
import { beginSkill, confirmTargeting, targetingDef, validSkillTarget } from '../input/targeting';
import type { BattleSession } from '../session';
import { hex } from '../render/palette';

interface MobileCard {
  unit: Unit;
  root: HTMLElement;
  fill: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  /** 失衡條（SPEC_STAGGER §6） */
  stagger: HTMLElement;
  status: HTMLElement;
  skillBtn: HTMLElement;
  skillName: HTMLElement;
  cdText: HTMLElement;
  cdCover: HTMLElement;
  hint: HTMLElement;
  skillId: string | undefined;
  /** 以友軍為目標的技能瞄準中、這名英雄可以當目標時顯示的箭頭 */
  target: HTMLElement;
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
 * 具名角色有 32×32 小頭像（public/assets/portraits/mini）就用它：沒選取時暗一點，選取時正常亮度（Alan）。
 */
function portrait(sheetUrl?: string, portraitId?: string): HTMLElement {
  const box = el('div', 'm-portrait');
  if (portraitId) {
    box.classList.add('has-mini');
    const img = el('div', 'm-mini');
    img.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/portraits/mini/${portraitId}.png")`;
    box.appendChild(img);
    return box;
  }
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
  if (c.mode === 'charge') return u.cycleStep > 0 ? tr("強化！") : `⚡${u.cycleCharge}/${c.chargeMax}`;
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
  /**
   * 拖曳選取（Alan 2026-10-24 試作）：按住一張英雄卡往左右拖，經過的卡（起點到目前這張之間）都會被選取。
   * base：開始拖之前的選取；moved：真的拖到別張卡了（放開後的 click 就不再切換選取）。
   */
  private drag: { start: number; base: number[]; moved: boolean } | null = null;
  private skipClick = false;

  /** 某個畫面座標底下的英雄卡（沒有就是 undefined） */
  private cardAt(x: number, y: number): MobileCard | undefined {
    const hit = document.elementFromPoint(x, y)?.closest('.m-card');
    return this.cards.find((c) => c.root === hit);
  }

  /** 起點到這張卡之間（依欄位順序）的存活英雄都選起來，加在開始拖之前的選取上 */
  private dragTo(card: MobileCard): void {
    const d = this.drag!;
    const s = this.host.session();
    const a = Math.min(d.start, card.unit.heroSlot);
    const b = Math.max(d.start, card.unit.heroSlot);
    const range = this.cards.filter((c) => !c.unit.dead && c.unit.heroSlot >= a && c.unit.heroSlot <= b).map((c) => c.unit.id);
    s.selection = [...d.base, ...range.filter((id) => !d.base.includes(id))];
  }
  private row: HTMLElement;
  private pauseBtn: HTMLElement;
  private pauseLabel: HTMLElement;
  private selectAllBtn: HTMLElement;
  private deselectBtn: HTMLElement;

  constructor(private host: MobileBarHost) {
    this.root = el('div', 'm-bar interactive');
    this.pauseBtn = el('button', 'm-pause');
    this.pauseBtn.innerHTML = HOURGLASS_SVG;
    this.pauseBtn.title = tr("暫停／繼續（空白鍵）");
    this.pauseBtn.tabIndex = -1;
    this.pauseBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
    this.pauseBtn.addEventListener('click', () => {
      const s = this.host.session();
      if (!s.world.result) s.setPaused(!s.paused);
    });
    this.pauseLabel = el('div', 'm-pause-label');
    this.selectAllBtn = el('button', 'm-selall', tr("全選"));
    this.selectAllBtn.tabIndex = -1;
    this.selectAllBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
    this.selectAllBtn.addEventListener('click', () => this.selectAll());
    this.selectAllBtn.title = tr("選取所有英雄");
    // Alan：全不選是另一顆按鈕（全選鈕一定是全選）
    this.deselectBtn = el('button', 'm-selall m-desel', tr("全不選"));
    this.deselectBtn.tabIndex = -1;
    this.deselectBtn.title = tr("取消選取所有英雄");
    this.deselectBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
    this.deselectBtn.addEventListener('click', () => {
      const s = this.host.session();
      if (!s.world.result) s.selection = [];
    });
    // 包包（消耗品，Alan 2026-10-21）：打開清單直接用；要選目標的點英雄卡
    this.bagBtn = el('button', 'm-selall m-bagbtn', '🎒');
    this.bagBtn.tabIndex = -1;
    this.bagBtn.title = tr("包包（消耗品）");
    this.bagBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
    this.bagBtn.addEventListener('click', () => {
      const s = this.host.session();
      if (s.itemTargeting) s.itemTargeting = null;
      else this.bagOpen = !this.bagOpen;
      this.renderBag();
    });
    this.bagPop = el('div', 'm-bag-pop');
    // 控制鈕列：依設定排列，對齊卡片列的左／中／右
    const mc = GAME_CONFIG.mobileControls;
    const buttons: Record<string, HTMLElement> = { pause: this.pauseBtn, selectAll: this.selectAllBtn, deselectAll: this.deselectBtn, bag: this.bagBtn };
    const pauseRow = el('div', 'm-pause-row');
    for (const k of mc.order) if (buttons[k]) pauseRow.appendChild(buttons[k]);
    const pauseCol = el('div', `m-pause-col align-${mc.align}`);
    pauseCol.append(this.pauseLabel, this.bagPop, pauseRow);
    this.bagHome = pauseCol;
    this.row = el('div', 'm-cards');
    // 控制鈕列與卡片列包在一起，寬度跟著卡片列
    const dock = el('div', 'm-dock');
    dock.append(pauseCol, this.row);
    this.root.append(dock);
  }

  private bagBtn: HTMLElement;
  private bagPop: HTMLElement;
  private bagOpen = false;
  private bagHome!: HTMLElement;
  /** 電腦版直式中欄：包包放在右側常開（Alan 2026-10-23：空間讓給包包） */
  private bagDocked = false;

  /** 把包包清單放到 side（右側）常開；null＝放回按鈕上方的彈出清單 */
  dockBag(side: HTMLElement | null): void {
    const docked = !!side;
    const target = side ?? this.bagHome;
    if (this.bagPop.parentElement !== target) {
      if (side) target.prepend(this.bagPop);
      else this.bagHome.insertBefore(this.bagPop, this.bagHome.children[1] ?? null);
    }
    if (docked !== this.bagDocked) {
      this.bagDocked = docked;
      this.bagPop.classList.toggle('docked', docked);
      this.bagKey = '';
      this.renderBag();
    }
  }
  /** 包包清單的內容（變了才重畫） */
  private bagKey = '';

  /** 包包清單：每種消耗品一顆按鈕（冷卻中、戰鬥結束時不能按） */
  private renderBag(): void {
    const s = this.host.session();
    const w = s.world;
    const cd = Math.max(0, w.consumableReadyAt - w.time);
    const open = this.bagOpen || this.bagDocked;
    const key = `${open}|${w.bag.join(',')}|${Math.ceil(cd)}|${s.itemTargeting}`;
    this.bagBtn.classList.toggle('active', this.bagOpen || !!s.itemTargeting);
    this.bagBtn.textContent = s.itemTargeting ? '✕' : `🎒${w.bag.length ? w.bag.length : ''}`;
    if (key === this.bagKey) return;
    this.bagKey = key;
    this.bagPop.innerHTML = '';
    this.bagPop.classList.toggle('open', open);
    if (!open) return;
    if (this.bagDocked) this.bagPop.appendChild(el('div', 'm-bag-title', tr("🧪 包包（消耗品 {0}／{1}）", { 0: w.bag.length, 1: BAG.capacity })));
    if (w.bag.length === 0) this.bagPop.appendChild(el('div', 'm-bag-empty', tr("包包是空的")));
    for (const id of [...new Set(w.bag)]) {
      const def = CONSUMABLES[id];
      const n = w.bag.filter((x) => x === id).length;
      const b = el('button', 'm-bag-item', tr("{0} ×{1}{2}", { 0: def.name, 1: n, 2: cd > 0 ? tr("（{0}）", { 0: Math.ceil(cd) }) : '' }));
      b.title = def.description;
      (b as HTMLButtonElement).disabled = cd > 0 || !!w.result || !def.inBattle;
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.addEventListener('click', () => {
        if (def.target === 'party') s.enqueue({ type: 'useConsumable', itemId: id });
        else {
          s.targeting = null;
          s.itemTargeting = id;
          s.showToast(def.target === 'fallen' ? tr("點陣亡英雄的卡片") : tr("點英雄卡選目標"), this.host.now(), 1400);
        }
        this.bagOpen = false;
        this.renderBag();
      });
      this.bagPop.appendChild(b);
    }
  }

  build(s: BattleSession): void {
    this.row.innerHTML = '';
    this.cards = [];
    const heroes = s.world.units.filter((u) => u.isHero).sort((a, b) => a.heroSlot - b.heroSlot);
    // 遠征中陣亡或空的欄位也佔一張卡，位置不會錯
    if (s.partySlots) {
      s.partySlots.forEach((info, slot) => {
        if (heroes.some((u) => u.heroSlot === slot)) return;
        const card = el('div', 'm-card empty');
        card.style.order = String(slot);
        const def = info ? HEROES[info.classId] : null;
        card.appendChild(el('div', 'm-head', def ? tr("{0}（陣亡）", { 0: def.name }) : tr("（空欄位）")));
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
      const staggerBox = el('div', 'm-stagger');
      const stagger = el('div', 'fill');
      staggerBox.appendChild(stagger);
      staggerBox.hidden = this.host.session().world.config.battleStyle !== 'deliberate';
      const status = el('span', 'm-status');
      // 技能循環的提示（⚡層數、下一招）放在右上角狀態圖示下面，不擠技能鈕（Alan 2026-10-30）
      const hint = el('span', 'm-hint');
      const tags = el('div', 'm-tags');
      tags.append(status, hint);
      head.append(portrait(this.host.portraitUrl?.(u.def.id), u.def.portrait), name, tags, hp, staggerBox);
      head.addEventListener('mousedown', (ev) => ev.preventDefault());
      // 拖曳選取：按住卡片往左右拖，經過的英雄都選起來
      head.addEventListener('pointerdown', (ev) => {
        const s2 = this.host.session();
        if (u.dead || s2.itemTargeting || targetingDef(s2)) return;
        this.drag = { start: u.heroSlot, base: [...s2.selection], moved: false };
        head.setPointerCapture(ev.pointerId);
      });
      head.addEventListener('pointermove', (ev) => {
        if (!this.drag) return;
        const card = this.cardAt(ev.clientX, ev.clientY);
        if (!card || card.unit.dead || (!this.drag.moved && card.unit.heroSlot === this.drag.start)) return;
        this.drag.moved = true;
        this.dragTo(card);
      });
      const endDrag = (ev: PointerEvent) => {
        if (!this.drag) return;
        this.skipClick = this.drag.moved;
        this.drag = null;
        if (head.hasPointerCapture(ev.pointerId)) head.releasePointerCapture(ev.pointerId);
      };
      head.addEventListener('pointerup', endDrag);
      head.addEventListener('pointercancel', endDrag);
      // 點名字：選取／取消選取（可以同時選多名）
      head.addEventListener('click', () => {
        // 剛拖曳選取完：這一下 click 不算
        if (this.skipClick) {
          this.skipClick = false;
          return;
        }
        const s2 = this.host.session();
        // 選消耗品的目標：點卡片就用（陣亡的英雄也可以，鳳凰羽毛）
        if (s2.itemTargeting) {
          if (s2.world.canUseConsumable(s2.itemTargeting, u.id)) {
            s2.enqueue({ type: 'useConsumable', itemId: s2.itemTargeting, targetId: u.id });
            s2.itemTargeting = null;
          }
          return;
        }
        if (u.dead) return;
        // 正在瞄準以友軍為目標的技能：點卡片＝選這名英雄當目標，不改變選取（Alan 2026-10-21）
        const td = targetingDef(s2);
        if (td && validSkillTarget(td.def, td.caster, u)) {
          confirmTargeting(s2, { x: u.pos.x, y: u.pos.y }, u, this.host.now());
          return;
        }
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
      skillBtn.append(cdCover, skillName, cdText);
      if (def) skillBtn.title = `${def.name}\n${def.description}`;
      skillBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
      // 點技能：發動唯一的主動技能（需要目標時進入瞄準，再點一次取消）
      skillBtn.addEventListener('click', () => {
        if (u.dead) return;
        beginSkill(this.host.session(), u.heroSlot, activeSkillIndex(u), this.host.now());
      });
      // 以友軍為目標的技能瞄準中：可以當目標的英雄卡上方出現箭頭（Alan：提示要點卡片、不是點地圖）
      const target = el('div', 'm-target', tr("▼ 目標"));
      root.append(fill, head, skillBtn, target);
      this.row.appendChild(root);
      this.cards.push({ unit: u, root, fill, hpFill, hpText, stagger, status, skillBtn, skillName, cdText, cdCover, hint, skillId, target });
    }
  }

  /** 存活英雄是否全部被選取（沒有存活英雄時視為否） */
  private allSelected(s: BattleSession): boolean {
    const alive = s.world.units.filter((u) => u.isHero && !u.dead);
    return alive.length > 0 && alive.every((u) => s.selection.includes(u.id));
  }

  /** 全選鈕：一定是選取所有存活英雄 */
  private selectAll(): void {
    const s = this.host.session();
    if (s.world.result) return;
    s.selection = s.world.units.filter((u) => u.isHero && !u.dead).sort((a, b) => a.heroSlot - b.heroSlot).map((u) => u.id);
  }

  update(s: BattleSession): void {
    this.renderBag();
    this.pauseBtn.classList.toggle('paused', s.paused);
    this.selectAllBtn.classList.toggle('active', this.allSelected(s));
    this.deselectBtn.classList.toggle('dim', s.selection.length === 0);
    const label = s.paused && !s.world.result ? (s.pauseReason ? tr("暫停：{0}", { 0: s.pauseReason }) : tr("暫停中")) : '';
    if (this.pauseLabel.textContent !== label) this.pauseLabel.textContent = label;
    const sel = new Set(s.selection);
    const td = targetingDef(s);
    const allyAim = !!td && (td.def.target === 'ally' || td.def.target === 'allyOrSelf' || td.def.target === 'unit');
    for (const c of this.cards) {
      const u = c.unit;
      c.root.classList.toggle('selected', sel.has(u.id));
      const itemAim = !!s.itemTargeting && s.world.canUseConsumable(s.itemTargeting, u.id);
      c.root.classList.toggle('targetable', (allyAim && validSkillTarget(td!.def, td!.caster, u)) || itemAim);
      c.root.classList.toggle('dead', u.dead);
      const frac = Math.max(0, u.hp / u.maxHp);
      c.hpFill.style.width = `${frac * 100}%`;
      c.hpFill.classList.toggle('low', frac < 0.3);
      c.hpText.textContent = `${Math.max(0, u.hp)} / ${u.maxHp}`;
      c.stagger.style.width = `${Math.min(1, u.stagger / u.poise) * 100}%`;
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
  /** 顯示名稱（具名角色）；沒有就用職業名 */
  name?: string;
  /** 具名角色的頭像 id */
  portrait?: string;
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
  const selAll = el('div', 'm-selall', tr("全選"));
  const desel = el('div', 'm-selall m-desel', tr("全不選"));
  const buttons: Record<string, HTMLElement> = { pause, selectAll: selAll, deselectAll: desel };
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
      card.appendChild(el('div', 'm-head', c ? tr("{0}（陣亡）", { 0: c.name ?? HEROES[c.classId].name }) : tr("（空欄位）")));
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
    head.append(portrait(portraitUrl?.(c.classId), c.portrait), el('span', 'm-name', c.name ?? HEROES[c.classId].name), el('div', 'm-tags'), hp);
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

import { tr } from '../../i18n';
import { languageRow } from '../ui/language';
import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import { canAutocast } from '../../sim/ai/autocast';
import { skillCooldownOf } from '../../sim/actions';
import { SKILLS } from '../../sim/data/skills';
import type { ZocMode } from '../../sim/simConfig';
import type { Unit } from '../../sim/unit';
import { UnitState } from '../../sim/unit';
import { beginSkill } from '../input/targeting';
import { HEROES } from '../../sim/data/heroes';
import { CLASSES, LINES } from '../../sim/data/classes';
import { PERSONALITY_LABEL } from '../../sim/ai/idleBehavior';
import type { Personality } from '../../sim/data/types';

/** 點擊性格標籤時的切換順序 */
const PERSONALITY_CYCLE: Personality[] = ['steadfast', 'aggressive', 'guerrilla'];
import { hex } from '../render/palette';
import { getProjection, setProjection } from '../render/projection';
import { DIR_SETTINGS, getArt, setArt } from '../render/art';
import { H3D, H3D_SETTINGS } from '../render/heroes3d';
import type { ArtMode, DirMode } from '../render/art';
import type { ProjectionMode } from '../render/projection';
import type { BattleSession, DebugFlags } from '../session';
import type { BattleScene } from './BattleScene';
import { MobileHeroBar } from '../ui/mobileBar';
import { RouteMini } from '../ui/routeMini';
import { exitInfos } from '../exitInfo';
import type { RunState } from '../../run/runState';
import { AUTO_PAUSE_OPTIONS, LOW_HP_THRESHOLDS } from '../autoPause';
import { portraitSheetUrl } from '../render/pixelArt';

const STATE_LABEL: Record<UnitState, string> = {
  [UnitState.Idle]: tr("閒置"),
  [UnitState.Moving]: tr("移動中"),
  [UnitState.Windup]: tr("準備中"),
  [UnitState.Recovery]: tr("恢復中"),
  [UnitState.Stunned]: tr("暈眩"),
  [UnitState.Dead]: tr("陣亡"),
};

interface CardRefs {
  unit: Unit;
  root: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  state: HTMLElement;
  personality: HTMLElement;
  bar: HTMLElement;
  skills: { btn: HTMLElement; cd: HTMLElement; cdText: HTMLElement; key: HTMLElement; skillId: string }[];
  slotKey: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** 不讓按鈕搶走鍵盤焦點（避免空白鍵觸發按鈕） */
function noFocus(e: HTMLElement): void {
  e.addEventListener('mousedown', (ev) => ev.preventDefault());
}

/**
 * HUD（DOM 覆蓋層）：上方狀態列、暫停橫幅、下方英雄列、戰鬥紀錄、除錯面板、提示訊息。
 * 每幀從 session 讀狀態；操作透過 session.enqueue / 畫面層狀態。
 */
export class UIScene extends Phaser.Scene {
  private root!: HTMLElement;
  private session: BattleSession | null = null;
  private cards: CardRefs[] = [];
  private heroBar!: HTMLElement;
  private timeEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private banner!: HTMLElement;
  private bannerReason!: HTMLElement;
  private toastEl!: HTMLElement;
  private logBody!: HTMLElement;
  private logBox!: HTMLElement;
  private debugPanel!: HTMLElement;
  private seedEl!: HTMLElement;
  private debugInputs: { sync: () => unknown }[] = [];
  /** 設定選單（自動暫停） */
  private settingsEl!: HTMLElement;
  /** 只在單場模式顯示的按鈕（遠征中不能重來） */
  private quickOnly: HTMLElement[] = [];
  private logCount = -1;
  private logLast: unknown = null;
  /** 沉穩節奏（SPEC_SLICE5）用行動版的四卡片英雄列 */
  private mobileBar!: MobileHeroBar;
  private routeMini!: RouteMini;
  private routeBtn!: HTMLElement;
  private mobile = false;

  constructor() {
    super('UI');
  }

  create(): void {
    // 自己的容器，關閉場景時一起移除（其他畫面也會掛在 #ui 上）
    this.root = el('div', 'hud-root');
    document.getElementById('ui')!.appendChild(this.root);
    this.events.once('shutdown', () => this.root.remove());
    this.session = null;
    this.buildTop();
    this.buildBanner();
    this.buildLog();
    this.buildDebug();
    this.heroBar = el('div', 'hero-bar interactive');
    this.root.appendChild(this.heroBar);
    this.mobileBar = new MobileHeroBar({
      session: () => this.cur(),
      now: () => this.time.now,
      centerOn: (id) => this.battle.centerOnUnit(id),
      portraitUrl: (defId) => (getArt() === 'pixel' ? portraitSheetUrl(this, defId) : undefined),
    });
    this.root.appendChild(this.mobileBar.root);
    this.toastEl = el('div', 'toast');
    this.root.appendChild(this.toastEl);
    this.routeMini = new RouteMini();
    this.root.appendChild(this.routeMini.root);
  }

  private get battle(): BattleScene {
    return this.scene.get('Battle') as BattleScene;
  }

  private cur(): BattleSession {
    return this.registry.get('session') as BattleSession;
  }

  // ───────────── 建構 ─────────────

  private buildTop(): void {
    const top = el('div', 'top-bar');
    this.timeEl = el('div', 'pill time', '00:00.0');
    this.speedEl = el('div', 'pill speed interactive', '1×');
    this.speedEl.title = tr("點擊切換時間倍率");
    noFocus(this.speedEl);
    this.speedEl.addEventListener('click', () => {
      const s = this.cur();
      const list = GAME_CONFIG.timeScales;
      s.timeScale = list[(list.indexOf(s.timeScale) + 1) % list.length];
    });
    // 設定選單（Alan：可以勾選哪些情況自動暫停）
    const gear = el('div', 'pill settings-btn interactive', '⚙');
    gear.title = tr("設定");
    noFocus(gear);
    gear.addEventListener('click', () => this.toggleSettings());
    const hint = el('div', 'pill hint', tr("空白鍵 暫停　1–4 選人→再按 1–3 放技能　Tab 切換　右鍵技能鈕 自動施放　右鍵 移動・攻擊・跟隨　F＋點擊／Ctrl＋右鍵 攻擊移動　WASD 鏡頭　G 切換性格　H 停止　` 除錯"));
    // 迷你路線圖（遠征中才有）：出口通往大地圖的哪裡
    this.routeBtn = el('div', 'pill route-btn interactive', '🗺');
    this.routeBtn.title = tr("路線圖（出口通往哪裡）");
    noFocus(this.routeBtn);
    this.routeBtn.addEventListener('click', () => {
      const s = this.cur();
      s.routeOpen = !s.routeOpen;
    });
    top.append(this.timeEl, this.speedEl, gear, this.routeBtn, hint);
    this.root.appendChild(top);
    this.settingsEl = el('div', 'settings-panel interactive');
    this.root.appendChild(this.settingsEl);
  }

  /** 開關設定選單；每次打開都依目前設定重建內容 */
  private toggleSettings(): void {
    const open = !this.settingsEl.classList.contains('show');
    this.settingsEl.classList.toggle('show', open);
    if (open) this.buildSettings();
  }

  private buildSettings(): void {
    const s = this.cur();
    const p = this.settingsEl;
    p.innerHTML = '';
    const head = el('div', 'settings-head');
    head.appendChild(el('div', 'settings-title', tr("設定")));
    const close = el('button', 'btn small', tr("關閉"));
    noFocus(close);
    close.addEventListener('click', () => this.toggleSettings());
    head.appendChild(close);
    p.appendChild(head);
    // 語言（Alan 2026-10-22）：切換後重新載入頁面
    p.appendChild(el('div', 'settings-sub', 'Language／語言'));
    p.appendChild(languageRow());
    // 操作（Alan 2026-10-22）
    p.appendChild(el('div', 'settings-sub', tr("操作")));
    {
      const row = el('div', 'settings-row');
      const lab = el('label', 'settings-check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.tabIndex = -1;
      cb.checked = s.controls.deselectOnPause;
      cb.addEventListener('change', () => s.setControls({ deselectOnPause: cb.checked }));
      const text = el('div', 'settings-text');
      text.append(el('div', '', tr("暫停時取消選取所有英雄")), el('div', 'settings-hint', tr("暫停代表狀況發生了，英雄要重新選")));
      lab.append(cb, text);
      row.appendChild(lab);
      p.appendChild(row);
    }
    p.appendChild(el('div', 'settings-sub', tr("自動暫停")));
    for (const o of AUTO_PAUSE_OPTIONS) {
      // 列是 div：勾選框與文字包在 label 裡，門檻下拉選單放在 label 外面（點選單不會切換勾選）
      const row = el('div', 'settings-row');
      const lab = el('label', 'settings-check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.tabIndex = -1;
      cb.checked = s.autoPause[o.key];
      cb.addEventListener('change', () => s.setAutoPause({ [o.key]: cb.checked }));
      const text = el('div', 'settings-text');
      text.appendChild(el('div', '', o.label));
      if (o.hint) text.appendChild(el('div', 'settings-hint', o.hint));
      lab.append(cb, text);
      row.appendChild(lab);
      if (o.key === 'heroLowHp') {
        const sel = el('select', 'settings-select');
        for (const v of LOW_HP_THRESHOLDS) {
          const opt = el('option', '', tr("低於 {0}%", { 0: Math.round(v * 100) }));
          opt.value = String(v);
          opt.selected = Math.abs(v - s.autoPause.heroLowHpThreshold) < 1e-6;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => s.setAutoPause({ heroLowHpThreshold: Number(sel.value) }));
        row.appendChild(sel);
      }
      p.appendChild(row);
    }
  }

  private buildBanner(): void {
    this.banner = el('div', 'pause-banner');
    const title = el('div', 'title', tr("暫停中"));
    this.bannerReason = el('div', 'reason');
    const sub = el('div', 'sub', tr("可以下指令——按空白鍵繼續"));
    this.banner.append(title, this.bannerReason, sub);
    this.root.appendChild(this.banner);
  }

  private buildLog(): void {
    this.logBox = el('div', 'log interactive');
    const head = el('div', 'log-head', tr("戰鬥紀錄"));
    noFocus(head);
    head.addEventListener('click', () => {
      const s = this.cur();
      s.logOpen = !s.logOpen;
    });
    this.logBody = el('div', 'log-body');
    this.logBox.append(head, this.logBody);
    this.root.appendChild(this.logBox);
  }

  private buildDebug(): void {
    const p = el('div', 'debug-panel interactive');
    p.appendChild(el('div', 'debug-title', tr("除錯面板（` 開關）")));
    const flags: [keyof DebugFlags, string][] = [
      ['navGrid', tr("導航格子")],
      ['paths', tr("單位路徑")],
      ['allZoc', tr("所有控制區")],
      ['los', tr("視線檢查線")],
      ['slots', tr("攻擊站位")],
      ['facing', tr("方向對照（面向箭頭＋Flare 方向）")],
    ];
    for (const [k, label] of flags) {
      p.appendChild(this.checkbox(label, () => this.cur().debug[k], (v) => (this.cur().debug[k] = v)));
    }

    const projRow = el('div', 'row');
    projRow.appendChild(el('span', 'lbl', tr("投影")));
    const proj = el('select');
    for (const [v, t] of [
      ['ortho', tr("正角俯視")],
      ['iso', tr("等角（45 度）")],
      ['topdown', tr("純平面")],
    ]) {
      const o = el('option', '', t);
      o.value = v;
      proj.appendChild(o);
    }
    proj.addEventListener('change', () => {
      setProjection(proj.value as ProjectionMode);
      proj.blur();
    });
    this.debugInputs.push({ sync: () => document.activeElement !== proj && (proj.value = getProjection()) });
    projRow.appendChild(proj);
    p.appendChild(projRow);

    const artRow = el('div', 'row');
    artRow.appendChild(el('span', 'lbl', tr("美術")));
    const artSel = el('select');
    for (const [v, t] of [
      ['pixel', tr("2D 像素")],
      ['heroes3d', tr("3D 英雄＋Flare（等角）")],
      ['flare', tr("Flare 素材（等角）")],
      ['blocks', tr("色塊")],
    ]) {
      const o = el('option', '', t);
      o.value = v;
      artSel.appendChild(o);
    }
    artSel.addEventListener('change', () => {
      setArt(artSel.value as ArtMode);
      artSel.blur();
    });
    this.debugInputs.push({ sync: () => document.activeElement !== artSel && (artSel.value = getArt()) });
    artRow.appendChild(artSel);
    p.appendChild(artRow);

    // heroes3d：法師外觀（mage／sorceress）
    const lookRow = el('div', 'row');
    lookRow.appendChild(el('span', 'lbl', tr("法師外觀")));
    const lookSel = el('select');
    for (const v of H3D.mageLooks) {
      const o = el('option', '', v === 'mage' ? tr("灰袍法師（mage）") : v === 'sorceress' ? tr("咒術師（sorceress）") : v);
      o.value = v;
      lookSel.appendChild(o);
    }
    lookSel.addEventListener('change', () => {
      H3D_SETTINGS.mageLook = lookSel.value;
      lookSel.blur();
    });
    this.debugInputs.push({ sync: () => document.activeElement !== lookSel && (lookSel.value = H3D_SETTINGS.mageLook) });
    lookRow.appendChild(lookSel);
    p.appendChild(lookRow);

    // 方向對照：換算方式與整體偏移，可以邊看邊調
    const dirRow = el('div', 'row');
    dirRow.appendChild(el('span', 'lbl', tr("方向換算")));
    const dirSel = el('select');
    for (const [v, t] of [
      ['screen', tr("螢幕方向")],
      ['map', tr("地圖方向（轉 45°）")],
    ]) {
      const o = el('option', '', t);
      o.value = v;
      dirSel.appendChild(o);
    }
    dirSel.addEventListener('change', () => {
      DIR_SETTINGS.mode = dirSel.value as DirMode;
      dirSel.blur();
    });
    const offSel = el('select');
    for (let i = 0; i < 8; i++) {
      const o = el('option', '', tr("偏移 {0}", { 0: i }));
      o.value = String(i);
      offSel.appendChild(o);
    }
    offSel.addEventListener('change', () => {
      DIR_SETTINGS.offset = Number(offSel.value);
      offSel.blur();
    });
    this.debugInputs.push({
      sync: () => {
        if (document.activeElement !== dirSel) dirSel.value = DIR_SETTINGS.mode;
        if (document.activeElement !== offSel) offSel.value = String(DIR_SETTINGS.offset);
      },
    });
    dirRow.append(dirSel, offSel);
    p.appendChild(dirRow);
    p.appendChild(this.checkbox(tr("轉向測試（每秒轉一個方向）"), () => DIR_SETTINGS.spin, (v) => (DIR_SETTINGS.spin = v)));

    const speedRow = el('div', 'row');
    speedRow.appendChild(el('span', 'lbl', tr("時間倍率")));
    for (const ts of GAME_CONFIG.timeScales) {
      const b = el('button', 'btn small', `${ts}×`);
      noFocus(b);
      b.addEventListener('click', () => (this.cur().timeScale = ts));
      this.debugInputs.push({ sync: () => b.classList.toggle('active', this.cur().timeScale === ts) });
      speedRow.appendChild(b);
    }
    p.appendChild(speedRow);

    const zocRow = el('div', 'row');
    zocRow.appendChild(el('span', 'lbl', tr("ZOC 模式")));
    const sel = el('select');
    for (const [v, t] of [
      ['pin', tr("pin（牽制）")],
      ['disengage', tr("disengage（脫離攻擊）")],
      ['off', tr("off（關閉）")],
    ]) {
      const o = el('option', '', t);
      o.value = v;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      this.cur().setSimConfig({ zocMode: sel.value as ZocMode });
      sel.blur();
    });
    this.debugInputs.push({ sync: () => document.activeElement !== sel && (sel.value = this.cur().simConfig.zocMode) });
    zocRow.appendChild(sel);
    p.appendChild(zocRow);
    p.appendChild(
      this.checkbox(tr("近戰進行中時控制區失效"), () => this.cur().simConfig.zocEngagedException, (v) => this.cur().setSimConfig({ zocEngagedException: v })),
    );
    p.appendChild(this.checkbox(tr("戰爭迷霧（怪群地圖）"), () => this.cur().simConfig.fogOfWar, (v) => this.cur().setSimConfig({ fogOfWar: v })));

    const ffRow = el('div', 'row');
    ffRow.appendChild(el('span', 'lbl', tr("火球友軍傷害")));
    const ff = el('select');
    for (const [v, t] of [
      ['1', tr("全額")],
      ['0.5', tr("減半")],
      ['0', tr("無")],
    ]) {
      const o = el('option', '', t);
      o.value = v;
      ff.appendChild(o);
    }
    ff.addEventListener('change', () => {
      this.cur().setSimConfig({ friendlyFireMultiplier: Number(ff.value) });
      ff.blur();
    });
    this.debugInputs.push({ sync: () => document.activeElement !== ff && (ff.value = String(this.cur().simConfig.friendlyFireMultiplier)) });
    ffRow.appendChild(ff);
    p.appendChild(ffRow);

    const leashRow = el('div', 'row');
    leashRow.appendChild(el('span', 'lbl', tr("駐守範圍")));
    const leash = el('select');
    for (const v of [0.5, 1, 1.5, 2, 3, 6]) {
      const o = el('option', '', `${v} m`);
      o.value = String(v);
      leash.appendChild(o);
    }
    leash.addEventListener('change', () => {
      this.cur().setSimConfig({ heroLeashRange: Number(leash.value) });
      leash.blur();
    });
    this.debugInputs.push({ sync: () => document.activeElement !== leash && (leash.value = String(this.cur().simConfig.heroLeashRange)) });
    leashRow.appendChild(leash);
    p.appendChild(leashRow);

    p.appendChild(el('div', 'debug-sub', tr("節奏（即時生效）")));
    const numSelect = (label: string, key: 'actionSpeedMult' | 'heroDamageMult', values: number[]) => {
      const row = el('div', 'row');
      row.appendChild(el('span', 'lbl', label));
      const sel = el('select');
      for (const v of values) {
        const o = el('option', '', `×${v}`);
        o.value = String(v);
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        this.cur().setSimConfig({ [key]: Number(sel.value) });
        sel.blur();
      });
      this.debugInputs.push({ sync: () => document.activeElement !== sel && (sel.value = String(this.cur().simConfig[key])) });
      row.appendChild(sel);
      p.appendChild(row);
    };
    numSelect(tr("行動條速度"), 'actionSpeedMult', [0.7, 0.75, 0.8, 0.85, 0.9, 1]);
    numSelect(tr("我方傷害"), 'heroDamageMult', [1, 1.1, 1.2, 1.3, 1.5]);

    p.appendChild(el('div', 'debug-sub', tr("自動暫停（也可以從 ⚙ 設定選單改）")));
    for (const o of AUTO_PAUSE_OPTIONS) p.appendChild(this.checkbox(o.label, () => this.cur().autoPause[o.key], (v) => this.cur().setAutoPause({ [o.key]: v })));

    const seedRow = el('div', 'row');
    this.seedEl = el('span', 'seed');
    const same = el('button', 'btn small', tr("重來（同種子）"));
    const fresh = el('button', 'btn small', tr("新種子"));
    noFocus(same);
    noFocus(fresh);
    same.addEventListener('click', () => this.battle.restartBattle(this.cur().seed));
    fresh.addEventListener('click', () => this.battle.restartBattle(1 + Math.floor(Math.random() * 999999)));
    seedRow.append(this.seedEl, same, fresh);
    this.quickOnly = [same, fresh];
    p.appendChild(seedRow);

    this.debugPanel = p;
    this.root.appendChild(p);
  }

  private checkbox(label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
    const row = el('label', 'row check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.tabIndex = -1;
    cb.addEventListener('change', () => {
      set(cb.checked);
      cb.blur();
    });
    this.debugInputs.push({ sync: () => (cb.checked = get()) });
    row.append(cb, el('span', '', label));
    return row;
  }

  private buildHeroBar(s: BattleSession): void {
    this.heroBar.innerHTML = '';
    this.cards = [];
    const heroes = s.world.units.filter((u) => u.team === 'hero').sort((a, b) => a.heroSlot - b.heroSlot);
    // 遠征模式：陣亡或空欄位也佔位，數字鍵不會錯位
    if (s.partySlots) {
      s.partySlots.forEach((info, slot) => {
        if (heroes.some((u) => u.heroSlot === slot)) return;
        const card = el('div', 'hero-card placeholder');
        card.style.order = String(slot);
        const def = info ? HEROES[info.classId] : null;
        const portrait = el('div', 'portrait', def ? def.letter : '');
        portrait.appendChild(el('span', 'slot-key', String(slot + 1)));
        card.append(portrait, el('div', 'info', def ? tr("{0}　陣亡", { 0: def.name }) : tr("（空欄位）")));
        this.heroBar.appendChild(card);
      });
    }
    for (const u of heroes) {
      const root = el('div', 'hero-card');
      root.style.order = String(u.heroSlot);
      const portrait = el('div', 'portrait', u.def.letter);
      portrait.style.background = hex(u.def.color);
      // 欄位編號（數字鍵）與主要選取標籤
      const slotKey = el('span', 'slot-key', String(u.heroSlot + 1));
      portrait.appendChild(slotKey);
      if (GAME_CONFIG.skillKeyLabels.length > 0) root.appendChild(el('span', 'qer-tag', GAME_CONFIG.skillKeyLabels.join(' ')));
      const info = el('div', 'info');
      const nameRow = el('div', 'name-row');
      const nameEl = el('span', 'name', u.def.name);
      const cls = CLASSES[u.def.id];
      if (cls?.variant) nameEl.title = tr("{0}（{1}）", { 0: u.def.name, 1: LINES[cls.line].name });
      nameRow.append(nameEl);
      const personality = el('span', 'personality');
      personality.title = tr("閒置性格（點擊或按 G 切換）\n堅守：附近有敵人就自動普攻，不離開駐守點\n好戰：看到敵人就衝出去打，一路追擊\n游擊：敵人靠近就逃跑，要下指令才會接戰");
      noFocus(personality);
      personality.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (u.dead) return;
        this.cur().enqueue({ type: 'setPersonality', unitId: u.id, personality: PERSONALITY_CYCLE[(PERSONALITY_CYCLE.indexOf(u.personality) + 1) % PERSONALITY_CYCLE.length] });
      });
      nameRow.append(personality);
      const state = el('span', 'state');
      nameRow.append(state);
      const hp = el('div', 'hp');
      const hpFill = el('div', 'fill');
      const hpText = el('span', 'hptext');
      hp.append(hpFill, hpText);
      const bar = el('div', 'actbar');
      info.append(nameRow, hp, bar);
      const skillsBox = el('div', 'skills');
      const skills: CardRefs['skills'] = [];
      u.def.skills.forEach((skillId, idx) => {
        const def = SKILLS[skillId];
        const btn = el('button', 'skill');
        btn.tabIndex = -1;
        noFocus(btn);
        btn.title = tr("{0}（{1}）\n準備 {2} 秒／恢復 {3} 秒／冷卻 {4} 秒\n{5}{6}", { 0: def.name, 1: GAME_CONFIG.skillKeyLabels[idx] ? tr("選取後按 {0}", { 0: GAME_CONFIG.skillKeyLabels[idx] }) : tr("按 {0} 再按 {1}", { 0: u.heroSlot + 1, 1: idx + 1 }), 2: def.windup, 3: def.recovery, 4: def.cooldown, 5: def.description, 6: canAutocast(skillId) ? tr("\n右鍵：切換自動施放") : '' });
        const key = el('span', 'key', GAME_CONFIG.skillKeyLabels[idx] ?? String(idx + 1));
        const nm = el('span', 'sname', def.name);
        const cd = el('div', 'cd');
        const cdText = el('span', 'cdtext');
        btn.append(cd, key, nm, cdText);
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          beginSkill(this.cur(), u.heroSlot, idx, this.time.now);
        });
        // 右鍵：切換自動施放（SPEC_SLICE4 §3.4）
        btn.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (u.dead || !canAutocast(skillId)) return;
          this.cur().enqueue({ type: 'setAutocast', unitId: u.id, skillId, on: !u.autocast.has(skillId) });
        });
        skills.push({ btn, cd, cdText, key, skillId });
        skillsBox.appendChild(btn);
      });
      root.append(portrait, info, skillsBox);
      noFocus(root);
      root.addEventListener('click', (ev) => {
        if (u.dead) return;
        this.battle.input2.selectHero(u.id, ev.shiftKey);
      });
      root.addEventListener('dblclick', () => this.battle.centerOnUnit(u.id));
      this.heroBar.appendChild(root);
      this.cards.push({ unit: u, root, hpFill, hpText, state, personality, bar, skills, slotKey });
    }
  }

  // ───────────── 每幀更新 ─────────────

  update(): void {
    const s = this.cur();
    if (!s) return;
    if (s !== this.session) {
      this.session = s;
      this.mobile = s.world.config.battleStyle === 'deliberate';
      this.root.classList.toggle('mobile', this.mobile);
      this.cards = [];
      this.heroBar.innerHTML = '';
      if (this.mobile) this.mobileBar.build(s);
      else this.buildHeroBar(s);
      // 迷你路線圖：遠征中的戰鬥才有
      const run = s.mode === 'run' ? (this.registry.get('run') as RunState | undefined) : undefined;
      this.routeBtn.style.display = run ? '' : 'none';
      if (run) this.routeMini.build(run, exitInfos(s.world, run));
      else s.routeOpen = false;
      this.logCount = -1;
    }
    if (this.mobile) this.mobileBar.update(s);
    this.routeMini.update(s, this.time.now);
    this.routeBtn.classList.toggle('active', s.routeOpen);
    const w = s.world;
    const t = w.time;
    const mm = Math.floor(t / 60);
    this.timeEl.textContent = `${String(mm).padStart(2, '0')}:${(t - mm * 60).toFixed(1).padStart(4, '0')}`;
    this.speedEl.textContent = `${s.timeScale}×`;
    this.banner.classList.toggle('show', s.paused && !w.result);
    this.bannerReason.textContent = s.pauseReason ? tr("自動暫停：{0}", { 0: s.pauseReason }) : '';

    const now = this.time.now;
    if (s.toast && s.toast.until > now) {
      this.toastEl.textContent = s.toast.text;
      this.toastEl.classList.add('show');
    } else this.toastEl.classList.remove('show');

    const sel = new Set(s.selection);
    const primaryId = s.primary()?.id;
    for (const c of this.cards) {
      const u = c.unit;
      const isPrimary = u.id === primaryId;
      c.root.classList.toggle('selected', sel.has(u.id));
      c.root.classList.toggle('primary', isPrimary);
      for (const sk of c.skills) sk.key.style.visibility = isPrimary ? 'visible' : 'hidden';
      c.root.classList.toggle('dead', u.dead);
      const frac = Math.max(0, u.hp / u.maxHp);
      c.hpFill.style.width = `${frac * 100}%`;
      c.hpFill.classList.toggle('low', frac < 0.3);
      c.hpText.textContent = `${Math.max(0, u.hp)} / ${u.maxHp}`;
      let label = STATE_LABEL[u.state];
      if (u.action?.skillId && u.state === UnitState.Windup) label = tr("準備：{0}", { 0: SKILLS[u.action.skillId].name });
      if (u.rooted && !u.dead) label += tr("・定身");
      if (u.guardPoint && !u.dead && u.state === UnitState.Idle) label = tr("駐守中");
      c.state.textContent = label;
      const pTxt = PERSONALITY_LABEL[u.personality];
      if (c.personality.textContent !== pTxt) {
        c.personality.textContent = pTxt;
        c.personality.className = `personality ${u.personality}`;
      }
      const a = u.action;
      if (a && (a.phase === 'windup' || a.phase === 'recovery')) {
        c.bar.style.width = `${u.actionProgress * 100}%`;
        c.bar.className = `actbar ${a.phase}`;
      } else c.bar.style.width = '0';
      // 數字鍵二段式：剛用數字選了這名英雄，技能鈕顯示 1–n
      const chord = !!s.chord && s.chord.slot === u.heroSlot && this.time.now <= s.chord.until;
      c.root.classList.toggle('chord', chord);
      c.skills.forEach((sk, idx) => {
        const label = chord ? String(idx + 1) : (GAME_CONFIG.skillKeyLabels[idx] ?? String(idx + 1));
        if (sk.key.textContent !== label) sk.key.textContent = label;
      });
      for (const sk of c.skills) {
        const def = SKILLS[sk.skillId];
        const cd = u.cooldowns[sk.skillId] ?? 0;
        const ready = u.skillReady(sk.skillId);
        const maxCharges = u.maxCharges(sk.skillId);
        sk.cd.style.height = ready ? '0' : `${(cd / skillCooldownOf(s.world, u, def.id)) * 100}%`;
        sk.cdText.textContent = !ready && cd > 0 ? cd.toFixed(cd < 10 ? 1 : 0) : maxCharges > 1 ? `×${u.charges[sk.skillId] ?? 0}` : '';
        sk.btn.classList.toggle('cooling', !ready);
        sk.btn.classList.toggle('targeting', s.targeting?.unitId === u.id && s.targeting.skillId === sk.skillId);
        sk.btn.classList.toggle('casting', u.action?.skillId === sk.skillId && u.action.phase === 'windup');
        sk.btn.classList.toggle('autocast', u.autocast.has(sk.skillId));
      }
    }

    this.logBox.classList.toggle('collapsed', !s.logOpen);
    const last = s.log[s.log.length - 1];
    if (s.log.length !== this.logCount || last !== this.logLast) {
      this.logCount = s.log.length;
      this.logLast = last;
      this.logBody.innerHTML = '';
      for (const e of s.log.slice(-60)) {
        const line = el('div', `line l-${e.cls}`);
        const ts = el('span', 'ts', e.time.toFixed(1).padStart(5, ' '));
        line.append(ts, document.createTextNode(e.text));
        this.logBody.appendChild(line);
      }
      this.logBody.scrollTop = this.logBody.scrollHeight;
    }

    this.debugPanel.classList.toggle('show', s.debug.panel);
    if (s.debug.panel) {
      for (const d of this.debugInputs) d.sync();
      this.seedEl.textContent = tr("種子 {0}", { 0: s.seed });
      for (const b of this.quickOnly) b.style.display = s.mode === 'run' ? 'none' : '';
    }
  }
}

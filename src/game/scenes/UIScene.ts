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

const STATE_LABEL: Record<UnitState, string> = {
  [UnitState.Idle]: '閒置',
  [UnitState.Moving]: '移動中',
  [UnitState.Windup]: '準備中',
  [UnitState.Recovery]: '恢復中',
  [UnitState.Stunned]: '暈眩',
  [UnitState.Dead]: '陣亡',
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
  /** 只在單場模式顯示的按鈕（遠征中不能重來） */
  private quickOnly: HTMLElement[] = [];
  private logCount = -1;
  private logLast: unknown = null;

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
    this.toastEl = el('div', 'toast');
    this.root.appendChild(this.toastEl);
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
    this.speedEl.title = '點擊切換時間倍率';
    noFocus(this.speedEl);
    this.speedEl.addEventListener('click', () => {
      const s = this.cur();
      const list = GAME_CONFIG.timeScales;
      s.timeScale = list[(list.indexOf(s.timeScale) + 1) % list.length];
    });
    const hint = el('div', 'pill hint', '空白鍵 暫停　1–4 選人→再按 1–3 放技能　Tab 切換　Q E R 技能（右鍵技能鈕：自動施放）　右鍵 移動・攻擊・跟隨　F＋點擊／Ctrl＋右鍵 攻擊移動　WASD 鏡頭　G 切換性格　H 停止　` 除錯');
    top.append(this.timeEl, this.speedEl, hint);
    this.root.appendChild(top);
  }

  private buildBanner(): void {
    this.banner = el('div', 'pause-banner');
    const title = el('div', 'title', '暫停中');
    this.bannerReason = el('div', 'reason');
    const sub = el('div', 'sub', '可以下指令——按空白鍵繼續');
    this.banner.append(title, this.bannerReason, sub);
    this.root.appendChild(this.banner);
  }

  private buildLog(): void {
    this.logBox = el('div', 'log interactive');
    const head = el('div', 'log-head', '戰鬥紀錄');
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
    p.appendChild(el('div', 'debug-title', '除錯面板（` 開關）'));
    const flags: [keyof DebugFlags, string][] = [
      ['navGrid', '導航格子'],
      ['paths', '單位路徑'],
      ['allZoc', '所有控制區'],
      ['los', '視線檢查線'],
      ['slots', '攻擊站位'],
      ['facing', '方向對照（面向箭頭＋Flare 方向）'],
    ];
    for (const [k, label] of flags) {
      p.appendChild(this.checkbox(label, () => this.cur().debug[k], (v) => (this.cur().debug[k] = v)));
    }

    const projRow = el('div', 'row');
    projRow.appendChild(el('span', 'lbl', '投影'));
    const proj = el('select');
    for (const [v, t] of [
      ['iso', '等角（45 度）'],
      ['topdown', '正俯視'],
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
    artRow.appendChild(el('span', 'lbl', '美術'));
    const artSel = el('select');
    for (const [v, t] of [
      ['heroes3d', '3D 英雄＋Flare（等角）'],
      ['flare', 'Flare 素材（等角）'],
      ['blocks', '色塊'],
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
    lookRow.appendChild(el('span', 'lbl', '法師外觀'));
    const lookSel = el('select');
    for (const v of H3D.mageLooks) {
      const o = el('option', '', v === 'mage' ? '灰袍法師（mage）' : v === 'sorceress' ? '咒術師（sorceress）' : v);
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
    dirRow.appendChild(el('span', 'lbl', '方向換算'));
    const dirSel = el('select');
    for (const [v, t] of [
      ['screen', '螢幕方向'],
      ['map', '地圖方向（轉 45°）'],
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
      const o = el('option', '', `偏移 ${i}`);
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
    p.appendChild(this.checkbox('轉向測試（每秒轉一個方向）', () => DIR_SETTINGS.spin, (v) => (DIR_SETTINGS.spin = v)));

    const speedRow = el('div', 'row');
    speedRow.appendChild(el('span', 'lbl', '時間倍率'));
    for (const ts of GAME_CONFIG.timeScales) {
      const b = el('button', 'btn small', `${ts}×`);
      noFocus(b);
      b.addEventListener('click', () => (this.cur().timeScale = ts));
      this.debugInputs.push({ sync: () => b.classList.toggle('active', this.cur().timeScale === ts) });
      speedRow.appendChild(b);
    }
    p.appendChild(speedRow);

    const zocRow = el('div', 'row');
    zocRow.appendChild(el('span', 'lbl', 'ZOC 模式'));
    const sel = el('select');
    for (const [v, t] of [
      ['pin', 'pin（牽制）'],
      ['disengage', 'disengage（脫離攻擊）'],
      ['off', 'off（關閉）'],
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
      this.checkbox('近戰進行中時控制區失效', () => this.cur().simConfig.zocEngagedException, (v) => this.cur().setSimConfig({ zocEngagedException: v })),
    );
    p.appendChild(this.checkbox('戰爭迷霧（怪群地圖）', () => this.cur().simConfig.fogOfWar, (v) => this.cur().setSimConfig({ fogOfWar: v })));

    const ffRow = el('div', 'row');
    ffRow.appendChild(el('span', 'lbl', '火球友軍傷害'));
    const ff = el('select');
    for (const [v, t] of [
      ['1', '全額'],
      ['0.5', '減半'],
      ['0', '無'],
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
    leashRow.appendChild(el('span', 'lbl', '駐守範圍'));
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

    p.appendChild(el('div', 'debug-sub', '節奏（即時生效）'));
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
    numSelect('行動條速度', 'actionSpeedMult', [0.7, 0.75, 0.8, 0.85, 0.9, 1]);
    numSelect('我方傷害', 'heroDamageMult', [1, 1.1, 1.2, 1.3, 1.5]);

    p.appendChild(el('div', 'debug-sub', '自動暫停'));
    p.appendChild(this.checkbox('戰鬥開始', () => this.cur().autoPause.battleStart, (v) => (this.cur().autoPause.battleStart = v)));
    p.appendChild(this.checkbox('英雄生命低於 30%', () => this.cur().autoPause.heroLowHp, (v) => (this.cur().autoPause.heroLowHp = v)));
    p.appendChild(this.checkbox('敵方術士準備範圍法術', () => this.cur().autoPause.enemyAoeWindup, (v) => (this.cur().autoPause.enemyAoeWindup = v)));
    p.appendChild(this.checkbox('英雄死亡', () => this.cur().autoPause.heroDeath, (v) => (this.cur().autoPause.heroDeath = v)));

    const seedRow = el('div', 'row');
    this.seedEl = el('span', 'seed');
    const same = el('button', 'btn small', '重來（同種子）');
    const fresh = el('button', 'btn small', '新種子');
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
        card.append(portrait, el('div', 'info', def ? `${def.name}　陣亡` : '（空欄位）'));
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
      const qer = el('span', 'qer-tag', GAME_CONFIG.skillKeyLabels.join(' '));
      root.appendChild(qer);
      const info = el('div', 'info');
      const nameRow = el('div', 'name-row');
      const nameEl = el('span', 'name', u.def.name);
      const cls = CLASSES[u.def.id];
      if (cls?.variant) nameEl.title = `${u.def.name}（${LINES[cls.line].name}）`;
      nameRow.append(nameEl);
      const personality = el('span', 'personality');
      personality.title = '閒置性格（點擊或按 G 切換）\n堅守：附近有敵人就自動普攻，不離開駐守點\n好戰：看到敵人就衝出去打，一路追擊\n游擊：敵人靠近就逃跑，要下指令才會接戰';
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
        btn.title = `${def.name}（選取後按 ${GAME_CONFIG.skillKeyLabels[idx]}）\n準備 ${def.windup} 秒／恢復 ${def.recovery} 秒／冷卻 ${def.cooldown} 秒\n${def.description}${canAutocast(skillId) ? '\n右鍵：切換自動施放' : ''}`;
        const key = el('span', 'key', GAME_CONFIG.skillKeyLabels[idx] ?? '');
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
      this.buildHeroBar(s);
      this.logCount = -1;
    }
    const w = s.world;
    const t = w.time;
    const mm = Math.floor(t / 60);
    this.timeEl.textContent = `${String(mm).padStart(2, '0')}:${(t - mm * 60).toFixed(1).padStart(4, '0')}`;
    this.speedEl.textContent = `${s.timeScale}×`;
    this.banner.classList.toggle('show', s.paused && !w.result);
    this.bannerReason.textContent = s.pauseReason ? `自動暫停：${s.pauseReason}` : '';

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
      if (u.action?.skillId && u.state === UnitState.Windup) label = `準備：${SKILLS[u.action.skillId].name}`;
      if (u.rooted && !u.dead) label += '・定身';
      if (u.guardPoint && !u.dead && u.state === UnitState.Idle) label = '駐守中';
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
        const label = chord ? String(idx + 1) : (GAME_CONFIG.skillKeyLabels[idx] ?? '');
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
      this.seedEl.textContent = `種子 ${s.seed}`;
      for (const b of this.quickOnly) b.style.display = s.mode === 'run' ? 'none' : '';
    }
  }
}

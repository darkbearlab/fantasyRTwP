import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import { SKILLS } from '../../sim/data/skills';
import type { ZocMode } from '../../sim/simConfig';
import type { Unit } from '../../sim/unit';
import { UnitState } from '../../sim/unit';
import { beginSkill } from '../input/targeting';
import { PERSONALITY_LABEL } from '../../sim/ai/idleBehavior';
import type { Personality } from '../../sim/data/types';

/** 點擊性格標籤時的切換順序 */
const PERSONALITY_CYCLE: Personality[] = ['steadfast', 'aggressive', 'guerrilla'];
import { hex } from '../render/palette';
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
  private logCount = -1;
  private logLast: unknown = null;

  constructor() {
    super('UI');
  }

  create(): void {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = '';
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
    const hint = el('div', 'pill hint', '空白鍵 暫停　1–4 選人（連按跳鏡頭）　Tab 切換　Q E R 技能　右鍵 移動・攻擊・跟隨　WASD 鏡頭　H 停止　` 除錯');
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
    ];
    for (const [k, label] of flags) {
      p.appendChild(this.checkbox(label, () => this.cur().debug[k], (v) => (this.cur().debug[k] = v)));
    }

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
    for (const u of heroes) {
      const root = el('div', 'hero-card');
      const portrait = el('div', 'portrait', u.def.letter);
      portrait.style.background = hex(u.def.color);
      // 欄位編號（數字鍵）與主要選取標籤
      const slotKey = el('span', 'slot-key', String(u.heroSlot + 1));
      portrait.appendChild(slotKey);
      const qer = el('span', 'qer-tag', GAME_CONFIG.skillKeyLabels.join(' '));
      root.appendChild(qer);
      const info = el('div', 'info');
      const nameRow = el('div', 'name-row');
      nameRow.append(el('span', 'name', u.def.name));
      const personality = el('span', 'personality');
      personality.title = '閒置性格（點擊切換）\n堅守：附近有敵人就自動普攻，不離開駐守點\n好戰：看到敵人就衝出去打，一路追擊\n游擊：敵人靠近就逃跑，要下指令才會接戰';
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
        btn.title = `${def.name}（選取後按 ${GAME_CONFIG.skillKeyLabels[idx]}）\n準備 ${def.windup} 秒／恢復 ${def.recovery} 秒／冷卻 ${def.cooldown} 秒\n${def.description}`;
        const key = el('span', 'key', GAME_CONFIG.skillKeyLabels[idx] ?? '');
        const nm = el('span', 'sname', def.name);
        const cd = el('div', 'cd');
        const cdText = el('span', 'cdtext');
        btn.append(cd, key, nm, cdText);
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          beginSkill(this.cur(), u.heroSlot, idx, this.time.now);
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
      for (const sk of c.skills) {
        const def = SKILLS[sk.skillId];
        const cd = u.cooldowns[sk.skillId] ?? 0;
        const ready = u.skillReady(sk.skillId);
        const maxCharges = u.maxCharges(sk.skillId);
        sk.cd.style.height = ready ? '0' : `${(cd / u.skillCooldown(sk.skillId, def.cooldown)) * 100}%`;
        sk.cdText.textContent = !ready && cd > 0 ? cd.toFixed(cd < 10 ? 1 : 0) : maxCharges > 1 ? `×${u.charges[sk.skillId] ?? 0}` : '';
        sk.btn.classList.toggle('cooling', !ready);
        sk.btn.classList.toggle('targeting', s.targeting?.unitId === u.id && s.targeting.skillId === sk.skillId);
        sk.btn.classList.toggle('casting', u.action?.skillId === sk.skillId && u.action.phase === 'windup');
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
    }
  }
}

import { tr } from '../../i18n';
import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import type { Vec } from '../../sim/math';
import type { Unit } from '../../sim/unit';
import type { BattleSession } from '../session';
import { screenToGround, worldToScreen } from '../render/projection';
import { beginSkill, confirmTargeting } from './targeting';
import { decideDigit } from './chord';
import { PERSONALITY_LABEL } from '../../sim/ai/idleBehavior';
import type { Personality } from '../../sim/data/types';
import { PERSONALITY_CYCLE } from '../ui/partyPanel';
import type { InteractableState } from '../../sim/interact';
import { activeSkillIndex } from '../ui/mobileBar';

/** 切換性格時的一句話說明 */
const PERSONALITY_HINT: Record<Personality, string> = {
  steadfast: tr("附近有敵人就自動普攻，不離開駐守點"),
  aggressive: tr("看到敵人就衝出去打，一路追擊"),
  guerrilla: tr("敵人靠近就逃跑，要下指令才接戰"),
};

export interface InputHost {
  scene: Phaser.Scene;
  session(): BattleSession;
  /** 畫面空間（相機世界 px）的單位點選判定 */
  unitAtScreen(x: number, y: number): Unit | undefined;
  /** 單位腳下中心的畫面座標（框選用） */
  footScreen(u: Unit): Vec;
  centerOn(unitId: number): void;
  /** 畫面空間的互動物件點選判定（門、拉桿） */
  objectAtScreen(x: number, y: number): InteractableState | undefined;
}

/**
 * 輸入層（SPEC_SLICE2 §1、SPEC §13）：把滑鼠／鍵盤轉成 Command 或畫面層狀態（選取、瞄準、鏡頭）。
 * sim 與渲染都不直接處理輸入，之後接觸控只要再寫一個 controller。
 */
export class InputController {
  /** 框選：起點（相機世界 px＝投影後的畫面座標） */
  dragStart: { x: number; y: number } | null = null;
  /**
   * 按住瞄準（Alan：觸控沒有 hover，技能改成按下後出現預覽、放開才確定）：
   * 按下時在按下的位置顯示預覽；暫停中可以拖曳調整位置；放開時用最後的位置施放。
   */
  aim: { pid: number | null; point: Vec } | null = null;
  /** 最後一次操作的指標是不是滑鼠（滑鼠才用 hover 預覽） */
  lastPointerMouse = true;
  dragNow: { x: number; y: number } | null = null;
  private panLast: { x: number; y: number } | null = null;
  /** 滑鼠真的移動過才啟用邊緣捲動（指標預設在 (0,0)） */
  private pointerSeen = false;
  /** 目前按住的按鍵（鏡頭移動用） */
  private held = new Set<string>();
  /** 按了攻擊移動鍵，等待點擊目標點 */
  attackMoveArmed = false;
  /** 沉穩模式（行動版操作）：按下的位置（判斷點擊或拖曳鏡頭） */
  private tap: { x: number; y: number; sx: number; sy: number; moved: boolean; pid: number | null; cx: number; cy: number; cx0: number; cy0: number; t0: number; fired: boolean } | null = null;
  /** 瀏覽器原生指標（Alan：拖曳地圖時手指滑到其他面板上也要繼續拖，直到放開）：按著的指標、最後一次按下的指標與位置 */
  private nativePointers = new Set<number>();
  private nativeDown: { id: number; x: number; y: number } | null = null;

  constructor(private host: InputHost) {
    const scene = host.scene;
    const input = scene.input;
    input.mouse?.disableContextMenu();
    // 行動版：第二根手指（Alan：鏡頭遠近固定，雙指只是取消點擊，不縮放）
    input.addPointer(1);
    input.keyboard!.addCapture('SPACE,UP,DOWN,LEFT,RIGHT,TAB');

    input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      this.held.add(e.code);
      this.onKey(e);
    });
    input.keyboard!.on('keyup', (e: KeyboardEvent) => this.held.delete(e.code));
    // 視窗失焦時放開所有按鍵，避免鏡頭一直捲
    window.addEventListener('blur', () => this.held.clear());
    // 拖曳地圖改聽整個視窗的原生指標事件：手指移到卡片、戰鬥紀錄等 DOM 面板上也會繼續拖，放開才結束
    const down = (e: PointerEvent) => {
      this.lastPointerMouse = e.pointerType === 'mouse';
      this.nativePointers.add(e.pointerId);
      this.nativeDown = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => this.onNativeMove(e);
    const up = (e: PointerEvent) => this.onNativeUp(e);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    scene.events.once('shutdown', () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    });
  }

  private get session(): BattleSession {
    return this.host.session();
  }

  /** 指標在相機世界中的畫面座標 */
  private toScreen(p: Phaser.Input.Pointer): Vec {
    const w = p.positionToCamera(this.host.scene.cameras.main) as Phaser.Math.Vector2;
    return { x: w.x, y: w.y };
  }

  private now(): number {
    return this.host.scene.time.now;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const s = this.session;
    if (p.middleButtonDown()) {
      this.panLast = { x: p.x, y: p.y };
      return;
    }
    const sp = this.toScreen(p);
    const m = screenToGround(sp.x, sp.y);
    // 點到角色優先於地面
    const unit = this.host.unitAtScreen(sp.x, sp.y);
    if (p.rightButtonDown()) {
      if (s.targeting) {
        s.targeting = null;
        return;
      }
      const ctrl = !!(p.event as MouseEvent | undefined)?.ctrlKey;
      if ((this.attackMoveArmed || ctrl) && !(unit && !unit.dead)) {
        this.attackMove(m);
        return;
      }
      this.attackMoveArmed = false;
      const obj = unit && !unit.dead ? undefined : this.host.objectAtScreen(sp.x, sp.y);
      if (obj) this.interact(obj);
      else if (this.deliberate) this.tapOrder(m, unit, true);
      else this.rightClick(m, unit);
      return;
    }
    if (this.deliberate && s.targeting && !this.attackMoveArmed) {
      // 行動版瞄準：按下先顯示預覽，放開才施放（暫停中可以拖曳調整位置）
      this.aim = { pid: this.nativeDown?.id ?? null, point: m };
      return;
    }
    if (this.deliberate && !this.attackMoveArmed && !s.targeting) {
      // 行動版：先記下按下的位置，放開時沒有拖曳才算點擊（拖曳＝移動鏡頭）
      const nd = this.nativeDown;
      this.tap = { x: p.x, y: p.y, sx: sp.x, sy: sp.y, moved: false, pid: nd?.id ?? null, cx: nd?.x ?? 0, cy: nd?.y ?? 0, cx0: nd?.x ?? 0, cy0: nd?.y ?? 0, t0: this.now(), fired: false };
      return;
    }
    if (p.leftButtonDown()) {
      if (this.attackMoveArmed && !(unit && !unit.dead)) {
        this.attackMove(m);
        return;
      }
      if (s.targeting) {
        confirmTargeting(s, m, unit, this.now());
        return;
      }
      this.dragStart = { ...sp };
      this.dragNow = { ...sp };
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    this.pointerSeen = true;
    // 拖曳中（由原生指標事件處理）不更新滑鼠提示
    if (this.deliberate && this.tap?.moved) return;
    const sp = this.toScreen(p);
    const u = this.host.unitAtScreen(sp.x, sp.y);
    this.session.hoverUnitId = u ? u.id : null;
    const obj = u ? undefined : this.host.objectAtScreen(sp.x, sp.y);
    this.session.hoverObjectId = obj ? obj.def.id : null;
    if (this.panLast && p.middleButtonDown()) {
      const cam = this.host.scene.cameras.main;
      cam.scrollX -= (p.x - this.panLast.x) / cam.zoom;
      cam.scrollY -= (p.y - this.panLast.y) / cam.zoom;
      this.panLast = { x: p.x, y: p.y };
    }
    if (this.dragStart) this.dragNow = { ...sp };
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.panLast && !p.middleButtonDown()) this.panLast = null;
    if (this.aim) {
      this.finishAim();
      return;
    }
    if (this.tap) {
      this.finishTap();
      return;
    }
    if (!this.dragStart || p.leftButtonDown()) return;
    const s = this.session;
    const a = this.dragStart;
    const b = this.dragNow ?? a;
    this.dragStart = null;
    this.dragNow = null;
    const shift = !!(p.event as MouseEvent | undefined)?.shiftKey;
    const heroes = s.world.units.filter((u) => u.team === 'hero' && !u.dead);
    if (Math.hypot(b.x - a.x, b.y - a.y) > 6) {
      // 框選：比對腳下中心投影後的畫面座標
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      const inBox = heroes
        .filter((u) => {
          const f = this.host.footScreen(u);
          return f.x >= x0 && f.x <= x1 && f.y >= y0 && f.y <= y1;
        })
        .sort((p1, p2) => p1.heroSlot - p2.heroSlot);
      if (shift) for (const u of inBox) if (!s.selection.includes(u.id)) s.selection.push(u.id);
      if (!shift) s.selection = inBox.map((u) => u.id);
      return;
    }
    const unit = this.host.unitAtScreen(a.x, a.y);
    if (unit && unit.team === 'hero' && !unit.dead) this.selectHero(unit.id, shift);
    else if (!shift) s.selection = [];
  }

  selectHero(id: number, shift: boolean): void {
    const s = this.session;
    if (shift) {
      const i = s.selection.indexOf(id);
      if (i >= 0) s.selection.splice(i, 1);
      else s.selection.push(id);
    } else s.selection = [id];
  }

  private rightClick(m: Vec, unit: Unit | undefined): void {
    const s = this.session;
    const sel = s.selectedUnits();
    if (sel.length === 0) return;
    const ids = sel.map((u) => u.id);
    if (unit && !unit.dead && unit.team === 'enemy') {
      s.enqueue({ type: 'attack', unitIds: ids, targetId: unit.id });
    } else if (unit && !unit.dead && unit.team === 'hero') {
      const others = ids.filter((id) => id !== unit.id);
      if (others.length > 0) s.enqueue({ type: 'follow', unitIds: others, targetId: unit.id });
    } else {
      s.enqueue({ type: 'move', unitIds: ids, point: m });
    }
  }

  /** 右鍵互動物件：主要選取的英雄走過去開門／拉動（SPEC_SLICE4 §15.1） */
  private interact(obj: InteractableState): void {
    const s = this.session;
    const p = s.primary();
    if (!p) {
      s.showToast(tr("請先選取英雄（1–4）"), this.now(), 1000);
      return;
    }
    s.enqueue({ type: 'interact', unitId: p.id, objectId: obj.def.id });
    if (this.deliberate) s.selection = [];
  }

  /**
   * 循環切換閒置性格（沒有收到指令時的遇敵反應）：以主要選取英雄的下一個性格為準，套用到所有已選英雄。
   */
  private cyclePersonality(): void {
    const s = this.session;
    if (this.deliberate) {
      s.showToast(tr("沉穩模式下性格固定為堅守"), this.now(), 1200);
      return;
    }
    const sel = s.selectedUnits();
    const p = s.primary();
    if (!p || sel.length === 0) {
      s.showToast(tr("請先選取英雄（1–4）"), this.now(), 1000);
      return;
    }
    const next = PERSONALITY_CYCLE[(PERSONALITY_CYCLE.indexOf(p.personality) + 1) % PERSONALITY_CYCLE.length];
    for (const u of sel) s.enqueue({ type: 'setPersonality', unitId: u.id, personality: next });
    s.showToast(tr("{0}：{1}（{2}）", { 0: sel.map((u) => u.def.name).join(tr("、")), 1: PERSONALITY_LABEL[next], 2: PERSONALITY_HINT[next] }), this.now(), 1600);
  }

  /** 攻擊移動（SPEC_SLICE4 §3.1b） */
  /** 沉穩節奏（SPEC_SLICE5）：使用行動版操作 */
  private get deliberate(): boolean {
    return this.session.world.config.battleStyle === 'deliberate';
  }

  /**
   * 行動版的點擊（Alan 2026-10-21）：
   * - 點英雄＝只選這名英雄（先全部取消再選；多選用英雄卡）。
   * - 輕點地面＝純移動（途中不理敵人，到了就地駐守）；輕點敵人＝攻擊移動到那個位置。
   * - 在原地按住 longPressSec 秒（或滑鼠右鍵）＝攻擊移動（attack＝true）。
   */
  private tapOrder(m: Vec, unit: Unit | undefined, attack = false): void {
    const s = this.session;
    if (unit && !unit.dead && unit.team === 'hero') {
      s.selection = [unit.id];
      return;
    }
    if (s.selectedUnits().length === 0) {
      s.showToast(tr("先點英雄卡上的名字選人"), this.now(), 1200);
      return;
    }
    // 點到出口方塊：迷你路線圖上對應的節點閃一下（Alan 2026-10-21：出口通往哪裡）
    const ex = (s.world.map.exits ?? []).find((e) => m.x >= e.x && m.x <= e.x + e.w && m.y >= e.y && m.y <= e.y + e.h);
    if (ex) s.exitPing = { id: ex.id, at: this.now() };
    const enemy = unit && !unit.dead && unit.team === 'enemy';
    if (attack || enemy) this.attackMove(enemy ? { x: unit!.pos.x, y: unit!.pos.y } : m);
    else s.enqueue({ type: 'move', unitIds: s.selectedUnits().map((u) => u.id), point: m });
    // 下完指令是否取消選取（GAME_CONFIG.deselectAfterOrder，目前關閉）
    if (GAME_CONFIG.deselectAfterOrder) s.selection = [];
  }

  /** 行動版：放開時沒有拖曳才算點擊 */
  private finishTap(): void {
    const t = this.tap;
    this.tap = null;
    // 拖曳過（移動鏡頭）或已經長按出了攻擊移動：放開不再下指令
    if (!t || t.moved || t.fired) return;
    const unit = this.host.unitAtScreen(t.sx, t.sy);
    const obj = unit && !unit.dead ? undefined : this.host.objectAtScreen(t.sx, t.sy);
    if (obj) this.interact(obj);
    else this.tapOrder(screenToGround(t.sx, t.sy), unit);
  }

  /** 放開瞄準：在最後的位置施放（點地圖打最近目標的規則照舊） */
  private finishAim(): void {
    const a = this.aim;
    this.aim = null;
    if (!a) return;
    const p = worldToScreen(a.point.x, a.point.y);
    const unit = this.host.unitAtScreen(p.x, p.y);
    confirmTargeting(this.session, a.point, unit, this.now());
  }

  /** 瀏覽器畫面座標 → 地面的世界座標 */
  private clientToGround(cx: number, cy: number): Vec {
    const scene = this.host.scene;
    const rect = scene.game.canvas.getBoundingClientRect();
    const k = this.clientScale();
    const wp = scene.cameras.main.getWorldPoint((cx - rect.left) * k, (cy - rect.top) * k);
    return screenToGround(wp.x, wp.y);
  }

  /** 瀏覽器畫面 px → 遊戲邏輯 px（舞台有 CSS 縮放） */
  private clientScale(): number {
    const game = this.host.scene.game;
    const w = game.canvas.getBoundingClientRect().width;
    return w > 0 ? game.scale.width / w : 1;
  }

  /** 行動版拖曳：單指拖曳移動鏡頭（在任何面板上都算，直到放開）；雙指不縮放（遠近固定），只取消點擊 */
  private onNativeMove(e: PointerEvent): void {
    this.lastPointerMouse = e.pointerType === 'mouse';
    // 按住瞄準：暫停中跟著手指移動預覽位置（不暫停時固定在按下的位置）
    const a = this.aim;
    if (a && a.pid !== null && e.pointerId === a.pid) {
      if (this.session.paused) a.point = this.clientToGround(e.clientX, e.clientY);
      return;
    }
    const t = this.tap;
    if (!t || t.pid === null || e.pointerId !== t.pid) return;
    const k = this.clientScale();
    if (this.nativePointers.size > 1) {
      t.moved = true;
    } else {
      if (!t.moved && Math.hypot(e.clientX - t.cx0, e.clientY - t.cy0) * k > 10) t.moved = true;
      if (t.moved) {
        const cam = this.host.scene.cameras.main;
        cam.scrollX -= ((e.clientX - t.cx) * k) / cam.zoom;
        cam.scrollY -= ((e.clientY - t.cy) * k) / cam.zoom;
      }
    }
    t.cx = e.clientX;
    t.cy = e.clientY;
  }

  private onNativeUp(e: PointerEvent): void {
    this.nativePointers.delete(e.pointerId);
    if (this.aim && this.aim.pid !== null && e.pointerId === this.aim.pid) {
      this.finishAim();
      return;
    }
    const t = this.tap;
    // 放開的地方可能是面板（Phaser 收不到）：在這裡結束拖曳；在地圖上放開時 Phaser 的 pointerup 會看到 tap 已經結束
    if (t && t.pid !== null && e.pointerId === t.pid) this.finishTap();
  }

  private attackMove(m: Vec): void {
    this.attackMoveArmed = false;
    const ids = this.session.selectedUnits().map((u) => u.id);
    if (ids.length) this.session.enqueue({ type: 'attackMove', unitIds: ids, point: m });
  }

  private onKey(e: KeyboardEvent): void {
    const s = this.session;
    if (e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    const K = GAME_CONFIG.keys;
    const code = e.code;
    if (K.pause.includes(code)) {
      e.preventDefault();
      if (!s.world.result) s.setPaused(!s.paused);
    } else if (K.cancel.includes(code)) {
      s.targeting = null;
      s.chord = null;
      this.attackMoveArmed = false;
    } else if (K.cyclePersonality.includes(code)) {
      this.cyclePersonality();
    } else if (K.attackMove.includes(code)) {
      if (s.selectedUnits().length === 0) s.showToast(tr("請先選取英雄（1–4）"), this.now(), 1000);
      else {
        s.targeting = null;
        this.attackMoveArmed = true;
        s.showToast(tr("攻擊移動：點擊目標地點"), this.now(), 1200);
      }
    } else if (K.stop.includes(code)) {
      const ids = s.selectedUnits().map((u) => u.id);
      if (ids.length) s.enqueue({ type: 'stop', unitIds: ids });
    } else if (K.debug.includes(code)) {
      s.debug.panel = !s.debug.panel;
    } else if (K.cycleHero.includes(code)) {
      e.preventDefault();
      this.cycleHero();
    } else if (K.skillDigits.includes(code)) {
      this.digit(K.skillDigits.indexOf(code), e.shiftKey);
    } else if (K.skills.includes(code)) {
      e.preventDefault();
      const p = s.primary();
      if (!p) s.showToast(tr("請先選取英雄（1–4）"), this.now(), 1000);
      else beginSkill(s, p.heroSlot, K.skills.indexOf(code), this.now());
    }
  }

  /**
   * 數字鍵二段式：第一下選英雄（1–4），時間內的第二下放那名英雄的第 n 個技能。
   * Shift＋數字照舊是加選，不進入二段式。
   */
  digit(n: number, shift: boolean): void {
    const s = this.session;
    const now = this.now();
    // 沉穩節奏：每名英雄只有一招主動技能（第二下的 1）
    const one = this.deliberate;
    const a = decideDigit(s.chord, now, n, shift, GAME_CONFIG.keys.selectSlot.length, (slot) => (one ? 1 : (s.heroBySlot(slot)?.def.skills.length ?? 0)));
    s.chord = null;
    switch (a.kind) {
      case 'skill': {
        const hero = s.heroBySlot(a.slot);
        beginSkill(s, a.slot, one && hero ? activeSkillIndex(hero) : a.index, now);
        break;
      }
      case 'noSkill': {
        const hero = s.heroBySlot(a.slot);
        if (hero) s.showToast(tr("{0}沒有第 {1} 個技能", { 0: hero.def.name, 1: a.index + 1 }), now, 1000);
        break;
      }
      case 'select': {
        this.selectSlot(a.slot, shift);
        const u = s.heroBySlot(a.slot);
        if (a.startChord && u && !u.dead) s.chord = { slot: a.slot, until: now + GAME_CONFIG.heroChordMs };
        break;
      }
      case 'none':
        break;
    }
  }

  /** 數字鍵選取英雄欄位（二段式下不再用連按兩下移動鏡頭；改用雙擊英雄卡片） */
  selectSlot(slot: number, shift: boolean): void {
    const s = this.session;
    const u = s.heroBySlot(slot);
    if (!u || u.dead) {
      s.showToast(u ? tr("{0}已陣亡", { 0: u.def.name }) : tr("這個欄位沒有英雄"), this.now(), 1000);
      return;
    }
    s.targeting = null;
    if (shift) {
      // 加選；已選的話移到最後，成為主要選取
      s.selection = s.selection.filter((id) => id !== u.id);
      s.selection.push(u.id);
    } else s.selection = [u.id];
  }

  /** Tab：主要選取切換到下一名存活英雄（只選他一人） */
  cycleHero(): void {
    const s = this.session;
    const heroes = s.world.units.filter((u) => u.team === 'hero' && !u.dead).sort((a, b) => a.heroSlot - b.heroSlot);
    if (heroes.length === 0) return;
    const p = s.primary();
    const i = p ? heroes.findIndex((u) => u.id === p.id) : -1;
    s.selection = [heroes[(i + 1) % heroes.length].id];
    s.targeting = null;
  }

  /** 每幀：方向鍵、滑鼠移到邊緣捲動鏡頭 */
  /**
   * 長按的進度（畫面畫一個漸滿的圈）：手指一直沒動、不是按在英雄身上時才有；0～1，滿了就下攻擊移動。
   */
  pressProgress(): { sx: number; sy: number; k: number } | null {
    const t = this.tap;
    if (!t || t.moved || t.fired || !this.deliberate) return null;
    const unit = this.host.unitAtScreen(t.sx, t.sy);
    if (unit && !unit.dead && unit.team === 'hero') return null;
    const held = (this.now() - t.t0) / 1000;
    // 剛按下的一小段不畫（輕點不會閃一下）
    if (held < 0.15) return null;
    return { sx: t.sx, sy: t.sy, k: Math.min(1, held / GAME_CONFIG.longPressSec) };
  }

  /** 長按到時間：在按住的位置下攻擊移動（之後放開不再下指令） */
  private checkLongPress(): void {
    const t = this.tap;
    const pr = this.pressProgress();
    if (!t || !pr || pr.k < 1) return;
    t.fired = true;
    const unit = this.host.unitAtScreen(t.sx, t.sy);
    this.tapOrder(screenToGround(t.sx, t.sy), unit, true);
  }

  update(dtSec: number): void {
    this.checkLongPress();
    const scene = this.host.scene;
    const cam = scene.cameras.main;
    const speed = (GAME_CONFIG.cameraScrollSpeed * dtSec) / cam.zoom;
    let dx = 0;
    let dy = 0;
    const K = GAME_CONFIG.keys;
    const down = (codes: string[]) => codes.some((c) => this.held.has(c));
    if (down(K.cameraLeft)) dx -= 1;
    if (down(K.cameraRight)) dx += 1;
    if (down(K.cameraUp)) dy -= 1;
    if (down(K.cameraDown)) dy += 1;
    const p = scene.input.activePointer;
    const m = GAME_CONFIG.edgeScrollMargin;
    // 觸控沒有「游標停在邊緣」，不做邊緣捲動（否則手指點過邊緣後鏡頭會一直飄）
    if (this.pointerSeen && scene.input.isOver && !this.dragStart && !this.panLast && !p.wasTouch) {
      if (p.x <= m) dx -= 1;
      if (p.x >= scene.scale.width - m) dx += 1;
      if (p.y <= m) dy -= 1;
      if (p.y >= scene.scale.height - m) dy += 1;
    }
    if (dx || dy) {
      cam.scrollX += dx * speed;
      cam.scrollY += dy * speed;
    }
  }
}

import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import type { Vec } from '../../sim/math';
import type { Unit } from '../../sim/unit';
import type { BattleSession } from '../session';
import { screenToGround } from '../render/projection';
import { beginSkill, confirmTargeting } from './targeting';

export interface InputHost {
  scene: Phaser.Scene;
  session(): BattleSession;
  /** 畫面空間（相機世界 px）的單位點選判定 */
  unitAtScreen(x: number, y: number): Unit | undefined;
  /** 單位腳下中心的畫面座標（框選用） */
  footScreen(u: Unit): Vec;
  centerOn(unitId: number): void;
}

/**
 * 輸入層（SPEC_SLICE2 §1、SPEC §13）：把滑鼠／鍵盤轉成 Command 或畫面層狀態（選取、瞄準、鏡頭）。
 * sim 與渲染都不直接處理輸入，之後接觸控只要再寫一個 controller。
 */
export class InputController {
  /** 框選：起點（相機世界 px＝投影後的畫面座標） */
  dragStart: { x: number; y: number } | null = null;
  dragNow: { x: number; y: number } | null = null;
  private panLast: { x: number; y: number } | null = null;
  /** 滑鼠真的移動過才啟用邊緣捲動（指標預設在 (0,0)） */
  private pointerSeen = false;
  /** 目前按住的按鍵（鏡頭移動用） */
  private held = new Set<string>();
  private lastSlotTap = { slot: -1, at: 0 };

  constructor(private host: InputHost) {
    const scene = host.scene;
    const input = scene.input;
    input.mouse?.disableContextMenu();
    input.keyboard!.addCapture('SPACE,UP,DOWN,LEFT,RIGHT,TAB');

    input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = scene.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.6, 1.8));
    });
    input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      this.held.add(e.code);
      this.onKey(e);
    });
    input.keyboard!.on('keyup', (e: KeyboardEvent) => this.held.delete(e.code));
    // 視窗失焦時放開所有按鍵，避免鏡頭一直捲
    window.addEventListener('blur', () => this.held.clear());
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
      this.rightClick(m, unit);
      return;
    }
    if (p.leftButtonDown()) {
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
    const sp = this.toScreen(p);
    const u = this.host.unitAtScreen(sp.x, sp.y);
    this.session.hoverUnitId = u ? u.id : null;
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
    } else if (K.stop.includes(code)) {
      const ids = s.selectedUnits().map((u) => u.id);
      if (ids.length) s.enqueue({ type: 'stop', unitIds: ids });
    } else if (K.debug.includes(code)) {
      s.debug.panel = !s.debug.panel;
    } else if (K.cycleHero.includes(code)) {
      e.preventDefault();
      this.cycleHero();
    } else if (K.selectSlot.includes(code)) {
      this.selectSlot(K.selectSlot.indexOf(code), e.shiftKey);
    } else if (K.skills.includes(code)) {
      e.preventDefault();
      const p = s.primary();
      if (!p) s.showToast('請先選取英雄（1–4）', this.now(), 1000);
      else beginSkill(s, p.heroSlot, K.skills.indexOf(code), this.now());
    }
  }

  /** 數字鍵選取英雄欄位；連按兩下鏡頭移過去 */
  selectSlot(slot: number, shift: boolean): void {
    const s = this.session;
    const u = s.heroBySlot(slot);
    if (!u || u.dead) {
      s.showToast(u ? `${u.def.name}已陣亡` : '這個欄位沒有英雄', this.now(), 1000);
      return;
    }
    const now = this.now();
    const double = this.lastSlotTap.slot === slot && now - this.lastSlotTap.at <= GAME_CONFIG.doubleTapMs;
    this.lastSlotTap = { slot, at: now };
    s.targeting = null;
    if (shift) {
      // 加選；已選的話移到最後，成為主要選取
      s.selection = s.selection.filter((id) => id !== u.id);
      s.selection.push(u.id);
    } else s.selection = [u.id];
    if (double) this.host.centerOn(u.id);
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
  update(dtSec: number): void {
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
    if (this.pointerSeen && scene.input.isOver && !this.dragStart && !this.panLast) {
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

import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import type { Unit } from '../../sim/unit';
import { COLORS, FONT, darken } from './palette';
import { depthOf, groundCirclePoints, isIso, worldToScreen } from './projection';
import { VISUAL, unitHeight } from './visual';

const PX = GAME_CONFIG.pxPerMeter;
const ISO = GAME_CONFIG.iso;

/** normal：一般；brush：在草叢裡但敵人看得到；concealed：我方躲在草叢中（半透明）；hidden：對我方隱藏的敵人 */
export type Concealment = 'normal' | 'brush' | 'concealed' | 'hidden';

/** 角色外觀的共同介面（色塊 UnitView／Flare 素材 FlareView／自製 3D 英雄 Hero3DView） */
export interface UnitVisual {
  readonly unit: Unit;
  readonly container: Phaser.GameObjects.Container;
  /** 身高（公尺） */
  readonly height: number;
  /** 腳下中心的畫面座標與世界座標（插值後） */
  x: number;
  y: number;
  wx: number;
  wy: number;
  readonly visible: boolean;
  update(alpha: number, selected: boolean, hovered: boolean, simTime?: number): void;
  head(): { x: number; y: number };
  bodyBounds(): { x: number; y: number; w: number; h: number };
  hitTest(px: number, py: number): boolean;
  drawOutline(g: Phaser.GameObjects.Graphics): void;
  setConcealment(c: Concealment): void;
  /** 被打中（Flare 版播放受擊動作） */
  onHit?(simTime: number, from?: { x: number; y: number }): void;
  destroy(): void;
}

/** 物件層的深度基準（地面層 < 10；物件層 = 基準 + depthOf；覆蓋層 > 1000） */
export const OBJECT_DEPTH_BASE = 100;
export const DEAD_DEPTH = 6;

/**
 * 單位的占位外觀。
 * - iso：腳下 2:1 橢圓（面向短線）＋直立長方形身體＋字母
 * - topdown：原本的圓形色塊＋字母＋面向短線
 */
export class UnitView implements UnitVisual {
  readonly container: Phaser.GameObjects.Container;
  private foot: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private facing: Phaser.GameObjects.Graphics;
  private letter: Phaser.GameObjects.Text;
  private wasDead = false;
  private concealment: Concealment = 'normal';
  private readonly iso: boolean;
  /** 身高（公尺）與畫面上的身體尺寸（px） */
  readonly height: number;
  readonly bodyW: number;
  readonly bodyH: number;
  /** 腳下中心的畫面座標（插值後） */
  x = 0;
  y = 0;
  /** 插值後的世界座標 */
  wx = 0;
  wy = 0;

  constructor(scene: Phaser.Scene, readonly unit: Unit) {
    this.iso = isIso();
    this.height = unitHeight(unit.def);
    this.bodyW = unit.radius * ISO.tileW * VISUAL.bodyWidthFactor;
    this.bodyH = this.height * ISO.heightPxPerM;
    this.ring = scene.add.graphics();
    this.foot = scene.add.graphics();
    this.body = scene.add.graphics();
    this.facing = scene.add.graphics();
    const fontPx = this.iso ? Math.round(Math.min(this.bodyW * 0.75, 20)) : Math.round(unit.radius * PX * 1.1);
    this.letter = scene.add
      .text(0, this.iso ? -this.bodyH * 0.55 : 0, unit.def.letter, { fontFamily: FONT, fontSize: `${fontPx}px`, color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.letter.setStroke('#000000', 3);
    this.container = scene.add.container(0, 0, [this.ring, this.foot, this.body, this.facing, this.letter]);
    this.container.setDepth(OBJECT_DEPTH_BASE);
    this.drawBody(false);
  }

  /** 腳下橢圓（相對於腳下中心） */
  private footPoints(r: number): { x: number; y: number }[] {
    const o = worldToScreen(0, 0);
    return groundCirclePoints(0, 0, r, 0, Math.PI * 2, 28).map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
  }

  private fillPoly(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]): void {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillPath();
  }

  private strokePoly(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]): void {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.strokePath();
  }

  private drawBody(dead: boolean): void {
    const c = dead ? 0x444444 : this.unit.def.color;
    const r = this.unit.radius;
    this.foot.clear();
    this.body.clear();
    if (!this.iso) {
      this.body.fillStyle(c, 1);
      this.body.fillCircle(0, 0, r * PX);
      this.body.lineStyle(2, darken(c, 0.5), 1);
      this.body.strokeCircle(0, 0, r * PX);
      return;
    }
    const pts = this.footPoints(r);
    this.foot.fillStyle(darken(c, 0.45), dead ? 0.8 : 0.9);
    this.fillPoly(this.foot, pts);
    this.foot.lineStyle(2, c, 1);
    this.strokePoly(this.foot, pts);
    if (dead) return;
    const w = this.bodyW;
    const h = this.bodyH;
    this.body.fillStyle(c, 1);
    this.body.fillRect(-w / 2, -h, w, h);
    // 側光：右半邊稍暗，增加立體感
    this.body.fillStyle(darken(c, 0.75), 1);
    this.body.fillRect(0, -h, w / 2, h);
    this.body.lineStyle(2, darken(c, 0.4), 1);
    this.body.strokeRect(-w / 2, -h, w, h);
  }

  update(alpha: number, selected: boolean, hovered: boolean): void {
    const u = this.unit;
    this.wx = u.prevPos.x + (u.pos.x - u.prevPos.x) * alpha;
    this.wy = u.prevPos.y + (u.pos.y - u.prevPos.y) * alpha;
    const p = worldToScreen(this.wx, this.wy);
    this.x = p.x;
    this.y = p.y;
    this.container.setPosition(this.x, this.y);
    if (u.dead !== this.wasDead) {
      this.wasDead = u.dead;
      this.drawBody(u.dead);
      this.facing.setVisible(!u.dead);
      this.container.setAlpha(u.dead ? 0.45 : 1);
      this.letter.setText(u.dead ? '✕' : u.def.letter);
      this.letter.setY(this.iso && !u.dead ? -this.bodyH * 0.55 : 0);
    }
    this.container.setDepth(u.dead ? DEAD_DEPTH : OBJECT_DEPTH_BASE + depthOf(this.wx, this.wy));
    const r = u.radius;
    this.facing.clear();
    this.ring.clear();
    if (!this.iso) {
      if (!u.dead) {
        this.facing.lineStyle(3, 0xffffff, 0.9);
        this.facing.lineBetween(Math.cos(u.facing) * r * PX * 0.55, Math.sin(u.facing) * r * PX * 0.55, Math.cos(u.facing) * (r * PX + 5), Math.sin(u.facing) * (r * PX + 5));
      }
      if (!u.dead && (selected || hovered)) {
        this.ring.lineStyle(selected ? 3 : 2, COLORS.selection, selected ? 1 : 0.5);
        this.ring.strokeCircle(0, 0, r * PX + 4);
      }
      return;
    }
    if (!u.dead) {
      // 面向：腳下橢圓上的一條短線
      const o = worldToScreen(0, 0);
      const a = worldToScreen(Math.cos(u.facing) * r * 0.5, Math.sin(u.facing) * r * 0.5);
      const b = worldToScreen(Math.cos(u.facing) * (r + 0.25), Math.sin(u.facing) * (r + 0.25));
      this.facing.lineStyle(3, 0xffffff, 0.95);
      this.facing.lineBetween(a.x - o.x, a.y - o.y, b.x - o.x, b.y - o.y);
    }
    if (!u.dead && (selected || hovered)) {
      this.ring.lineStyle(selected ? 3 : 2, COLORS.selection, selected ? 1 : 0.5);
      this.strokePoly(this.ring, this.footPoints(r + 0.15));
    }
  }

  /** 頭頂位置（生命條、飄字）的畫面座標 */
  head(): { x: number; y: number } {
    if (!this.iso) return { x: this.x, y: this.y - this.unit.radius * PX };
    const p = worldToScreen(this.wx, this.wy, this.height + VISUAL.headClearance);
    return { x: p.x, y: p.y };
  }

  /** 身體在畫面上的範圍（遮擋判定、輪廓） */
  bodyBounds(): { x: number; y: number; w: number; h: number } {
    if (!this.iso) {
      const r = this.unit.radius * PX;
      return { x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 };
    }
    return { x: this.x - this.bodyW / 2, y: this.y - this.bodyH, w: this.bodyW, h: this.bodyH };
  }

  /** 畫面空間的點選判定：身體長方形＋腳下橢圓（topdown 為圓形） */
  hitTest(px: number, py: number): boolean {
    if (!this.container.visible) return false;
    const r = this.unit.radius;
    if (!this.iso) return Math.hypot(px - this.x, py - this.y) <= (r + 0.25) * PX;
    const b = this.bodyBounds();
    const pad = 3;
    if (px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad) return true;
    // 腳下橢圓：半軸 = 投影後的圓（r + 容許值）
    const rr = r + 0.2;
    const ax = (rr * ISO.tileW) / Math.SQRT2;
    const ay = (rr * ISO.tileH) / Math.SQRT2;
    const dx = (px - this.x) / ax;
    const dy = (py - this.y) / ay;
    return dx * dx + dy * dy <= 1;
  }

  /** 被遮擋時的輪廓 */
  drawOutline(g: Phaser.GameObjects.Graphics): void {
    const b = this.bodyBounds();
    const c = this.unit.def.color;
    g.fillStyle(c, VISUAL.occludedAlpha);
    g.fillRect(b.x, b.y, b.w, b.h);
    g.lineStyle(2, 0xffffff, VISUAL.occludedAlpha + 0.25);
    g.strokeRect(b.x, b.y, b.w, b.h);
  }

  setConcealment(c: Concealment): void {
    if (c === this.concealment) return;
    this.concealment = c;
    this.container.setVisible(c !== 'hidden');
    if (!this.unit.dead) this.container.setAlpha(c === 'concealed' ? 0.5 : 1);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  destroy(): void {
    this.container.destroy();
  }
}

import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import type { Vec } from '../../sim/math';
import type { Unit } from '../../sim/unit';
import { displayFacing, flareDir } from './art';
import { COLORS } from './palette';
import { H3D, H3D_SHEETS, h3dCharFor, h3dKey } from './heroes3d';
import { h3dFrame, hitDuration } from './heroes3dAnim';
import { depthOf, groundAxes, groundCirclePoints, heightPx, worldToScreen } from './projection';
import type { Concealment, UnitVisual } from './unitView';
import { DEAD_DEPTH, OBJECT_DEPTH_BASE } from './unitView';
import { VISUAL, unitHeight } from './visual';


/**
 * 自製 3D 預渲染英雄的外觀（美術試裝 heroes3d）。
 * - 每個動作一張 spritesheet：影格編號 = 方向列 × 影格數 + 影格
 * - 錨點 = 素材的腳底原點 (96, 135)；縮放 = config.heroes3dScale × 角色倍率
 * - 動作節奏見 heroes3dAnim.ts
 */
export class Hero3DView implements UnitVisual {
  readonly container: Phaser.GameObjects.Container;
  private ring: Phaser.GameObjects.Graphics;
  private sprite: Phaser.GameObjects.Sprite;
  private char: string;
  private concealment: Concealment = 'normal';
  readonly height: number;
  private readonly bodyW: number;
  private readonly bodyH: number;
  private dir = 6;
  private deathAnim = 'death';
  private deathStart = -1;
  private hitStart = -1;
  private hitUntil = -1;
  private lastHitFrom: Vec | null = null;
  private shownKey = '';
  private shownIdx = -1;
  x = 0;
  y = 0;
  wx = 0;
  wy = 0;

  constructor(scene: Phaser.Scene, readonly unit: Unit) {
    this.height = unitHeight(unit.def);
    this.char = h3dCharFor(unit.def.id)!;
    this.ring = scene.add.graphics();
    this.sprite = scene.add.sprite(0, 0, h3dKey(this.char, 'idle'), 0);
    this.applyChar();
    this.bodyW = unit.radius * groundAxes(1).x * Math.SQRT2 * 1.1 * VISUAL.unitScale;
    this.bodyH = heightPx(this.height);
    this.container = scene.add.container(0, 0, [this.ring, this.sprite]);
    this.container.setDepth(OBJECT_DEPTH_BASE);
    this.dir = flareDir(unit.facing);
  }

  /** 錨點與縮放（換角色外觀時重設） */
  private applyChar(): void {
    const s = H3D_SHEETS[this.char];
    this.sprite.setOrigin(s.origin[0] / s.cell, s.origin[1] / s.cell);
    this.sprite.setScale(GAME_CONFIG.heroes3dScale * (H3D.scaleMul[this.char] ?? 1) * VISUAL.unitScale);
  }

  onHit(simTime: number, from?: Vec): void {
    this.hitStart = simTime;
    this.hitUntil = simTime + hitDuration(this.char);
    if (from) this.lastHitFrom = { ...from };
  }

  /** 死亡方向：最後一擊來自前方 → 往後倒（death_back）；否則往前倒（death） */
  private chooseDeath(): string {
    const u = this.unit;
    if (!this.lastHitFrom) return u.id % 2 === 0 ? 'death' : 'death_back';
    const a = Math.atan2(this.lastHitFrom.y - u.pos.y, this.lastHitFrom.x - u.pos.x);
    const d = Math.abs(Math.atan2(Math.sin(a - u.facing), Math.cos(a - u.facing)));
    return d < Math.PI / 2 ? 'death_back' : 'death';
  }

  update(alpha: number, selected: boolean, hovered: boolean, simTime = 0): void {
    const u = this.unit;
    const want = h3dCharFor(u.def.id);
    if (want && want !== this.char) {
      this.char = want;
      this.applyChar();
    }
    this.wx = u.prevPos.x + (u.pos.x - u.prevPos.x) * alpha;
    this.wy = u.prevPos.y + (u.pos.y - u.prevPos.y) * alpha;
    const p = worldToScreen(this.wx, this.wy);
    this.x = p.x;
    this.y = p.y;
    this.container.setPosition(this.x, this.y);
    this.container.setDepth(u.dead ? DEAD_DEPTH : OBJECT_DEPTH_BASE + depthOf(this.wx, this.wy));
    if (u.dead && this.deathStart < 0) {
      this.deathStart = u.corpse ? simTime - 60 : simTime;
      this.deathAnim = this.chooseDeath();
    } else if (!u.dead) this.deathStart = -1;
    if (!u.dead) this.dir = flareDir(displayFacing(u.facing));
    const a = u.action;
    const { anim, frame } = h3dFrame(this.char, {
      simTime,
      dead: u.dead,
      deathAnim: this.deathAnim,
      deathStart: this.deathStart,
      action: a ? { kind: a.kind, skillId: a.skillId, phase: a.phase, progress: u.actionProgress } : undefined,
      stunned: u.stunTime > 0,
      hitStart: this.hitStart,
      hitUntil: this.hitUntil,
      moving: u.movedThisTick,
    });
    const n = H3D_SHEETS[this.char].anims[anim]?.frames ?? 1;
    const key = h3dKey(this.char, anim);
    const idx = this.dir * n + frame;
    if (key !== this.shownKey || idx !== this.shownIdx) {
      this.sprite.setTexture(key, idx);
      this.shownKey = key;
      this.shownIdx = idx;
    }
    // 腳下：選取／滑過時的橢圓；平時一個淡淡的影子
    this.ring.clear();
    if (u.dead) return;
    const o = worldToScreen(0, 0);
    const pts = groundCirclePoints(0, 0, u.radius + (selected || hovered ? 0.15 : 0), 0, Math.PI * 2, 28).map((q) => new Phaser.Math.Vector2(q.x - o.x, q.y - o.y));
    this.ring.fillStyle(0x000000, 0.28);
    this.ring.fillPoints(pts, true);
    if (selected || hovered) {
      this.ring.lineStyle(selected ? 2.5 : 1.5, selected ? COLORS.selection : u.def.color, selected ? 1 : 0.7);
    } else this.ring.lineStyle(1.5, u.def.color, 0.55);
    this.ring.strokePoints(pts, true);
  }

  head(): { x: number; y: number } {
    const p = worldToScreen(this.wx, this.wy, this.height + VISUAL.headClearance);
    return { x: p.x, y: p.y };
  }

  bodyBounds(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - this.bodyW / 2, y: this.y - this.bodyH, w: this.bodyW, h: this.bodyH };
  }

  hitTest(px: number, py: number): boolean {
    if (!this.container.visible) return false;
    const b = this.bodyBounds();
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return true;
    const rr = this.unit.radius + 0.2;
    const { x: ax, y: ay } = groundAxes(rr);
    const dx = (px - this.x) / ax;
    const dy = (py - this.y) / ay;
    return dx * dx + dy * dy <= 1;
  }

  drawOutline(g: Phaser.GameObjects.Graphics): void {
    const b = this.bodyBounds();
    g.fillStyle(this.unit.def.color, VISUAL.occludedAlpha);
    g.fillRoundedRect(b.x, b.y, b.w, b.h, 6);
    g.lineStyle(2, 0xffffff, VISUAL.occludedAlpha + 0.25);
    g.strokeRoundedRect(b.x, b.y, b.w, b.h, 6);
  }

  setConcealment(c: Concealment): void {
    if (c === this.concealment) return;
    this.concealment = c;
    this.container.setVisible(c !== 'hidden');
    this.container.setAlpha(c === 'concealed' ? 0.5 : 1);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  destroy(): void {
    this.container.destroy();
  }
}

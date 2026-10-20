/**
 * 2D 像素單位的外觀（素材與動作計算見 pixelArtData.ts）。
 * - mw：3 方向（側面／正面／背面，朝左鏡像）× 待機／移動／攻擊／倒地。
 * - m72：只有待機／移動（朝右，朝左鏡像）；攻擊用「往前衝一下＋閃白」代替，倒下時躺平變暗。
 * 被打中時閃白。腳下的圈、生命條位置與其他外觀共用 UnitVisual 介面。
 */
import Phaser from 'phaser';
import type { Unit } from '../../sim/unit';
import { displayFacing } from './art';
import { COLORS } from './palette';
import { artKey, m72Key } from './pixelArt';
import type { PixelUnitArt } from './pixelArtData';
import { PIXEL, facingBlock, m72Lunge, mwAnim, mwFrame } from './pixelArtData';
import { depthOf, groundAxes, groundCirclePoints, heightPx, worldToScreen } from './projection';
import type { Concealment, UnitVisual } from './unitView';
import { DEAD_DEPTH, OBJECT_DEPTH_BASE } from './unitView';
import { VISUAL } from './visual';

export class PixelView implements UnitVisual {
  readonly container: Phaser.GameObjects.Container;
  private ring: Phaser.GameObjects.Graphics;
  private sprite: Phaser.GameObjects.Sprite;
  private concealment: Concealment = 'normal';
  /** 身高（公尺）：依素材實際高度換算，頭頂生命條放在這裡 */
  readonly height: number;
  private readonly bodyW: number;
  private readonly bodyH: number;
  private block = 1;
  private flip = false;
  private deathStart = -1;
  private hitUntil = -1;
  x = 0;
  y = 0;
  wx = 0;
  wy = 0;

  constructor(
    scene: Phaser.Scene,
    readonly unit: Unit,
    private readonly art: PixelUnitArt,
  ) {
    const s = PIXEL.unitScale;
    this.ring = scene.add.graphics();
    if (art.kind === 'mw') {
      this.sprite = scene.add.sprite(0, 0, artKey(art), mwFrame(1, 0, 0)).setOrigin(0.5, PIXEL.mwFootY);
      this.bodyH = PIXEL.mwBodyPx * s;
    } else {
      this.sprite = scene.add.sprite(0, 0, m72Key(`${art.idle}_f0`)).setOrigin(0.5, 1);
      this.bodyH = this.sprite.height * s;
    }
    this.sprite.setScale(s);
    this.height = this.bodyH / heightPx(1);
    this.bodyW = Math.max(unit.radius * groundAxes(1).x * 2, 12 * s);
    this.container = scene.add.container(0, 0, [this.ring, this.sprite]);
    this.container.setDepth(OBJECT_DEPTH_BASE);
  }

  onHit(simTime: number): void {
    this.hitUntil = simTime + PIXEL.hitFlashSec;
  }

  update(alpha: number, selected: boolean, hovered: boolean, simTime = 0): void {
    const u = this.unit;
    this.wx = u.prevPos.x + (u.pos.x - u.prevPos.x) * alpha;
    this.wy = u.prevPos.y + (u.pos.y - u.prevPos.y) * alpha;
    const p = worldToScreen(this.wx, this.wy);
    this.x = p.x;
    this.y = p.y;
    this.container.setPosition(this.x, this.y);
    this.container.setDepth(u.dead ? DEAD_DEPTH : OBJECT_DEPTH_BASE + depthOf(this.wx, this.wy));
    if (u.dead && this.deathStart < 0) this.deathStart = simTime;
    else if (!u.dead) this.deathStart = -1;

    // 面向：世界方向投影到畫面後決定側面／正面／背面
    let fsx = 0;
    let fsy = 0;
    if (!u.dead) {
      const f = displayFacing(u.facing);
      const o = worldToScreen(0, 0);
      const q = worldToScreen(Math.cos(f), Math.sin(f));
      fsx = q.x - o.x;
      fsy = q.y - o.y;
      const fb = facingBlock(fsx, fsy);
      this.block = fb.block;
      this.flip = fb.flip;
    }
    const a = u.action;
    const act = a ? { phase: a.phase, progress: u.actionProgress } : undefined;
    let flash = simTime < this.hitUntil;
    this.sprite.setPosition(0, 0).setAngle(0);
    if (this.art.kind === 'mw') {
      const { action, frame } = mwAnim({ time: simTime, dead: u.dead, deathStart: this.deathStart, moving: u.movedThisTick, action: act });
      this.sprite.setFrame(mwFrame(this.block, action, frame));
      this.sprite.setFlipX(this.flip);
    } else {
      const art = this.art;
      const anim = u.movedThisTick && !u.dead ? art.run : art.idle;
      const fps = u.movedThisTick ? PIXEL.moveFps : PIXEL.idleFps;
      // 沒有倒地動作：陣亡後固定用待機的第一格（躺平），不再播動畫
      const frame = u.dead ? 0 : Math.floor(simTime * fps) % art.frames;
      this.sprite.setTexture(m72Key(`${anim}_f${frame}`));
      // 只有朝右的圖：往左時鏡像
      this.sprite.setFlipX(fsx < 0 || (fsx === 0 && this.flip));
      if (u.dead) {
        this.sprite.setAngle(this.flip ? -90 : 90);
      } else {
        const l = m72Lunge(act);
        if (l.push > 0) {
          const len = Math.hypot(fsx, fsy) || 1;
          const d = PIXEL.lungePx * PIXEL.unitScale * l.push;
          this.sprite.setPosition((fsx / len) * d, (fsy / len) * d);
        }
        flash ||= l.flash;
      }
    }
    if (flash && !u.dead) this.sprite.setTintFill(0xffffff);
    else this.sprite.clearTint();
    this.sprite.setAlpha(u.dead ? 0.6 : 1);

    // 腳下：選取／滑過時的橢圓；平時一個淡淡的影子
    this.ring.clear();
    if (u.dead) return;
    const o = worldToScreen(0, 0);
    const pts = groundCirclePoints(0, 0, u.radius + (selected || hovered ? 0.15 : 0), 0, Math.PI * 2, 28).map((q) => new Phaser.Math.Vector2(q.x - o.x, q.y - o.y));
    this.ring.fillStyle(0x000000, 0.22);
    this.ring.fillPoints(pts, true);
    if (selected || hovered) this.ring.lineStyle(selected ? 2.5 : 1.5, selected ? COLORS.selection : u.def.color, selected ? 1 : 0.7);
    else this.ring.lineStyle(1.5, u.def.color, 0.5);
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
    const { x: ax, y: ay } = groundAxes(this.unit.radius + 0.2);
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

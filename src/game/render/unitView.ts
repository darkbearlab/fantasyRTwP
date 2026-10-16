import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import type { Unit } from '../../sim/unit';
import { COLORS, FONT, darken } from './palette';

const PX = GAME_CONFIG.pxPerMeter;

/** normal：一般；brush：在草叢裡但敵人看得到；concealed：我方躲在草叢中（半透明）；hidden：對我方隱藏的敵人 */
export type Concealment = 'normal' | 'brush' | 'concealed' | 'hidden';

/** 單位的占位外觀：圓形色塊＋字母＋面向短線 */
export class UnitView {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private facing: Phaser.GameObjects.Graphics;
  private letter: Phaser.GameObjects.Text;
  private wasDead = false;
  private concealment: Concealment = 'normal';
  x = 0;
  y = 0;

  constructor(scene: Phaser.Scene, readonly unit: Unit) {
    const r = unit.radius * PX;
    this.ring = scene.add.graphics();
    this.body = scene.add.graphics();
    this.drawBody(false);
    this.facing = scene.add.graphics();
    this.facing.lineStyle(3, 0xffffff, 0.9);
    this.facing.lineBetween(r * 0.55, 0, r + 5, 0);
    this.letter = scene.add
      .text(0, 0, unit.def.letter, { fontFamily: FONT, fontSize: `${Math.round(r * 1.1)}px`, color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.letter.setStroke('#000000', 3);
    this.container = scene.add.container(0, 0, [this.ring, this.body, this.facing, this.letter]);
    this.container.setDepth(10);
  }

  private drawBody(dead: boolean): void {
    const r = this.unit.radius * PX;
    const c = dead ? 0x444444 : this.unit.def.color;
    this.body.clear();
    this.body.fillStyle(c, 1);
    this.body.fillCircle(0, 0, r);
    this.body.lineStyle(2, darken(c, 0.5), 1);
    this.body.strokeCircle(0, 0, r);
  }

  update(alpha: number, selected: boolean, hovered: boolean): void {
    const u = this.unit;
    this.x = (u.prevPos.x + (u.pos.x - u.prevPos.x) * alpha) * PX;
    this.y = (u.prevPos.y + (u.pos.y - u.prevPos.y) * alpha) * PX;
    this.container.setPosition(this.x, this.y);
    if (u.dead !== this.wasDead) {
      this.wasDead = u.dead;
      this.drawBody(u.dead);
      this.facing.setVisible(!u.dead);
      this.container.setAlpha(u.dead ? 0.45 : 1);
      this.container.setDepth(u.dead ? 5 : 10);
      this.letter.setText(u.dead ? '✕' : u.def.letter);
    }
    this.facing.setRotation(u.facing);
    const r = u.radius * PX;
    this.ring.clear();
    if (!u.dead && selected) {
      this.ring.lineStyle(3, COLORS.selection, 1);
      this.ring.strokeCircle(0, 0, r + 4);
    } else if (!u.dead && hovered) {
      this.ring.lineStyle(2, COLORS.selection, 0.5);
      this.ring.strokeCircle(0, 0, r + 4);
    }
  }

  setConcealment(c: Concealment): void {
    if (c === this.concealment) return;
    this.concealment = c;
    this.container.setVisible(c !== 'hidden');
    if (!this.unit.dead) this.container.setAlpha(c === 'concealed' ? 0.5 : 1);
  }

  destroy(): void {
    this.container.destroy();
  }
}

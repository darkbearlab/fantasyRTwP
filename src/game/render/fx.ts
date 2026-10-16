import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import type { Vec } from '../../sim/math';
import { FONT } from './palette';

const PX = GAME_CONFIG.pxPerMeter;

/** 飄字、閃光等一次性特效（以真實時間播放，暫停時也會播完） */
export class Fx {
  constructor(private scene: Phaser.Scene) {}

  text(p: Vec, text: string, color: string, size = 16, rise = 34, dur = 900): void {
    const t = this.scene.add
      .text(p.x * PX + Phaser.Math.Between(-6, 6), p.y * PX - 18, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(50);
    t.setStroke('#000000', 4);
    this.scene.tweens.add({
      targets: t,
      y: t.y - rise,
      alpha: { from: 1, to: 0 },
      ease: 'Cubic.easeOut',
      duration: dur,
      onComplete: () => t.destroy(),
    });
  }

  ring(p: Vec, radiusM: number, color: number, dur = 450, from = 0.3, width = 4): void {
    const g = this.scene.add.graphics().setDepth(45);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: dur,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        g.clear();
        const r = radiusM * PX * (from + (1 - from) * state.t);
        g.lineStyle(width, color, 1 - state.t);
        g.strokeCircle(p.x * PX, p.y * PX, r);
      },
      onComplete: () => g.destroy(),
    });
  }

  burst(p: Vec, radiusM: number, color: number, dur = 500): void {
    const g = this.scene.add.graphics().setDepth(44);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: dur,
      onUpdate: () => {
        g.clear();
        g.fillStyle(color, 0.55 * (1 - state.t));
        g.fillCircle(p.x * PX, p.y * PX, radiusM * PX * (0.6 + 0.4 * state.t));
      },
      onComplete: () => g.destroy(),
    });
  }

  /** 打斷：白黃色衝擊環＋大字 */
  interrupt(p: Vec): void {
    this.ring(p, 1.6, 0xfff27a, 500, 0.2, 6);
    this.ring(p, 1.0, 0xffffff, 350, 0.1, 3);
    this.text(p, '打斷！', '#fff27a', 24, 44, 1200);
  }

  /** 範圍法術被打斷：預警圈碎裂 */
  shatter(p: Vec, radiusM: number): void {
    const g = this.scene.add.graphics().setDepth(44);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: 700,
      onUpdate: () => {
        g.clear();
        const a = 1 - state.t;
        g.lineStyle(4, 0xffffff, a);
        const r = radiusM * PX * (1 + state.t * 0.3);
        for (let i = 0; i < 8; i++) {
          const a0 = (i / 8) * Math.PI * 2 + state.t * 0.6;
          const a1 = a0 + Math.PI / 10;
          g.beginPath();
          g.arc(p.x * PX, p.y * PX, r, a0, a1);
          g.strokePath();
        }
      },
      onComplete: () => g.destroy(),
    });
  }
}

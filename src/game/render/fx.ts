import Phaser from 'phaser';
import type { Vec } from '../../sim/math';
import { FONT } from './palette';
import { groundArc, groundCircle, worldToScreen } from './projection';
import type { VfxUse } from './vfxData';
import { VFX_SHEETS, vfxKey } from './vfxData';

/** 飄字的預設高度（公尺）：大約在頭頂 */
const TEXT_Z = 2.0;

/** 飄字、閃光等一次性特效（以真實時間播放，暫停時也會播完） */
export class Fx {
  constructor(private scene: Phaser.Scene) {}

  /** p：世界座標；z：高度（公尺，預設在頭頂附近） */
  text(p: Vec, text: string, color: string, size = 16, rise = 34, dur = 900, z = TEXT_Z): void {
    const sp = worldToScreen(p.x, p.y, z);
    const t = this.scene.add
      .text(sp.x + Phaser.Math.Between(-6, 6), sp.y - 18, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(2050);
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
    const g = this.scene.add.graphics().setDepth(8);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: dur,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        g.clear();
        const r = radiusM * (from + (1 - from) * state.t);
        groundCircle(g, p.x, p.y, r, { stroke: color, strokeAlpha: 1 - state.t, width });
      },
      onComplete: () => g.destroy(),
    });
  }

  burst(p: Vec, radiusM: number, color: number, dur = 500): void {
    const g = this.scene.add.graphics().setDepth(7);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: dur,
      onUpdate: () => {
        g.clear();
        groundCircle(g, p.x, p.y, radiusM * (0.6 + 0.4 * state.t), { fill: color, fillAlpha: 0.55 * (1 - state.t) });
      },
      onComplete: () => g.destroy(),
    });
  }

  /**
   * 逐格特效（vfxData.ts）：在世界座標 p 播一次就消失。沒有載入素材時略過。
   * z：高度（公尺）；delay：每一個之間錯開的毫秒。
   */
  vfx(p: Vec, uses: VfxUse[], z = 0.4, delay = 60): void {
    const sp = worldToScreen(p.x, p.y, z);
    const o = worldToScreen(0, 0);
    const e = worldToScreen(1, 0);
    const pxPerM = Math.hypot(e.x - o.x, e.y - o.y) || 32;
    uses.forEach((u, k) => {
      const sheet = VFX_SHEETS[u.id];
      if (!sheet || !this.scene.textures.exists(vfxKey(u.id, 0))) return;
      const anim = `vfx_${u.id}`;
      if (!this.scene.anims.exists(anim))
        this.scene.anims.create({ key: anim, frames: Array.from({ length: sheet.frames }, (_, i) => ({ key: vfxKey(u.id, i) })), frameRate: u.fps ?? 14 });
      const play = () => {
        const s = this.scene.add.sprite(sp.x, sp.y, vfxKey(u.id, 0)).setDepth(2040);
        s.setScale((u.sizeM * pxPerM) / sheet.w);
        if (u.tint !== undefined) s.setTint(u.tint);
        s.play(anim);
        s.once('animationcomplete', () => s.destroy());
      };
      if (k === 0 || delay <= 0) play();
      else this.scene.time.delayedCall(k * delay, play);
    });
  }

  /** 兩點之間的一條線，漸漸淡掉（吸血的紅線） */
  line(a: Vec, b: Vec, color: number, dur = 500): void {
    const g = this.scene.add.graphics().setDepth(2035);
    const pa = worldToScreen(a.x, a.y, 0.9);
    const pb = worldToScreen(b.x, b.y, 0.9);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: dur,
      onUpdate: () => {
        g.clear();
        g.lineStyle(4, color, 1 - state.t);
        g.lineBetween(pa.x, pa.y, pb.x, pb.y);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** 打斷：白黃色衝擊環＋大字 */
  interrupt(p: Vec, z = TEXT_Z): void {
    this.ring(p, 1.6, 0xfff27a, 500, 0.2, 6);
    this.ring(p, 1.0, 0xffffff, 350, 0.1, 3);
    this.text(p, '打斷！', '#fff27a', 24, 44, 1200, z);
  }

  /** 範圍法術被打斷：預警圈碎裂 */
  shatter(p: Vec, radiusM: number): void {
    const g = this.scene.add.graphics().setDepth(8);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: 700,
      onUpdate: () => {
        g.clear();
        const a = 1 - state.t;
        const r = radiusM * (1 + state.t * 0.3);
        for (let i = 0; i < 8; i++) {
          const a0 = (i / 8) * Math.PI * 2 + state.t * 0.6;
          groundArc(g, p.x, p.y, r, a0, a0 + Math.PI / 10, { stroke: 0xffffff, strokeAlpha: a, width: 4 });
        }
      },
      onComplete: () => g.destroy(),
    });
  }
}

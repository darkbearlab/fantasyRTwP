import { tr } from '../../i18n';
import Phaser from 'phaser';
import type { Vec } from '../../sim/math';
import { FONT } from './palette';
import { PIXEL_FONT, pixelSize } from '../fonts';
import { groundArc, groundCircle, worldToScreen } from './projection';
import type { VfxUse } from './vfxData';
import { VFX_SHEETS, vfxKey } from './vfxData';
import { VISUAL } from './visual';

export type BloodKind = 'hit' | 'melee' | 'projectile' | 'spell' | 'area';

/** 飄字的預設高度（公尺）：大約在頭頂 */
const TEXT_Z = 2.0;

/** 飄字、閃光等一次性特效（以真實時間播放，暫停時也會播完） */
export class Fx {
  constructor(private scene: Phaser.Scene) {}

  /** p：世界座標；z：高度（公尺，預設在頭頂附近） */
  text(p: Vec, text: string, color: string, size = 16, rise = 34, dur = 900, z = TEXT_Z): void {
    const sp = worldToScreen(p.x, p.y, z);
    // 沒有中文的字（數字、英文）一律用 Alagard：16 的整數倍、至少 16，座標取整數；有中文的照舊
    const px = /[一-鿿]/.test(text) ? null : pixelSize(Math.max(16, size));
    const t = this.scene.add
      .text(Math.round(sp.x + Phaser.Math.Between(-6, 6)), Math.round(sp.y - 18), text, {
        fontFamily: px ? PIXEL_FONT : FONT,
        fontSize: `${px ?? size}px`,
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

  /**
   * 血跡（Alan 2026-10-25）：p 是受傷者的位置、from 是打過來的位置（決定往哪邊噴）。
   * 每一滴都是背景像素大小的方塊，位置對齊背景的像素格；飛行中畫在角色上方，落地後留在地上一陣子再淡出。
   * open(x, y)：這一點可以有血跡嗎（Alan 2026-10-25：不噴到建築等地形上、不噴出地圖）；飛到不行的地方就停在邊緣。
   */
  blood(p: Vec, kind: BloodKind, from?: Vec, open: (x: number, y: number) => boolean = () => true): void {
    const B = VISUAL.blood;
    const cfg = kind === 'hit' ? B.hit : B.death[kind];
    const rnd = (r: readonly number[]) => r[0] + Math.random() * (r[1] - r[0]);
    const k = B.artPx;
    const snap = (v: number) => Math.round(v / k) * k;
    // 往打過來的反方向噴；沒有方向時隨機
    const away = from ? Math.atan2(p.y - from.y, p.x - from.x) : Math.random() * Math.PI * 2;
    const drops = Array.from({ length: Math.round(rnd(cfg.count)) }, () => {
      const a = away + ((Math.random() - 0.5) * cfg.spread * Math.PI) / 180;
      const v = rnd(cfg.speed);
      return {
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: rnd(cfg.up),
        size: Math.round(rnd(cfg.size)) * k,
        color: B.colors[Math.floor(Math.random() * B.colors.length)],
        landT: -1,
        x: p.x,
        y: p.y,
        /** 最後一個可以有血跡的位置（撞到建築或地圖邊緣就停在這裡） */
        cx: p.x,
        cy: p.y,
      };
    });
    // 地上一灘（陣亡）：落在腳下附近、不飛
    const pool = kind === 'hit' ? 0 : B.death[kind].pool;
    for (let i = 0; i < pool; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.35;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      if (open(x, y)) drops.push({ vx: 0, vy: 0, vz: 0, size: 2 * k, color: B.colors[2], landT: 0, x, y, cx: x, cy: y });
    }
    const air = this.scene.add.graphics().setDepth(1100);
    const ground = this.scene.add.graphics().setDepth(4);
    const total = B.linger + B.fade;
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: total,
      duration: total,
      onUpdate: () => {
        const s = state.t / 1000;
        air.clear();
        ground.clear();
        const fade = state.t > B.linger ? 1 - (state.t - B.linger) / B.fade : 1;
        for (const d of drops) {
          let z = 0;
          if (d.landT < 0) {
            z = B.z + d.vz * s - (B.gravity * s * s) / 2;
            const wx = d.x + d.vx * s;
            const wy = d.y + d.vy * s;
            // 撞到建築、地形或地圖邊緣：停在最後一個可以的位置落下
            if (open(wx, wy)) {
              d.cx = wx;
              d.cy = wy;
            } else z = 0;
            if (z <= 0) d.landT = s;
          }
          const sp = worldToScreen(d.cx, d.cy, Math.max(0, z));
          const g = d.landT >= 0 ? ground : air;
          g.fillStyle(d.color, d.landT >= 0 ? 0.85 * fade : 1);
          g.fillRect(snap(sp.x - d.size / 2), snap(sp.y - d.size / 2), d.size, d.size);
        }
      },
      onComplete: () => {
        air.destroy();
        ground.destroy();
      },
    });
    const mist = kind === 'hit' ? 0 : B.death[kind].mist;
    if (mist > 0) this.bloodMist(p, mist, open);
  }

  /** 血霧：一團一團從身上往外擴散、變淡（也是對齊像素格的方塊） */
  private bloodMist(p: Vec, puffs: number, open: (x: number, y: number) => boolean): void {
    const M = VISUAL.blood.mist;
    const k = VISUAL.blood.artPx;
    const snap = (v: number) => Math.round(v / k) * k;
    const g = this.scene.add.graphics().setDepth(1100);
    const parts = Array.from({ length: puffs }, () => ({
      a: Math.random() * Math.PI * 2,
      r: M.radius * (0.4 + Math.random() * 0.6),
      z: 0.4 + Math.random() * 0.8,
      size: (M.size[0] + Math.floor(Math.random() * (M.size[1] - M.size[0] + 1))) * k,
      color: VISUAL.blood.colors[Math.floor(Math.random() * VISUAL.blood.colors.length)],
    }));
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: M.dur,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        g.clear();
        for (const q of parts) {
          const wx = p.x + Math.cos(q.a) * q.r * state.t;
          const wy = p.y + Math.sin(q.a) * q.r * state.t;
          if (!open(wx, wy)) continue;
          const sp = worldToScreen(wx, wy, q.z + 0.3 * state.t);
          g.fillStyle(q.color, M.alpha * (1 - state.t));
          g.fillRect(snap(sp.x - q.size / 2), snap(sp.y - q.size / 2), q.size, q.size);
        }
      },
      onComplete: () => g.destroy(),
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
    this.text(p, tr("打斷！"), '#fff27a', 24, 44, 1200, z);
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

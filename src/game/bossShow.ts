/**
 * 頭目演出（Alan 2026-10-21）：
 * - 登場：頭目第一次進入視線（sim 的 bossSighted；迷霧在 sim 那邊暫時解開）→ 遊戲暫停、鏡頭帶到頭目身上；
 *   畫面上方的頭目血條先從左往右把槽拉滿，槽滿了血才逐漸填滿，期間頭目喊話；填滿後鏡頭回到原本的位置，遊戲維持暫停。
 * - 擊敗（Alan 2026-10-21 第三版：頓點要更強、更久）：畫面暫停 → 鏡頭移到頭目 → 停 0.8 秒 → 原圖抖一下 → 頓一下
 *   → 變成紅黑雙色 → 停 0.8 秒
 *   → 約 3 秒左右抖動、往下沉、逐漸變透明直到消失，演完才跳勝利畫面。
 * 時間與台詞都在 BOSS_SHOW、BOSS_LINES。
 */
import Phaser from 'phaser';
import type { Unit } from '../sim/unit';
import { worldToScreen } from './render/projection';
import type { BattleSession } from './session';
import { el } from './ui/dom';

export const BOSS_SHOW = {
  /** 鏡頭移動（毫秒） */
  panMs: 600,
  /** 槽從左往右拉滿、血再填滿（毫秒） */
  slotMs: 700,
  fillMs: 1100,
  /** 填滿後多停一下再回鏡頭 */
  holdMs: 700,
  /** 擊敗：鏡頭移過去、原色定格、紅黑定格、抖動下沉變透明（毫秒）；抖動的幅度（px）與頻率（每次換邊的毫秒） */
  defeatPanMs: 500,
  freezeMs: 800,
  /** 轉紅黑之前：原圖抖一下、再頓一下 */
  joltMs: 250,
  joltHoldMs: 500,
  joltPx: 7,
  toneHoldMs: 800,
  sinkMs: 3000,
  shakePx: 5,
  shakeEveryMs: 45,
  /** 紅黑雙色的分界（亮度 0～1）與顏色 */
  twoToneSplit: 0.38,
  red: [200, 24, 30] as [number, number, number],
  black: [16, 6, 8] as [number, number, number],
};

/** 頭目的台詞（依 def.id） */
export const BOSS_LINES: Record<string, { intro: string }> = {
  warlord: { intro: '王都已經是一片灰燼了。你們四個，就跟它一起埋在這裡吧！' },
};

export interface BossShowHost {
  scene: Phaser.Scene;
  session(): BattleSession;
  /** 頭目目前的 sprite（像素美術才有；沒有時跳過紅黑消失的演出） */
  bossSprite(unitId: number): Phaser.GameObjects.Sprite | undefined;
  /** 擊敗演出時把原本的單位外觀藏起來 */
  hideUnit(unitId: number): void;
}

export class BossShow {
  private bar: HTMLElement | null = null;
  private slotEl: HTMLElement | null = null;
  private hpEl: HTMLElement | null = null;
  private bossId = -1;
  /** 血條的顯示比例（登場演出時從 0 填到目前的生命） */
  private shown = 1;
  private filling = false;
  /** 擊敗演出結束的時間（scene 時間，毫秒）；勝利畫面要等到這之後 */
  doneAt = 0;

  constructor(private readonly host: BossShowHost) {
    host.scene.events.once('shutdown', () => this.bar?.remove());
  }

  /** 頭目登場 */
  intro(boss: Unit): void {
    const { scene } = this.host;
    const s = this.host.session();
    this.bossId = boss.id;
    s.setPaused(true, '頭目登場');
    this.buildBar(boss);
    const cam = scene.cameras.main;
    const back = { x: cam.midPoint.x, y: cam.midPoint.y };
    const p = worldToScreen(boss.pos.x, boss.pos.y);
    cam.pan(p.x, p.y, BOSS_SHOW.panMs, 'Sine.easeInOut');
    // 喊話：頭目頭上的對話框
    const line = BOSS_LINES[boss.def.id]?.intro;
    let bubble: Phaser.GameObjects.Text | null = null;
    if (line) {
      const hp = worldToScreen(boss.pos.x, boss.pos.y, 2.6);
      bubble = scene.add
        .text(hp.x, hp.y, line, { fontSize: '15px', color: '#fff1dc', backgroundColor: 'rgba(40,6,8,0.88)', padding: { x: 10, y: 6 }, wordWrap: { width: 300 }, align: 'center' })
        .setOrigin(0.5, 1)
        .setDepth(2950);
    }
    // 槽拉滿 → 血填滿 → 停一下 → 鏡頭回去（遊戲維持暫停）
    this.shown = 0;
    this.slotEl!.style.transition = `width ${BOSS_SHOW.slotMs}ms ease-out`;
    scene.time.delayedCall(BOSS_SHOW.panMs, () => {
      this.slotEl!.style.width = '100%';
      scene.time.delayedCall(BOSS_SHOW.slotMs, () => {
        this.filling = true;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: BOSS_SHOW.fillMs,
          onUpdate: (tw) => (this.shown = tw.getValue() ?? 1),
          onComplete: () => {
            this.filling = false;
            this.shown = 1;
            scene.time.delayedCall(BOSS_SHOW.holdMs, () => {
              bubble?.destroy();
              cam.pan(back.x, back.y, BOSS_SHOW.panMs, 'Sine.easeInOut');
            });
          },
        });
      });
    });
  }

  private buildBar(boss: Unit): void {
    if (this.bar) return;
    const bar = el('div', 'boss-bar');
    bar.appendChild(el('div', 'boss-name', boss.def.name));
    const slot = el('div', 'boss-slot');
    const hp = el('div', 'boss-hp');
    slot.appendChild(hp);
    bar.appendChild(slot);
    document.getElementById('ui')!.appendChild(bar);
    this.bar = bar;
    this.slotEl = slot;
    this.hpEl = hp;
  }

  /** 每幀：血條跟著頭目的生命 */
  update(): void {
    if (!this.bar || this.bossId < 0) return;
    const u = this.host.session().world.getUnit(this.bossId);
    if (!u) return;
    const frac = Math.max(0, u.hp) / u.maxHp;
    const show = this.filling || this.shown < 1 ? Math.min(frac, this.shown) : frac;
    this.hpEl!.style.width = `${show * 100}%`;
  }

  /** 頭目被擊敗：暫停 → 鏡頭帶過去 → 原色定格 → 紅黑定格 → 抖動下沉變透明，回傳演出長度（毫秒） */
  defeat(boss: Unit): number {
    const { scene } = this.host;
    const B = BOSS_SHOW;
    const total = B.defeatPanMs + B.freezeMs + B.joltMs + B.joltHoldMs + B.toneHoldMs + B.sinkMs + 200;
    this.doneAt = scene.time.now + total;
    this.bar?.classList.add('defeated');
    this.host.session().setPaused(true, '頭目擊敗');
    // 鏡頭帶到頭目身上（倒下的地方可能在畫面外）
    const p = worldToScreen(boss.pos.x, boss.pos.y);
    scene.cameras.main.pan(p.x, p.y, B.defeatPanMs, 'Sine.easeOut');
    const sp = this.host.bossSprite(boss.id);
    if (!sp) return total;
    const key = twoToneTexture(scene, sp);
    if (!key) return total;
    this.host.hideUnit(boss.id);
    // 先用原本的樣子定格，之後才換成紅黑雙色
    const img = scene.add
      .image(sp.parentContainer ? sp.parentContainer.x + sp.x : sp.x, sp.parentContainer ? sp.parentContainer.y + sp.y : sp.y, sp.texture.key, sp.frame.name)
      .setOrigin(sp.originX, sp.originY)
      .setScale(sp.scaleX, sp.scaleY)
      .setFlipX(sp.flipX)
      .setDepth(2900);
    const x0 = img.x;
    const y0 = img.y;
    const h = img.height;
    const footFrac = sp.originY;
    // 原圖抖一下（左右快速換邊），停回原位頓一下，再換成紅黑雙色
    const tJolt = B.defeatPanMs + B.freezeMs;
    scene.time.delayedCall(tJolt, () => {
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: B.joltMs,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 1;
          const side = Math.floor(scene.time.now / B.shakeEveryMs) % 2 ? 1 : -1;
          img.x = x0 + side * B.joltPx * (1 - k);
        },
        onComplete: () => (img.x = x0),
      });
    });
    const tTone = tJolt + B.joltMs + B.joltHoldMs;
    scene.time.delayedCall(tTone, () => img.setTexture(key));
    scene.time.delayedCall(tTone + B.toneHoldMs, () => {
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: B.sinkMs,
        ease: 'Sine.easeIn',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 1;
          // 往下沉：裁掉沉進地面的那一段（腳底以下）
          const sunk = h * footFrac * k;
          img.setCrop(0, 0, img.width, Math.max(0, h * footFrac - sunk + (1 - footFrac) * 0));
          img.y = y0 + sunk * img.scaleY;
          const side = Math.floor(scene.time.now / BOSS_SHOW.shakeEveryMs) % 2 ? 1 : -1;
          img.x = x0 + side * B.shakePx * (1 - k * 0.5);
          img.setAlpha(1 - k);
        },
        onComplete: () => img.destroy(),
      });
    });
    return total;
  }
}

/** 把 sprite 目前這一格做成紅黑雙色的貼圖（亮度高於分界＝紅、低於＝黑；透明照舊） */
function twoToneTexture(scene: Phaser.Scene, sp: Phaser.GameObjects.Sprite): string | undefined {
  const fr = sp.frame;
  const src = fr.source.image as CanvasImageSource | undefined;
  if (!src) return undefined;
  const key = `boss_twotone_${sp.texture.key}_${String(fr.name)}`;
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = fr.cutWidth;
  c.height = fr.cutHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const [rr, rg, rb] = BOSS_SHOW.red;
  const [br, bg, bb] = BOSS_SHOW.black;
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] === 0) continue;
    const lum = (0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]) / 255;
    const red = lum > BOSS_SHOW.twoToneSplit;
    d.data[i] = red ? rr : br;
    d.data[i + 1] = red ? rg : bg;
    d.data[i + 2] = red ? rb : bb;
  }
  ctx.putImageData(d, 0, 0);
  scene.textures.addCanvas(key, c);
  return key;
}

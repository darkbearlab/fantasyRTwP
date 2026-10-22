/**
 * 營火對話（Alan 2026-10-20）：休息節點先顯示英雄圍著火堆的畫面，上下兩個對話框輪流說話；
 * 點一下推進，說完（或按略過）才回到休息選單。
 * 英雄用戰鬥中的 sprite（heroes3d 預渲染或 Flare 分層），頭像也直接用 sprite（面向鏡頭、只露上半身）。
 */
import { pixelGlow } from '../render/pixelGlow';
import { tr } from '../../i18n';
import Phaser from 'phaser';
import type { CampfireLine } from '../../run/campfire';
import { HEROES } from '../../sim/data/heroes';
import { FLARE, flareKey, getArt } from '../render/art';
import { artKey, pixelArtFor, portraitSheetUrl } from '../render/pixelArt';
import { MW_IDLE, PIXEL, facingBlock, mwFrame } from '../render/pixelArtData';
import type { FlareAnimMeta } from '../render/art';
import { H3D_SHEETS, h3dCharFor, h3dKey, h3dResolve } from '../render/heroes3d';
import { FONT, hex } from '../render/palette';
import { staticHeroBar } from '../ui/mobileBar';
import type { StaticHeroCard } from '../ui/mobileBar';
import { el, uiRoot } from '../ui/dom';
import { GAME_CONFIG } from '../../config';

export interface CampfireData {
  /** 圍在火堆旁的英雄（欄位與職業） */
  heroes: { slot: number; classId: string }[];
  lines: CampfireLine[];
  /** 底部英雄面板（和戰鬥中一樣的外觀，蓋一層半透明黑色、按不到） */
  cards: StaticHeroCard[];
  slots: number;
  onDone: () => void;
}

/** 畫面設定（只影響這個畫面） */
const CAMP = {
  /** 圍坐英雄的 sprite 倍率（相對於戰鬥中、未乘 unitScale 的大小） */
  heroScale: 1.4,
  /** 頭像裡 sprite 的倍率 */
  portraitScale: 2.4,
  /** 2D 像素 sprite：上面兩個倍率 × 這個值（取整數） */
  pixelPerScale: 2.9,
  /** 頭像框大小（px） */
  portrait: 92,
  boxHeight: 128,
  /** 圍坐英雄在畫面上大約多高（px，排版用） */
  heroHeightPx: 105,
  /** 打字速度（字／秒） */
  typeSpeed: 40,
  idleFps: 8,
};

/** 一名英雄的 sprite（可能是多層） */
interface HeroSprite {
  objs: Phaser.GameObjects.Sprite[];
  setFrame(i: number): void;
}

/** 建立英雄 sprite：dir 是 8 方向（0=西、2=北、4=東、6=南／面向鏡頭） */
function makeHeroSprite(scene: Phaser.Scene, classId: string, x: number, y: number, dir: number, scale: number): HeroSprite | null {
  // 2D 像素：mw sheet 的待機動作（8 方向換成畫面方向後取側面／正面／背面）
  if (getArt() === 'pixel') {
    const art = pixelArtFor(scene, classId);
    if (art?.kind === 'mw') {
      const k = ((dir + 4) % 8) * (Math.PI / 4);
      const { block, flip } = facingBlock(Math.cos(k), Math.sin(k));
      const s = scene.add.sprite(x, y, artKey(art), mwFrame(block, MW_IDLE, 0)).setOrigin(0.5, PIXEL.mwFootY).setFlipX(flip);
      // 像素要整數倍：依原本的倍率換算成最接近的整數
      s.setScale(Math.max(1, Math.round(scale * CAMP.pixelPerScale)));
      return { objs: [s], setFrame: (i) => s.setFrame(mwFrame(block, MW_IDLE, Math.floor(i / 2))) };
    }
    if (!art) return null;
  }
  const char = h3dCharFor(classId);
  if (char && H3D_SHEETS[char]) {
    const sheet = H3D_SHEETS[char];
    const anim = h3dResolve(char, 'idle');
    const key = h3dKey(char, anim);
    if (scene.textures.exists(key)) {
      const n = sheet.anims[anim].frames;
      const s = scene.add.sprite(x, y, key, dir * n).setOrigin(sheet.origin[0] / sheet.cell, sheet.origin[1] / sheet.cell).setScale(scale * GAME_CONFIG.heroes3dScale);
      return { objs: [s], setFrame: (i) => s.setFrame(dir * n + (i % n)) };
    }
  }
  const hero = FLARE.heroes[classId];
  if (!hero) return null;
  const set = FLARE.heroSets[hero.set];
  const layers: { s: Phaser.GameObjects.Sprite; prefix: string; frames: number }[] = [];
  for (const l of hero.layers) {
    const key = flareKey(`${hero.set}_${l}`);
    if (!scene.textures.exists(key)) return null;
    const tex = scene.textures.get(key);
    const anims = ((tex.customData as { anims?: Record<string, FlareAnimMeta> }).anims ?? {}) as Record<string, FlareAnimMeta>;
    const frames = Math.max(1, anims.stance?.frames ?? 1);
    const s = scene.add.sprite(x, y, key, `${l}/stance/0/${dir}`).setScale(scale * (1.8 / set.heightM));
    layers.push({ s, prefix: l, frames });
  }
  return {
    objs: layers.map((l) => l.s),
    setFrame: (i) => {
      for (const l of layers) {
        const name = `${l.prefix}/stance/${i % l.frames}/${dir}`;
        if (l.s.texture.has(name)) l.s.setFrame(name);
      }
    },
  };
}

/** 從 a 看向 b 的 8 方向（Flare 編號） */
function dirToward(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const k = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4));
  return (((k + 4) % 8) + 8) % 8;
}

interface DialogBox {
  root: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  body: Phaser.GameObjects.Text;
  portraitObjs: Phaser.GameObjects.GameObject[];
  maskShape: Phaser.GameObjects.Graphics;
  px: number;
  py: number;
}

export class CampfireScene extends Phaser.Scene {
  private data0!: CampfireData;
  private fireG!: Phaser.GameObjects.Graphics;
  private glowG!: Phaser.GameObjects.Graphics;
  private seated: { slot: number; classId: string; x: number; y: number; top: boolean; sprite: HeroSprite | null; ring: Phaser.GameObjects.Graphics }[] = [];
  private boxes!: { top: DialogBox; bottom: DialogBox };
  private lineIndex = -1;
  private typed = 0;
  private fullText = '';
  private activeBox: DialogBox | null = null;
  private sparks: { x: number; y: number; vy: number; life: number }[] = [];
  private center = { x: 0, y: 0 };
  private skipBtn!: Phaser.GameObjects.Text;
  private finished = false;

  constructor() {
    super('Campfire');
  }

  create(data: CampfireData): void {
    this.data0 = data;
    this.seated = [];
    this.sparks = [];
    this.lineIndex = -1;
    this.finished = false;
    const W = this.scale.width;
    const H = this.scale.height;
    this.cameras.main.setBackgroundColor('#07080c');
    // 底部保留原本的英雄面板（只是外觀，蓋半透明黑色）
    const hud = el('div', 'hud-root mobile');
    hud.appendChild(staticHeroBar(data.cards, data.slots, (id) => (getArt() === 'pixel' ? portraitSheetUrl(this, id) : undefined)));
    uiRoot().appendChild(hud);
    this.events.once('shutdown', () => hud.remove());
    // 版面（Alan）：畫面下方是英雄面板的位置（戰鬥中四張卡片那一塊），對話框與場景只用它以上的區域
    const reserve = W < H ? GAME_CONFIG.hudBottomHeightPortrait : GAME_CONFIG.hudBottomHeight;
    const areaBottom = H - reserve;
    const topBoxY = 12;
    const bottomBoxY = areaBottom - 12 - CAMP.boxHeight;
    // 兩個對話框之間放火堆與英雄：上排英雄的頭不碰到上框，下排英雄的腳不碰到提示列
    const m0 = topBoxY + CAMP.boxHeight + 8;
    const m1 = bottomBoxY - 56;
    const ry = Phaser.Math.Clamp((m1 - m0 - CAMP.heroHeightPx) / 2, 30, 120);
    this.center = { x: W / 2, y: m0 + CAMP.heroHeightPx + ry };
    const c = this.center;

    // 火光照亮的地面
    const ground = this.add.graphics();
    for (let i = 6; i >= 1; i--) {
      ground.fillStyle(0x3a2412, 0.12 + (6 - i) * 0.05);
      ground.fillEllipse(c.x, c.y + 20, (Math.min(W, 520) * 0.95 * i) / 6, (Math.min(W, 520) * 0.5 * i) / 6);
    }
    this.glowG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.fireG = this.add.graphics();

    // 四名英雄：左上、右上、左下、右下，面向火堆
    const rx = Math.min(W * 0.3, 180);
    const seats = [
      { x: c.x - rx, y: c.y - ry, top: true },
      { x: c.x + rx, y: c.y - ry, top: true },
      { x: c.x - rx, y: c.y + ry, top: false },
      { x: c.x + rx, y: c.y + ry, top: false },
    ];
    data.heroes.slice(0, 4).forEach((h, i) => {
      const seat = seats[i];
      const ring = this.add.graphics();
      const sprite = makeHeroSprite(this, h.classId, seat.x, seat.y, dirToward(seat, c), CAMP.heroScale);
      if (!sprite) {
        // 素材沒載入：色塊
        const g = this.add.graphics();
        g.fillStyle(HEROES[h.classId].color, 1);
        g.fillRoundedRect(seat.x - 16, seat.y - 60, 32, 60, 8);
      }
      this.seated.push({ ...h, ...seat, sprite, ring });
    });
    // 前後順序：下面的英雄畫在火堆前面
    for (const s of this.seated) for (const o of s.sprite?.objs ?? []) o.setDepth(s.y > c.y ? 20 : 5);
    this.fireG.setDepth(10);
    this.glowG.setDepth(11);

    this.boxes = { top: this.makeBox(topBoxY), bottom: this.makeBox(bottomBoxY) };
    const by = bottomBoxY - 8;
    this.add.text(14, by, tr("點一下繼續"), { fontFamily: FONT, fontSize: '13px', color: '#b8b8b8' }).setOrigin(0, 1).setDepth(40);
    this.skipBtn = this.add
      .text(W - 14, by, tr("略過 ▶▶"), { fontFamily: FONT, fontSize: '15px', color: '#ffffff', backgroundColor: '#000000', padding: { x: 10, y: 5 } })
      .setOrigin(1, 1)
      .setDepth(40)
      .setInteractive({ useHandCursor: true });
    this.skipBtn.on('pointerdown', () => this.finish());

    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.includes(this.skipBtn)) return;
      this.advance();
    });
    this.time.addEvent({ delay: 1000 / CAMP.idleFps, loop: true, callback: () => this.tickIdle() });
    this.advance();
  }

  private makeBox(y: number): DialogBox {
    const W = this.scale.width;
    const w = Math.min(W - 24, 640);
    const x = (W - w) / 2;
    const root = this.add.container(x, y).setDepth(50);
    const bg = this.add.graphics();
    // 勇者鬥惡龍風格的對話框（Alan 2026-10-22）：黑底、白框、白字
    bg.fillStyle(0x000000, 1);
    bg.fillRoundedRect(0, 0, w, CAMP.boxHeight, 4);
    bg.lineStyle(3, 0xffffff, 1);
    bg.strokeRoundedRect(0, 0, w, CAMP.boxHeight, 4);
    const P = CAMP.portrait;
    const py = (CAMP.boxHeight - P) / 2;
    bg.fillStyle(0x000000, 1);
    bg.fillRoundedRect(py, py, P, P, 4);
    bg.lineStyle(2, 0xffffff, 1);
    bg.strokeRoundedRect(py, py, P, P, 4);
    const name = this.add.text(py * 2 + P, 12, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' });
    const body = this.add.text(py * 2 + P, 38, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', wordWrap: { width: w - P - py * 3 - 4, useAdvancedWrap: true }, lineSpacing: 4 });
    root.add([bg, name, body]);
    root.setAlpha(0);
    const maskShape = this.make.graphics({}, false);
    return { root, name, body, portraitObjs: [], maskShape, px: x + py, py: y + py };
  }

  /** 對話框的頭像：英雄 sprite 面向鏡頭，只露出框內的上半身 */
  private setPortrait(box: DialogBox, classId: string): void {
    for (const o of box.portraitObjs) o.destroy();
    box.portraitObjs = [];
    const P = CAMP.portrait;
    box.maskShape.clear();
    box.maskShape.fillStyle(0xffffff, 1);
    box.maskShape.fillRect(box.px, box.py, P, P);
    const mask = box.maskShape.createGeometryMask();
    // 腳底放在框下方，放大讓頭和胸口落在框裡
    // 預渲染（heroes3d）的頭部比 Flare 高一點：腳底放低一些
    const footY = getArt() === 'pixel' ? P * 1.4 : h3dCharFor(classId) ? P * 2.0 : P * 1.75;
    const sp = makeHeroSprite(this, classId, box.px + P / 2, box.py + footY, 6, CAMP.portraitScale);
    if (!sp) return;
    for (const o of sp.objs) {
      o.setMask(mask).setDepth(51);
      box.portraitObjs.push(o);
    }
  }

  private advance(): void {
    if (this.finished) return;
    // 打字中：先把這句顯示完
    if (this.activeBox && this.typed < this.fullText.length) {
      this.typed = this.fullText.length;
      this.activeBox.body.setText(this.fullText);
      return;
    }
    this.lineIndex++;
    const line = this.data0.lines[this.lineIndex];
    if (!line) {
      this.finish();
      return;
    }
    const who = this.seated.find((s) => s.slot === line.slot);
    const box = who && !who.top ? this.boxes.bottom : this.boxes.top;
    // 另一個框保留上一句，變暗
    for (const b of [this.boxes.top, this.boxes.bottom]) b.root.setAlpha(b === box ? 1 : b.root.alpha > 0 ? 0.45 : 0);
    for (const b of [this.boxes.top, this.boxes.bottom]) for (const o of b.portraitObjs) (o as Phaser.GameObjects.Sprite).setAlpha(b === box ? 1 : 0.45);
    const classId = who?.classId ?? HEROES.warrior.id;
    box.name.setText(HEROES[classId].name).setColor(hex(HEROES[classId].color));
    this.setPortrait(box, classId);
    this.activeBox = box;
    this.fullText = line.text;
    this.typed = 0;
    box.body.setText('');
    // 說話的人腳下亮一圈
    for (const s of this.seated) {
      s.ring.clear();
      if (s.slot === line.slot) {
        s.ring.lineStyle(3, 0xffd76a, 0.85);
        s.ring.strokeEllipse(s.x, s.y, 70, 26);
      }
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const done = this.data0.onDone;
    this.scene.stop();
    done();
  }

  private idleFrame = 0;

  private tickIdle(): void {
    this.idleFrame++;
    for (const s of this.seated) s.sprite?.setFrame(this.idleFrame);
  }

  update(_t: number, dtMs: number): void {
    if (this.activeBox && this.typed < this.fullText.length) {
      this.typed = Math.min(this.fullText.length, this.typed + (CAMP.typeSpeed * dtMs) / 1000);
      this.activeBox.body.setText(this.fullText.slice(0, Math.floor(this.typed)));
    }
    this.drawFire(dtMs / 1000);
  }

  /** 火堆：木柴＋跳動的火焰＋光暈＋往上飄的火星 */
  private drawFire(dt: number): void {
    const now = this.time.now;
    const { x, y } = this.center;
    const g = this.fireG;
    g.clear();
    // 木柴
    g.fillStyle(0x4a2c17, 1);
    g.fillRoundedRect(x - 34, y - 4, 68, 12, 5);
    g.fillStyle(0x5b3720, 1);
    g.fillRoundedRect(x - 26, y + 2, 52, 11, 5);
    // 火焰：幾層三角形，高度隨時間跳動
    const layers: [number, number, number][] = [
      [0xd2400f, 34, 64],
      [0xff7a1a, 26, 50],
      [0xffc14a, 16, 34],
      [0xfff1b0, 8, 18],
    ];
    for (const [color, w, h] of layers) {
      for (let i = -1; i <= 1; i++) {
        const f = 0.75 + 0.25 * Math.sin(now / (90 + i * 23) + i * 1.7 + w);
        const ox = i * w * 0.45;
        g.fillStyle(color, 0.9);
        g.fillTriangle(x + ox - w * 0.5, y, x + ox + w * 0.5, y, x + ox + Math.sin(now / 160 + i) * 4, y - h * f * (i === 0 ? 1 : 0.7));
      }
    }
    // 光暈
    const gl = this.glowG;
    gl.clear();
    const pulse = 0.85 + 0.15 * Math.sin(now / 120);
    // 像素光暈（Alan 2026-10-22）：格子對齊、透明度分階
    pixelGlow(gl, x, y - 18, 200 * pulse, 0xff8a2a, 0.17 * pulse, { cell: 8, bands: 5 });
    // 火星
    if (Math.random() < dt * 10) this.sparks.push({ x: x + (Math.random() - 0.5) * 30, y: y - 20, vy: 30 + Math.random() * 40, life: 1.2 });
    g.fillStyle(0xffc14a, 1);
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparks) {
      s.y -= s.vy * dt;
      s.x += Math.sin(now / 200 + s.vy) * 0.4;
      g.fillStyle(0xffc14a, Math.min(1, s.life));
      g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 3, 3);
    }
  }
}

/**
 * finalbossblues 地形的戰鬥地圖畫面（程序生成的野外、城內；資料在 mapDef.art，格式見 src/run/fbbLevel.ts）。
 * 拼法移植自試產工具 tools/field_render.py、town_render.py（Alan 看過的試產圖）。
 *
 * - 地面（A2 autotile 草地／泥土路／石板街、A5 裝飾、單格石頭、瓦礫、預製件的 ground 層）烘成一張貼圖，原始像素拼好再整數放大。
 * - 會遮住角色的物件（樹、石柱、牆、房子、木箱、路燈…）各自一張圖，依錨點那一列排深度（和角色一起排序）。
 * - 火（營火、屋頂大火、地上小火）是 4 格動畫；煙在最上層；火光用加亮混合的光暈。
 * - 調色（GRADES）：整張地圖蓋一層乘色（夜晚、黃昏）；飽和度在遊戲裡先不做。
 * 需要正角俯視、不壓縮（Alan：取消縱向壓縮；BattleScene 載入這種地圖時把 squash 設成 1）。
 */
import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import { PREFABS } from '../../run/data/prefabs';
import type { FbbArt, FbbLook } from '../../run/fbbLevel';
import type { FieldLevel } from '../../run/fieldGen';
import { tilePrefabs } from '../../run/tilePrefabRegistry';
import type { TilePrefab } from '../../run/tilePrefab';
import type { TownLevel } from '../../run/townGen';
import type { MapDef } from '../../sim/data/types';
import type { FbbSeason } from './fbbArt';
import { fbbKey, fbbReady } from './fbbArt';
import { ANIM_OBJECTS, GRADES, PREFAB_TILES, ROCK_SINGLES, TOWN_TILES, WALL_TILES, wallKey } from './fbbTiles';
import { depthOf, mapScreenBounds, worldToScreen } from './projection';
import { OBJECT_DEPTH_BASE } from './unitView';

const T = 16;
/** 調色層、火光、煙的深度（迷霧 900 之下；角色外框在 875） */
const GRADE_DEPTH = 860;
const LIGHT_DEPTH = 870;
const SMOKE_DEPTH = 880;

const SEASON: Record<FbbLook, FbbSeason> = { summer: 'summer', fallDusk: 'fall', winterOvercast: 'winter', townNight: 'summer' };
const GRADE_OF: Record<FbbLook, string> = { summer: 'summerDay', fallDusk: 'fallDusk', winterOvercast: 'winterOvercast', townNight: 'townNight' };

type Ctx = CanvasRenderingContext2D;

/** 試產工具的設定：石牆拉高半格（Alan 看過兩版還沒決定，先用拉高版） */
export const FBB_VIEW = { tallWalls: true, decorChance: 0.15, burntMul: [0.35, 0.3, 0.3] as [number, number, number] };

export function isFbbMap(map: MapDef): boolean {
  return map.art?.kind === 'fbbField' || map.art?.kind === 'fbbTown';
}

export class FbbMapView {
  readonly objects: Phaser.GameObjects.GameObject[] = [];
  private anims: { sprite: Phaser.GameObjects.Image; sheet: string; k: number; phase: number; fps: number }[] = [];
  private lights: { img: Phaser.GameObjects.Image; base: number; phase: number }[] = [];
  private readonly art: FbbArt;
  private readonly H: number;
  private readonly k = GAME_CONFIG.ortho.pxPerM / T;
  private readonly season: FbbSeason;

  /** 地圖是 fbb 而且素材都在才能用；否則 BattleScene 用原本的程式畫法 */
  static usable(scene: Phaser.Scene, map: MapDef): boolean {
    return isFbbMap(map) && fbbReady(scene);
  }

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapDef,
  ) {
    this.art = map.art as unknown as FbbArt;
    this.H = this.art.level.h;
    this.season = SEASON[this.art.look];
    for (const sheet of ['fires', 'smoke']) this.ensureFrames(sheet);
    if (this.art.kind === 'fbbField') this.buildField(this.art.level);
    else this.buildTown(this.art.level);
    this.buildGrade();
  }

  update(timeSec: number): void {
    for (const a of this.anims) a.sprite.setFrame(`${a.k}_${(Math.floor(timeSec * a.fps) + a.phase) % 4}`);
    for (const l of this.lights) l.img.setAlpha(l.base * (0.9 + 0.1 * Math.sin(timeSec * 11 + l.phase)));
  }

  // ───────────── 共用 ─────────────

  private img(key: string): CanvasImageSource {
    return this.scene.textures.get(key).getSourceImage() as CanvasImageSource;
  }

  private cols(key: string): number {
    return (this.scene.textures.get(key).getSourceImage() as HTMLImageElement).width / T;
  }

  private drawCell(ctx: Ctx, key: string, i: number, dx: number, dy: number): void {
    const c = this.cols(key);
    ctx.drawImage(this.img(key), (i % c) * T, Math.floor(i / c) * T, T, T, dx, dy, T, T);
  }

  /** A2 地面 autotile（32 × 48 區塊）：n(dx, dy)＝鄰格是否同種 */
  private floorAuto(ctx: Ctx, idx: number, n: (dx: number, dy: number) => boolean, dx0: number, dy0: number): void {
    const src = this.img(fbbKey('tileA2', this.season));
    const bx = (idx % 8) * 32;
    const by = Math.floor(idx / 8) * 48;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const h = n(sx, 0);
      const v = n(0, sy);
      const d = n(sx, sy);
      const L = sx < 0;
      const Tt = sy < 0;
      let qx: number;
      let qy: number;
      if (h && v && !d) {
        qx = L ? 2 : 3;
        qy = Tt ? 0 : 1;
      } else {
        qx = !h ? (L ? 0 : 3) : L ? 2 : 1;
        qy = !v ? (Tt ? 2 : 5) : Tt ? 4 : 3;
      }
      ctx.drawImage(src, bx + qx * 8, by + qy * 8, 8, 8, dx0 + (L ? 0 : 8), dy0 + (Tt ? 0 : 8), 8, 8);
    }
  }

  /** 做一張畫布貼圖（同一個 key 只做一次，可以重複使用） */
  private tex(key: string, w: number, h: number, draw: (ctx: Ctx) => void): string {
    if (this.scene.textures.exists(key)) return key;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    this.scene.textures.addCanvas(key, c);
    return key;
  }

  /** 格子 (gx, gy) 左上角的畫面座標 */
  private topLeft(gx: number, gy: number): { x: number; y: number } {
    return worldToScreen(this.H - gy, gx);
  }

  /** 錨點在第 gy 列的物件深度（和角色一起排序） */
  private rowDepth(gy: number): number {
    return OBJECT_DEPTH_BASE + depthOf(this.H - 1 - gy + 0.05, 0);
  }

  private put(key: string, gx: number, gy: number, depth: number, yOffPx = 0): Phaser.GameObjects.Image {
    const p = this.topLeft(gx, gy);
    const im = this.scene.add.image(p.x, p.y + yOffPx * this.k, key).setOrigin(0).setScale(this.k).setDepth(depth);
    this.objects.push(im);
    return im;
  }

  /** characters 表（4 × 2 個物件，每個寬 48 高 128；中間欄 4 列＝4 格動畫，每格 16 × 32）：加成命名的格 */
  private ensureFrames(sheet: string): void {
    const tex = this.scene.textures.get(fbbKey(sheet));
    if (tex.has('0_0')) return;
    for (let k = 0; k < 8; k++) for (let f = 0; f < 4; f++) tex.add(`${k}_${f}`, 0, (k % 4) * 48 + 16, Math.floor(k / 4) * 128 + f * 32, 16, 32);
  }

  /** 動畫物件（火、煙）：左上角在格子 (gx, gy) */
  private anim(name: string, gx: number, gy: number, depth: number, phase: number, alpha = 1): void {
    const a = ANIM_OBJECTS[name];
    const p = this.topLeft(gx, gy);
    const sprite = this.scene.add.image(p.x, p.y, fbbKey(a.sheet), `${a.index}_0`).setOrigin(0).setScale(this.k).setDepth(depth).setAlpha(alpha);
    this.objects.push(sprite);
    this.anims.push({ sprite, sheet: a.sheet, k: a.index, phase: phase % 4, fps: a.sheet === 'smoke' ? 3 : 7 });
  }

  /** 火光（加亮混合的暖色光暈）；中心在格子 (gx, gy) 的中心，半徑 r 格 */
  private light(gx: number, gy: number, r: number, strength: number, phase: number): void {
    const key = this.tex('fbb_light', 128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,150,60,1)');
      g.addColorStop(0.45, 'rgba(240,110,30,0.45)');
      g.addColorStop(1, 'rgba(200,80,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
    const p = this.topLeft(gx, gy);
    const img = this.scene.add
      .image(p.x + (T / 2) * this.k, p.y + (T / 2) * this.k, key)
      .setScale((r * T * this.k * 2) / 128)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(LIGHT_DEPTH)
      .setAlpha(strength);
    this.objects.push(img);
    this.lights.push({ img, base: strength, phase });
  }

  /** 雜湊（同一張地圖每次一樣） */
  private hash(x: number, y: number): number {
    return ((((x * 73856093) ^ (y * 19349663) ^ (this.art.level.seed * 83492791)) >>> 0) % 1000) / 1000;
  }

  private buildGrade(): void {
    const g = GRADES[GRADE_OF[this.art.look]];
    const b = mapScreenBounds(this.map.width, this.map.height);
    const c = Phaser.Display.Color.GetColor(Math.round(g.mul[0] * 255), Math.round(g.mul[1] * 255), Math.round(g.mul[2] * 255));
    const r = this.scene.add.rectangle(b.x, b.y, b.w, b.h, c).setOrigin(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(GRADE_DEPTH);
    this.objects.push(r);
  }

  /** 地面貼圖（整張地圖） */
  private ground(draw: (ctx: Ctx) => void): void {
    const L = this.art.level;
    const key = this.tex(`fbb_ground_${this.art.kind}_${L.seed}_${this.map.id}`, L.w * T, L.h * T, draw);
    this.put(key, 0, 0, 0);
    // 每張地圖一張大貼圖：離開戰鬥時移除（物件、牆的小貼圖可以重複使用，留著）
    this.scene.events.once('shutdown', () => this.scene.textures.exists(key) && this.scene.textures.remove(key));
  }

  // ───────────── 野外 ─────────────

  private buildField(L: FieldLevel): void {
    const G = L.ground;
    const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < L.w && y < L.h ? G[y][x] : null);
    const A5 = fbbKey('tileA5_outside', this.season);
    const B = fbbKey('tileB_outside', this.season);
    this.ground((ctx) => {
      for (let y = 0; y < L.h; y++)
        for (let x = 0; x < L.w; x++) {
          this.floorAuto(ctx, 0, (dx, dy) => '.p'.includes(at(x + dx, y + dy) ?? '.'), x * T, y * T);
          if (G[y][x] === 'p') this.floorAuto(ctx, 1, (dx, dy) => (at(x + dx, y + dy) ?? 'p') === 'p', x * T, y * T);
          else if (this.hash(x, y) < FBB_VIEW.decorChance) this.drawCell(ctx, A5, 1 + Math.floor(this.hash(y, x) * 6), x * T, y * T);
        }
      // 單格石頭：裝飾，畫在地面
      for (const p of L.props) if (p.prefab === 'rock1') this.drawCell(ctx, B, ROCK_SINGLES[p.variant ?? 0], p.x * T, p.y * T);
    });
    // 石牆：依上下左右相連挑格；拉高版往上延伸半格
    const walls = new Set(L.walls.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of L.walls) {
      const tile = WALL_TILES[wallKey((dx, dy) => walls.has(`${x + dx},${y + dy}`))];
      if (tile === undefined) continue;
      const tall = FBB_VIEW.tallWalls;
      const key = this.tex(`fbb_wall_${this.season}_${tile}_${tall ? 't' : 'f'}`, T, tall ? 24 : T, (ctx) => {
        const c = this.cols(B);
        ctx.drawImage(this.img(B), (tile % c) * T, Math.floor(tile / c) * T, T, T, 0, 0, T, tall ? 24 : T);
      });
      this.put(key, x, y, this.rowDepth(y) - 0.01, tall ? -8 : 0);
    }
    let phase = 0;
    for (const p of L.props) {
      if (p.prefab === 'rock1') continue;
      if (ANIM_OBJECTS[p.prefab]) {
        // 營火：16 × 32，錨點是下格
        this.anim(p.prefab, p.x, p.y - 1, this.rowDepth(p.y) + 0.01, phase++);
        this.light(p.x, p.y, 4, this.art.look === 'summer' ? 0.25 : 0.7, phase);
        continue;
      }
      const tiles = PREFAB_TILES[p.prefab];
      const def = PREFABS[p.prefab];
      if (!tiles || !def) continue;
      const [w, h] = def.size;
      const key = this.tex(`fbb_pf_${this.season}_${p.prefab}`, w * T, h * T, (ctx) => {
        tiles.forEach((row, r) => row.forEach((i, q) => i !== null && this.drawCell(ctx, B, i, q * T, r * T)));
      });
      this.put(key, p.x - def.anchor[0], p.y - def.anchor[1], this.rowDepth(p.y));
    }
  }

  // ───────────── 城內 ─────────────

  private prefabById(id: string | undefined): TilePrefab | undefined {
    return id ? tilePrefabs().find((p) => p.id === id) : undefined;
  }

  /** 預製件的一層畫到畫布（表 0＝master_everything.png） */
  private drawPrefabLayer(ctx: Ctx, pf: TilePrefab, layer: 'ground' | 'objects', ox: number, oy: number, burnt = false): void {
    const M = fbbKey('master');
    pf[layer].forEach((row, r) =>
      row.forEach((c, q) => {
        if (!c || c.sheet !== 0) return;
        this.drawCell(ctx, M, c.tile, ox + q * T, oy + r * T);
        if (burnt && (r + q) % 3 !== 0) this.char(ctx, ox + q * T, oy + r * T, T, T);
      }),
    );
  }

  /** 燒焦：把這塊區域的顏色乘暗 */
  private char(ctx: Ctx, x: number, y: number, w: number, h: number): void {
    const d = ctx.getImageData(x, y, w, h);
    const [mr, mg, mb] = FBB_VIEW.burntMul;
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] *= mr;
      d.data[i + 1] *= mg;
      d.data[i + 2] *= mb;
    }
    ctx.putImageData(d, x, y);
  }

  private buildTown(L: TownLevel): void {
    const G = L.ground;
    const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < L.w && y < L.h ? G[y][x] : null);
    const BT = fbbKey('tileB_town');
    this.ground((ctx) => {
      for (let y = 0; y < L.h; y++)
        for (let x = 0; x < L.w; x++) {
          this.floorAuto(ctx, 0, (dx, dy) => '.s'.includes(at(x + dx, y + dy) ?? '.'), x * T, y * T);
          if (G[y][x] === 's') this.floorAuto(ctx, 4, (dx, dy) => (at(x + dx, y + dy) ?? 's') === 's', x * T, y * T);
        }
      for (const p of L.props) if (p.kind === 'rubble') this.drawCell(ctx, BT, TOWN_TILES.rubble[p.variant ?? 0], p.x * T, p.y * T);
      for (const h of L.houses) {
        const pf = this.prefabById(h.prefab);
        if (pf) this.drawPrefabLayer(ctx, pf, 'ground', h.x * T, h.y * T);
      }
      for (const p of L.props) {
        const pf = p.kind === 'well' ? this.prefabById(p.prefab) : undefined;
        if (pf) this.drawPrefabLayer(ctx, pf, 'ground', p.x * T, p.y * T);
      }
    });
    let phase = 0;
    L.houses.forEach((h, n) => {
      const pf = this.prefabById(h.prefab);
      const key = pf
        ? this.tex(`fbb_house_${pf.id}_${h.burning ? 'b' : 'n'}`, pf.w * T, pf.h * T, (ctx) => this.drawPrefabLayer(ctx, pf, 'objects', 0, 0, h.burning))
        : this.tex(`fbb_ph_${h.w}x${h.h}_${h.burning ? 'b' : 'n'}`, h.w * T, h.h * T, (ctx) => this.placeholderHouse(ctx, h.w, h.h, h.burning));
      const depth = this.rowDepth(h.y + h.h - 1);
      this.put(key, h.x, h.y, depth);
      h.fires.forEach(([fx, fy], j) => {
        this.anim(TOWN_TILES.houseFire, fx, fy - 1, depth + 0.01 + j * 0.001, n + j);
        this.anim(TOWN_TILES.smoke, fx, fy - 3, SMOKE_DEPTH, n + j, 0.8);
        this.light(fx, fy, 4.4, 0.75, n + j);
      });
    });
    for (const p of L.props) {
      if (p.kind === 'well') {
        const pf = this.prefabById(p.prefab);
        if (pf) {
          const key = this.tex(`fbb_house_${pf.id}_n`, pf.w * T, pf.h * T, (ctx) => this.drawPrefabLayer(ctx, pf, 'objects', 0, 0));
          this.put(key, p.x, p.y, this.rowDepth(p.y + pf.h - 1));
        } else {
          const key = this.tex('fbb_well2', 2 * T, 2 * T, (ctx) => TOWN_TILES.well.forEach((row, r) => row.forEach((i, q) => this.drawCell(ctx, BT, i, q * T, r * T))));
          this.put(key, p.x, p.y, this.rowDepth(p.y + 1));
        }
      } else if (p.kind === 'lamp' || p.kind === 'crates' || p.kind === 'sack') {
        const [top, bot] = p.kind === 'lamp' ? TOWN_TILES.lamp : (TOWN_TILES.crates[p.variant ?? 0] ?? TOWN_TILES.crates[0]);
        const key = this.tex(`fbb_t2_${top}_${bot}`, T, 2 * T, (ctx) => {
          this.drawCell(ctx, BT, top, 0, 0);
          this.drawCell(ctx, BT, bot, 0, T);
        });
        this.put(key, p.x, p.y - 1, this.rowDepth(p.y));
        if (p.kind === 'lamp') this.light(p.x, p.y - 1, 2.5, 0.4, phase++);
      } else if (p.kind === 'fire') {
        this.anim(TOWN_TILES.groundFire, p.x, p.y - 1, this.rowDepth(p.y) + 0.01, phase++);
        this.light(p.x, p.y, 2.8, 0.6, phase);
      }
    }
  }

  /** 佔位房子（交接文件 §10 (a)）：深色矩形加輪廓，寫「房屋」，下緣中間是門 */
  private placeholderHouse(ctx: Ctx, w: number, h: number, burnt: boolean): void {
    ctx.fillStyle = burnt ? 'rgb(70,40,34)' : 'rgb(58,52,60)';
    ctx.fillRect(0, 0, w * T, h * T);
    ctx.strokeStyle = 'rgb(170,160,150)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w * T - 1, h * T - 1);
    ctx.fillStyle = 'rgb(120,90,60)';
    ctx.fillRect((Math.floor(w / 2) - 1) * T + 4, h * T - 6, 2 * T - 8, 5);
    ctx.fillStyle = 'rgb(220,215,205)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('房屋', (w * T) / 2, (h * T) / 2);
  }
}

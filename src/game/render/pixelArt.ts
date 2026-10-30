/**
 * 2D 像素美術的載入（資料與計算在 pixelArtData.ts）。
 * - mw sheet 在 public/assets/licensed/（授權素材，部署時才拉進來；本機用 npm run assets:pull）。
 *   **找不到時不會壞**：載入失敗的圖不會有 texture，該單位改用色塊（UnitView）。
 * - 0x72 逐格 PNG 在 public/assets/0x72/frames/（CC0，在 repo 內）。
 */
import type Phaser from 'phaser';
import type { PixelUnitArt } from './pixelArtData';
import { VFX_SHEETS, VFX_USE, vfxFrame, vfxKey } from './vfxData';
import { CHARACTER_UNITS, FLOOR_TILES, MW_TEAM_DARK, MW_TEAM_LIGHT, PIXEL, PIXEL_UNITS, m72Frames, mwPaths } from './pixelArtData';

export const mwKey = (path: string): string => `px_mw_${path}`;
export const m72Key = (frame: string): string => `px_72_${frame}`;

/** 把像素素材加入載入佇列（BootScene 用）；已經有的不重複載入 */
export function queuePixel(load: Phaser.Loader.LoaderPlugin, scene: Phaser.Scene): void {
  for (const p of mwPaths()) {
    const key = mwKey(p);
    if (!scene.textures.exists(key)) load.spritesheet(key, `assets/licensed/${p}`, { frameWidth: PIXEL.cell, frameHeight: PIXEL.cell });
  }
  for (const f of [...m72Frames(), ...new Set(FLOOR_TILES)]) {
    const key = m72Key(f);
    if (!scene.textures.exists(key)) load.image(key, `assets/0x72/frames/${f}.png`);
  }
  // 逐格特效（授權素材；沒有時載入失敗也不影響遊戲，播放時會略過）
  const ids = new Set(Object.values(VFX_USE).flatMap((us) => us.map((u) => u.id)));
  for (const id of ids)
    for (let i = 0; i < (VFX_SHEETS[id]?.frames ?? 0); i++) {
      const key = vfxKey(id, i);
      if (!scene.textures.exists(key)) load.image(key, `assets/licensed/${vfxFrame(id, i)}`);
    }
}

/** mw 單位實際使用的 texture（有換色時是換色後的版本） */
export function artKey(a: PixelUnitArt & { kind: 'mw' }): string {
  return a.recolor ? `${mwKey(a.path)}#${a.recolor.light.toString(16)}` : mwKey(a.path);
}

/** 換色後的畫布（頭像也用它產生圖片網址） */
const recolored = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

/**
 * 換色（Alan：職業顏色和 sprite 一致）：把藍隊的兩個隊伍色換成指定顏色，加成新的 spritesheet。
 * 在遊戲裡做，不另外產生圖檔（授權素材不能放進公開 repo）。
 */
function ensureRecolored(scene: Phaser.Scene, a: PixelUnitArt & { kind: 'mw' }): boolean {
  const key = artKey(a);
  if (scene.textures.exists(key)) return true;
  const base = mwKey(a.path);
  if (!a.recolor || !scene.textures.exists(base)) return false;
  const src = scene.textures.get(base).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
  const map: [number[], number[]][] = [
    [rgb(MW_TEAM_DARK), rgb(a.recolor.dark)],
    [rgb(MW_TEAM_LIGHT), rgb(a.recolor.light)],
  ];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    for (const [from, to] of map) {
      if (d[i] === from[0] && d[i + 1] === from[1] && d[i + 2] === from[2]) {
        d[i] = to[0];
        d[i + 1] = to[1];
        d[i + 2] = to[2];
        break;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, { frameWidth: PIXEL.cell, frameHeight: PIXEL.cell });
  recolored.set(key, canvas);
  return true;
}

/** 這個單位的像素素材（沒有對照或圖沒載入時回傳 undefined → 用色塊）；具名角色的專屬 sheet 優先，沒載入時退回職業的 */
export function pixelArtFor(scene: Phaser.Scene, defId: string, characterId?: string): PixelUnitArt | undefined {
  const own = characterId ? CHARACTER_UNITS[characterId] : undefined;
  if (own?.kind === 'mw' && scene.textures.exists(mwKey(own.path))) return own;
  const a = PIXEL_UNITS[defId];
  if (!a) return undefined;
  if (a.kind === 'mw') {
    if (!scene.textures.exists(mwKey(a.path))) return undefined;
    if (a.recolor && !ensureRecolored(scene, a)) return undefined;
    return a;
  }
  return scene.textures.exists(m72Key(`${a.idle}_f0`)) ? a : undefined;
}

/** 英雄卡頭像用的 sheet 圖片網址（DOM 用 CSS 背景裁出側面／正面）；沒有素材時 undefined */
export function portraitSheetUrl(scene: Phaser.Scene, defId: string): string | undefined {
  const a = pixelArtFor(scene, defId);
  if (!a || a.kind !== 'mw') return undefined;
  const key = artKey(a);
  const cached = urlCache.get(key);
  if (cached) return cached;
  const c = recolored.get(key);
  if (c) {
    const url = c.toDataURL();
    urlCache.set(key, url);
    return url;
  }
  // 沒換色的 sheet：Phaser 載入用的 blob 網址載完就失效，畫到 canvas 轉成 data URL 再給 DOM 用
  const img = scene.textures.get(mwKey(a.path)).getSourceImage() as HTMLImageElement;
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  cv.getContext('2d')!.drawImage(img, 0, 0);
  const url = cv.toDataURL();
  urlCache.set(key, url);
  return url;
}

/** 地城地板拼塊是否都載入了 */
export function pixelFloorReady(scene: Phaser.Scene): boolean {
  return FLOOR_TILES.every((f) => scene.textures.exists(m72Key(f)));
}

/**
 * 外框貼圖（Alan：陣營色腳下圈以外，sprite 的輪廓也框起來，被遮住時也看得到）：
 * 原圖的不透明像素往外擴 1 px 的那一圈，填白色（畫的時候再染成陣營色）。
 * sheet＝mw 的 spritesheet（32 px 一格）：每一格各自算，放大成 (32 + 2) px 的格子（外框可以伸出原本的格邊），
 * 格子之間再留 OUTLINE_GAP 的空白——外框貼著格邊時，縮放取樣才不會取到隔壁格（攻擊動作會框到旁邊那格的外框）。
 * 外框格比原圖大一圈，對位用 outlineOrigin。否則是 0x72 的單張圖（格子大小和原圖相同）。
 */
const OUTLINE_PAD = 1;
const OUTLINE_GAP = 2;

/** mw 外框格要對齊身體 sprite：身體的原點（0～1）換算成外框格的原點 */
export function outlineOrigin(ox: number, oy: number): { x: number; y: number } {
  const size = PIXEL.cell + OUTLINE_PAD * 2;
  return { x: (ox * PIXEL.cell + OUTLINE_PAD) / size, y: (oy * PIXEL.cell + OUTLINE_PAD) / size };
}

export function outlineKey(scene: Phaser.Scene, key: string, sheet: boolean): string | undefined {
  const out = `${key}#outline`;
  if (scene.textures.exists(out)) return out;
  if (!scene.textures.exists(key)) return undefined;
  const src = recolored.get(key) ?? (scene.textures.get(key).getSourceImage() as HTMLImageElement);
  const w = src.width;
  const h = src.height;
  const read = document.createElement('canvas');
  read.width = w;
  read.height = h;
  const rctx = read.getContext('2d')!;
  rctx.drawImage(src, 0, 0);
  const a = rctx.getImageData(0, 0, w, h);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a.data[(y * w + x) * 4 + 3] > 0;
  // 一格一格算（單張圖＝整張一格）：只看同一格裡的像素
  const C = sheet ? PIXEL.cell : 0;
  const cols = sheet ? Math.floor(w / C) : 1;
  const rows = sheet ? Math.floor(h / C) : 1;
  const cw = sheet ? C : w;
  const ch = sheet ? C : h;
  const pad = sheet ? OUTLINE_PAD : 0;
  const step = (sheet ? cw + pad * 2 + OUTLINE_GAP : cw);
  const stepY = (sheet ? ch + pad * 2 + OUTLINE_GAP : ch);
  const ow = sheet ? cols * step - OUTLINE_GAP + OUTLINE_GAP * 2 : w;
  const oh = sheet ? rows * stepY - OUTLINE_GAP + OUTLINE_GAP * 2 : h;
  const canvas = document.createElement('canvas');
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext('2d')!;
  const o = ctx.createImageData(ow, oh);
  const margin = sheet ? OUTLINE_GAP : 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const sx = c * cw;
      const sy = r * ch;
      const inCell = (x: number, y: number) => x >= sx && y >= sy && x < sx + cw && y < sy + ch && solid(x, y);
      for (let y = sy - pad; y < sy + ch + pad; y++)
        for (let x = sx - pad; x < sx + cw + pad; x++) {
          if (inCell(x, y)) continue;
          if (!(inCell(x + 1, y) || inCell(x - 1, y) || inCell(x, y + 1) || inCell(x, y - 1))) continue;
          const tx = margin + c * step + (x - sx + pad);
          const ty = margin + r * stepY + (y - sy + pad);
          const i = (ty * ow + tx) * 4;
          o.data[i] = o.data[i + 1] = o.data[i + 2] = o.data[i + 3] = 255;
        }
    }
  ctx.putImageData(o, 0, 0);
  if (sheet)
    scene.textures.addSpriteSheet(out, canvas as unknown as HTMLImageElement, {
      frameWidth: cw + pad * 2,
      frameHeight: ch + pad * 2,
      margin: OUTLINE_GAP,
      spacing: OUTLINE_GAP,
    });
  else scene.textures.addCanvas(out, canvas);
  return out;
}

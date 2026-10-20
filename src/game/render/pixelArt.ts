/**
 * 2D 像素美術的載入（資料與計算在 pixelArtData.ts）。
 * - mw sheet 在 public/assets/licensed/（授權素材，部署時才拉進來；本機用 npm run assets:pull）。
 *   **找不到時不會壞**：載入失敗的圖不會有 texture，該單位改用色塊（UnitView）。
 * - 0x72 逐格 PNG 在 public/assets/0x72/frames/（CC0，在 repo 內）。
 */
import type Phaser from 'phaser';
import type { PixelUnitArt } from './pixelArtData';
import { FLOOR_TILES, PIXEL, PIXEL_UNITS, m72Frames, mwPaths } from './pixelArtData';

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
}

/** 這個單位的像素素材（沒有對照或圖沒載入時回傳 undefined → 用色塊） */
export function pixelArtFor(scene: Phaser.Scene, defId: string): PixelUnitArt | undefined {
  const a = PIXEL_UNITS[defId];
  if (!a) return undefined;
  if (a.kind === 'mw') return scene.textures.exists(mwKey(a.path)) ? a : undefined;
  return scene.textures.exists(m72Key(`${a.idle}_f0`)) ? a : undefined;
}

/** 地城地板拼塊是否都載入了 */
export function pixelFloorReady(scene: Phaser.Scene): boolean {
  return FLOOR_TILES.every((f) => scene.textures.exists(m72Key(f)));
}

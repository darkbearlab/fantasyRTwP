/**
 * 像素感的光暈（Alan 2026-10-22：光暈要有像素感）：不畫平滑的圓，改成格子對齊的方塊、透明度分成幾階。
 * - pixelGlow：畫在 Graphics 上（每幀重畫的指示器、營火）；同一列同一階的格子合成一個長方形。
 * - pixelGlowCanvas：畫在畫布上做成貼圖（火光）；貼圖用最近鄰放大就是一格一格的。
 */
import type Phaser from 'phaser';

export interface PixelGlowOptions {
  /** 一格幾個畫面像素 */
  cell?: number;
  /** 透明度分幾階 */
  bands?: number;
}

/** 距離中心 d（0～1）的那一格是第幾階（1＝最亮，0＝不畫） */
function level(d: number, bands: number): number {
  if (d >= 1) return 0;
  return Math.ceil((1 - d) * bands) / bands;
}

/** 在 Graphics 上畫一個像素光暈：中心 (cx, cy)、半徑 r（畫面像素），中心透明度 alpha */
export function pixelGlow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha: number, opts: PixelGlowOptions = {}): void {
  const cell = opts.cell ?? 6;
  const bands = opts.bands ?? 4;
  // 中心對齊格子，移動時不會閃
  const ox = Math.round(cx / cell) * cell;
  const oy = Math.round(cy / cell) * cell;
  const n = Math.ceil(r / cell);
  for (let j = -n; j < n; j++) {
    let runStart = 0;
    let runLevel = 0;
    const flush = (end: number) => {
      if (runLevel > 0) {
        g.fillStyle(color, alpha * runLevel);
        g.fillRect(ox + runStart * cell, oy + j * cell, (end - runStart) * cell, cell);
      }
    };
    for (let i = -n; i <= n; i++) {
      const lv = i < n ? level(Math.hypot(i + 0.5, j + 0.5) * (cell / r), bands) : -1;
      if (lv !== runLevel) {
        flush(i);
        runStart = i;
        runLevel = lv;
      }
    }
  }
}

/** 在畫布上畫一個像素光暈（size × size，中心在正中間）；colorAt(level) 回傳那一階的 CSS 顏色 */
export function pixelGlowCanvas(ctx: CanvasRenderingContext2D, size: number, colorAt: (level: number) => string, bands = 4): void {
  const r = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const lv = level(Math.hypot(x + 0.5 - r, y + 0.5 - r) / r, bands);
      if (lv <= 0) continue;
      ctx.fillStyle = colorAt(lv);
      ctx.fillRect(x, y, 1, 1);
    }
}

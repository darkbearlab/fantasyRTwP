/**
 * 畫面投影（畫面改版：45 度等角）。所有畫面與輸入的座標換算都必須經過這個模組。
 * sim 仍然使用公尺的平面座標 (x, y)；z 是畫面上的高度（公尺），只影響繪製位置。
 *
 * iso（2:1 等角）：
 *   screenX = (x − y) × TILE_W / 2
 *   screenY = (x + y) × TILE_H / 2 − z × HEIGHT_PX_PER_M
 * topdown（正俯視）：screenX = x × PX、screenY = y × PX（忽略 z）
 *
 * 只 import Phaser 的型別，數學部分可以在測試中直接使用。
 */
import type Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';

export type ProjectionMode = 'iso' | 'topdown';

export interface Pt {
  x: number;
  y: number;
}

let mode: ProjectionMode = GAME_CONFIG.projection;

export function getProjection(): ProjectionMode {
  return mode;
}

/** 切換投影（除錯面板）；戰鬥場景每幀檢查，改變時重建畫面物件 */
export function setProjection(m: ProjectionMode): void {
  mode = m;
}

export const isIso = (): boolean => mode === 'iso';

const ISO = GAME_CONFIG.iso;
const PX = GAME_CONFIG.pxPerMeter;

/** 世界座標（公尺）→ 畫面座標（相機世界 px） */
export function worldToScreen(x: number, y: number, z = 0): Pt {
  if (mode === 'topdown') return { x: x * PX, y: y * PX };
  return { x: (x - y) * (ISO.tileW / 2), y: (x + y) * (ISO.tileH / 2) - z * ISO.heightPxPerM };
}

/** 畫面座標 → 地面（z = 0）的世界座標（公尺） */
export function screenToGround(sx: number, sy: number): Pt {
  if (mode === 'topdown') return { x: sx / PX, y: sy / PX };
  const a = sx / (ISO.tileW / 2);
  const b = sy / (ISO.tileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** 繪製深度：越大越前面（畫在越上層） */
export function depthOf(x: number, y: number): number {
  return mode === 'topdown' ? y : x + y;
}

/** 高度 z 公尺在畫面上的像素（topdown 為 0） */
export function heightPx(z: number): number {
  return mode === 'topdown' ? 0 : z * ISO.heightPxPerM;
}

/** 地圖四角投影後的外框（鏡頭邊界、地面貼圖用） */
export function mapScreenBounds(width: number, height: number): { x: number; y: number; w: number; h: number } {
  const pts = [worldToScreen(0, 0), worldToScreen(width, 0), worldToScreen(0, height), worldToScreen(width, height)];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// ───────────── 地面繪圖輔助（圓形 → 2:1 橢圓、線段與多邊形投影頂點） ─────────────

export interface GroundStyle {
  fill?: number;
  fillAlpha?: number;
  stroke?: number;
  strokeAlpha?: number;
  width?: number;
}

/** 地面上的圓的投影頂點（等角時為 2:1 橢圓） */
export function groundCirclePoints(cx: number, cy: number, r: number, a0 = 0, a1 = Math.PI * 2, segments = 0): Pt[] {
  const span = a1 - a0;
  const n = segments || Math.max(12, Math.min(64, Math.ceil(r * 12 * (Math.abs(span) / (Math.PI * 2)) + 8)));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (span * i) / n;
    out.push(worldToScreen(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return out;
}

function fillStroke(g: Phaser.GameObjects.Graphics, pts: Pt[], s: GroundStyle, closed: boolean): void {
  if (pts.length < 2) return;
  if (s.fill !== undefined && closed) {
    g.fillStyle(s.fill, s.fillAlpha ?? 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillPath();
  }
  if (s.stroke !== undefined) {
    g.lineStyle(s.width ?? 1, s.stroke, s.strokeAlpha ?? 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    if (closed) g.closePath();
    g.strokePath();
  }
}

/** 地面圓（半徑 r 公尺） */
export function groundCircle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, s: GroundStyle): void {
  if (r <= 0) return;
  fillStroke(g, groundCirclePoints(cx, cy, r), s, true);
}

/** 地面圓弧（只描邊；進度環用） */
export function groundArc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, a0: number, a1: number, s: GroundStyle): void {
  if (r <= 0 || a1 === a0) return;
  fillStroke(g, groundCirclePoints(cx, cy, r, a0, a1), { stroke: s.stroke, strokeAlpha: s.strokeAlpha, width: s.width }, false);
}

/** 地面扇形（以 (cx, cy) 為圓心） */
export function groundSector(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, a0: number, a1: number, s: GroundStyle): void {
  if (r <= 0) return;
  fillStroke(g, [worldToScreen(cx, cy), ...groundCirclePoints(cx, cy, r, a0, a1)], s, true);
}

/** 地面線段 */
export function groundLine(g: Phaser.GameObjects.Graphics, a: Pt, b: Pt, width: number, color: number, alpha = 1): void {
  const p = worldToScreen(a.x, a.y);
  const q = worldToScreen(b.x, b.y);
  g.lineStyle(width, color, alpha);
  g.lineBetween(p.x, p.y, q.x, q.y);
}

/** 地面多邊形（世界座標頂點） */
export function groundPolygon(g: Phaser.GameObjects.Graphics, pts: Pt[], s: GroundStyle): void {
  fillStroke(
    g,
    pts.map((p) => worldToScreen(p.x, p.y)),
    s,
    true,
  );
}

/** 地面矩形（世界座標 x, y, w, h） */
export function groundRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, s: GroundStyle): void {
  if (mode === 'topdown') {
    if (s.fill !== undefined) {
      g.fillStyle(s.fill, s.fillAlpha ?? 1);
      g.fillRect(x * PX, y * PX, w * PX, h * PX);
    }
    if (s.stroke !== undefined) {
      g.lineStyle(s.width ?? 1, s.stroke, s.strokeAlpha ?? 1);
      g.strokeRect(x * PX, y * PX, w * PX, h * PX);
    }
    return;
  }
  groundPolygon(
    g,
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    s,
  );
}

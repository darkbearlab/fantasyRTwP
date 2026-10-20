/**
 * 畫面投影。所有畫面與輸入的座標換算都必須經過這個模組。
 * sim 仍然使用公尺的平面座標 (x, y)；z 是畫面上的高度（公尺），只影響繪製位置。
 *
 * ortho（正角俯視，預設；Alan：地圖改成正角，但保留俯角，角色 sprite 照樣站著畫）：
 *   先依旋轉換成 (u, v)，screenX = u × PX、screenY = v × PX × SQUASH − z × HEIGHT_PX_PER_M
 * iso（2:1 等角，舊的 45 度畫面）：
 *   screenX = (u − v) × TILE_W / 2
 *   screenY = (u + v) × TILE_H / 2 − z × HEIGHT_PX_PER_M
 * topdown（純平面俯視，除錯用）：screenX = x × PX、screenY = y × PX（忽略 z）
 *
 * 只 import Phaser 的型別，數學部分可以在測試中直接使用。
 */
import type Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';

export type ProjectionMode = 'ortho' | 'iso' | 'topdown';

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

/** 有高度的投影（ortho、iso）：角色立起來畫、障礙物是方塊、投射物在空中 */
export const hasHeight = (): boolean => mode !== 'topdown';

const ISO = GAME_CONFIG.iso;
const ORTHO = GAME_CONFIG.ortho;
const PX = GAME_CONFIG.pxPerMeter;

let rotation: 0 | 90 = GAME_CONFIG.isoRotation;

/**
 * 正角俯視的縱向壓縮：預設 GAME_CONFIG.ortho.squash；finalbossblues 地形的地圖不壓縮（Alan 2026-10-21），
 * 戰鬥場景載入地圖時設定，離開時還原。
 */
let squash = ORTHO.squash;

export function setOrthoSquash(s?: number): void {
  squash = s ?? ORTHO.squash;
}

export function orthoSquash(): number {
  return squash;
}

export function getIsoRotation(): 0 | 90 {
  return rotation;
}

/** 等角畫面旋轉（測試與除錯用） */
export function setIsoRotation(r: 0 | 90): void {
  rotation = r;
}

/** 世界座標 → 投影前的格子座標 (u, v)。等角：旋轉 90 度（逆時針）時 u = y、v = −x；ortho 依 ORTHO.rotation */
function toUV(x: number, y: number): Pt {
  const r = mode === 'ortho' ? ORTHO.rotation : rotation;
  return r === 90 ? { x: y, y: -x } : { x, y };
}

/** 世界座標（公尺）→ 畫面座標（相機世界 px） */
export function worldToScreen(x: number, y: number, z = 0): Pt {
  if (mode === 'topdown') return { x: x * PX, y: y * PX };
  const { x: u, y: v } = toUV(x, y);
  if (mode === 'ortho') return { x: u * ORTHO.pxPerM, y: v * ORTHO.pxPerM * squash - z * ORTHO.heightPxPerM };
  return { x: (u - v) * (ISO.tileW / 2), y: (u + v) * (ISO.tileH / 2) - z * ISO.heightPxPerM };
}

/** 畫面座標 → 地面（z = 0）的世界座標（公尺） */
export function screenToGround(sx: number, sy: number): Pt {
  if (mode === 'topdown') return { x: sx / PX, y: sy / PX };
  if (mode === 'ortho') {
    const u = sx / ORTHO.pxPerM;
    const v = sy / (ORTHO.pxPerM * squash);
    return ORTHO.rotation === 90 ? { x: -v, y: u } : { x: u, y: v };
  }
  const a = sx / (ISO.tileW / 2);
  const b = sy / (ISO.tileH / 2);
  const u = (a + b) / 2;
  const v = (b - a) / 2;
  return rotation === 90 ? { x: -v, y: u } : { x: u, y: v };
}

/** 繪製深度：越大越前面（畫在越上層），即畫面上越靠下 */
export function depthOf(x: number, y: number): number {
  if (mode === 'topdown') return y;
  const { x: u, y: v } = toUV(x, y);
  if (mode === 'ortho') return v;
  return u + v;
}

/** 高度 z 公尺在畫面上的像素（topdown 為 0） */
export function heightPx(z: number): number {
  if (mode === 'topdown') return 0;
  return z * (mode === 'ortho' ? ORTHO.heightPxPerM : ISO.heightPxPerM);
}

/** 地面上半徑 r 公尺的圓投影到畫面後的半軸（px）：iso 為 2:1 橢圓 */
export function groundAxes(r: number): Pt {
  if (mode === 'topdown') return { x: r * PX, y: r * PX };
  if (mode === 'ortho') return { x: r * ORTHO.pxPerM, y: r * ORTHO.pxPerM * squash };
  return { x: (r * ISO.tileW) / Math.SQRT2, y: (r * ISO.tileH) / Math.SQRT2 };
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

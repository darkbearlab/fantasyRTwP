import type { Vec } from '../math';

/**
 * 超覆蓋（supercover）直線：列出線段經過的所有格子（剛好穿過格角時兩側格子都算）。
 * 為保證對稱，一律從「較小」端點走到「較大」端點。
 * visit 回傳 false 時中止並回傳 false。
 */
export function traceSupercover(
  cell: number,
  a: Vec,
  b: Vec,
  visit: (cx: number, cy: number) => boolean,
): boolean {
  if (b.x < a.x || (b.x === a.x && b.y < a.y)) {
    const t = a;
    a = b;
    b = t;
  }
  const x0 = a.x / cell;
  const y0 = a.y / cell;
  const x1 = b.x / cell;
  const y1 = b.y / cell;
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = stepX > 0 ? (cx + 1 - x0) / dx : stepX < 0 ? (cx - x0) / dx : Infinity;
  let tMaxY = stepY > 0 ? (cy + 1 - y0) / dy : stepY < 0 ? (cy - y0) / dy : Infinity;

  if (!visit(cx, cy)) return false;
  for (let guard = 0; guard < 100000; guard++) {
    if (cx === ex && cy === ey) break;
    const tNext = Math.min(tMaxX, tMaxY);
    if (tNext > 1 + 1e-9) break;
    if (Math.abs(tMaxX - tMaxY) < 1e-9) {
      // 剛好穿過格角：兩側格子都要檢查
      if (!visit(cx + stepX, cy)) return false;
      if (!visit(cx, cy + stepY)) return false;
      cx += stepX;
      cy += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cy += stepY;
      tMaxY += tDeltaY;
    }
    if (!visit(cx, cy)) return false;
  }
  return true;
}

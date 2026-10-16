import type { Vec } from './math';
import type { NavGrid } from './nav/grid';
import { traceSupercover } from './nav/raycast';

/** 兩點連線不經過任何遮擋格 */
export function segmentClear(grid: NavGrid, a: Vec, b: Vec): boolean {
  return traceSupercover(grid.cell, a, b, (cx, cy) => !grid.isBlockedCell(cx, cy));
}

/** 取樣點：中心，以及垂直於視線方向、距中心 radius 的左右兩點 */
function samples(p: Vec, r: number, perp: Vec): Vec[] {
  if (r <= 0) return [p];
  return [p, { x: p.x + perp.x * r, y: p.y + perp.y * r }, { x: p.x - perp.x * r, y: p.y - perp.y * r }];
}

/**
 * 視線判定（SPEC §9）：A 的三個取樣點射向 B 的三個取樣點，任一條通過即可見。
 * 交換 A、B 時垂直向量只差正負號，取樣點集合完全相同，且線段追蹤以固定端點順序進行，因此保證對稱。
 */
export function canSeeCircle(grid: NavGrid, a: Vec, ar: number, b: Vec, br: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) return true;
  const perp = { x: -dy / l, y: dx / l };
  const sa = samples(a, ar, perp);
  const sb = samples(b, br, perp);
  for (const p of sa) for (const q of sb) if (segmentClear(grid, p, q)) return true;
  return false;
}

/**
 * 找一組看得見的取樣點（投射物的發射點與瞄準偏移）：
 * 回傳 A 端取樣點，以及 B 端取樣點相對於 B 中心的偏移；看不見時回傳 null。
 */
export function clearLine(grid: NavGrid, a: Vec, ar: number, b: Vec, br: number): { from: Vec; aim: Vec } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) return { from: { ...a }, aim: { x: 0, y: 0 } };
  const perp = { x: -dy / l, y: dx / l };
  const sa = samples(a, ar, perp);
  const sb = samples(b, br, perp);
  for (const p of sa) for (const q of sb) if (segmentClear(grid, p, q)) return { from: { ...p }, aim: { x: q.x - b.x, y: q.y - b.y } };
  return null;
}

/** 單位對地面點的視線 */
export function canSeePoint(grid: NavGrid, a: Vec, ar: number, p: Vec): boolean {
  return canSeeCircle(grid, a, ar, p, 0);
}

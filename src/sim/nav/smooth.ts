import type { Vec } from '../math';
import type { NavGrid } from './grid';
import { traceSupercover } from './raycast';

/** 兩點之間的直線在導航格子上是否完全可走 */
export function lineWalkable(grid: NavGrid, a: Vec, b: Vec, extraOk?: (cx: number, cy: number) => boolean): boolean {
  return traceSupercover(grid.cell, a, b, (cx, cy) => !grid.isBlockedCell(cx, cy) && (!extraOk || extraOk(cx, cy)));
}

/**
 * 路徑平滑：從目前點往後找能直線走到的最遠路徑點，跳過中間的轉折，只留下真正的轉角。
 */
export function smoothPath(
  grid: NavGrid,
  start: Vec,
  path: Vec[],
  extraOk?: (cx: number, cy: number) => boolean,
): Vec[] {
  if (path.length <= 1) return path.slice();
  const out: Vec[] = [];
  let cur = start;
  let i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    while (j > i && !lineWalkable(grid, cur, path[j], extraOk)) j--;
    out.push(path[j]);
    cur = path[j];
    i = j + 1;
  }
  return out;
}

import type { Vec } from '../math';
import type { NavGrid } from './grid';

export interface PathOptions {
  /** 額外成本（例如敵方控制區），以格子為單位 */
  extraCost?: (cx: number, cy: number) => number;
  /** 最多展開節點數，避免卡死 */
  maxNodes?: number;
}

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/** 最小堆（以 f 值排序，相同時以插入序排，確保決定論） */
class Heap {
  private items: { node: number; f: number; seq: number }[] = [];
  private seq = 0;
  get size(): number {
    return this.items.length;
  }
  push(node: number, f: number): void {
    const it = { node, f, seq: this.seq++ };
    const a = this.items;
    a.push(it);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top.node;
  }
  private less(x: { f: number; seq: number }, y: { f: number; seq: number }): boolean {
    return x.f < y.f || (x.f === y.f && x.seq < y.seq);
  }
}

/**
 * 八方向 A*，對角成本 √2，禁止斜穿牆角。
 * 回傳路徑點（不含起點；最後一點為目標或最近的可走點），找不到回傳 null。
 */
export function findPath(grid: NavGrid, start: Vec, goal: Vec, opts: PathOptions = {}): Vec[] | null {
  const s0 = grid.cellOf(start);
  const s = grid.nearestWalkableCell(s0.cx, s0.cy, 6);
  const g0 = grid.cellOf(goal);
  const g = grid.nearestWalkableCell(g0.cx, g0.cy);
  if (!s || !g) return null;
  const goalPoint = g.cx === g0.cx && g.cy === g0.cy ? goal : grid.cellCenter(g.cx, g.cy);
  if (s.cx === g.cx && s.cy === g.cy) return [goalPoint];

  const cols = grid.cols;
  const n = cols * grid.rows;
  const gScore = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const startIdx = s.cy * cols + s.cx;
  const goalIdx = g.cy * cols + g.cx;
  const h = (cx: number, cy: number): number => {
    const dx = Math.abs(cx - g.cx);
    const dy = Math.abs(cy - g.cy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  const heap = new Heap();
  gScore[startIdx] = 0;
  heap.push(startIdx, h(s.cx, s.cy));
  const maxNodes = opts.maxNodes ?? n * 2;
  let expanded = 0;
  let found = false;

  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === goalIdx) {
      found = true;
      break;
    }
    closed[cur] = 1;
    if (++expanded > maxNodes) break;
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (grid.isBlockedCell(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (grid.isBlockedCell(cx + dx, cy) || grid.isBlockedCell(cx, cy + dy))) continue;
      const ni = ny * cols + nx;
      if (closed[ni]) continue;
      const extra = opts.extraCost ? opts.extraCost(nx, ny) : 0;
      const tentative = gScore[cur] + cost + extra;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = cur;
        heap.push(ni, tentative + h(nx, ny));
      }
    }
  }
  if (!found) return null;

  const cells: number[] = [];
  for (let c = goalIdx; c !== startIdx && c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  const path = cells.map((c) => {
    const cx = c % cols;
    return grid.cellCenter(cx, (c - cx) / cols);
  });
  path[path.length - 1] = goalPoint;
  return path;
}

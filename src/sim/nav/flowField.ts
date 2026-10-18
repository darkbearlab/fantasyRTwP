import type { Vec } from '../math';
import type { NavGrid } from './grid';

/** 直向／斜向一步的整數成本（≈ 1 與 √2 的 10 倍） */
const STRAIGHT = 10;
const DIAG = 14;
const NDX = [1, -1, 0, 0, 1, 1, -1, -1];
const NDY = [0, 0, 1, -1, 1, -1, 1, -1];
const NCOST = [STRAIGHT, STRAIGHT, STRAIGHT, STRAIGHT, DIAG, DIAG, DIAG, DIAG];
/** 桶佇列的桶數：必須大於最大單步成本 */
const BUCKETS = DIAG + 1;
const UNREACHED = 0x7fffffff;

/**
 * 流場尋路（SPEC_SLICE4 §8）：從多個目標點（英雄）往外做一次最短路，
 * 得到每格到最近目標的路徑距離。所有雜兵共用同一張距離場，沿著距離下降的方向移動，
 * 不必各自跑 A*。斜向移動不得切過障礙物的角。
 * 成本只有兩種（10／14），用桶佇列（Dial 演算法）做到線性時間。
 */
export class FlowField {
  /** 每格的距離（成本單位：直走一格 = 10）；不可達為 UNREACHED */
  readonly dist: Int32Array;
  private buckets: Int32Array[];
  private bucketLen: Int32Array;

  constructor(readonly grid: NavGrid) {
    const n = grid.cols * grid.rows;
    this.dist = new Int32Array(n).fill(UNREACHED);
    this.buckets = Array.from({ length: BUCKETS }, () => new Int32Array(Math.max(64, n >> 2)));
    this.bucketLen = new Int32Array(BUCKETS);
  }

  /** 以 sources 為起點重算距離場 */
  compute(sources: Vec[]): void {
    const g = this.grid;
    const d = this.dist;
    const cols = g.cols;
    const rows = g.rows;
    const blocked = g.blocked;
    d.fill(UNREACHED);
    this.bucketLen.fill(0);
    let pending = 0;
    for (const s of sources) {
      let c = g.cellOf(s);
      if (g.isBlockedCell(c.cx, c.cy)) {
        const n = g.nearestWalkableCell(c.cx, c.cy, 6);
        if (!n) continue;
        c = n;
      }
      const i = c.cy * cols + c.cx;
      if (d[i] !== 0) {
        d[i] = 0;
        this.add(0, i);
        pending++;
      }
    }
    // 不可走或超出邊界
    const bad = (x: number, y: number) => x < 0 || y < 0 || x >= cols || y >= rows || blocked[y * cols + x] === 1;
    let cur = 0;
    while (pending > 0) {
      const b = cur % BUCKETS;
      if (this.bucketLen[b] === 0) {
        cur++;
        continue;
      }
      const i = this.buckets[b][--this.bucketLen[b]];
      pending--;
      if (d[i] !== cur) continue; // 已被更短的距離取代
      const cx = i % cols;
      const cy = (i - cx) / cols;
      for (let k = 0; k < 8; k++) {
        const dx = NDX[k];
        const dy = NDY[k];
        const nx = cx + dx;
        const ny = cy + dy;
        if (bad(nx, ny)) continue;
        // 斜向不得切角
        if (k >= 4 && (bad(cx + dx, cy) || bad(cx, cy + dy))) continue;
        const ni = ny * cols + nx;
        const nd = cur + NCOST[k];
        if (nd < d[ni]) {
          d[ni] = nd;
          this.add(nd % BUCKETS, ni);
          pending++;
        }
      }
    }
  }

  /** 位置所在格的距離（格）；不可達為 Infinity */
  distanceAt(p: Vec): number {
    const c = this.grid.cellOf(p);
    if (!this.grid.inBounds(c.cx, c.cy)) return Infinity;
    const v = this.dist[c.cy * this.grid.cols + c.cx];
    return v === UNREACHED ? Infinity : v / STRAIGHT;
  }

  /**
   * 下一步要走向的點：周圍 8 格中距離最小者的中心。
   * 已在目標格或無法前進時回傳 null。
   */
  nextPoint(p: Vec): Vec | null {
    const g = this.grid;
    const c = g.cellOf(p);
    if (g.isBlockedCell(c.cx, c.cy)) {
      // 被推進不可走格（膨脹邊緣）：先回到最近的可走格
      const n = g.nearestWalkableCell(c.cx, c.cy, 3);
      if (!n) return null;
      return g.cellCenter(n.cx, n.cy);
    }
    const here = this.dist[c.cy * g.cols + c.cx];
    if (here === 0 || here === UNREACHED) return null;
    let best = here;
    let bx = -1;
    let by = -1;
    for (let k = 0; k < 8; k++) {
      const nx = c.cx + NDX[k];
      const ny = c.cy + NDY[k];
      if (g.isBlockedCell(nx, ny)) continue;
      if (k >= 4 && (g.isBlockedCell(nx, c.cy) || g.isBlockedCell(c.cx, ny))) continue;
      const v = this.dist[ny * g.cols + nx];
      if (v < best) {
        best = v;
        bx = nx;
        by = ny;
      }
    }
    if (bx < 0) return null;
    return g.cellCenter(bx, by);
  }

  private add(b: number, i: number): void {
    let arr = this.buckets[b];
    const n = this.bucketLen[b];
    if (n >= arr.length) {
      const grown = new Int32Array(arr.length * 2);
      grown.set(arr);
      this.buckets[b] = arr = grown;
    }
    arr[n] = i;
    this.bucketLen[b] = n + 1;
  }
}

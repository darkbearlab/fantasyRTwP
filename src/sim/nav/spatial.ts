import type { Unit } from '../unit';

/**
 * 空間分格（SPEC_SLICE4 §8）：每節拍重建一次，查詢某點附近的單位，避免兩兩檢查（O(n²)）。
 * 查詢結果依單位在 world.units 中的順序排列，維持決定論。
 */
export class SpatialHash {
  private cells = new Map<number, number[]>();
  private list: readonly Unit[] = [];

  constructor(readonly cellSize = 2) {}

  private key(cx: number, cy: number): number {
    return (cx + 1024) * 4096 + (cy + 1024);
  }

  /** 重建（只放存活單位）；index 為單位在 units 陣列中的位置 */
  rebuild(units: readonly Unit[]): void {
    this.cells.clear();
    this.list = units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.dead) continue;
      const k = this.key(Math.floor(u.pos.x / this.cellSize), Math.floor(u.pos.y / this.cellSize));
      const c = this.cells.get(k);
      if (c) c.push(i);
      else this.cells.set(k, [i]);
    }
  }

  /** 中心 (x, y) 半徑 r 內「可能」相鄰的單位索引（依索引遞增；呼叫者自行做精確距離判定） */
  queryIndices(x: number, y: number, r: number): number[] {
    const s = this.cellSize;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    const out: number[] = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.cells.get(this.key(cx, cy));
        if (c) for (const i of c) out.push(i);
      }
    }
    out.sort((a, b) => a - b);
    return out;
  }

  query(x: number, y: number, r: number): Unit[] {
    return this.queryIndices(x, y, r).map((i) => this.list[i]);
  }
}

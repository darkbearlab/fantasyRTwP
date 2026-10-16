/**
 * 戰術地形（SPEC_SLICE3 §2）：以導航格子大小記錄每格的地形旗標。
 * 草叢會被燒掉，所以每個 World 持有自己的一份。
 */
import { NAV_CELL } from './constants';
import type { MapDef, TerrainKind } from './data/types';
import type { Vec } from './math';

export const T_BRUSH = 1;
export const T_SHALLOW = 2;
export const T_HEDGE = 4;
export const T_HIGH = 8;

const FLAG: Record<TerrainKind, number> = { brush: T_BRUSH, shallow: T_SHALLOW, hedge: T_HEDGE, high: T_HIGH };

export class TerrainGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cell = NAV_CELL;
  readonly flags: Uint8Array;
  /** 草叢連通區塊編號（同一片草叢內的單位彼此看得見）；-1 表示不是草叢 */
  readonly patch: Int32Array;
  /** 地圖上是否有任何地形（沒有時可以略過計算） */
  readonly any: boolean;
  /** 地形變動次數（草叢燒光時遞增，畫面據此重畫） */
  version = 0;

  constructor(map: MapDef) {
    this.cols = Math.ceil(map.width / this.cell);
    this.rows = Math.ceil(map.height / this.cell);
    this.flags = new Uint8Array(this.cols * this.rows);
    this.patch = new Int32Array(this.cols * this.rows).fill(-1);
    const list = map.terrain ?? [];
    this.any = list.length > 0;
    for (const t of list) {
      const f = FLAG[t.kind];
      for (let cy = 0; cy < this.rows; cy++) {
        for (let cx = 0; cx < this.cols; cx++) {
          const px = (cx + 0.5) * this.cell;
          const py = (cy + 0.5) * this.cell;
          if (px >= t.x && px < t.x + t.w && py >= t.y && py < t.y + t.h) this.flags[cy * this.cols + cx] |= f;
        }
      }
    }
    this.labelPatches();
  }

  /** 以 4 連通標記草叢區塊 */
  private labelPatches(): void {
    let id = 0;
    for (let i = 0; i < this.flags.length; i++) {
      if (!(this.flags[i] & T_BRUSH) || this.patch[i] >= 0) continue;
      const stack = [i];
      this.patch[i] = id;
      while (stack.length) {
        const c = stack.pop()!;
        for (const n of this.neighbors(c)) {
          if (this.flags[n] & T_BRUSH && this.patch[n] < 0) {
            this.patch[n] = id;
            stack.push(n);
          }
        }
      }
      id++;
    }
  }

  neighbors(i: number): number[] {
    const cx = i % this.cols;
    const cy = (i - cx) / this.cols;
    const out: number[] = [];
    if (cx > 0) out.push(i - 1);
    if (cx < this.cols - 1) out.push(i + 1);
    if (cy > 0) out.push(i - this.cols);
    if (cy < this.rows - 1) out.push(i + this.cols);
    return out;
  }

  indexOf(p: Vec): number {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return -1;
    return cy * this.cols + cx;
  }

  centerOf(i: number): Vec {
    const cx = i % this.cols;
    return { x: (cx + 0.5) * this.cell, y: ((i - cx) / this.cols + 0.5) * this.cell };
  }

  flagsAt(p: Vec): number {
    const i = this.indexOf(p);
    return i < 0 ? 0 : this.flags[i];
  }

  has(p: Vec, flag: number): boolean {
    return (this.flagsAt(p) & flag) !== 0;
  }

  patchAt(p: Vec): number {
    const i = this.indexOf(p);
    return i < 0 ? -1 : this.patch[i];
  }

  /** 草叢燒光：移除旗標 */
  clearBrush(i: number): void {
    this.flags[i] &= ~T_BRUSH;
    this.patch[i] = -1;
    this.version++;
  }
}

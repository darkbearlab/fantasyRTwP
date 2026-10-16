import type { MapDef, Rect } from '../data/types';
import type { Vec } from '../math';

export interface Cell {
  cx: number;
  cy: number;
}

/**
 * 導航格子。`inflate` 為膨脹半徑：格子中心離任何障礙物（含地圖邊界）小於此距離即視為不可走。
 * inflate = 0 的格子用於視線判定（格子中心落在障礙物內才算遮擋）。
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cell: number,
    readonly inflate: number,
    obstacles: Rect[],
  ) {
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const px = (cx + 0.5) * cell;
        const py = (cy + 0.5) * cell;
        let b = false;
        if (inflate > 0 && (px < inflate || py < inflate || width - px < inflate || height - py < inflate)) b = true;
        for (const r of obstacles) {
          if (b) break;
          if (inflate <= 0) {
            b = px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
          } else {
            const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
            const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
            b = dx * dx + dy * dy < inflate * inflate;
          }
        }
        this.blocked[cy * this.cols + cx] = b ? 1 : 0;
      }
    }
  }

  static fromMap(map: MapDef, cell: number, inflate: number): NavGrid {
    return new NavGrid(map.width, map.height, cell, inflate, map.obstacles);
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows;
  }

  /** 超出邊界視為阻擋 */
  isBlockedCell(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    return this.blocked[cy * this.cols + cx] === 1;
  }

  cellOf(p: Vec): Cell {
    return { cx: Math.floor(p.x / this.cell), cy: Math.floor(p.y / this.cell) };
  }

  cellCenter(cx: number, cy: number): Vec {
    return { x: (cx + 0.5) * this.cell, y: (cy + 0.5) * this.cell };
  }

  isWalkable(p: Vec): boolean {
    const c = this.cellOf(p);
    return !this.isBlockedCell(c.cx, c.cy);
  }

  /** 由近到遠螺旋搜尋最近的可走格子 */
  nearestWalkableCell(cx: number, cy: number, maxRing = 40): Cell | null {
    if (!this.isBlockedCell(cx, cy)) return { cx, cy };
    for (let r = 1; r <= maxRing; r++) {
      let best: Cell | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (this.isBlockedCell(x, y)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = { cx: x, cy: y };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }
}

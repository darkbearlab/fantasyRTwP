/**
 * 視線與戰爭迷霧（SPEC_SLICE4 §6）。放在 sim：英雄能不能把敵人當成目標由這裡決定；畫面只負責顯示。
 * 每格三種狀態：未探索（0）、已探索但不在視野內（1）、視野內（2）。隊伍的視野是所有存活英雄視野的聯集。
 */
import { segmentClear } from './los';
import type { Vec } from './math';
import type { NavGrid } from './nav/grid';

export const FOG_UNEXPLORED = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;

export class Vision {
  readonly cols: number;
  readonly rows: number;
  /** 每格狀態（0／1／2） */
  readonly state: Uint8Array;
  /** 每次重算後遞增；畫面層據此判斷要不要重畫迷霧 */
  version = 0;

  constructor(
    width: number,
    height: number,
    readonly cell: number,
    private readonly sight: NavGrid,
  ) {
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.state = new Uint8Array(this.cols * this.rows);
  }

  /** 以觀察者（位置、視野半徑）重算：視野內 → 2；先前視野內、現在看不到 → 1 */
  update(viewers: { pos: Vec; range: number }[]): void {
    const s = this.state;
    for (let i = 0; i < s.length; i++) if (s[i] === FOG_VISIBLE) s[i] = FOG_EXPLORED;
    const c = this.cell;
    for (const v of viewers) {
      const r = v.range;
      const x0 = Math.max(0, Math.floor((v.pos.x - r) / c));
      const x1 = Math.min(this.cols - 1, Math.floor((v.pos.x + r) / c));
      const y0 = Math.max(0, Math.floor((v.pos.y - r) / c));
      const y1 = Math.min(this.rows - 1, Math.floor((v.pos.y + r) / c));
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const i = cy * this.cols + cx;
          if (s[i] === FOG_VISIBLE) continue;
          const p = { x: (cx + 0.5) * c, y: (cy + 0.5) * c };
          const dx = p.x - v.pos.x;
          const dy = p.y - v.pos.y;
          if (dx * dx + dy * dy > r * r) continue;
          // 擋視線的障礙物本身也算「看到了」（牆面可見），但牆後看不到
          if (this.sight.isWalkable(p) ? segmentClear(this.sight, v.pos, p) : segmentClear(this.sight, v.pos, towards(p, v.pos, c * 0.75))) s[i] = FOG_VISIBLE;
        }
      }
    }
    this.version++;
  }

  stateAt(p: Vec): number {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return FOG_UNEXPLORED;
    return this.state[cy * this.cols + cx];
  }

  isVisible(p: Vec): boolean {
    return this.stateAt(p) === FOG_VISIBLE;
  }
}

/** 從 p 往 toward 方向退 d（判斷牆面格：看得到牆面前的那一點就算看到牆） */
function towards(p: Vec, toward: Vec, d: number): Vec {
  const dx = toward.x - p.x;
  const dy = toward.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * d, y: p.y + (dy / len) * d };
}

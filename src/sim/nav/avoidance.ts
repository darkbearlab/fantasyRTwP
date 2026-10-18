import type { Unit } from '../unit';
import type { NavGrid } from './grid';
import { SpatialHash } from './spatial';

/** 候選配對的額外查詢距離（推擠中位置會小幅改變） */
const PAIR_MARGIN = 0.5;

/**
 * 單位避讓（SPEC §8-5）：重疊的單位互相推開，推開後不得進入不可走格子。
 * - 同隊：移動中的單位擠到閒置單位時，閒置者讓位。
 * - 敵對：移動中的單位撞到靜止的敵人時，由移動者退回（不能推開敵人）。
 */
export function separateUnits(units: readonly Unit[], gridFor: (u: Unit) => NavGrid): void {
  // 空間分格篩選候選（SPEC_SLICE4 §8）；配對順序與兩兩檢查相同（依陣列順序 i < j），結果維持決定論
  let maxR = 0;
  for (const u of units) if (!u.dead && u.radius > maxR) maxR = u.radius;
  const hash = new SpatialHash(2);
  hash.rebuild(units);
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (a.dead) continue;
    for (const j of hash.queryIndices(a.pos.x, a.pos.y, a.radius + maxR + PAIR_MARGIN)) {
      if (j <= i) continue;
      const b = units[j];
      if (b.dead) continue;
      let dx = b.pos.x - a.pos.x;
      let dy = b.pos.y - a.pos.y;
      let d = Math.hypot(dx, dy);
      const minD = a.radius + b.radius;
      if (d >= minD) continue;
      if (d < 1e-6) {
        // 完全重疊：以 id 決定方向，保持決定論
        const ang = ((a.id * 7 + b.id * 13) % 16) * (Math.PI / 8);
        dx = Math.cos(ang);
        dy = Math.sin(ang);
        d = 1;
      } else {
        dx /= d;
        dy /= d;
      }
      const overlap = minD - Math.min(d, minD);
      let wa = 0.5;
      let wb = 0.5;
      const am = a.movedThisTick;
      const bm = b.movedThisTick;
      if (am !== bm) {
        const moverIsA = am;
        if (a.team === b.team) {
          // 閒置者讓位
          wa = moverIsA ? 0 : 1;
          wb = moverIsA ? 1 : 0;
        } else {
          // 不能推開敵人：移動者被擋回
          wa = moverIsA ? 1 : 0;
          wb = moverIsA ? 0 : 1;
        }
      }
      // 不會被推開的單位（巢穴）：對方承受全部推力
      if (a.def.immovable) {
        wb += wa;
        wa = 0;
      } else if (b.def.immovable) {
        wa += wb;
        wb = 0;
      }
      pushUnit(a, -dx * overlap * wa, -dy * overlap * wa, gridFor(a));
      pushUnit(b, dx * overlap * wb, dy * overlap * wb, gridFor(b));
    }
  }
}

function pushUnit(u: Unit, px: number, py: number, grid: NavGrid): void {
  if (px === 0 && py === 0) return;
  if (u.def.immovable) return;
  const np = { x: u.pos.x + px, y: u.pos.y + py };
  if (grid.isWalkable(np)) {
    u.pos = np;
    return;
  }
  // 沿軸滑動
  const nx = { x: u.pos.x + px, y: u.pos.y };
  if (px !== 0 && grid.isWalkable(nx)) {
    u.pos = nx;
    return;
  }
  const ny = { x: u.pos.x, y: u.pos.y + py };
  if (py !== 0 && grid.isWalkable(ny)) u.pos = ny;
}

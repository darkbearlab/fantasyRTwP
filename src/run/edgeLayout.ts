/**
 * 野外、城內地圖共用的「入口與出口位置」（格子座標：x 往右、y 往下，畫面方向）。
 * SPEC_SLICE6 §4：從哪個節點來，出生點就在那一側；出口放在相鄰節點的方向（上＝下一層、下＝前一層、左右＝同層）。
 * 和入口同一邊的出口放在離入口遠的那一半。
 */
export type MapEdge = 'top' | 'bottom' | 'left' | 'right';
type Cell = [number, number];

/** 往地圖內側的方向 */
export function inward(edge: MapEdge): Cell {
  return edge === 'bottom' ? [0, -1] : edge === 'top' ? [0, 1] : edge === 'left' ? [1, 0] : [-1, 0];
}

/** 入口所在的邊格（along＝沿著那一邊的位置） */
export function edgeCell(edge: MapEdge, along: number, W: number, H: number): Cell {
  return edge === 'bottom' ? [along, H - 1] : edge === 'top' ? [along, 0] : edge === 'left' ? [0, along] : [W - 1, along];
}

/** 四名英雄的出生格：入口往內 depths 格（預設 2、4），左右各一 */
export function spawnCells(edge: MapEdge, along: number, W: number, H: number, depths: [number, number] = [2, 4]): Cell[] {
  const [ex, ey] = edgeCell(edge, along, W, H);
  const [dx, dy] = inward(edge);
  const [px, py] = [dy, dx];
  return depths.flatMap((k) => [-1, 1].map((s) => [ex + dx * k + px * s, ey + dy * k + py * s] as Cell));
}

/** 從入口拉路時，寬 wd 的路塊左上角 */
export function roadStart(edge: MapEdge, along: number, W: number, H: number, wd: number): Cell {
  const a = along - 1;
  return edge === 'bottom' ? [a, H - wd] : edge === 'top' ? [a, 0] : edge === 'left' ? [0, a] : [W - wd, a];
}

export interface EdgeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 出口的位置（S × S）：沿著那一邊平均分配；和入口同一邊的，排在離入口遠的那一半。
 * 順序照傳入的順序：上下兩邊由左到右、左右兩邊由上到下。
 */
export function exitRects<E extends { edge: MapEdge }>(list: E[], W: number, H: number, S: number, entry: { edge: MapEdge; along: number }): (E & EdgeRect)[] {
  return list.map((e) => {
    const same = list.filter((x) => x.edge === e.edge);
    const order = same.indexOf(e);
    const len = e.edge === 'top' || e.edge === 'bottom' ? W : H;
    let lo = 0;
    let hi = len;
    if (e.edge === entry.edge) {
      // 入口那一邊：只用離入口遠的那一半
      if (entry.along < len / 2) lo = len / 2 + 2;
      else hi = len / 2 - 2;
    }
    const c = Math.round(lo + ((order + 0.5) / same.length) * (hi - lo));
    const a0 = Math.max(1, Math.min(len - S - 1, c - S / 2));
    const r = e.edge === 'top' ? { x: a0, y: 0 } : e.edge === 'bottom' ? { x: a0, y: H - S } : e.edge === 'left' ? { x: 0, y: a0 } : { x: W - S, y: a0 };
    return { ...e, ...r, w: S, h: S };
  });
}

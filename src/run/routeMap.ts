/**
 * FTL 式路線圖（SPEC_SLICE6 §4）：純函式、決定論。
 * - 生成：每層 4～5 個節點（ROUTE_MAP 旋鈕），往下一層不交叉的連線＋同層相鄰的橫向連線；所有連線都可以雙向走（links）。
 * - 主力：從頭目前一層開始佔領節點，每幾回合擴散；節點被重複訪問時額外往那裡蔓延。
 * - 冠軍：在圖上遊蕩，發現玩家後每回合沿最短路徑追一格；追到就進入特殊戰鬥。
 */
import { ROUTE_MAP } from './data/routeMap';
import type { MapNode, NodeType, RunMap } from './mapGen';
import { rngFor } from './seed';
import type { Rng } from '../sim/rng';

export function generateRouteMap(seed: number, layers: number = ROUTE_MAP.layers): RunMap {
  const rng = rngFor(seed, 'routeMap');
  for (let attempt = 0; attempt < 200; attempt++) {
    const map = tryGenerate(rng, layers);
    if (map && validateRouteMap(map).length === 0) return map;
  }
  throw new Error('路線圖生成失敗');
}

function link(a: MapNode, b: MapNode): void {
  const la = (a.links ??= []);
  const lb = (b.links ??= []);
  if (!la.includes(b.id)) la.push(b.id);
  if (!lb.includes(a.id)) lb.push(a.id);
}

function tryGenerate(rng: Rng, L: number): RunMap | null {
  const R = ROUTE_MAP;
  // 節點類型的數量依層數比例縮放（以 ROUTE_MAP.layers 為基準）
  const k = L / R.layers;
  const scaled = (r: [number, number]): [number, number] => [Math.max(1, Math.round(r[0] * k)), Math.max(1, Math.round(r[1] * k))];
  const nodes: MapNode[] = [];
  const layers: number[][] = [];
  for (let l = 1; l <= L; l++) {
    const size = l === L ? 1 : rng.int(R.width[0], R.width[1]);
    const ids: number[] = [];
    for (let i = 0; i < size; i++) {
      const id = nodes.length;
      nodes.push({ id, layer: l, index: i, type: l === L ? 'boss' : 'battle', next: [], links: [] });
      ids.push(id);
    }
    layers.push(ids);
  }
  // 往下一層：在 (i, j) 格子上走一條單調路徑（不交叉、每個節點都有連線）
  for (let l = 0; l < L - 1; l++) {
    const A = layers[l];
    const B = layers[l + 1];
    let i = 0;
    let j = 0;
    const add = () => {
      nodes[A[i]].next.push(B[j]);
      link(nodes[A[i]], nodes[B[j]]);
    };
    add();
    while (i < A.length - 1 || j < B.length - 1) {
      const canI = i < A.length - 1;
      const canJ = j < B.length - 1 && nodes[A[i]].next.length < R.maxForwardLinks;
      const choices: ('i' | 'j' | 'both')[] = [];
      if (canI) choices.push('i');
      if (canJ) choices.push('j');
      if (canI && j < B.length - 1) choices.push('both');
      if (choices.length === 0) return null;
      const c = choices[rng.int(0, choices.length - 1)];
      if (c === 'i' || c === 'both') i++;
      if (c === 'j' || c === 'both') j++;
      add();
    }
  }
  // 同層橫向連線（頭目層除外）
  for (let l = 0; l < L - 1; l++) {
    const ids = layers[l];
    for (let k = 0; k + 1 < ids.length; k++) if (rng.chance(R.lateralChance)) link(nodes[ids[k]], nodes[ids[k + 1]]);
  }

  const at = (layer: number) => layers[layer - 1].map((id) => nodes[id]);
  const pick = (minLayer: number, maxLayer: number): MapNode | null => {
    const pool: MapNode[] = [];
    for (let l = Math.max(2, minLayer); l <= Math.min(L - 1, maxLayer); l++) for (const n of at(l)) if (n.type === 'battle') pool.push(n);
    return pool.length ? pool[rng.int(0, pool.length - 1)] : null;
  };
  const place = (type: NodeType, range: [number, number], minLayer: number) => {
    for (let k = rng.int(range[0], range[1]); k > 0; k--) {
      const n = pick(minLayer, L - 1);
      if (n) n.type = type;
    }
  };
  const restLayer = at(L - 1);
  restLayer[rng.int(0, restLayer.length - 1)].type = 'rest';
  place('rest', scaled(R.extraRests), 4);
  place('elite', scaled(R.elites), 3);
  place('event', scaled(R.events), 2);
  place('shop', R.shops, 2);
  return { layerCount: L, layers, nodes };
}

/** 路線圖規則：層數、連線對稱、從第一層走得到每個節點與頭目 */
export function validateRouteMap(map: RunMap): string[] {
  const err: string[] = [];
  const { nodes, layers } = map;
  if (layers.length !== map.layerCount) err.push('層數不符');
  const last = layers[layers.length - 1];
  if (last.length !== 1 || nodes[last[0]].type !== 'boss') err.push('最後一層必須只有頭目');
  for (const n of nodes) {
    for (const t of n.links ?? []) if (!(nodes[t].links ?? []).includes(n.id)) err.push(`連線不對稱 ${n.id}-${t}`);
    for (const t of n.next) if (nodes[t].layer !== n.layer + 1) err.push(`節點 ${n.id} 的往前連線不是下一層`);
    if (n.layer === 1 && n.type !== 'battle') err.push('第 1 層必須全部是戰鬥');
    if (n.type === 'elite' && n.layer <= 2) err.push('精英不能在第 1–2 層');
  }
  const seen = new Set<number>(layers[0]);
  const queue = [...layers[0]];
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of nodes[id].links ?? []) if (!seen.has(t)) (seen.add(t), queue.push(t));
  }
  if (seen.size !== nodes.length) err.push('有節點走不到');
  return err;
}

/** 相鄰節點（雙向） */
export function neighbors(map: RunMap, id: number): number[] {
  const n = map.nodes[id];
  return n.links ?? n.next;
}

/** 最短路徑的距離（節點數）；走不到回傳 Infinity */
export function distances(map: RunMap, from: number): Map<number, number> {
  const d = new Map<number, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of neighbors(map, id)) {
      if (d.has(t)) continue;
      d.set(t, d.get(id)! + 1);
      queue.push(t);
    }
  }
  return d;
}

/** 從 from 往 to 走一步（最短路徑上的下一個節點；相同的距離時取 id 小的，保持決定論） */
export function stepToward(map: RunMap, from: number, to: number): number {
  if (from === to) return from;
  const d = distances(map, to);
  const opts = neighbors(map, from).filter((t) => d.has(t));
  if (opts.length === 0) return from;
  return opts.reduce((a, b) => (d.get(b)! < d.get(a)! || (d.get(b) === d.get(a) && b < a) ? b : a));
}

/** 節點相對於另一個節點的方向（出口與入口用）：下一層＝上、前一層＝下、同層＝左右 */
export function directionTo(map: RunMap, from: number, to: number): 'top' | 'bottom' | 'left' | 'right' {
  const a = map.nodes[from];
  const b = map.nodes[to];
  if (b.layer > a.layer) return 'top';
  if (b.layer < a.layer) return 'bottom';
  return b.index < a.index ? 'left' : 'right';
}

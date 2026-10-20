/**
 * 路線圖生成（SPEC_SLICE2 §2）：純函式、以種子決定論生成，附規則驗證器。
 */
import { ECONOMY } from './data/economy';
import { rngFor } from './seed';
import type { Rng } from '../sim/rng';

/** shop：商人（沉穩節奏的遠征才有，SPEC_SLICE5 §17） */
export type NodeType = 'battle' | 'elite' | 'event' | 'rest' | 'boss' | 'shop';

export interface MapNode {
  id: number;
  /** 1 起算的層數 */
  layer: number;
  /** 層內由上到下的位置 */
  index: number;
  type: NodeType;
  /** 下一層可前往的節點 id */
  next: number[];
}

export interface RunMap {
  layerCount: number;
  /** 每層的節點 id（由上到下） */
  layers: number[][];
  nodes: MapNode[];
}

export const NODE_LABEL: Record<NodeType, string> = {
  battle: '戰鬥',
  elite: '精英',
  event: '事件',
  rest: '休息',
  boss: '頭目',
  shop: '商人',
};

export const NODE_ICON: Record<NodeType, string> = {
  battle: '⚔',
  elite: '☠',
  event: '？',
  rest: '🔥',
  boss: '👑',
  shop: '💰',
};

export interface MapOptions {
  /** 放商人節點（沉穩節奏的遠征） */
  shops?: boolean;
}

export function generateMap(seed: number, layerCount = ECONOMY.mapLayers, opts: MapOptions = {}): RunMap {
  const rng = rngFor(seed, 'map');
  for (let attempt = 0; attempt < 500; attempt++) {
    const map = tryGenerate(rng, layerCount, opts);
    if (map && validateMap(map).length === 0) return map;
  }
  throw new Error('路線圖生成失敗');
}

function tryGenerate(rng: Rng, layerCount: number, opts: MapOptions): RunMap | null {
  const nodes: MapNode[] = [];
  const layers: number[][] = [];
  for (let l = 1; l <= layerCount; l++) {
    const size = l === layerCount ? 1 : rng.int(2, 3);
    const ids: number[] = [];
    for (let i = 0; i < size; i++) {
      const id = nodes.length;
      nodes.push({ id, layer: l, index: i, type: l === layerCount ? 'boss' : 'battle', next: [] });
      ids.push(id);
    }
    layers.push(ids);
  }
  // 連線：在 (i, j) 格子上走一條單調路徑，保證不交叉、每個節點都有連線
  for (let l = 0; l < layerCount - 1; l++) {
    const A = layers[l];
    const B = layers[l + 1];
    let i = 0;
    let j = 0;
    const link = () => nodes[A[i]].next.push(B[j]);
    link();
    while (i < A.length - 1 || j < B.length - 1) {
      const canI = i < A.length - 1;
      const canJ = j < B.length - 1 && nodes[A[i]].next.length < 2;
      const canBoth = canI && j < B.length - 1;
      const choices: ('i' | 'j' | 'both')[] = [];
      if (canI) choices.push('i');
      if (canJ) choices.push('j');
      if (canBoth) choices.push('both');
      if (choices.length === 0) return null;
      const c = choices[rng.int(0, choices.length - 1)];
      if (c === 'i' || c === 'both') i++;
      if (c === 'j' || c === 'both') j++;
      link();
    }
  }

  const at = (layer: number) => layers[layer - 1].map((id) => nodes[id]);
  const pickBattleNode = (minLayer: number, maxLayer: number): MapNode | null => {
    const pool: MapNode[] = [];
    for (let l = Math.max(2, minLayer); l <= Math.min(layerCount - 1, maxLayer); l++) for (const n of at(l)) if (n.type === 'battle') pool.push(n);
    return pool.length ? pool[rng.int(0, pool.length - 1)] : null;
  };
  // 倒數第二層（預設第 7 層）至少一個休息
  const restLayer = layerCount - 1;
  if (restLayer >= 2) {
    const r = at(restLayer);
    r[rng.int(0, r.length - 1)].type = 'rest';
    if (rng.chance(0.5)) {
      const extra = pickBattleNode(4, restLayer - 1);
      if (extra) extra.type = 'rest';
    }
  }
  const elites = rng.int(1, 2);
  for (let k = 0; k < elites; k++) {
    const n = pickBattleNode(3, layerCount - 1);
    if (n) n.type = 'elite';
  }
  const events = rng.int(2, 4);
  for (let k = 0; k < events; k++) {
    const n = pickBattleNode(2, layerCount - 1);
    if (n) n.type = 'event';
  }
  // 商人放在最後（不影響沒有商人的路線圖：舊模式的亂數順序不變）
  if (opts.shops) {
    const shops = rng.int(ECONOMY.shopNodes[0], ECONOMY.shopNodes[1]);
    for (let k = 0; k < shops; k++) {
      const n = pickBattleNode(2, layerCount - 1);
      if (n) n.type = 'shop';
    }
  }
  return { layerCount, layers, nodes };
}

/** 檢查 §2.1–§2.2 的所有規則，回傳違規說明（空陣列＝合法） */
export function validateMap(map: RunMap): string[] {
  const err: string[] = [];
  const { nodes, layers, layerCount } = map;
  if (layers.length !== layerCount) err.push('層數不符');
  const count = (t: NodeType) => nodes.filter((n) => n.type === t).length;
  layers.forEach((ids, li) => {
    const l = li + 1;
    if (l === layerCount) {
      if (ids.length !== 1 || nodes[ids[0]].type !== 'boss') err.push('最後一層必須只有頭目');
    } else if (ids.length < 2 || ids.length > 3) err.push(`第 ${l} 層節點數 ${ids.length}`);
    for (const id of ids) {
      const n = nodes[id];
      if (n.layer !== l) err.push(`節點 ${id} 層數錯誤`);
      if (l === 1 && n.type !== 'battle') err.push('第 1 層必須全部是戰鬥');
      if (n.type === 'boss' && l !== layerCount) err.push('頭目只能在最後一層');
      if (n.type === 'elite' && l <= 2) err.push('精英不能在第 1–2 層');
      if (n.type === 'rest' && l <= 3) err.push('休息不能在第 1–3 層');
      if (n.type === 'shop' && l <= 1) err.push('商人不能在第 1 層');
      if (l < layerCount) {
        if (n.next.length < 1 || n.next.length > 2) err.push(`節點 ${id} 出線數 ${n.next.length}`);
        for (const t of n.next) {
          if (nodes[t].layer !== l + 1) err.push(`節點 ${id} 連到非下一層`);
          if (n.type === 'rest' && nodes[t].type === 'rest') err.push('同一路線連續兩個休息');
        }
      } else if (n.next.length !== 0) err.push('頭目不應有出線');
      if (l > 1 && !nodes.some((p) => p.next.includes(id))) err.push(`節點 ${id} 沒有入線`);
    }
    // 連線不交叉：上方節點的連線不能低於下方節點的連線
    if (l < layerCount) {
      const edges: [number, number][] = [];
      for (const id of ids) for (const t of nodes[id].next) edges.push([nodes[id].index, nodes[t].index]);
      for (const [a1, b1] of edges) for (const [a2, b2] of edges) if (a1 < a2 && b1 > b2) err.push(`第 ${l} 層連線交叉`);
    }
  });
  const elites = count('elite');
  if (elites < 1 || elites > 2) err.push(`精英數 ${elites}`);
  const events = count('event');
  if (events < 2 || events > 4) err.push(`事件數 ${events}`);
  if (layerCount >= 2 && !layers[layerCount - 2].some((id) => nodes[id].type === 'rest')) err.push('倒數第二層沒有休息');
  return err;
}

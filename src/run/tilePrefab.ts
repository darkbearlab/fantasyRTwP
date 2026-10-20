/**
 * 手工預製件讀取器（交接文件 §10）：讀 Alan 用拼圖台匯出的 tilebench-prefab/1 JSON，算出占地、擋路格、門口。
 * 純函式：不讀檔案；呼叫端（遊戲用 Vite 的 import.meta.glob、工具與測試用 fs）把 JSON 內容傳進來。
 *
 * 格式：layers.ground、layers.objects 都是 h 列 × w 欄的字串；每格是 "表號:格號"（表 0＝master_everything.png，
 * 格號＝列 × sheetCols＋欄），空字串是空格。繪製時先畫 ground、再畫 objects。
 */
import { TILE_PREFAB_DEFAULT, TILE_PREFAB_META } from './data/tilePrefabMeta';
import type { TilePrefabMeta } from './data/tilePrefabMeta';

export interface TilePrefabFile {
  format: string;
  name?: string;
  sheet?: string;
  sheetCols: number;
  tileSize?: number;
  w: number;
  h: number;
  layers: { ground?: string[][]; objects?: string[][] };
}

/** 一格：表號＋格號；空格是 null */
export type PrefabCell = { sheet: number; tile: number } | null;

export interface TilePrefab extends TilePrefabMeta {
  /** 檔名（不含 .json），也是 TILE_PREFAB_META 的鍵 */
  id: string;
  name: string;
  w: number;
  h: number;
  sheetCols: number;
  ground: PrefabCell[][];
  objects: PrefabCell[][];
  /** 擋路的格（相對左上角） */
  blockCells: [number, number][];
  /** 門口要空出來的格（相對左上角） */
  doorCells: [number, number][];
}

function parseLayer(rows: string[][] | undefined, w: number, h: number, id: string): PrefabCell[][] {
  const out: PrefabCell[][] = [];
  for (let y = 0; y < h; y++) {
    const row: PrefabCell[] = [];
    for (let x = 0; x < w; x++) {
      const s = rows?.[y]?.[x] ?? '';
      if (!s) {
        row.push(null);
        continue;
      }
      const m = /^(\d+):(\d+)$/.exec(s);
      if (!m) throw new Error(`預製件 ${id}：看不懂的格子「${s}」（第 ${y} 列第 ${x} 欄）`);
      row.push({ sheet: Number(m[1]), tile: Number(m[2]) });
    }
    out.push(row);
  }
  return out;
}

export function parseTilePrefab(id: string, file: TilePrefabFile): TilePrefab {
  if (!/^tilebench-prefab\/1$/.test(file.format)) throw new Error(`預製件 ${id}：不支援的格式 ${file.format}`);
  const meta: TilePrefabMeta = {
    ...TILE_PREFAB_DEFAULT,
    ...(id.startsWith('房屋') ? { kind: 'house' as const, blocksSight: true } : {}),
    ...TILE_PREFAB_META[id],
  };
  const { w, h } = file;
  const ground = parseLayer(file.layers.ground, w, h, id);
  const objects = parseLayer(file.layers.objects, w, h, id);
  const blockCells: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (meta.blocks === 'rect' || objects[y][x]) blockCells.push([x, y]);
  const doorCells: [number, number][] = [];
  if (meta.door) {
    const d = meta.door;
    const along = d.side === 'up' || d.side === 'down';
    for (let k = 0; k < d.w; k++) doorCells.push(along ? [d.x + k, d.y] : [d.x, d.y + k]);
  }
  return { ...meta, id, name: file.name ?? id, w, h, sheetCols: file.sheetCols, ground, objects, blockCells, doorCells };
}

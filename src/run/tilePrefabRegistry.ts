/**
 * 手工預製件的登記處：run 層不能讀檔案，由呼叫端登記讀好的預製件
 * （遊戲：BootScene 用 Vite 的 import.meta.glob；工具與測試：用 fs 讀 src/run/data/tilePrefabs/）。
 * 沒登記時城內地圖全部用佔位房子。
 */
import type { TilePrefab } from './tilePrefab';

let registered: TilePrefab[] = [];

export function registerTilePrefabs(list: TilePrefab[]): void {
  registered = list;
}

export function tilePrefabs(): TilePrefab[] {
  return registered;
}

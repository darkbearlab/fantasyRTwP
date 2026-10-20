/**
 * 手工預製件（交接文件 §10）的遊戲設定：Alan 用拼圖台拼好的 JSON 放在 src/run/data/tilePrefabs/，這裡補「圖上看不出來」的規則。
 * 沒列在這裡的預製件也能用：用名稱判斷種類（名稱開頭是「房屋」就是房屋），其餘照 TILE_PREFAB_DEFAULT。
 *
 * - kind：house 房屋（城內生成器拿來排街區）、well 水井（廣場中央）、decor 其他擺設。
 * - blocks：擋路的格。objects＝物件層有圖的格（Alan 決定）；rect＝整個矩形。
 * - blocksSight：擋路的格是否也擋視線（房屋擋，水井不擋）。
 * - door：門口外側要空出來的格（相對預製件左上角；可以在矩形裡，例如房屋做例的門在第 6–7 列，第 8 列的門前是空地）。
 *   生成器保證這些格不放任何東西、而且走得到。沒寫就不檢查。
 */
import type { Facing } from '../fieldGen';

export interface TilePrefabMeta {
  kind: 'house' | 'well' | 'decor';
  blocks: 'objects' | 'rect';
  blocksSight: boolean;
  door?: { x: number; y: number; w: number; side: Facing };
}

export const TILE_PREFAB_DEFAULT: TilePrefabMeta = { kind: 'decor', blocks: 'objects', blocksSight: false };

export const TILE_PREFAB_META: Record<string, Partial<TilePrefabMeta>> = {
  /** Alan 的房屋做例 01：9×8，L 形，左側縱向屋脊的側翼；門在第 5、6 欄（從 0 數是 4、5） */
  房屋_做例01: { kind: 'house', blocksSight: true, door: { x: 4, y: 7, w: 2, side: 'down' } },
  /** 水井：3×3 */
  水井: { kind: 'well' },
};

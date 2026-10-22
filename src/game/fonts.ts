/**
 * 英文像素字體 Alagard（Hewett Tsoi；授權素材，在私有素材 repo 的 fonts/，見 ASSET_LICENSES.md）。
 * 交接文件：D:/_遊戲素材/字體/交接_英文字體Alagard給開發session.md
 * - 只有拉丁字母、數字、標點：放在字型清單最前面，中文字由瀏覽器逐字退回原本的字型。
 * - 原生 16px，只用 16 的整數倍；更小的字不用 Alagard。
 * - 找不到字型檔時（CI、fork、沒拉素材）直接退回原本的字型，不影響遊戲。
 */
import { FONT } from './render/palette';

export const PIXEL_FONT_NAME = 'Alagard';
/** Phaser 文字與 CSS 用的字型清單：英文、數字用 Alagard，中文退回原本的字型 */
export const PIXEL_FONT = `"${PIXEL_FONT_NAME}", ${FONT}`;

let ready: Promise<boolean> | null = null;

/** 載入 Alagard（只載一次）；回傳是否成功。建立用到它的文字物件前要先等這個 */
export function loadPixelFont(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    try {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined') return false;
      const face = new FontFace(PIXEL_FONT_NAME, 'url(assets/licensed/fonts/alagard.ttf)');
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      return false;
    }
  })();
  return ready;
}

/** 像素字體的大小：16 的整數倍（不到 16 的字回傳 null＝不要用 Alagard） */
export function pixelSize(px: number): number | null {
  if (px < 16) return null;
  return Math.max(16, Math.round(px / 16) * 16);
}

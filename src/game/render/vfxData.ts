/**
 * 逐格特效（Kendrick ML〈All Fantasy World Explosions vfx〉，授權素材：在私有素材 repo 的 vfx/kml/，不在公開 repo）。
 * 編號＝素材 session 總覽 GIF 上的編號（交接_需求單回覆_2026-10-22.md 第 3 節）；每一格是 vfx/kml/<兩位數編號>/<i>.png。
 * 沒有素材時（CI、fork）特效直接略過，不影響遊戲。
 */
export interface VfxSheet {
  frames: number;
  w: number;
  h: number;
}

export const VFX_SHEETS: Record<number, VfxSheet> = {
  1: { frames: 8, w: 32, h: 32 },
  2: { frames: 10, w: 32, h: 32 },
  3: { frames: 9, w: 32, h: 32 },
  4: { frames: 8, w: 32, h: 32 },
  5: { frames: 7, w: 32, h: 32 },
  6: { frames: 5, w: 32, h: 32 },
  7: { frames: 5, w: 32, h: 32 },
  8: { frames: 7, w: 32, h: 32 },
  9: { frames: 5, w: 32, h: 32 },
  10: { frames: 4, w: 32, h: 32 },
  11: { frames: 6, w: 32, h: 32 },
  12: { frames: 6, w: 32, h: 32 },
  13: { frames: 6, w: 32, h: 32 },
  14: { frames: 6, w: 32, h: 32 },
  15: { frames: 5, w: 32, h: 32 },
  16: { frames: 8, w: 93, h: 97 },
  17: { frames: 11, w: 93, h: 97 },
  18: { frames: 6, w: 64, h: 59 },
  19: { frames: 7, w: 54, h: 62 },
  20: { frames: 7, w: 50, h: 62 },
  21: { frames: 8, w: 77, h: 62 },
  22: { frames: 10, w: 66, h: 63 },
  23: { frames: 11, w: 61, h: 63 },
  24: { frames: 8, w: 61, h: 63 },
  25: { frames: 12, w: 61, h: 63 },
  26: { frames: 8, w: 61, h: 63 },
  27: { frames: 11, w: 127, h: 118 },
  28: { frames: 6, w: 127, h: 118 },
  29: { frames: 7, w: 32, h: 58 },
  30: { frames: 5, w: 32, h: 58 },
  31: { frames: 9, w: 32, h: 32 },
  32: { frames: 7, w: 32, h: 32 },
  33: { frames: 7, w: 32, h: 32 },
  34: { frames: 9, w: 32, h: 32 },
  35: { frames: 8, w: 32, h: 32 },
  36: { frames: 8, w: 32, h: 64 },
  37: { frames: 11, w: 32, h: 32 },
  38: { frames: 7, w: 32, h: 32 },
};

/**
 * 各個招式用哪些特效（素材 session 的建議編號，先試）：
 * id：編號；sizeM：畫面上的寬度（公尺）；tint：染色；fps：播放速度。
 */
export interface VfxUse {
  id: number;
  sizeM: number;
  tint?: number;
  fps?: number;
}

export const VFX_USE: Record<string, VfxUse[]> = {
  /** 冠軍吐息（火＋暗）：沿扇形排幾個 */
  breath: [
    { id: 16, sizeM: 2.6 },
    { id: 4, sizeM: 1.6 },
    { id: 14, sizeM: 1.6 },
  ],
  /** 馬匹震地：碎石環＋土黃煙塵 */
  stomp: [
    { id: 24, sizeM: 4.6 },
    { id: 19, sizeM: 3.2 },
  ],
  /** 衝鋒撞牆、投擲巨石落地 */
  impact: [
    { id: 12, sizeM: 1.4 },
    { id: 19, sizeM: 2.6 },
  ],
  /** 元素附魔（火＋冰）：每名受到附魔的隊友身上 */
  elementalEnchant: [
    { id: 5, sizeM: 1.2 },
    { id: 31, sizeM: 1.2 },
  ],
  /** 異教徒吸血：目標身上的紅色漩渦（紅線由程式畫） */
  drain: [{ id: 6, sizeM: 1.4 }],
  /** 聖域・審判：白色雷光＋光環，染成金色 */
  holyGround: [
    { id: 29, sizeM: 2.2, tint: 0xffe08a },
    { id: 38, sizeM: 5, tint: 0xffd75e },
  ],
  /** 昇變閃光：光環染成金色 */
  evolve: [
    { id: 33, sizeM: 1.6, tint: 0xffe08a },
    { id: 38, sizeM: 2.4, tint: 0xffd75e },
  ],
  /** 暗水晶（魔王第三階段）的大範圍攻擊：染成暗紫（之後用） */
  darkCrystal: [
    { id: 16, sizeM: 5, tint: 0xa070ff },
    { id: 17, sizeM: 5, tint: 0x9060e0 },
    { id: 28, sizeM: 6, tint: 0x8050d0 },
  ],
};

/** 第 i 格的檔名（相對於 public/assets/licensed/） */
export const vfxFrame = (id: number, i: number): string => `vfx/kml/${String(id).padStart(2, '0')}/${i}.png`;
export const vfxKey = (id: number, i: number): string => `vfx_${id}_${i}`;

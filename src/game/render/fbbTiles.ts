/**
 * finalbossblues 圖塊對照（畫面層；交接文件 §4、§5，Alan 用拼圖台確認過的格號）。
 * 格號＝列 × 欄數＋欄；tileB_outside 每列 16 格，四季版格號相同。
 * 素材在私有 repo：public/assets/licensed/fbb/（見 ASSET_LICENSES.md）。
 */

/** 預製件 → tileB_outside 的格號（二維，null＝空；最底列是站位） */
export const PREFAB_TILES: Record<string, (number | null)[][]> = {
  treeA: [
    [null, 121, null],
    [136, 137, 138],
    [152, 153, 154],
    [168, 169, 170],
    [null, 185, null],
  ],
  treeB: [
    [null, 121, null],
    [136, 137, 138],
    [152, 153, 154],
    [168, 169, 170],
    [null, 184, null],
  ],
  pillar: [[15], [31]],
  rockBrown2: [[134, 135]],
  rockGrey2: [[132, 133]],
  logH: [[201, 202]],
  logV: [[200], [216]],
};

/** 單格石頭（可單獨使用） */
export const ROCK_SINGLES = [144, 145, 146, 147, 148, 149, 150, 151];

/** 動畫物件：characters 表（192×256，4×2 個物件，每個寬 48 高 128；取中間欄，4 列＝4 格動畫，每格 16×32） */
export const ANIM_OBJECTS: Record<string, { sheet: string; index: number }> = {
  campfire: { sheet: 'fires', index: 4 },
  bigFire: { sheet: 'fires', index: 0 },
  smallFire: { sheet: 'fires', index: 5 },
  torchStand: { sheet: 'fires', index: 6 },
  torchWall: { sheet: 'fires', index: 7 },
  smokeThick: { sheet: 'smoke', index: 1 },
  smokeThin: { sheet: 'smoke', index: 0 },
};

/**
 * 石牆：依「這格和上下左右哪些牆格相連」挑格（U 上、D 下、L 左、R 右；字母照 UDLR 排序成鍵）。
 * 這組素材沒有 UDL、UDR 的 T 字，也沒有孤立單格：生成器要避開，查不到時回傳 undefined。
 */
export const WALL_TILES: Record<string, number> = {
  LR: 99,
  UD: 113,
  DR: 96,
  UR: 128,
  UL: 130,
  UDLR: 131,
  U: 112,
  D: 114,
  L: 116,
  R: 115,
  ULR: 129,
  DLR: 97,
  DL: 98,
};

/** 這格的牆接法鍵（照 U、D、L、R 的順序） */
export function wallKey(has: (dx: number, dy: number) => boolean): string {
  return (has(0, -1) ? 'U' : '') + (has(0, 1) ? 'D' : '') + (has(-1, 0) ? 'L' : '') + (has(1, 0) ? 'R' : '');
}

/** A2 地面 autotile 的地形編號 */
export const GROUND = { grass: 0, dirt: 1, stone: 4 };

/** 季節：夏用 hometown 原表，其他用 seasons 替換表 */
export type Season = 'summer' | 'spring' | 'fall' | 'winter';

/** 調色（交接文件 §6；grade.py 的參數）：整體乘色、飽和度，火源光暈半徑 */
export const GRADES: Record<string, { mul: [number, number, number]; sat: number; fireLight: boolean }> = {
  summerDay: { mul: [0.95, 0.95, 0.95], sat: 0.85, fireLight: false },
  fallDusk: { mul: [0.78, 0.62, 0.62], sat: 0.7, fireLight: true },
  winterOvercast: { mul: [0.72, 0.75, 0.85], sat: 0.55, fireLight: false },
  townNight: { mul: [0.55, 0.5, 0.68], sat: 0.75, fireLight: true },
  // 室內（第 3～5 章；試產 tools/indoor_render.py 的調色）
  temple: { mul: [0.92, 0.94, 1.0], sat: 0.85, fireLight: true },
  castle: { mul: [0.62, 0.58, 0.72], sat: 0.6, fireLight: true },
  cave: { mul: [0.55, 0.5, 0.55], sat: 0.75, fireLight: true },
};

/**
 * 室內圖塊（試產 tools/indoor_render.py 的格號；Alan 看過試產圖後再定案）。
 * a2：地面 autotile 表、floor／high：地面與高台的 autotile 編號；a5：牆面表、face：牆面格號（洞穴用兩格高的洞壁）。
 */
export const INDOOR_TILES = {
  temple: { a2: 'tileA2_cc', floor: 1, high: 4, a5: 'tileA5_castle_int', face: [57, 58, 59], cave: false },
  castle: { a2: 'tileA2_cc', floor: 0, high: 4, a5: 'tileA5_castle_int', face: [57, 58, 59], cave: false },
  cave: { a2: 'tileA2_caves', floor: 0, high: 2, a5: 'tileA5_cave1', face: [] as number[], cave: true },
  /** tileB_cc1：燭台、火盆（上、下）、盔甲架（上、下）；tileB_cave1：蘑菇、瓦礫 */
  candle: 112,
  brazier: [133, 149],
  armorStand: [166, 182],
  mushroom: [116, 117, 118, 119],
  rubble: [120, 121, 124, 125],
};

/**
 * 城內圖塊（交接文件 §4；scene_fb_town.py 用過的格號）。
 * 屋頂、屋牆是 tileA3 的牆型 autotile 編號；其餘是 tileB_town 的格號。
 */
export const TOWN_TILES = {
  /** 屋頂：0 棕、3 紅、5 黑 */
  roofs: [0, 3, 5],
  /** 屋牆：8 石牆、10、12 紅磚 */
  walls: [8, 10, 12],
  door: 126,
  window: 110,
  /** 1×2 的物件：[上格, 下格] */
  lamp: [101, 117],
  // 第二種（98／114：上面是陶罐、下面是被切掉的箱子，圖是破的）刪掉（Alan 2026-10-21）
  crates: [[96, 112]],
  rubble: [240, 241, 245, 246, 247],
  /** 井（2×2） */
  well: [
    [238, 239],
    [254, 255],
  ],
  /** 動畫：屋頂大火、地上小火、粗煙柱（ANIM_OBJECTS 的鍵） */
  houseFire: 'bigFire',
  groundFire: 'smallFire',
  smoke: 'smokeThick',
};

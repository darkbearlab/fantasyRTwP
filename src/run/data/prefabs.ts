/**
 * 野外戰鬥地圖的預製件與放置約束（交接文件 §5b；Alan：做成可調整的資料檔）。全部是初版預設值。
 *
 * 座標：格子（1 m），x 往右、y 往下（畫面方向；遊戲裡世界 +x 朝畫面上方，轉換在生成器裡做）。
 * 每個預製件以「錨點格」為準：draw＝畫多大（寬×高，錨點在 anchor 位置），blocks＝擋路的格（相對錨點），
 * blocksSight＝是否也擋視線。圖塊格號在畫面層的 src/game/render/fbbTiles.ts。
 */

export interface PrefabDef {
  id: string;
  /** 繪製範圍（寬×高，格） */
  size: [number, number];
  /** 錨點在繪製範圍裡的位置（排序與站位以錨點那一列為準） */
  anchor: [number, number];
  /** 擋路的格（相對錨點） */
  blocks: [number, number][];
  /** 擋路的格是否也擋視線 */
  blocksSight: boolean;
}

export const PREFABS: Record<string, PrefabDef> = {
  /** 大樹：3×5，錨點是最底列中間的樹幹；只有樹幹擋路，樹冠可以蓋住單位 */
  treeA: { id: 'treeA', size: [3, 5], anchor: [1, 4], blocks: [[0, 0]], blocksSight: false },
  treeB: { id: 'treeB', size: [3, 5], anchor: [1, 4], blocks: [[0, 0]], blocksSight: false },
  /** 石柱：1×2，錨點是下格 */
  pillar: { id: 'pillar', size: [1, 2], anchor: [0, 1], blocks: [[0, 0]], blocksSight: true },
  /** 雙格石頭：左右擺放，不可拆開 */
  rockBrown2: { id: 'rockBrown2', size: [2, 1], anchor: [0, 0], blocks: [[0, 0], [1, 0]], blocksSight: false },
  rockGrey2: { id: 'rockGrey2', size: [2, 1], anchor: [0, 0], blocks: [[0, 0], [1, 0]], blocksSight: false },
  /** 單格石頭：裝飾，不擋路 */
  rock1: { id: 'rock1', size: [1, 1], anchor: [0, 0], blocks: [], blocksSight: false },
  /** 倒木：橫 2×1、直 1×2 */
  logH: { id: 'logH', size: [2, 1], anchor: [0, 0], blocks: [[0, 0], [1, 0]], blocksSight: false },
  logV: { id: 'logV', size: [1, 2], anchor: [0, 1], blocks: [[0, 0], [0, -1]], blocksSight: false },
  /** 營火：1×2 動畫，錨點是下格 */
  campfire: { id: 'campfire', size: [1, 2], anchor: [0, 1], blocks: [[0, 0]], blocksSight: false },
};

/**
 * 敵方據點（Alan：據點要和路一起設計，開口朝向人會通過的方向）。
 * 形狀一律畫成「開口朝下」，生成時旋轉到開口朝向最近的路；牆把背面與兩側包住，所以不會被繞背。
 * - lookout 哨點：小ㄇ形，1–2 名遠程敵人，離路近（在警覺距離 6 m 內看得到路上）。
 * - camp 營地：較大的ㄇ形，營火在最裡面，2–3 名敵人，開口一樣朝路。
 * - checkpoint 檢查點：路從中間穿過的關卡（中排固定一個），上下開口。
 * enemies：生怪格數量；grunts：先放的雜兵；upgradePool：升級時從哪個敵人池抽（src/run/data/levelPools.ts）。
 */
export interface SiteDef {
  count: [number, number];
  /** 內側中心到路邊的距離（格） */
  roadDist: [number, number];
  shapes: { id: string; weight: number; rows: string[] }[];
  enemies: [number, number];
  grunts: { enemy: string; weight: number }[];
  upgradePool: string;
  campfire: boolean;
}

const MIXED_GRUNTS = [
  { enemy: 'shieldbearer', weight: 3 },
  { enemy: 'archer', weight: 3 },
  { enemy: 'exploder', weight: 2 },
];

export const SITES: Record<'lookout' | 'camp' | 'checkpoint', SiteDef> = {
  lookout: {
    count: [2, 4],
    roadDist: [2, 4],
    shapes: [
      { id: 'post1', weight: 2, rows: ['###', '#.#'] },
      { id: 'post2', weight: 2, rows: ['####', '#..#'] },
      { id: 'post2deep', weight: 1, rows: ['####', '#..#', '#..#'] },
    ],
    enemies: [1, 2],
    grunts: [{ enemy: 'archer', weight: 1 }],
    upgradePool: 'ranged',
    campfire: false,
  },
  camp: {
    count: [1, 2],
    roadDist: [4, 7],
    shapes: [
      { id: 'u5', weight: 2, rows: ['#######', '#.....#', '#.....#', '#.....#'] },
      { id: 'u4', weight: 2, rows: ['######', '#....#', '#....#', '#....#'] },
      { id: 'uWide', weight: 1, rows: ['########', '#......#', '#......#'] },
    ],
    enemies: [2, 3],
    grunts: MIXED_GRUNTS,
    upgradePool: 'mixed',
    campfire: true,
  },
  checkpoint: {
    count: [1, 1],
    roadDist: [0, 0],
    shapes: [{ id: 'gate', weight: 1, rows: ['###......###', '#..........#', '#..........#', '#..........#', '###......###'] }],
    enemies: [3, 4],
    grunts: MIXED_GRUNTS,
    upgradePool: 'mixed',
    campfire: true,
  },
};

/**
 * 散落的小段廢牆（Alan：地圖中穿插小型建築或破碎地形遮擋視線）。擋路也擋視線；彼此與其他擋路物件至少隔 FIELD.ruins.gap 格，
 * 所以不會和別的牆接起來，接法永遠合法。
 */
export const RUIN_SHAPES: { id: string; weight: number; rows: string[] }[] = [
  { id: 'corner', weight: 3, rows: ['##', '#.'] },
  { id: 'cornerLong', weight: 2, rows: ['###', '#..'] },
  { id: 'stub3', weight: 2, rows: ['###'] },
  { id: 'stub2', weight: 2, rows: ['##'] },
];

/**
 * 石牆有圖的接法（U 上、D 下、L 左、R 右，依 UDLR 順序）。沒有 UDL、UDR 的 T 字，也沒有孤立單格（空字串）。
 * 圖塊格號在 src/game/render/fbbTiles.ts 的 WALL_TILES。
 */
export const WALL_JOINS = ['LR', 'UD', 'DR', 'UR', 'UL', 'UDLR', 'U', 'D', 'L', 'R', 'ULR', 'DLR', 'DL'];

/** 野外地圖的版面與放置參數 */
export const FIELD = {
  /** 地圖大小（格）與區塊大小 */
  width: 48,
  height: 48,
  chunk: 16,
  /** 樹林區塊數（森林在這些區塊比較密） */
  forests: [2, 3] as [number, number],
  /** 泥土路：寬度、彎度 */
  path: { width: [2, 3] as [number, number], wiggle: 0.35 },
  /** 據點之間（內側中心）至少相隔幾格 */
  siteGap: 7,
  /**
   * 密林（Alan：多一點樹來控制行進路線）：用平滑雜訊長出大片森林，整片擋路也擋視線，只能沿路或空地走。
   * threshold／forestThreshold／edgeThreshold：雜訊高於這個標準分數才長成森林（一般空地／樹林區塊／地圖邊緣），越低越密。
   * roadClear：路兩側保留幾格不長森林；minBlob：太小的森林塊拆掉；trunkStep：樹幹間距（越小越密）。
   */
  forest: { threshold: 0.9, forestThreshold: -0.4, edgeThreshold: -0.6, edgeBand: 3, roadClear: 3, minBlob: 8, blocksSight: true, trunkStep: 2 },
  /** 空地上零星的單棵大樹：數量；樹幹至少相隔 minDx 欄或 minDy 列 */
  trees: { scatter: [4, 8] as [number, number], minDx: 2, minDy: 3 },
  /** 石柱：數量；四周 8 格至少空 clear 格 */
  pillars: { count: [2, 4] as [number, number], clear: 1 },
  /** 雙格石頭、倒木、單格石頭的數量 */
  rocks2: [2, 4] as [number, number],
  logs: [2, 3] as [number, number],
  rocks1: [6, 12] as [number, number],
  /** 小段廢牆：數量、與其他擋路物件的間距 */
  ruins: { count: [3, 5] as [number, number], gap: 1 },
  /**
   * 敵人（Alan：前後期的圖生怪格數量差不多，雜兵權重高）：
   * 生怪格數量看 SITES 各自的 enemies，先放雜兵，再用升級點數把部分雜兵換成強敵（點數＝兩者 cost 差，至少 1）。
   */
  enemies: {
    upgrade: { base: 1, perLayer: 0.8, eliteBonus: 3 },
    max: 18,
  },
  /** 擋路物件之間至少留幾格空（避免擠成一團） */
  blockerGap: 1,
  /** 出生點與出口附近不放擋路物件的半徑 */
  keepClear: 3,
  /** 出口大小 */
  exitSize: 4,
  maxAttempts: 60,
};

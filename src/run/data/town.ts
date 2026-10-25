/**
 * 城內戰鬥地圖（首都突圍：夜晚、燃燒中的街區）的版面參數。全部是初版預設值，可調。
 * Alan：房子純當背景，擋路也擋視線，而且在燒；房屋要高密度。
 *
 * 座標：格子（1 m），x 往右、y 往下（畫面方向）。圖塊格號在 src/game/render/fbbTiles.ts 的 TOWN_TILES。
 */
export const TOWN = {
  width: 48,
  height: 48,
  /** 街道：主街寬、巷道寬（格）；街區的寬、高範圍（街道之間的空間） */
  street: { main: 3, side: 2 },
  block: { w: [10, 15] as [number, number], h: [9, 12] as [number, number] },
  /** 隨機拆掉幾成的街段（相鄰街區合併成大街區，街網不會太整齊）；拆了會不通的不拆 */
  removeSegment: 0.25,
  /** 廣場：幾個街區改成廣場（中間放井）；只挑面積在範圍內的街區（太大的合併街區會變成一大片空地） */
  plazas: 1,
  plazaSize: [60, 170] as [number, number],
  /**
   * 房子：Alan 手工拼的預製件，或佔位矩形（首都一系列的圖先佔位，之後重做）。門朝下（南）。
   * 佔位：屋頂（roofH 列）＋屋牆（wallH 列）的深度，整個矩形擋路擋視線。
   * 街區由下往上排成一列一列；兩列之間留 alley 格寬的後巷；同一列的房子之間有 gapChance 的機率留 gapWidth 格的窄巷。
   * 巷子至少 2 格：角色直徑約 1 m，1 格寬的巷子走不過去。
   */
  house: {
    w: [4, 7] as [number, number],
    roofH: [2, 3] as [number, number],
    wallH: 2,
    alley: [2, 2] as [number, number],
    gapChance: 0.35,
    gapWidth: 2,
    /**
     * 縱向的房子（Alan：要有縱向的）：窄而深，屋脊南北向，屋牆和門在南端（素材只有朝南的立面）。
     * 每一排有 chance 的機率改成「直排」：房子一棟棟並排，每棟寬 w、總深 depth（屋牆 wallH 列，其餘是屋頂）。
     */
    deep: { chance: 0.5, w: [3, 5] as [number, number], depth: [6, 9] as [number, number] },
    /**
     * 手工預製件的房屋（src/run/data/tilePrefabs/ 裡 kind＝house 的）：每一排有 prefabRow 的機率用預製件排，
     * 排裡每個位置有 prefabChance 的機率放預製件，其餘用同深度的佔位補。
     */
    prefabRow: 0.4,
    prefabChance: 0.6,
    /** 燃燒中的比例 */
    burning: 0.55,
  },
  /** 路燈（擋路不擋視線）、木箱堆（擋路不擋視線，當掩體）、瓦礫（裝飾）、地上小火（裝飾，有火光） */
  lamps: [4, 8] as [number, number],
  crates: [4, 8] as [number, number],
  rubble: [10, 18] as [number, number],
  groundFires: [4, 8] as [number, number],
  /**
   * 擋路的散件（路燈、木箱堆）只放在空曠的地方（Alan 2026-10-25：街口被一根路燈、一個箱子堵死）：
   * 以這一格為中心、(2 × roomy + 1) 見方的範圍內全部可以走（不含其他散件、房子、門口）才放。
   */
  roomy: 2,
  /** 小隊前方的路障：放了之後橫豎兩個方向剩下的通路至少要這麼多格寬 */
  barricadePassage: 3,
  /**
   * 敵人小隊：守在路口與廣場，面向英雄來的方向；前方擺 1–2 個木箱當路障。
   * 生怪格數量固定，先放雜兵，再用升級點數換成強敵（和野外相同的做法）。
   */
  squads: { count: [4, 6] as [number, number], size: [2, 3] as [number, number], minDistFromEntry: 16, barricade: [1, 2] as [number, number] },
  /** 雜兵（Alan：盾兵不當雜兵；雜魚用劍兵、斧兵，穿插弓手） */
  grunts: [
    { enemy: 'raider', weight: 3 },
    { enemy: 'axeman', weight: 2 },
    { enemy: 'archer', weight: 3 },
  ],
  /** 鐵砧：每個小隊正中間站一名盾兵，擋住玩家讓其他敵人（含小衝突導演的波次）支援上來；不參與升級 */
  anvil: 'shieldbearer',
  upgradePool: 'mixed',
  upgrade: { base: 1, perLayer: 0.8, eliteBonus: 3 },
  maxEnemies: 18,
  keepClear: 3,
  exitSize: 4,
  maxAttempts: 60,
};

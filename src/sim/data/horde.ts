/**
 * 怪群模式的調整值（SPEC_SLICE4；全部是佔位，試玩後再調）。
 */
export const HORDE = {
  /** 流場重算間隔（節拍）：10 節拍 ≈ 0.33 秒 */
  flowInterval: 10,
  /** 流場格子大小（公尺）：比導航格子粗，只負責遠距離的大方向；近距離改為直接追擊 */
  flowCell: 1.0,
  /** 流場使用的膨脹半徑（雜兵最大半徑） */
  flowRadius: 0.4,
  /** 雜兵重新挑選目標的間隔（秒） */
  retargetInterval: 0.5,
  /** 離目標這麼近且直線可走時，不看流場、直接走向目標（公尺） */
  directChaseRange: 4,
};

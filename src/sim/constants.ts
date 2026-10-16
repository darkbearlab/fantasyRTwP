/** 模擬層固定常數 */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
/** 導航格子大小（公尺） */
export const NAV_CELL = 0.5;

/** 秒數 → 節拍數（至少 1） */
export const secondsToTicks = (s: number): number => Math.max(1, Math.round(s * TICK_RATE));

/** 單位指令目標有效範圍的容許誤差（公尺） */
export const RANGE_TOLERANCE = 0.05;

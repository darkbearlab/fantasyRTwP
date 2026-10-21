/**
 * 遠征存檔（localStorage）：每次遠征狀態改變（runFlow.setRun）就自動存；遠征結束就刪掉。
 * 存的是 RunState（純資料，serializeRun／deserializeRun）。戰鬥進行中的狀態不存：讀檔後回到那場戰鬥的開頭
 * （關卡依種子重新生成，和原本同一張圖）。
 * localStorage 可能不能用（無痕視窗、被封鎖）：讀寫都包在 try 裡，失敗就當作沒有存檔，遊戲照常進行。
 */
import type { RunState } from '../run/runState';
import { deserializeRun, serializeRun } from '../run/runState';

export const SAVE_KEY = 'fantasyRTwP.run';

/** 標題畫面顯示用的摘要 */
export interface SaveSummary {
  savedAt: number;
  layer: number;
  layers: number;
  level: number;
  alive: number;
  classes: string[];
}

interface SaveFile {
  savedAt: number;
  run: string;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** 存檔；遠征結束（ended）時改成刪除存檔 */
export function saveRun(run: RunState): void {
  const s = storage();
  if (!s) return;
  try {
    if (run.phase.kind === 'ended') {
      s.removeItem(SAVE_KEY);
      return;
    }
    const file: SaveFile = { savedAt: Date.now(), run: serializeRun(run) };
    s.setItem(SAVE_KEY, JSON.stringify(file));
  } catch {
    // 空間不足或被封鎖：不存，遊戲照常進行
  }
}

/** 讀檔；沒有存檔、壞掉或版本不合時回傳 null */
export function loadRun(): RunState | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(SAVE_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    const run = deserializeRun(file.run);
    return run.phase.kind === 'ended' ? null : run;
  } catch {
    return null;
  }
}

export function saveSummary(): SaveSummary | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(SAVE_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    const run = deserializeRun(file.run);
    const node = run.currentNodeId !== null ? run.map.nodes[run.currentNodeId] : null;
    const layers = Math.max(...run.map.nodes.map((n) => n.layer));
    return {
      savedAt: file.savedAt,
      layer: node?.layer ?? 0,
      layers,
      level: run.level ?? 1,
      alive: run.party.filter((h) => h && !h.dead).length,
      classes: run.party.filter((h): h is NonNullable<typeof h> => !!h).map((h) => h.classId),
    };
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    // 不能用就算了
  }
}

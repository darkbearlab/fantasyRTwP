import { beforeEach, describe, expect, it } from 'vitest';
import { createRun } from '../src/run/runState';
import { SAVE_KEY, clearSave, loadRun, saveRun, saveSummary } from '../src/game/save';

/** 測試環境沒有 localStorage：用一個記在記憶體裡的替身 */
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('遠征存檔（localStorage）', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });
  it('存了讀得回來，內容相同', () => {
    const r = createRun(42, { style: 'deliberate' });
    saveRun(r);
    expect(loadRun()).toEqual(r);
    const s = saveSummary()!;
    expect(s.alive).toBe(4);
    expect(s.layer).toBe(0);
  });
  it('遠征結束就刪掉存檔', () => {
    const r = createRun(42, { style: 'deliberate' });
    saveRun(r);
    saveRun({ ...r, phase: { kind: 'ended', result: 'lost' } } as typeof r);
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });
  it('壞掉的存檔或沒有 localStorage 都當作沒有存檔', () => {
    localStorage.setItem(SAVE_KEY, '{壞掉');
    expect(loadRun()).toBeNull();
    expect(saveSummary()).toBeNull();
    clearSave();
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadRun()).toBeNull();
    expect(() => saveRun(createRun(1))).not.toThrow();
  });
});

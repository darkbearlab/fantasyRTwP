import { Rng } from '../sim/rng';

/** 由遠征種子＋任意標籤推導子種子（同樣輸入 → 同樣輸出），讓整趟遠征可以重現 */
export function deriveSeed(seed: number, ...parts: (number | string)[]): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h = Math.imul(h ^ 0x7f, 0x85ebca6b) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

export function rngFor(seed: number, ...parts: (number | string)[]): Rng {
  return new Rng(deriveSeed(seed, ...parts));
}

/** 不重複抽 n 個 */
export function pickN<T>(rng: Rng, list: readonly T[], n: number): T[] {
  const pool = list.slice();
  const out: T[] = [];
  while (out.length < n && pool.length > 0) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

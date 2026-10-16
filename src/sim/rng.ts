/**
 * 種子亂數（mulberry32）。sim 內所有隨機都必須走這裡，不得使用 JS 內建亂數。
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0, 1) 的浮點數 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) 的浮點數 */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** [min, max] 的整數（含兩端） */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  get state(): number {
    return this.s;
  }
}

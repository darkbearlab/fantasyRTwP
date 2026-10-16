import { describe, expect, it } from 'vitest';
import { generateMap, validateMap } from '../src/run/mapGen';

describe('路線圖生成（SPEC_SLICE2 §2、§11-1）', () => {
  it('500 個種子全部符合規則', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const map = generateMap(seed);
      expect(validateMap(map), `種子 ${seed}`).toEqual([]);
      expect(map.layers.length).toBe(8);
    }
  });

  it('同種子 → 同一張圖；不同種子 → 不同圖', () => {
    expect(JSON.stringify(generateMap(7))).toBe(JSON.stringify(generateMap(7)));
    expect(JSON.stringify(generateMap(7))).not.toBe(JSON.stringify(generateMap(8)));
  });

  it('層數可設定', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const map = generateMap(seed, 10);
      expect(validateMap(map)).toEqual([]);
      expect(map.layers.length).toBe(10);
    }
  });

  it('驗證器能抓到違規（連續休息、交叉）', () => {
    const map = generateMap(3);
    const bad = JSON.parse(JSON.stringify(map));
    for (const n of bad.nodes) if (n.layer === 1) n.type = 'rest';
    expect(validateMap(bad).length).toBeGreaterThan(0);
  });
});

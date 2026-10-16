import { describe, expect, it } from 'vitest';
import { depthOf, screenToGround, setProjection, worldToScreen } from '../src/game/render/projection';

describe('畫面投影（等角／正俯視）', () => {
  it('iso：worldToScreen → screenToGround 來回換算誤差 < 0.001 m', () => {
    setProjection('iso');
    for (let i = 0; i < 500; i++) {
      const x = ((i * 7919) % 4000) / 100;
      const y = ((i * 104729) % 2400) / 100;
      const s = worldToScreen(x, y);
      const g = screenToGround(s.x, s.y);
      expect(Math.abs(g.x - x)).toBeLessThan(0.001);
      expect(Math.abs(g.y - y)).toBeLessThan(0.001);
    }
  });

  it('iso：2:1 菱形、z 往上、深度 = x + y', () => {
    setProjection('iso');
    expect(worldToScreen(1, 0)).toEqual({ x: 32, y: 16 });
    expect(worldToScreen(0, 1)).toEqual({ x: -32, y: 16 });
    expect(worldToScreen(1, 1, 1).y).toBe(32 - 32);
    expect(depthOf(3, 4)).toBe(7);
  });

  it('topdown：來回換算', () => {
    setProjection('topdown');
    const s = worldToScreen(12.345, 6.789);
    const g = screenToGround(s.x, s.y);
    expect(Math.abs(g.x - 12.345)).toBeLessThan(0.001);
    expect(Math.abs(g.y - 6.789)).toBeLessThan(0.001);
    setProjection('iso');
  });
});

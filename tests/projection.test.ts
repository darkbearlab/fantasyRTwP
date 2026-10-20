import { describe, expect, it } from 'vitest';
import { depthOf, screenToGround, setIsoRotation, setProjection, worldToScreen } from '../src/game/render/projection';

describe('畫面投影（等角／正俯視）', () => {
  it('iso：worldToScreen → screenToGround 來回換算誤差 < 0.001 m（旋轉 0 與 90 度）', () => {
    setProjection('iso');
    for (let i = 0; i < 1000; i++) {
      setIsoRotation(i % 2 === 0 ? 0 : 90);
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
    setIsoRotation(0);
    expect(worldToScreen(1, 0)).toEqual({ x: 32, y: 16 });
    expect(worldToScreen(0, 1)).toEqual({ x: -32, y: 16 });
    expect(worldToScreen(1, 1, 1).y).toBe(32 - 32);
    expect(depthOf(3, 4)).toBe(7);
  });

  it('iso 逆時針轉 90 度：世界 +x 朝螢幕右上、+y 朝右下；畫面越下面越前面', () => {
    setProjection('iso');
    setIsoRotation(90);
    const o = worldToScreen(0, 0);
    const ex = worldToScreen(1, 0);
    const ey = worldToScreen(0, 1);
    expect(ex.x - o.x).toBeGreaterThan(0);
    expect(ex.y - o.y).toBeLessThan(0);
    expect(ey.x - o.x).toBeGreaterThan(0);
    expect(ey.y - o.y).toBeGreaterThan(0);
    // 深度與畫面 y 同向
    expect(depthOf(0, 1)).toBeGreaterThan(depthOf(0, 0));
    expect(depthOf(1, 0)).toBeLessThan(depthOf(0, 0));
    setIsoRotation(0);
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

describe('Flare 8 方向換算', () => {
  it('世界面向經等角投影後換算成最接近的螢幕方向', async () => {
    const { flareDir } = await import('../src/game/render/art');
    setProjection('iso');
    setIsoRotation(0);
    // Flare：0=西、1=西北、2=北、3=東北、4=東、5=東南、6=南、7=西南（螢幕方向）
    // 世界 +x 在螢幕上是右下（東南）、+y 是左下（西南）、(+x,+y) 是正下方（南）
    expect(flareDir(0)).toBe(5);
    expect(flareDir(Math.PI / 2)).toBe(7);
    expect(flareDir(Math.PI / 4)).toBe(6);
    expect(flareDir(Math.PI)).toBe(1);
    expect(flareDir(-Math.PI / 2)).toBe(3);
    expect(flareDir((-3 * Math.PI) / 4)).toBe(2);
    expect(flareDir(-Math.PI / 4)).toBe(4);
    expect(flareDir((3 * Math.PI) / 4)).toBe(0);
    // 轉 90 度：世界 +x 在螢幕右上（東北）
    setIsoRotation(90);
    expect(flareDir(0)).toBe(3);
    expect(flareDir(Math.PI / 2)).toBe(5);
    setIsoRotation(0);
  });

  it('ortho：來回換算誤差 < 0.001 m；世界 +x 朝畫面上方、+y 朝右；深度與畫面 y 同向；z 往上', () => {
    setProjection('ortho');
    for (let i = 0; i < 500; i++) {
      const x = ((i * 7919) % 4800) / 100;
      const y = ((i * 104729) % 4800) / 100;
      const s = worldToScreen(x, y);
      const g = screenToGround(s.x, s.y);
      expect(Math.abs(g.x - x)).toBeLessThan(0.001);
      expect(Math.abs(g.y - y)).toBeLessThan(0.001);
    }
    const o = worldToScreen(0, 0);
    const ex = worldToScreen(1, 0);
    const ey = worldToScreen(0, 1);
    expect(ex.x - o.x).toBeCloseTo(0);
    expect(ex.y - o.y).toBeLessThan(0);
    expect(ey.x - o.x).toBeGreaterThan(0);
    expect(ey.y - o.y).toBeCloseTo(0);
    expect(depthOf(0, 0)).toBeGreaterThan(depthOf(1, 0));
    expect(worldToScreen(0, 0, 1).y).toBeLessThan(o.y);
    setProjection('iso');
  });
});

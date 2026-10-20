import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ENEMIES } from '../src/sim/data/enemies';
import { HEROES } from '../src/sim/data/heroes';
import {
  MW_ATTACK,
  MW_BACK,
  MW_DEATH,
  MW_FRONT,
  MW_IDLE,
  MW_MOVE,
  MW_SIDE,
  PIXEL_UNITS,
  facingBlock,
  heroTeamColors,
  m72Frames,
  m72Lunge,
  mwAnim,
  mwFrame,
} from '../src/game/render/pixelArtData';

describe('2D 像素素材', () => {
  it('mw 取格公式：第 (方向×5＋動作) 列、8 欄', () => {
    expect(mwFrame(MW_SIDE, MW_IDLE, 0)).toBe(0);
    expect(mwFrame(MW_SIDE, MW_ATTACK, 3)).toBe(2 * 8 + 3);
    expect(mwFrame(MW_FRONT, MW_IDLE, 0)).toBe(5 * 8);
    expect(mwFrame(MW_BACK, MW_DEATH, 3)).toBe(13 * 8 + 3);
  });

  it('面向：左右為主→側面（朝左鏡像）；上下為主→正面／背面', () => {
    expect(facingBlock(1, 0.2)).toEqual({ block: MW_SIDE, flip: false });
    expect(facingBlock(-1, 0.2)).toEqual({ block: MW_SIDE, flip: true });
    expect(facingBlock(0.1, 1)).toEqual({ block: MW_FRONT, flip: false });
    expect(facingBlock(0.1, -1)).toEqual({ block: MW_BACK, flip: false });
  });

  it('動作：待機、移動、攻擊（準備 0–2 格、恢復停在第 3 格）、倒地播完停在最後一格', () => {
    expect(mwAnim({ time: 0, dead: false, deathStart: 0, moving: false }).action).toBe(MW_IDLE);
    expect(mwAnim({ time: 0, dead: false, deathStart: 0, moving: true }).action).toBe(MW_MOVE);
    expect(mwAnim({ time: 0, dead: false, deathStart: 0, moving: false, action: { phase: 'windup', progress: 0.9 } })).toEqual({ action: MW_ATTACK, frame: 2 });
    expect(mwAnim({ time: 0, dead: false, deathStart: 0, moving: false, action: { phase: 'recovery', progress: 0.1 } })).toEqual({ action: MW_ATTACK, frame: 3 });
    expect(mwAnim({ time: 10, dead: true, deathStart: 1, moving: false })).toEqual({ action: MW_DEATH, frame: 3 });
  });

  it('0x72 怪物的攻擊替代：恢復期一開始往前衝並閃白，之後回原位', () => {
    expect(m72Lunge({ phase: 'recovery', progress: 0 })).toEqual({ push: 1, flash: true });
    expect(m72Lunge({ phase: 'recovery', progress: 0.9 }).push).toBe(0);
    expect(m72Lunge({ phase: 'windup', progress: 0.5 }).push).toBe(0);
  });

  it('所有英雄與敵人都有對照；0x72 的逐格圖都在 repo 裡', () => {
    for (const id of [...Object.keys(HEROES), ...Object.keys(ENEMIES)]) expect(PIXEL_UNITS[id], id).toBeDefined();
    for (const f of m72Frames()) expect(existsSync(`public/assets/0x72/frames/${f}.png`), f).toBe(true);
  });

  it('英雄換成職業色：亮色＝職業色、暗色＝壓暗一半；英雄都有換色、敵人保留陣營色', () => {
    expect(heroTeamColors(0x3a7bd5)).toEqual({ light: 0x3a7bd5, dark: 0x1d3e6b });
    for (const id of Object.keys(HEROES)) {
      const a = PIXEL_UNITS[id];
      expect(a.kind === 'mw' && a.recolor?.light, id).toBe(HEROES[id].color);
    }
    const brute = PIXEL_UNITS.brute;
    expect(brute.kind === 'mw' && brute.recolor).toBeFalsy();
  });
});

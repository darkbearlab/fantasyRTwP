import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { H3D, H3D_SHEETS, h3dResolve } from '../src/game/render/heroes3d';
import type { H3DState } from '../src/game/render/heroes3dAnim';
import { h3dFrame, peakOf, planFor } from '../src/game/render/heroes3dAnim';
import { CLASSES, LINES } from '../src/sim/data/classes';

const base: H3DState = { simTime: 10, dead: false, deathAnim: 'death', deathStart: -1, stunned: false, hitStart: -1, hitUntil: -1, moving: false };
const act = (phase: 'windup' | 'recovery' | 'dash', progress: number, kind: 'attack' | 'skill' = 'attack', skillId?: string) => ({ ...base, action: { kind, skillId, phase, progress } });

/** PNG 檔頭的寬高 */
function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('美術試裝 heroes3d（畫面層，不影響 sim）', () => {
  it('素材格式：每個動作 8 列方向 × 影格數，每格 192', () => {
    for (const [char, s] of Object.entries(H3D_SHEETS)) {
      for (const [anim, m] of Object.entries(s.anims)) {
        const { w, h } = pngSize(`public/assets/heroes3d/${char}/${anim}.png`);
        expect({ char, anim, w, h }).toEqual({ char, anim, w: m.frames * s.cell, h: 8 * s.cell });
      }
    }
  });

  it('生效時剛好是最用力的那一格：準備結束前停在 peak-1，進入恢復時是 peak', () => {
    const peak = peakOf('warrior', 'slash');
    expect(h3dFrame('warrior', act('windup', 0))).toEqual({ anim: 'slash', frame: 0 });
    expect(h3dFrame('warrior', act('windup', 0.999))).toEqual({ anim: 'slash', frame: peak - 1 });
    expect(h3dFrame('warrior', act('recovery', 0))).toEqual({ anim: 'slash', frame: peak });
    expect(h3dFrame('warrior', act('recovery', 0.79)).frame).toBe(H3D_SHEETS.warrior.anims.slash.frames - 1);
    expect(h3dFrame('warrior', act('recovery', 0.9)).anim).toBe('idle');
  });

  it('遊俠普攻：draw → aim（循環）→ 生效時 shoot', () => {
    expect(h3dFrame('ranger', act('windup', 0.2)).anim).toBe('draw');
    expect(h3dFrame('ranger', act('windup', 0.8)).anim).toBe('aim');
    expect(h3dFrame('ranger', act('recovery', 0))).toEqual({ anim: 'shoot', frame: peakOf('ranger', 'shoot') });
  });

  it('四個基本職業的所有技能都對應到該角色真的有的動作（不會退回待機）', () => {
    for (const heroId of ['warrior', 'ranger', 'mage', 'cleric']) {
      const char = H3D.heroes[heroId];
      const skills = new Set([CLASSES[heroId].signature, ...LINES[CLASSES[heroId].line].pool]);
      for (const sk of skills) {
        const anim = h3dResolve(char, planFor(char, 'skill', sk).anim);
        expect(anim, `${heroId} ${sk}`).not.toBe('idle');
        expect(H3D_SHEETS[char].anims[anim], `${heroId} ${sk}`).toBeDefined();
      }
    }
    // 戰士沒有踢擊：盾擊退回 power_slash（attack_high 素材有問題，暫不使用）
    expect(h3dResolve('warrior', planFor('warrior', 'skill', 'shieldBash').anim)).toBe('power_slash');
    expect(h3dResolve('ranger', planFor('ranger', 'skill', 'shieldBash').anim)).toBe('kick');
  });

  it('衝刺用 run；移動用 walk；死亡播完停在最後一格；暈眩停在受擊最後一格', () => {
    expect(h3dFrame('warrior', act('dash', 0.5, 'skill', 'charge')).anim).toBe('run');
    expect(h3dFrame('warrior', { ...base, moving: true }).anim).toBe('walk');
    const n = H3D_SHEETS.mage.anims.death_back.frames;
    expect(h3dFrame('mage', { ...base, dead: true, deathAnim: 'death_back', deathStart: 0, simTime: 100 })).toEqual({ anim: 'death_back', frame: n - 1 });
    expect(h3dFrame('cleric', { ...base, stunned: true })).toEqual({ anim: 'hit', frame: H3D_SHEETS.cleric.anims.hit.frames - 1 });
  });
});

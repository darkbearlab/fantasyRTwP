/**
 * heroes3d 的動作與影格選擇（純函式，方便測試）。
 * 節奏：準備（windup）期間依進度播到「最用力」那格的前一格，生效（進入恢復）時剛好是 peak 影格，
 * 恢復期間播完剩下的影格，最後回到待機。準備或恢復較長時動作會被拉慢，較短時被壓快。
 */
import { SKILLS } from '../../sim/data/skills';
import type { ActionPhase } from '../../sim/unit';
import type { H3DPlan } from './heroes3d';
import { H3D, H3D_SHEETS, h3dResolve } from './heroes3d';

/** 恢復期間在這個進度之前播完出手後的影格，之後回到待機 */
const RECOVERY_PLAY = 0.8;

export interface H3DState {
  simTime: number;
  dead: boolean;
  /** 死亡動作（death／death_back）與開始時間 */
  deathAnim: string;
  deathStart: number;
  action?: { kind: 'attack' | 'skill'; skillId?: string; phase: ActionPhase; progress: number };
  stunned: boolean;
  hitStart: number;
  hitUntil: number;
  moving: boolean;
}

export function planFor(char: string, kind: 'attack' | 'skill', skillId?: string): H3DPlan {
  const atk = H3D.attack[char] ?? { anim: 'attack' };
  if (kind === 'attack' || !skillId) return atk;
  const effectKind = SKILLS[skillId]?.effect?.kind;
  const name = H3D.skills[skillId] ?? (effectKind ? H3D.kinds[effectKind] : undefined);
  if (!name || name === '@attack') return atk;
  return { anim: name };
}

function fps(anim: string): number {
  return H3D.fps[anim] ?? H3D.fps.default ?? 12;
}

/** 單次動作：依開始時間以自然速度播放，播完停在最後一格 */
function once(anim: string, n: number, start: number, t: number): number {
  return Math.max(0, Math.min(n - 1, Math.floor((t - start) * fps(anim))));
}

function loopFrame(anim: string, n: number, t: number): number {
  return Math.floor(t * fps(anim)) % n;
}

export function peakOf(char: string, anim: string): number {
  const n = H3D_SHEETS[char].anims[anim]?.frames ?? 1;
  return Math.max(0, Math.min(n - 1, H3D.peaks[anim] ?? Math.floor(n / 2)));
}

/** 目前要顯示的動作（已依角色替代）與影格 */
export function h3dFrame(char: string, s: H3DState): { anim: string; frame: number } {
  const sheet = H3D_SHEETS[char];
  const meta = (a: string) => sheet.anims[a] ?? { frames: 1, loop: true };
  const pick = (want: string, frame: (a: string, n: number, loop: boolean) => number) => {
    const a = h3dResolve(char, want);
    const m = meta(a);
    return { anim: a, frame: Math.max(0, Math.min(m.frames - 1, frame(a, m.frames, m.loop))) };
  };
  const idle = () => pick('idle', (a, n) => loopFrame(a, n, s.simTime));
  const t = s.simTime;
  if (s.dead) return pick(s.deathAnim, (a, n) => once(a, n, s.deathStart, t));
  const act = s.action;
  if (act) {
    if (act.phase === 'dash') return pick('run', (a, n) => loopFrame(a, n, t));
    const plan = planFor(char, act.kind, act.skillId);
    const main = h3dResolve(char, plan.anim);
    const mainMeta = meta(main);
    const peak = peakOf(char, main);
    if (act.phase === 'windup') {
      const p = act.progress;
      let acc = 0;
      for (const [seg, share] of plan.pre ?? []) {
        if (p < acc + share) {
          const local = share > 0 ? (p - acc) / share : 1;
          return pick(seg, (a, n, loop) => (loop ? loopFrame(a, n, t) : Math.floor(local * n)));
        }
        acc += share;
      }
      if (mainMeta.loop) return { anim: main, frame: loopFrame(main, mainMeta.frames, t) };
      if (acc >= 1 || peak === 0) return { anim: main, frame: 0 };
      const q = (p - acc) / (1 - acc);
      return { anim: main, frame: Math.min(peak - 1, Math.floor(q * peak)) };
    }
    // 恢復：從 peak 播到最後一格，再回到待機
    if (mainMeta.loop) return { anim: main, frame: loopFrame(main, mainMeta.frames, t) };
    const rp = act.progress;
    if (rp >= RECOVERY_PLAY) return idle();
    const rest = mainMeta.frames - peak;
    return { anim: main, frame: Math.min(mainMeta.frames - 1, peak + Math.floor((rp / RECOVERY_PLAY) * rest)) };
  }
  if (s.stunned) return pick('hit', (_a, n) => n - 1);
  if (t < s.hitUntil) return pick('hit', (a, n) => once(a, n, s.hitStart, t));
  if (s.moving) return pick('walk', (a, n) => loopFrame(a, n, t));
  return idle();
}

/** 受擊動作的長度（秒） */
export function hitDuration(char: string): number {
  const a = h3dResolve(char, 'hit');
  return (H3D_SHEETS[char].anims[a]?.frames ?? 6) / fps(a);
}

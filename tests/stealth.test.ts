import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/run/battle';
import { activeSkillOf } from '../src/run/loadout';
import { DT } from '../src/sim/constants';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { World } from '../src/sim/world';

const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };
const MAP = { id: 't', name: 't', width: 30, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };

/** 刺客與一名弓手，相距 foeX − 3 公尺 */
function setup(foeX = 15) {
  const w = new World({
    seed: 1,
    map: MAP,
    spawns: [
      { defId: 'cutthroat', def: { ...HEROES.cutthroat, skills: ['stealth'] }, pos: { x: 3, y: 6 } },
      { defId: 'archer', def: enemyDef('archer', 1), pos: { x: foeX, y: 6 }, squad: 's' },
    ],
    config: DELIB,
  });
  const [h, e] = w.units;
  return { w, h, e };
}

function run(w: World, seconds: number, onEvent?: (ev: { type: string; text?: string; unitId?: number }) => void) {
  for (let t = 0; t < seconds / DT; t++) for (const ev of w.step()) onEvent?.(ev as never);
}

describe('刺客的潛行（Alan 2026-10-25）', () => {
  it('刺客的主動技能是潛行', () => {
    expect(activeSkillOf('cutthroat')).toBe('stealth');
  });

  it('潛行中完全偵測不到（貼身也看不到），瞄準他的敵人失去目標', () => {
    const { w, h, e } = setup();
    e.alerted = true;
    w.enqueue({ type: 'skill', unitId: h.id, skillId: 'stealth' });
    run(w, 0.8);
    expect(h.stealthTime).toBeGreaterThan(0);
    h.pos = { x: e.pos.x - 1, y: e.pos.y };
    expect(w.canTarget(e, h)).toBe(false);
    expect(e.action?.targetId === h.id).toBe(false);
  });

  it('附近 4 m 內有敵人時不能用', () => {
    const { w, h } = setup(6);
    const notes: string[] = [];
    w.enqueue({ type: 'skill', unitId: h.id, skillId: 'stealth' });
    run(w, 0.5, (ev) => ev.type === 'notice' && ev.unitId === h.id && notes.push(ev.text!));
    expect(h.stealthTime).toBe(0);
    expect(notes).toContain('敵人太近');
  });

  it('從潛行出手：第一擊是偷襲（命中 +50），出手後解除潛行', () => {
    const { w, h, e } = setup(9);
    w.enqueue({ type: 'skill', unitId: h.id, skillId: 'stealth' });
    run(w, 0.8);
    expect(h.stealthTime).toBeGreaterThan(0);
    let ambush = 0;
    let hit = false;
    w.enqueue({ type: 'attack', unitIds: [h.id], targetId: e.id });
    run(w, 6, (ev) => {
      if (ev.type === 'status' && ev.unitId === h.id && ev.text === '偷襲！') ambush++;
      if (ev.type === 'hit' && (ev as unknown as { sourceId: number }).sourceId === h.id) hit = true;
    });
    expect(ambush).toBe(1);
    expect(hit).toBe(true);
    expect(h.stealthTime).toBe(0);
    expect(h.stealthFull).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { createBattleFromRun } from '../src/run/battle';
import { chooseNode, pickEncounter } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import { skillCooldownOf } from '../src/sim/actions';
import { CLASSES } from '../src/sim/data/classes';
import { DELIBERATE_PACE, deliberateConfig } from '../src/sim/data/deliberate';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { activeSkillIndex } from '../src/game/ui/mobileBar';
import { makeWorld, run } from './helpers';

describe('沉穩節奏（SPEC_SLICE5 §1）', () => {
  it('設定檔：移動、行動、冷卻依倍率變慢', () => {
    const c = deliberateConfig();
    expect(c.battleStyle).toBe('deliberate');
    expect(c.moveSpeedMult).toBeCloseTo(DEFAULT_SIM_CONFIG.moveSpeedMult * DELIBERATE_PACE.move);
    expect(c.actionSpeedMult).toBeCloseTo(DEFAULT_SIM_CONFIG.actionSpeedMult / DELIBERATE_PACE.actionTime);
    expect(c.skillCooldownMult).toBeCloseTo(DEFAULT_SIM_CONFIG.skillCooldownMult * DELIBERATE_PACE.cooldown);
  });

  it('同一段移動：沉穩節奏花的時間是原本的 1 / 0.6 倍；技能冷卻是 2 倍', () => {
    const timeTo = (cfg: object) => {
      const w = makeWorld([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 19, y: 1 } }], cfg);
      w.enqueue({ type: 'move', unitIds: [1], point: { x: 14, y: 6 } });
      let t = 0;
      while (w.getUnit(1)!.pos.x < 13.9 && t < 3000) {
        run(w, 1);
        t++;
      }
      return { t, w };
    };
    const base = timeTo({ moveSpeedMult: DEFAULT_SIM_CONFIG.moveSpeedMult });
    const slow = timeTo(deliberateConfig());
    expect(slow.t / base.t).toBeCloseTo(1 / DELIBERATE_PACE.move, 1);
    const u = slow.w.getUnit(1)!;
    expect(skillCooldownOf(slow.w, u, 'guard') / skillCooldownOf(base.w, base.w.getUnit(1)!, 'guard')).toBeCloseTo(DELIBERATE_PACE.cooldown);
  });

  it('新遠征預設是沉穩節奏：小地圖遭遇、戰鬥套用沉穩設定', () => {
    const r = createRun(3);
    expect(r.style).toBe('deliberate');
    const first = r.map.nodes[r.map.layers[0][0]];
    expect(pickEncounter(r, first).startsWith('level:')).toBe(false);
    const w = createBattleFromRun(chooseNode(r, first.id));
    expect(w.config.battleStyle).toBe('deliberate');
    expect(w.horde).toBeNull();
    expect(w.config.moveSpeedMult).toBeCloseTo(DEFAULT_SIM_CONFIG.moveSpeedMult * DELIBERATE_PACE.move);
  });

  it('每名英雄唯一的主動技能是職業的專用技能（技能順序調過也一樣）', () => {
    const r = createRun(5);
    const w = createBattleFromRun(chooseNode(r, r.map.layers[0][0]));
    for (const u of w.units.filter((x) => x.team === 'hero')) expect(u.def.skills[activeSkillIndex(u)]).toBe(CLASSES[u.def.id].signature);
  });
});

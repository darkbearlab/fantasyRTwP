import { describe, expect, it } from 'vitest';
import { activeSkillOf, createBattleFromRun } from '../src/run/battle';
import { chooseNode, pickEncounter } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import { skillCooldownOf } from '../src/sim/actions';
import { CLASSES } from '../src/sim/data/classes';
import { DELIBERATE_PACE, deliberateConfig } from '../src/sim/data/deliberate';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { activeSkillIndex } from '../src/game/ui/mobileBar';
import { OPEN_MAP, PASSIVE, makeWorld, run } from './helpers';
import { World } from '../src/sim/world';

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

  it('每名英雄只有一招主動技能：職業的專用技能；牧師是治療藥瓶、煉金術士是會留下地面火的火焰瓶（v0.4）', () => {
    const r = createRun(5, { party: ['warrior', 'cleric', 'alchemist', 'mage'] });
    const w = createBattleFromRun(chooseNode(r, r.map.layers[0][0]));
    for (const u of w.units.filter((x) => x.team === 'hero')) {
      expect(u.def.skills).toEqual([activeSkillOf(u.def.id)]);
      expect(u.def.skills[activeSkillIndex(u)]).toBe(activeSkillOf(u.def.id));
    }
    expect(activeSkillOf('warrior')).toBe(CLASSES.warrior.signature);
    expect(activeSkillOf('cleric')).toBe('healFlask');
    expect(activeSkillOf('alchemist')).toBe('fireFlask');
  });
});

describe('沉穩節奏的規則調整（Alan）', () => {
  it('攻擊移動只打目標點附近的敵人：途中經過身邊的敵人不接戰，可以脫離', () => {
    // 英雄從 (2,6) 往 (18,6) 攻擊移動；路邊 (6,7.5) 有一名敵人，目標點附近沒有敵人
    const w = makeWorld([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 6, y: 7.5 } }], deliberateConfig());
    w.enqueue({ type: 'attackMove', unitIds: [1], point: { x: 18, y: 6 } });
    const evs = run(w, 20 * 30);
    expect(evs.some((e) => e.type === 'actionStart' && e.unitId === 1 && e.targetId === 2)).toBe(false);
    expect(w.getUnit(1)!.pos.x).toBeGreaterThan(16);
    // 目標點就在敵人身上：會打它
    const w2 = makeWorld([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 12, y: 6 } }], deliberateConfig());
    w2.enqueue({ type: 'attackMove', unitIds: [1], point: { x: 12, y: 6 } });
    expect(run(w2, 15 * 30).some((e) => e.type === 'hit' && e.sourceId === 1 && e.targetId === 2)).toBe(true);
  });

  it('沒有控制區；性格一律是堅守（游擊不會逃跑）', () => {
    const c = deliberateConfig();
    expect(c.zocMode).toBe('off');
    const w = new World({ seed: 1, map: OPEN_MAP, spawns: [{ defId: 'ranger', pos: { x: 5, y: 6 }, personality: 'guerrilla' }, { defId: 'brute', pos: { x: 7, y: 6 } }], config: { ...PASSIVE, ...c, enemyAggroRange: 0 } });
    const evs = run(w, 3 * 30);
    expect(evs.some((e) => e.type === 'notice' && e.text === '逃跑！')).toBe(false);
  });
});

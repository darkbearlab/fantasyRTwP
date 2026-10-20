import { describe, expect, it } from 'vitest';
import { createBattleFromRun } from '../src/run/battle';
import { chooseNode } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import { currentActiveSkill } from '../src/sim/cycle';
import { ACTIVE_CYCLES } from '../src/sim/data/cycles';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { ENEMIES } from '../src/sim/data/enemies';
import { activeSkillIndex } from '../src/game/ui/mobileBar';
import { HOLD, makeWorld, run } from './helpers';

const D = deliberateConfig();

describe('技能循環（SPEC_SLICE5 §16）', () => {
  it('遠征：咒術師帶齊循環的每一招，技能鈕顯示第一招；法師（Alan 2026-10-20）只有一招附魔、沒有循環', () => {
    const r = createRun(5, { party: ['mage', 'hexer', 'warrior', 'cleric'] });
    const w = createBattleFromRun(chooseNode(r, r.map.layers[0][0]));
    const mage = w.units.find((u) => u.def.id === 'mage')!;
    const hexer = w.units.find((u) => u.def.id === 'hexer')!;
    expect(ACTIVE_CYCLES.mage).toBeUndefined();
    // Alan 2026-10-20 第二版：法師主動是附魔，小火球是普攻
    expect(mage.def.skills).toEqual(['enchant']);
    expect(mage.cycle).toBeUndefined();
    expect(hexer.def.skills).toEqual(ACTIVE_CYCLES.hexer.steps);
    expect(currentActiveSkill(mage)).toBe('enchant');
    expect(currentActiveSkill(hexer)).toBe('curse');
    expect(mage.def.skills[activeSkillIndex(mage)]).toBe('enchant');
    expect(w.units.find((u) => u.def.id === 'warrior')!.cycle).toBeUndefined();
  });

  it('charge 循環（通用機制，暫時掛在法師上測）：普攻命中 5 次後換成第二招；放完歸零', () => {
    ACTIVE_CYCLES.mage = { mode: 'charge', steps: ['flashFireball', 'greatFireball'], chargeMax: 5 };
    try {
      chargeCycleCase();
    } finally {
      delete ACTIVE_CYCLES.mage;
    }
  });

  it('咒術師：衰弱詛咒 → 詛咒爆裂（引爆詛咒、傷害較高）→ 回到衰弱詛咒', () => {
    const def = { ...HEROES.hexer, skills: ['curse', 'curseBurst'] };
    const w = makeWorld([{ defId: 'hexer', def, pos: { x: 3, y: 6 } }, { defId: 'shieldbearer', pos: { x: 9, y: 6 } }], D, undefined, 1, HOLD);
    const h = w.getUnit(1)!;
    const e = w.getUnit(2)!;
    w.enqueue({ type: 'skill', unitId: 1, skillId: 'curse', targetId: 2 });
    run(w, 4 * 30);
    expect(e.curseTime).toBeGreaterThan(0);
    expect(currentActiveSkill(h)).toBe('curseBurst');
    const hp0 = e.hp;
    w.enqueue({ type: 'skill', unitId: 1, skillId: 'curseBurst', targetId: 2 });
    const evs = run(w, 4 * 30);
    expect(evs.some((x) => x.type === 'status' && x.unitId === 2 && x.text === '詛咒爆裂')).toBe(true);
    expect(e.curseTime).toBe(0);
    const burst = evs.filter((x) => x.type === 'hit' && x.skillId === 'curseBurst');
    expect(burst.length).toBe(1);
    expect(hp0 - e.hp).toBeGreaterThan(0);
    expect(currentActiveSkill(h)).toBe('curse');
  });
});

function chargeCycleCase(): void {
  const def = { ...HEROES.mage, skills: ['flashFireball', 'greatFireball'] };
  // 標靶：打不死、不還手、好命中
  const dummy = { ...ENEMIES.minion, maxHp: 9999, defense: 0, damage: [0, 0] as [number, number] };
  const w = makeWorld([{ defId: 'mage', def, pos: { x: 3, y: 6 } }, { defId: 'minion', def: dummy, pos: { x: 9, y: 6 } }], D, undefined, 1, HOLD);
  const m = w.getUnit(1)!;
  w.enqueue({ type: 'attack', unitIds: [1], targetId: 2 });
  let ticks = 0;
  while (m.cycleStep === 0 && ticks < 120 * 30) {
    run(w, 1);
    ticks++;
    if (!m.order && !m.action) w.enqueue({ type: 'attack', unitIds: [1], targetId: 2 });
  }
  expect(m.cycleCharge).toBe(5);
  expect(currentActiveSkill(m)).toBe('greatFireball');
  // 放的是第一招：還沒輪到
  w.enqueue({ type: 'skill', unitId: 1, skillId: 'flashFireball', point: { x: 9, y: 6 } });
  expect(run(w, 4 * 30).some((e) => e.type === 'notice' && e.text === '還沒輪到這一招')).toBe(true);
  w.enqueue({ type: 'skill', unitId: 1, skillId: 'greatFireball', point: { x: 9, y: 6 } });
  const evs = run(w, 12 * 30);
  expect(evs.some((e) => e.type === 'aoe' && e.skillId === 'greatFireball')).toBe(true);
  expect(m.cycleStep).toBe(0);
  expect(m.cycleCharge).toBeLessThan(5);
}

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
import { HEROES } from '../src/sim/data/heroes';
import { SKILLS } from '../src/sim/data/skills';

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
    // 法師有技能循環（S5-4）：帶齊循環的每一招，技能鈕顯示目前這一招
    for (const u of w.units.filter((x) => x.team === 'hero' && x.def.id !== 'mage')) {
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
    // 英雄從 (2,6) 往 (18,6) 攻擊移動；路邊 (6,7.5) 有一名（不會警覺的）敵人，目標點附近沒有敵人
    const w = makeWorld([{ defId: 'warrior', pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 6, y: 7.5 } }], { ...deliberateConfig(), enemyAggroRange: 0 });
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

describe('Alan 的調整（切片 5 試玩後）', () => {
  it('點地圖放指定目標技能：打點擊位置最近的敵人（遊俠瞄準射擊）', async () => {
    const { BattleSession } = await import('../src/game/session');
    const { confirmTargeting } = await import('../src/game/input/targeting');
    const w = new World({
      seed: 1,
      map: OPEN_MAP,
      spawns: [{ defId: 'ranger', def: { ...HEROES.ranger, skills: ['aimedShot'] }, pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 10, y: 3 } }, { defId: 'brute', pos: { x: 10, y: 9 } }],
      config: { ...PASSIVE, ...deliberateConfig() },
    });
    const s = new BattleSession(1, { world: w });
    s.targeting = { unitId: 1, skillId: 'aimedShot' };
    expect(confirmTargeting(s, { x: 11, y: 8 }, undefined, 0)).toBe(true);
    expect(w.pendingCommands).toContainEqual({ type: 'skill', unitId: 1, skillId: 'aimedShot', targetId: 3 });
    expect(activeSkillOf('ranger')).toBe('aimedShot');
  });

  it('法師的火球即時爆炸（沒有投射物）；沉穩節奏的手工遭遇也有迷霧', () => {
    const w = makeWorld([{ defId: 'mage', def: { ...HEROES.mage, skills: ['flashFireball'] }, pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 10, y: 6 } }], deliberateConfig());
    w.enqueue({ type: 'skill', unitId: 1, skillId: 'flashFireball', point: { x: 10, y: 6 } });
    const evs = run(w, 6 * 30);
    expect(evs.some((e) => e.type === 'aoe' && e.skillId === 'flashFireball')).toBe(true);
    expect(w.projectiles.length).toBe(0);
    const r = createRun(5, { party: ['warrior', 'cleric', 'mage', 'ranger'] });
    const node = r.map.nodes[r.map.layers[0][0]];
    const b = { ...r, currentNodeId: node.id, phase: { kind: 'battle' as const, nodeId: node.id, encounterId: 'passScouts', fromEvent: false } };
    expect(createBattleFromRun(b).fogActive).toBe(true);
  });
});

describe('交戰距離縮短、火球改回（Alan 2026-10-20）', () => {
  it('沉穩節奏的普攻射程、技能射程、察覺距離、攻擊移動距離都 ×0.6；近戰不縮；舊模式不變', () => {
    const c = deliberateConfig();
    expect(c.rangeMult).toBeCloseTo(0.6);
    expect(c.enemyAggroRange).toBeCloseTo(6);
    expect(c.attackMoveRange).toBeCloseTo(3.6);
    const w = makeWorld([{ defId: 'ranger', pos: { x: 2, y: 6 } }, { defId: 'warrior', pos: { x: 3, y: 6 } }], c);
    const ranger = w.getUnit(1)!;
    const warrior = w.getUnit(2)!;
    expect(w.attackRange(ranger)).toBeCloseTo(12 * 0.6);
    expect(w.attackRange(warrior)).toBeCloseTo(0.3);
    expect(w.skillRange(ranger, SKILLS.flashFireball)).toBeCloseTo(12 * 0.6);
    const old = makeWorld([{ defId: 'ranger', pos: { x: 2, y: 6 } }]);
    expect(old.attackRange(old.getUnit(1)!)).toBeCloseTo(12);
  });

  it('火球：不用等準備（沒有地上預告），直接丟出；有飛行時間，飛到落點才爆炸；放完進冷卻', () => {
    const w = makeWorld([{ defId: 'mage', def: { ...HEROES.mage, skills: ['flashFireball'] }, pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 7, y: 6 } }], { ...deliberateConfig(), enemyAggroRange: 0 });
    const m = w.getUnit(1)!;
    w.enqueue({ type: 'skill', unitId: 1, skillId: 'flashFireball', point: { x: 7, y: 6 } });
    // 準備時間 0：幾個節拍內就丟出投射物
    let flying = false;
    let t = 0;
    for (; t < 10 && !flying; t++) {
      run(w, 1);
      flying = w.projectiles.some((p) => p.payload.type === 'aoe' && p.payload.skillId === 'flashFireball');
    }
    expect(flying).toBe(true);
    // 剛丟出時還沒爆炸（有飛行時間）
    const pr = w.projectiles.find((p) => p.payload.type === 'aoe')!;
    expect(pr.point).toEqual({ x: 7, y: 6 });
    let flightTicks = 0;
    while (flightTicks < 3 * 30 && !run(w, 1).some((e) => e.type === 'aoe' && e.skillId === 'flashFireball')) flightTicks++;
    // 約 5 m ÷ 16 m/s ≈ 0.3 秒
    expect(flightTicks).toBeGreaterThan(3);
    expect(flightTicks).toBeLessThan(3 * 30);
    expect(m.skillReady('flashFireball')).toBe(false);
    // 冷卻 12 秒 ×2（沉穩節奏）
    run(w, 20 * 30);
    expect(m.skillReady('flashFireball')).toBe(false);
    run(w, 6 * 30);
    expect(m.skillReady('flashFireball')).toBe(true);
  });

  it('火焰瓶：節奏比照火球（直接丟出、有飛行時間、冷卻 12 秒 ×2），落點地面燃燒 5 秒', () => {
    const w = makeWorld([{ defId: 'alchemist', def: { ...HEROES.alchemist, skills: ['fireFlask'] }, pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 6, y: 6 } }], { ...deliberateConfig(), enemyAggroRange: 0 });
    const a = w.getUnit(1)!;
    w.enqueue({ type: 'skill', unitId: 1, skillId: 'fireFlask', point: { x: 6, y: 6 } });
    run(w, 3);
    expect(w.projectiles.some((p) => p.payload.type === 'aoe' && p.payload.skillId === 'fireFlask')).toBe(true);
    let t = 0;
    while (t < 90 && w.zones.length === 0) {
      run(w, 1);
      t++;
    }
    expect(t).toBeGreaterThan(3);
    expect(w.zones[0].style).toBe('fire');
    run(w, 4 * 30);
    expect(w.zones.length).toBe(1);
    run(w, 2 * 30);
    expect(w.zones.length).toBe(0);
    expect(a.skillReady('fireFlask')).toBe(false);
    run(w, 20 * 30);
    expect(a.skillReady('fireFlask')).toBe(true);
  });
});

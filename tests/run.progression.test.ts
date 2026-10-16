import { describe, expect, it } from 'vitest';
import { HEROES } from '../src/sim/data/heroes';
import { ECONOMY } from '../src/run/data/economy';
import { battleOutcomeFromWorld, createBattleFromRun, enemyDef } from '../src/run/battle';
import { applyBattleResult, availableNodes, canRecruit, canRevive, chooseNode, chooseReward, restCamp, restRecruit, restRevive } from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun, currentLayer, firstEmptySlot, serializeRun, deserializeRun } from '../src/run/runState';
import { lateJoinUpgradeCount, maxHpOf } from '../src/run/upgrades';
import { playRun } from '../tools/runPolicy';

/** 進入第一個戰鬥節點 */
function toFirstBattle(seed = 1): RunState {
  const r = createRun(seed);
  return chooseNode(r, availableNodes(r)[0].id);
}

/** 直接把遠征放到一個休息節點（測試用） */
function atRest(r: RunState): RunState {
  const rest = r.map.nodes.find((n) => n.type === 'rest')!;
  const s = JSON.parse(JSON.stringify(r)) as RunState;
  s.currentNodeId = s.map.nodes.find((n) => n.next.includes(rest.id))!.id;
  s.phase = { kind: 'map' };
  return chooseNode(s, rest.id);
}

describe('遠征狀態（SPEC_SLICE2 §3、§11-2/3）', () => {
  it('初始狀態：4 名英雄滿血、50 金幣、可序列化', () => {
    const r = createRun(5);
    expect(r.party.map((h) => h?.classId)).toEqual(['warrior', 'ranger', 'mage', 'cleric']);
    expect(r.gold).toBe(ECONOMY.startGold);
    expect(deserializeRun(serializeRun(r))).toEqual(r);
  });

  it('決定論：同種子＋同一串選擇 → 最終 RunState 完全一致', () => {
    const a = playRun(11, { layers: 5 });
    const b = playRun(11, { layers: 5 });
    expect(serializeRun(a)).toBe(serializeRun(b));
    expect(a.phase.kind).toBe('ended');
  });

  it('戰後生命正確寫回、陣亡英雄不出現在下一場戰鬥', () => {
    const r = toFirstBattle();
    const outcome = {
      won: true,
      time: 42,
      heroes: [
        { slot: 0, hp: 77, dead: false, kills: 2, damageDealt: 50, damageTaken: 63 },
        { slot: 1, hp: 0, dead: true, kills: 0, damageDealt: 10, damageTaken: 80 },
        { slot: 2, hp: 60, dead: false, kills: 1, damageDealt: 30, damageTaken: 0 },
        { slot: 3, hp: 12, dead: false, kills: 0, damageDealt: 5, damageTaken: 78 },
      ],
    };
    const after = applyBattleResult(r, outcome);
    expect(after.party[0]!.hp).toBe(77);
    expect(after.party[1]!.dead).toBe(true);
    expect(after.party[3]!.hp).toBe(12);
    expect(after.gold).toBe(ECONOMY.startGold + ECONOMY.goldPerBattle);
    expect(after.phase.kind).toBe('reward');
    expect(r.party[0]!.hp).toBe(HEROES.warrior.maxHp); // 原狀態不被修改

    const next = chooseNode(chooseReward(after, 'skip'), availableNodes(chooseReward(after, 'skip'))[0].id);
    if (next.phase.kind === 'battle') {
      const w = createBattleFromRun(next);
      const heroes = w.units.filter((u) => u.team === 'hero');
      expect(heroes.map((u) => u.heroSlot)).toEqual([0, 2, 3]);
      expect(heroes.find((u) => u.heroSlot === 3)!.hp).toBe(12);
    }
  });

  it('實際打一場：結果寫回遠征', () => {
    const r = toFirstBattle(3);
    const w = createBattleFromRun(r);
    for (let i = 0; i < 30 * 300 && !w.result; i++) w.step();
    const after = applyBattleResult(r, battleOutcomeFromWorld(w));
    expect(['reward', 'ended']).toContain(after.phase.kind);
    expect(after.stats.battles).toBe(1);
  });

  it('全滅 → 遠征失敗', () => {
    const r = toFirstBattle();
    const after = applyBattleResult(r, { won: false, time: 10, heroes: [0, 1, 2, 3].map((slot) => ({ slot, hp: 0, dead: true, kills: 0, damageDealt: 0, damageTaken: 0 })) });
    expect(after.phase).toEqual({ kind: 'ended', result: 'lost' });
    expect(after.stats.lostAtLayer).toBe(1);
  });

  it('敵人數值隨層數成長；隊長強化', () => {
    expect(enemyDef('brute', 1).maxHp).toBe(105);
    expect(enemyDef('brute', 6).maxHp).toBe(Math.round(105 * (1 + ECONOMY.layerScaling * 5)));
    const cap = enemyDef('brute', 1, true);
    expect(cap.maxHp).toBe(Math.round(105 * 2.5));
    expect(cap.name).toBe('隊長蠻兵');
    expect(cap.damageMult).toBeCloseTo(1.4);
  });
});

describe('休息、復活與招募（SPEC_SLICE2 §4、§5、§11-3/4）', () => {
  function withDead(r: RunState, slot: number, gold: number): RunState {
    const s = JSON.parse(JSON.stringify(r)) as RunState;
    s.party[slot]!.dead = true;
    s.party[slot]!.hp = 0;
    s.gold = gold;
    return s;
  }

  it('復活後以 50% 生命回歸，花 80 金幣', () => {
    const r = atRest(withDead(createRun(2), 2, 200));
    expect(canRevive(r, 2)).toBe(true);
    const after = restRevive(r, 2);
    expect(after.party[2]!.dead).toBe(false);
    expect(after.party[2]!.hp).toBe(Math.round(maxHpOf(after.party[2]!) * 0.5));
    expect(after.gold).toBe(120);
    // 三選一已用掉
    expect(() => restCamp(after)).toThrow();
  });

  it('金幣不足時無法復活或招募', () => {
    const r = atRest(withDead(createRun(2), 1, 60));
    expect(canRevive(r, 1)).toBe(false);
    expect(() => restRevive(r, 1)).toThrow();
    expect(canRecruit(r)).toBe(false);
  });

  it('招募填入第一個空欄位（陣亡者的欄位也算空位），新英雄滿血、依層數獲得強化', () => {
    let r = withDead(createRun(2), 1, 300);
    r.party[3] = null;
    r = atRest(r);
    expect(firstEmptySlot(r)).toBe(1);
    const cls = r.phase.kind === 'rest' ? r.phase.recruitCandidates[0] : '';
    const after = restRecruit(r, cls);
    expect(after.party[1]!.classId).toBe(cls);
    expect(after.party[1]!.dead).toBe(false);
    // 越晚加入越強（SPEC_SLICE3 §1.3）：滿血，強化數量 = floor(層數 / 2)
    expect(after.party[1]!.hp).toBe(maxHpOf(after.party[1]!));
    expect(after.party[1]!.upgrades.length).toBe(lateJoinUpgradeCount(currentLayer(r)));
    expect(HEROES[cls]).toBeDefined();
    expect(after.gold).toBe(200);
    // 招募不佔三選一，但每次休息只能招募一次
    expect(() => restCamp(after)).not.toThrow();
    expect(canRecruit(after)).toBe(false);
  });

  it('紮營恢復 40% 最大生命', () => {
    const r0 = createRun(2);
    r0.party[0]!.hp = 20;
    const after = restCamp(atRest(r0));
    expect(after.party[0]!.hp).toBe(20 + Math.round(140 * 0.4));
  });
});

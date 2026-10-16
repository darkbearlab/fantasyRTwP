import { describe, expect, it } from 'vitest';
import { CLASS_ORDER, CLASSES, LINES, defaultLoadout } from '../src/sim/data/classes';
import { HEROES } from '../src/sim/data/heroes';
import { SKILLS } from '../src/sim/data/skills';
import { ECONOMY } from '../src/run/data/economy';
import { createBattleFromRun } from '../src/run/battle';
import { recruitPool, rollParty, swapOptions, swapSkill, validLoadout } from '../src/run/classes';
import { availableNodes, chooseNode } from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun, deserializeRun, newHero, serializeRun } from '../src/run/runState';
import { lateJoinUpgradeCount, recruitInto } from '../src/run/upgrades';
import { Rng } from '../src/sim/rng';

function atRest(r: RunState): RunState {
  const rest = r.map.nodes.find((n) => n.type === 'rest')!;
  const s = JSON.parse(JSON.stringify(r)) as RunState;
  s.currentNodeId = s.map.nodes.find((n) => n.next.includes(rest.id))!.id;
  s.phase = { kind: 'map' };
  return chooseNode(s, rest.id);
}

describe('職業體系（SPEC_SLICE3 §1、§7-3/4）', () => {
  it('每個職業：資料完整、專用技能在第 1 欄、預設技能欄合法', () => {
    for (const id of CLASS_ORDER) {
      const c = CLASSES[id];
      expect(HEROES[id], id).toBeDefined();
      expect(SKILLS[c.signature], id).toBeDefined();
      for (const s of LINES[c.line].pool) expect(SKILLS[s], s).toBeDefined();
      expect(HEROES[id].skills).toEqual(defaultLoadout(id));
      expect(newHero(id).skills[0]).toBe(c.signature);
      expect(validLoadout(id, defaultLoadout(id)), id).toBe(true);
    }
  });

  it('技能欄驗證：第 1 欄固定、只接受同系技能、不重複', () => {
    expect(validLoadout('warrior', ['shieldBash', 'guard', 'charge'])).toBe(false);
    expect(validLoadout('warrior', ['guard', 'shieldBash', 'fireball'])).toBe(false);
    expect(validLoadout('warrior', ['guard', 'shieldBash', 'shieldBash'])).toBe(false);
    expect(validLoadout('warrior', ['guard', 'charge', 'shieldBash'])).toBe(true);
    // 第 1 欄不能換；已裝備的不會出現在選項裡
    expect(swapOptions('warrior', ['guard', 'shieldBash', 'charge'], 0)).toEqual([]);
    const opts = swapOptions('mage', ['fireball', 'iceBind', 'arcaneMissile'], 1);
    for (const o of opts) expect(LINES.mage.pool).toContain(o);
    expect(opts).not.toContain('fireball');
    expect(opts).not.toContain('arcaneMissile');
  });

  it('休息節點可以替換第 2、3 欄（免費、不佔三選一），戰鬥用新技能欄', () => {
    let r = atRest(createRun(3));
    // 不同系的技能、第 1 欄都不能換
    expect(() => swapSkill(r, 0, 1, 'fireball')).toThrow();
    expect(() => swapSkill(r, 0, 0, 'shieldBash')).toThrow();
    const ranger = r.party[1]!;
    ranger.skills = ['tumble', 'aimedShot', 'stunArrow'];
    expect(swapOptions('ranger', ranger.skills, 2)).toEqual(LINES.ranger.pool.filter((s) => !ranger.skills.includes(s)));
    // 法師換第 2 欄（池內有未裝備的技能時）
    const mOpts = swapOptions('mage', r.party[2]!.skills, 1);
    if (mOpts.length) {
      r = swapSkill(r, 2, 1, mOpts[0]);
      expect(r.party[2]!.skills[1]).toBe(mOpts[0]);
      expect(r.phase.kind === 'rest' && r.phase.used).toBe(false);
      // 帶進戰鬥
      const b = JSON.parse(JSON.stringify(r)) as RunState;
      const battle = b.map.nodes.find((n) => n.type === 'battle')!;
      b.currentNodeId = battle.id;
      b.phase = { kind: 'battle', nodeId: battle.id, encounterId: 'passScouts', fromEvent: false };
      const w = createBattleFromRun(b);
      expect(w.units.find((u) => u.heroSlot === 2)!.def.skills).toEqual(r.party[2]!.skills);
    }
    // 不在休息節點不能換
    expect(() => swapSkill(createRun(3), 0, 1, 'charge')).toThrow();
  });

  it('組隊：自選 2 名＋隨機 2 名，不重複；同種子結果相同', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = rollParty(seed, ['mage', 'cleric']);
      expect(p.length).toBe(ECONOMY.partySize);
      expect(p.slice(0, 2)).toEqual(['mage', 'cleric']);
      expect(new Set(p).size).toBe(p.length);
      for (const id of p) expect(CLASSES[id]).toBeDefined();
      expect(rollParty(seed, ['mage', 'cleric'])).toEqual(p);
    }
    expect(() => rollParty(1, ['mage', 'mage'])).toThrow();
    expect(() => rollParty(1, ['mage', 'cleric', 'warrior'])).toThrow();
    const r = createRun(9, { party: rollParty(9, ['ranger']) });
    expect(r.party[0]!.classId).toBe('ranger');
  });

  it('招募候選排除隊上存活者的職業；越晚加入強化越多', () => {
    const r = createRun(4, { party: ['warrior', 'ranger'] });
    expect(recruitPool(r)).not.toContain('warrior');
    expect(recruitPool(r)).not.toContain('ranger');
    expect(lateJoinUpgradeCount(0)).toBe(0);
    expect(lateJoinUpgradeCount(1)).toBe(0);
    expect(lateJoinUpgradeCount(2)).toBe(1);
    expect(lateJoinUpgradeCount(5)).toBe(2);
    expect(lateJoinUpgradeCount(7)).toBe(3);
    for (const layer of [1, 3, 6]) {
      const s = JSON.parse(JSON.stringify(r)) as RunState;
      s.currentNodeId = s.map.nodes.find((n) => n.layer === layer)!.id;
      recruitInto(s, 2, 'mage', new Rng(layer));
      expect(s.party[2]!.upgrades.length).toBe(Math.floor(layer / 2));
    }
  });

  it('切片 2 的存檔（沒有技能欄）讀回時補上預設技能欄', () => {
    const r = createRun(1);
    const old = JSON.parse(serializeRun(r));
    for (const h of old.party) delete h.skills;
    const back = deserializeRun(JSON.stringify(old));
    expect(back.party[0]!.skills).toEqual(defaultLoadout('warrior'));
    expect(availableNodes(back).length).toBeGreaterThan(0);
  });
});

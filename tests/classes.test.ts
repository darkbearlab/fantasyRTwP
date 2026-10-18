import { describe, expect, it } from 'vitest';
import { CLASS_ORDER, CLASSES, LINES, defaultLoadout } from '../src/sim/data/classes';
import { HEROES } from '../src/sim/data/heroes';
import { SKILLS } from '../src/sim/data/skills';
import { ECONOMY } from '../src/run/data/economy';
import { createBattleFromRun } from '../src/run/battle';
import { recruitPool, rollParty, swapHeroSlots, swapOptions, swapSkill, swapSkillOrder, validLoadout } from '../src/run/classes';
import { decideDigit } from '../src/game/input/chord';
import { availableNodes, chooseNode } from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun, deserializeRun, newHero, serializeRun } from '../src/run/runState';
import { heroDef, lateJoinUpgradeCount, recruitInto } from '../src/run/upgrades';
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

  it('技能欄驗證：一定帶專用技能（位置可以在路線圖上調整）、只接受同系技能、不重複', () => {
    // 專用技能不在第 1 欄也合法（Alan：技能順序可以調整）；沒有專用技能則不合法
    expect(validLoadout('warrior', ['shieldBash', 'guard', 'charge'])).toBe(true);
    expect(validLoadout('warrior', ['shieldBash', 'battleCry', 'charge'])).toBe(false);
    expect(validLoadout('warrior', ['guard', 'shieldBash', 'fireball'])).toBe(false);
    expect(validLoadout('warrior', ['guard', 'shieldBash', 'shieldBash'])).toBe(false);
    expect(validLoadout('warrior', ['guard', 'charge', 'shieldBash'])).toBe(true);
    // 專用技能那一欄不能換；已裝備的不會出現在選項裡
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

describe('路線圖調整英雄與技能順序（Alan 要求）', () => {
  const onMap = () => {
    const r = createRun(11);
    r.phase = { kind: 'map' };
    return r;
  };

  it('交換英雄欄位；交換技能順序；專用技能可以在任何一欄', () => {
    const r = onMap();
    const [a, b] = [r.party[0]!.classId, r.party[1]!.classId];
    const r2 = swapHeroSlots(r, 0, 1);
    expect(r2.party[0]!.classId).toBe(b);
    expect(r2.party[1]!.classId).toBe(a);
    // 原本的狀態不變
    expect(r.party[0]!.classId).toBe(a);
    const before = [...r.party[0]!.skills];
    const r3 = swapSkillOrder(r, 0, 0, 2);
    expect(r3.party[0]!.skills).toEqual([before[2], before[1], before[0]]);
    expect(validLoadout(r3.party[0]!.classId, r3.party[0]!.skills)).toBe(true);
    // 戰鬥中的技能順序跟著改
    expect(heroDef(r3.party[0]!).skills).toEqual(r3.party[0]!.skills);
  });

  it('專用技能那一欄不能替換（不論在第幾欄）；其他欄可以', () => {
    const r = onMap();
    const h = r.party[0]!;
    const sig = CLASSES[h.classId].signature;
    const moved = swapSkillOrder(r, 0, 0, 2).party[0]!.skills;
    expect(swapOptions(h.classId, moved, moved.indexOf(sig))).toEqual([]);
    expect(swapOptions(h.classId, moved, 0).length).toBeGreaterThan(0);
  });

  it('只能在路線圖上調整', () => {
    const r = onMap();
    r.phase = { kind: 'battle', nodeId: 0, encounterId: 'passScouts', fromEvent: false };
    expect(() => swapHeroSlots(r, 0, 1)).toThrow();
    expect(() => swapSkillOrder(r, 0, 0, 1)).toThrow();
  });
});

describe('數字鍵二段式（Alan 試作）', () => {
  const skills = () => 3;
  it('第一下選英雄並開始二段式；時間內第二下放技能；逾時又變回選英雄', () => {
    expect(decideDigit(null, 0, 2, false, 4, skills)).toEqual({ kind: 'select', slot: 2, startChord: true });
    const chord = { slot: 2, until: 2000 };
    expect(decideDigit(chord, 1500, 0, false, 4, skills)).toEqual({ kind: 'skill', slot: 2, index: 0 });
    expect(decideDigit(chord, 1500, 2, false, 4, skills)).toEqual({ kind: 'skill', slot: 2, index: 2 });
    expect(decideDigit(chord, 1500, 4, false, 4, skills)).toEqual({ kind: 'noSkill', slot: 2, index: 4 });
    expect(decideDigit(chord, 2500, 0, false, 4, skills)).toEqual({ kind: 'select', slot: 0, startChord: true });
  });

  it('Shift＋數字是加選，不進入也不使用二段式；沒有英雄的數字（5 以上）在選人時無效', () => {
    expect(decideDigit({ slot: 1, until: 9999 }, 0, 3, true, 4, skills)).toEqual({ kind: 'select', slot: 3, startChord: false });
    expect(decideDigit(null, 0, 6, false, 4, skills)).toEqual({ kind: 'none' });
  });
});

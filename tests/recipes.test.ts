/** 每名英雄各自升級、配方昇變（SPEC_SLICE7 §3.1、§3.2） */
import { afterEach, describe, expect, it } from 'vitest';
import type { BattleOutcome } from '../src/run/battle';
import { RECIPE_RULES, RECIPES, evolveUpgradeId } from '../src/run/data/recipes';
import { UPGRADES } from '../src/run/data/upgrades';
import { rescueHero } from '../src/run/journey';
import { applyBattleResult, chooseNode, chooseReward } from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun } from '../src/run/runState';
import { rngFor } from '../src/run/seed';
import { grantUpgrade, heroLevelUpOffer, maxRankOf, rankOf, readyRecipes, recipeDone } from '../src/run/upgrades';
import { xpToNext } from '../src/run/xp';

const berserker = RECIPES.find((r) => r.id === 'berserker')!;

/** 把一份配方湊齊 */
function complete(r: RunState, slot: number, rc = berserker): void {
  for (const id of rc.requires) grantUpgrade(r, id, slot);
  for (let n = 1; n < maxRankOf(rc.maxed); n++) grantUpgrade(r, rc.maxed, slot);
}

afterEach(() => {
  RECIPE_RULES.mode = 'choice';
});

describe('每名英雄各自升級', () => {
  it('升一級：每名活著的英雄各自三選一，選完才往下走', () => {
    let r = createRun(3, { style: 'deliberate', party: ['warrior', 'mage'] });
    r = chooseNode(r, r.map.layers[0][0]);
    r.xp = xpToNext(1) - 1;
    const out: BattleOutcome = {
      won: true,
      exitNodeId: r.map.nodes[r.currentNodeId!].next[0],
      killed: [{ enemy: 'raider', captain: false }],
      time: 5,
      heroes: [0, 1].map((slot) => ({ slot, hp: r.party[slot]!.hp, dead: false, kills: 0, damageDealt: 0, damageTaken: 0 })),
    };
    r = applyBattleResult(r, out);
    expect(r.level).toBe(2);
    const seen: number[] = [];
    for (let i = 0; i < 5 && r.phase.kind === 'reward'; i++) {
      const p = r.phase;
      expect(p.options.length).toBe(3);
      expect(p.optionSlots!.every((s) => s === p.pickSlot)).toBe(true);
      // 通用升級不出全隊的
      for (const id of p.options) expect(UPGRADES[id].scope).toBe('hero');
      seen.push(p.pickSlot!);
      const pick = p.options.find((id) => !UPGRADES[id].needsSkill) ?? p.options[0];
      r = chooseReward(r, UPGRADES[pick].needsSkill ? 'skip' : { upgradeId: pick, slot: p.pickSlot });
    }
    expect(seen).toEqual([0, 1]);
    expect(r.phase.kind).not.toBe('reward');
  });

  it('三選一裡有職業升級；升滿的不再出現；昇變後只剩通用升級', () => {
    const r = createRun(4, { style: 'deliberate', party: ['warrior'] });
    const offer = heroLevelUpOffer(r, 0, rngFor(1, 't'), 3);
    expect(offer.filter((id) => UPGRADES[id].branch).length).toBe(RECIPE_RULES.classSlots);
    grantUpgrade(r, 'bkFury', 0);
    grantUpgrade(r, 'bkFury', 0);
    expect(rankOf(r.party[0]!, 'bkFury')).toBe(2);
    expect(() => grantUpgrade(r, 'bkFury', 0)).toThrow();
    for (let s = 0; s < 30; s++) expect(heroLevelUpOffer(r, 0, rngFor(s, 't'), 3)).not.toContain('bkFury');
  });
});

describe('配方昇變', () => {
  it('湊齊配方：升級時第一張是昇變卡，選了才昇變', () => {
    const r = createRun(5, { style: 'deliberate', party: ['warrior'] });
    complete(r, 0);
    const h = r.party[0]!;
    expect(recipeDone(h, berserker)).toBe(true);
    expect(h.classId).toBe('warrior');
    const offer = heroLevelUpOffer(r, 0, rngFor(2, 't'), 3);
    expect(offer[0]).toBe(evolveUpgradeId('berserker'));
    // 昇變卡是額外的一張
    expect(offer.length).toBe(4);
    grantUpgrade(r, offer[0], 0);
    expect(r.party[0]!.classId).toBe('berserker');
    expect(r.party[0]!.baseClass).toBe('warrior');
    expect(r.evolutionShow?.length).toBe(1);
    // 昇變後：沒有配方、沒有職業升級
    expect(readyRecipes(r.party[0]!)).toEqual([]);
    for (const id of heroLevelUpOffer(r, 0, rngFor(3, 't'), 3)) expect(UPGRADES[id].branch).toBeUndefined();
  });

  it('還沒湊齊不能選昇變卡', () => {
    const r = createRun(6, { style: 'deliberate', party: ['warrior'] });
    grantUpgrade(r, 'bkFury', 0);
    expect(() => grantUpgrade(r, evolveUpgradeId('berserker'), 0)).toThrow();
  });

  it('自動模式：湊齊就昇變', () => {
    RECIPE_RULES.mode = 'auto';
    const r = createRun(7, { style: 'deliberate', party: ['warrior'] });
    complete(r, 0);
    expect(r.party[0]!.classId).toBe('berserker');
  });

  it('每一份配方都湊得齊（升級存在、要升滿的在 requires 裡、屬於那個職業）', () => {
    for (const rc of RECIPES) {
      expect(rc.requires).toContain(rc.maxed);
      for (const id of rc.requires) expect(UPGRADES[id]?.branch?.classId).toBe(rc.base);
      const r = createRun(8, { style: 'deliberate', party: [rc.base] });
      complete(r, 0, rc);
      expect(recipeDone(r.party[0]!, rc)).toBe(true);
    }
  });

  it('被救的英雄照一份配方配點，湊齊就已經昇變', () => {
    const r = createRun(9, { style: 'deliberate', party: ['warrior', 'ranger'] });
    r.level = 6;
    const node = r.map.nodes.find((n) => n.type === 'battle')!.id;
    const h = rescueHero(r, node);
    expect(h.upgrades.length).toBe(5);
    expect(h.baseClass).toBeTruthy();
  });
});

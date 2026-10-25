/** 職業被動的等級（Alan 2026-10-25）：英雄本來就有的被動改成可以升級，不算昇變配方 */
import { afterEach, describe, expect, it } from 'vitest';
import { createBattleFromRun } from '../src/run/battle';
import { RECIPES } from '../src/run/data/recipes';
import { UPGRADES } from '../src/run/data/upgrades';
import { startNodeOf } from '../src/run/journey';
import { chooseNode } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import { classPassiveRank, classPassivesOf, classUpgradesFor, grantUpgrade, maxRankOf } from '../src/run/upgrades';
import { CLASS_PASSIVE_RANKS, CLASS_PASSIVE_RULES, PASSIVES, passiveAtRank } from '../src/sim/data/passives';

afterEach(() => {
  CLASS_PASSIVE_RULES.startRank = 1;
});

describe('職業被動的等級', () => {
  it('每升一級，數值照 grow 增加；第 1 級就是原本的', () => {
    expect(passiveAtRank('cleave', 1)).toBe(PASSIVES.cleave);
    const p3 = passiveAtRank('cleave', 3);
    expect(p3.id).toBe('cleave');
    const a = p3.attack as { angle: number; heavyMult: number };
    expect(a.angle).toBe(110 + 20 * 2);
    expect(a.heavyMult).toBeCloseTo(1.4 + 0.2 * 2);
    expect(passiveAtRank('chillAura', 2).aura!.enemies!.slow).toBeCloseTo(0.3);
  });

  it('升級三選一可以出職業被動升級；升到最高就不再出；不算昇變配方', () => {
    const r = createRun(1, { style: 'deliberate', party: ['warrior'] });
    const h = r.party[0]!;
    expect(classUpgradesFor(h)).toContain('cp_cleave');
    for (let n = 0; n < maxRankOf('cp_cleave'); n++) grantUpgrade(r, 'cp_cleave', 0);
    expect(classPassiveRank(r.party[0]!, 'cleave')).toBe(CLASS_PASSIVE_RANKS.cleave.max);
    expect(classUpgradesFor(r.party[0]!)).not.toContain('cp_cleave');
    expect(() => grantUpgrade(r, 'cp_cleave', 0)).toThrow();
    for (const rc of RECIPES) for (const id of rc.requires) expect(UPGRADES[id].innate).toBeUndefined();
  });

  it('戰鬥裡帶的是目前等級的被動', () => {
    let r = createRun(2, { style: 'deliberate', party: ['warrior', 'ranger'] });
    grantUpgrade(r, 'cp_pierce', 1);
    r = chooseNode(r, startNodeOf(r));
    const w = createBattleFromRun(r);
    const ranger = w.heroes().find((u) => u.def.id === 'ranger')!;
    const p = ranger.passives.find((x) => x.id === 'pierce')!;
    expect((p.attack as { maxTargets: number }).maxTargets).toBe(4);
  });

  it('起始等級 0：一開始沒有那個被動，要從升級拿', () => {
    CLASS_PASSIVE_RULES.startRank = 0;
    const r = createRun(3, { style: 'deliberate', party: ['mage'] });
    expect(classPassivesOf(r.party[0]!).map((p) => p.id)).not.toContain('emberBolt');
    grantUpgrade(r, 'cp_emberBolt', 0);
    expect(classPassivesOf(r.party[0]!).find((p) => p.id === 'emberBolt')?.rank).toBe(1);
  });

  it('不能升別的職業的被動', () => {
    const r = createRun(4, { style: 'deliberate', party: ['warrior'] });
    expect(() => grantUpgrade(r, 'cp_smite', 0)).toThrow();
  });
});

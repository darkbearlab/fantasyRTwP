import { describe, expect, it } from 'vitest';
import { createBattleFromRun, deliberateLevelId } from '../src/run/battle';
import { BRANCH_RULES, BRANCHES, STARTER_CLASSES } from '../src/run/data/branches';
import { UPGRADES } from '../src/run/data/upgrades';
import { recruitPool } from '../src/run/classes';
import { deliberateSkillsOf } from '../src/run/loadout';
import { chooseReward } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import type { RunState } from '../src/run/runState';
import { branchProgress, canEvolve, generalUpgradeIds, grantUpgrade, heroDef, levelUpOffer, rollExclusive, rollUpgrades } from '../src/run/upgrades';
import { CLASS_PASSIVES } from '../src/sim/data/passives';
import { CLASSES } from '../src/sim/data/classes';
import { HEROES } from '../src/sim/data/heroes';
import { SKILLS } from '../src/sim/data/skills';
import { Rng } from '../src/sim/rng';

const run4 = (seed = 3): RunState => createRun(seed, { forward: false, style: 'deliberate', party: ['warrior', 'ranger', 'mage', 'cleric'] });
const branchUps = (branch: string) => Object.keys(UPGRADES).filter((id) => UPGRADES[id].branch?.id === branch);

describe('昇變分支與兩個專屬＋一個通用（SPEC_CLASSES §1）', () => {
  it('每個基本職業的分支（SPEC_CHARACTERS 之後：戰士、遊俠、牧師 3 個，法師、下位元素師 2 個）、每個分支 3 個專屬升級；進階職業的資料都齊', () => {
    for (const base of [...STARTER_CLASSES, 'adept']) {
      expect(BRANCHES[base].length).toBe(base === 'mage' || base === 'adept' ? 2 : 3);
      for (const b of BRANCHES[base]) {
        expect(branchUps(b.id), b.id).toHaveLength(BRANCH_RULES.threshold);
        const to = b.evolvesTo;
        expect(HEROES[to], to).toBeDefined();
        expect(CLASSES[to].line, to).toBe(CLASSES[base].line);
        expect(CLASS_PASSIVES[to], to).toBeDefined();
        for (const sk of deliberateSkillsOf(to)) expect(SKILLS[sk], `${to}:${sk}`).toBeDefined();
      }
    }
  });

  it('通用池：沉穩節奏沒有同袍、有特殊防禦；舊模式和以前一樣（沒有專屬升級）', () => {
    const d = generalUpgradeIds('deliberate');
    expect(d).not.toContain('unity');
    expect(d).toContain('mindWard');
    expect(d.some((id) => UPGRADES[id].branch)).toBe(false);
    const t = generalUpgradeIds();
    expect(t).toContain('unity');
    expect(t).not.toContain('mindWard');
    expect(t).toEqual(['vigor', 'precise', 'ironWall', 'swift', 'practiced', 'sharp', 'evasive', 'fleet', 'fieldMedic', 'unity', 'steadfast', 'doubleCast', 'titan']);
    expect(rollUpgrades(new Rng(1), 3).every((id) => t.includes(id))).toBe(true);
  });

  it('升級三選一：前兩格是兩名不同英雄的專屬升級，第三格通用', () => {
    const r = run4();
    for (let s = 0; s < 20; s++) {
      const { options, optionSlots } = levelUpOffer(r, new Rng(s), 3);
      expect(options).toHaveLength(3);
      const [a, b, c] = optionSlots;
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a).not.toBe(b);
      expect(c).toBeNull();
      expect(UPGRADES[options[0]].branch!.classId).toBe(r.party[a!]!.classId);
      expect(UPGRADES[options[2]].branch).toBeUndefined();
    }
  });

  it('偏向已經在走的分支', () => {
    const r = run4();
    const w = r.party[0]!;
    grantUpgrade(r, 'gdTaunt', 0);
    let lead = 0;
    for (let s = 0; s < 200; s++) if (UPGRADES[rollExclusive(new Rng(s), w)!].branch!.id === 'guardian') lead++;
    // 70% 從領先分支抽，其他 30% 平均（也有三分之一是領先分支）
    expect(lead / 200).toBeGreaterThan(0.65);
  });

  it('同一個分支選滿就昇變：換職業、其他分支關閉、不再出現在專屬升級裡', () => {
    const r = run4();
    grantUpgrade(r, 'glBash', 0);
    grantUpgrade(r, 'gdTaunt', 0);
    grantUpgrade(r, 'gdAura', 0);
    expect(r.party[0]!.classId).toBe('warrior');
    const text = grantUpgrade(r, 'gdShell', 0);
    const h = r.party[0]!;
    expect(text).toContain('昇變成守護者');
    expect(h.classId).toBe('guardian');
    expect(h.baseClass).toBe('warrior');
    expect(r.evolutionShow).toEqual([{ slot: 0, from: 'warrior', to: 'guardian', line: BRANCHES.warrior[0].line }]);
    expect(branchProgress(h)).toEqual({ guardian: 3, gladiator: 1, berserker: 0 });
    expect(canEvolve(h)).toBe(false);
    expect(() => grantUpgrade(r, 'glFocus', 0)).toThrow();
    // 昇變前選過的升級照樣有效
    expect(heroDef(h).skillMods?.shieldBash?.cooldownMult).toBe(0.75);
    for (let s = 0; s < 20; s++) expect(levelUpOffer(r, new Rng(s), 3).optionSlots).not.toContain(0);
  });

  it('專屬升級只能給抽到的英雄；被動帶進戰鬥', () => {
    const r = run4();
    r.pendingLevelUps = 1;
    r.phase = { kind: 'reward', nodeId: 0, options: ['gdTaunt', 'snPower', 'vigor'], optionSlots: [0, 1, null], elite: false, gold: 0, levelUpTo: 2 };
    expect(() => chooseReward(r, { upgradeId: 'gdTaunt', slot: 1 })).toThrow();
    const after = chooseReward(r, { upgradeId: 'gdTaunt', slot: 0 });
    const node = after.map.nodes.find((n) => n.layer === 3)!;
    after.currentNodeId = node.id;
    after.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
    const w = createBattleFromRun(after);
    const u = w.units.find((x) => x.team === 'hero' && x.heroSlot === 0)!;
    expect(u.passives.some((p) => p.id === 'tauntWide')).toBe(true);
  });

  it('刺客分支：每選一個射程縮短，最短 1.5 m', () => {
    const r = run4();
    grantUpgrade(r, 'ctClose1', 1);
    expect(heroDef(r.party[1]!).range).toBe(HEROES.ranger.range - 2.5);
    grantUpgrade(r, 'ctClose2', 1);
    grantUpgrade(r, 'ctClose3', 1);
    // 第三個昇變成刺客（近戰）
    expect(r.party[1]!.classId).toBe('cutthroat');
    expect(heroDef(r.party[1]!).range).toBe(HEROES.cutthroat.range);
  });

  it('每一種進階職業都能進戰鬥', () => {
    for (const base of STARTER_CLASSES)
      for (const b of BRANCHES[base]) {
        const r = createRun(5, { forward: false, style: 'deliberate', party: [base, 'ranger', 'mage', 'cleric'] });
        for (const id of branchUps(b.id)) grantUpgrade(r, id, 0);
        expect(r.party[0]!.classId).toBe(b.evolvesTo);
        const node = r.map.nodes.find((n) => n.layer === 2)!;
        r.currentNodeId = node.id;
        r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
        const w = createBattleFromRun(r);
        for (let t = 0; t < 200; t++) w.step();
        expect(w.units.find((u) => u.heroSlot === 0)!.def.id).toBe(b.evolvesTo);
      }
  });

  it('沉穩節奏只招募基本職業', () => {
    const r = run4();
    r.party[3] = null;
    expect(recruitPool(r).every((id) => STARTER_CLASSES.includes(id))).toBe(true);
  });
});

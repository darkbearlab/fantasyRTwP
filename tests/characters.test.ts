/** 具名角色：A 階段（SPEC_CHARACTERS §3） */
import { describe, expect, it } from 'vitest';
import type { BattleOutcome } from '../src/run/battle';
import { battleOutcomeFromWorld, createBattleFromRun } from '../src/run/battle';
import { availableCharacters, heroName, heroShortName, unmetCharacters } from '../src/run/characters';
import { CHARACTER_ORDER, CHARACTERS } from '../src/run/data/characters';
import { rescueAt, rescueHero } from '../src/run/journey';
import { applyBattleResult, chooseNode, chooseReward, continueFromReward, resolveRescue } from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun, deserializeRun, serializeRun } from '../src/run/runState';
import { HEROES } from '../src/sim/data/heroes';

/** 兩名角色出發、站在有被困英雄的戰鬥前一步 */
function besideRescue(party = ['corin', 'sylwen']): { r: RunState; node: number } {
  for (let s = 1; s < 200; s++) {
    const r = createRun(s, { style: 'deliberate', party });
    const node = r.map.nodes.find((n) => rescueAt(r, n.id) && r.map.nodes.some((p) => p.next.includes(n.id)));
    if (!node) continue;
    const prev = r.map.nodes.find((p) => p.next.includes(node.id))!;
    r.currentNodeId = prev.id;
    r.exitTo = node.id;
    return { r, node: node.id };
  }
  throw new Error('找不到有被困英雄的遠征');
}

describe('具名角色（SPEC_CHARACTERS §3）', () => {
  it('7 名角色；骨架職業做好的才能登場（B 階段之前：柯林、希爾雯、奧爾德斯、班尼迪克）', () => {
    expect(CHARACTER_ORDER.length).toBe(7);
    for (const id of CHARACTER_ORDER) expect(CHARACTERS[id].id).toBe(id);
    expect(availableCharacters()).toEqual(['corin', 'sylwen', 'aldous', 'benedict']);
  });

  it('用角色組隊：英雄帶著角色、職業是骨架職業；名稱是「角色名・職業名」', () => {
    const r = createRun(1, { style: 'deliberate', party: ['corin', 'aldous'] });
    expect(r.party[0]).toMatchObject({ characterId: 'corin', classId: 'warrior' });
    expect(r.party[1]).toMatchObject({ characterId: 'aldous', classId: 'mage' });
    expect(heroName(r.party[0]!)).toBe(`柯林・${HEROES.warrior.name}`);
    expect(heroShortName(r.party[0]!)).toBe('柯林');
    // 沒有角色（舊存檔、舊模式）：職業名
    const old = createRun(1, { style: 'deliberate', party: ['warrior'] });
    expect(old.party[0]!.characterId).toBeUndefined();
    expect(heroName(old.party[0]!)).toBe(HEROES.warrior.name);
    // 存檔來回
    expect(deserializeRun(serializeRun(r)).party[0]!.characterId).toBe('corin');
  });

  it('戰鬥中的名字是角色名', () => {
    const { r, node } = besideRescue();
    const w = createBattleFromRun(chooseNode({ ...r, phase: { kind: 'map' } }, node));
    const hero = w.units.find((u) => u.heroSlot === 0)!;
    expect(hero.def.name).toBe('柯林');
    const captive = w.units.find((u) => u.rescue)!;
    expect(CHARACTER_ORDER.map((id) => CHARACTERS[id].name)).toContain(captive.def.name);
  });

  it('路上解救：抽還沒登場的角色；加入或離開之後都不會再遇到', () => {
    const { r, node } = besideRescue();
    const h = rescueHero(r, node);
    expect(h.characterId).toBeDefined();
    expect(['corin', 'sylwen']).not.toContain(h.characterId);
    expect(h.classId).toBe(CHARACTERS[h.characterId!].baseClass);
    // 走一場：救出來、戰後決定
    let b = chooseNode({ ...r, phase: { kind: 'map' } }, node);
    const w = createBattleFromRun(b);
    w.units.find((u) => u.rescue)!.captive = false;
    w.result = 'hero';
    const out: BattleOutcome = { ...battleOutcomeFromWorld(w), exitNodeId: b.map.nodes[node].next[0] };
    b = applyBattleResult(b, out);
    for (let i = 0; i < 10 && b.phase.kind === 'reward'; i++) b = b.phase.options.length ? chooseReward(b, 'skip') : continueFromReward(b);
    expect(b.phase.kind).toBe('rescue');
    const met = (b.phase as { hero: { characterId?: string } }).hero.characterId!;
    const left = resolveRescue(b, false);
    expect(left.metCharacters).toContain(met);
    expect(unmetCharacters(left)).not.toContain(met);
    const joined = resolveRescue(b, true);
    expect(joined.party.some((p) => p?.characterId === met)).toBe(true);
    expect(unmetCharacters(joined)).not.toContain(met);
  });

  it('所有角色都登場過：照舊抽職業（沒有角色）', () => {
    const { r, node } = besideRescue();
    r.metCharacters = ['aldous', 'benedict'];
    const h = rescueHero(r, node);
    expect(h.characterId).toBeUndefined();
    expect(HEROES[h.classId]).toBeDefined();
  });
});

import { describe, expect, it } from 'vitest';
import { createBattleFromRun, deliberateLevelId } from '../src/run/battle';
import type { BattleOutcome } from '../src/run/battle';
import { depthOffset, startChapter } from '../src/run/campaign';
import { CHAPTERS } from '../src/run/data/chapters';
import { applyBattleResult, chooseReward, continueFromReward } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import type { RunState } from '../src/run/runState';
import { validateRouteMap } from '../src/run/routeMap';
import { maxHpOf } from '../src/run/upgrades';

/** 打贏本章頭目（第 1 名英雄陣亡、其他人受傷） */
function beatBoss(r: RunState): RunState {
  const boss = r.map.nodes.find((n) => n.type === 'boss')!;
  r.currentNodeId = boss.id;
  r.phase = { kind: 'battle', nodeId: boss.id, encounterId: deliberateLevelId('boss'), fromEvent: false };
  const outcome: BattleOutcome = {
    won: true,
    time: 60,
    killed: [{ enemy: 'warlord', captain: false }],
    heroes: r.party.map((_h, slot) => ({ slot, hp: slot === 0 ? 0 : 10, dead: slot === 0, kills: 0, damageDealt: 0, damageTaken: 0 })),
  };
  let next = applyBattleResult(r, outcome);
  // 戰果與升級照常（升級都選第一個）
  for (let i = 0; i < 20 && next.phase.kind === 'reward'; i++) {
    const p = next.phase;
    if (p.options.length === 0) next = continueFromReward(next);
    else next = chooseReward(next, { upgradeId: p.options[0], slot: p.optionSlots?.[0] ?? 1 });
  }
  return next;
}

describe('戰役：五章（SPEC_CAMPAIGN）', () => {
  it('第一章 5 層；組隊後先看開場過場，出發後還是同一張路線圖', () => {
    const r = createRun(4, { style: 'deliberate', intro: true });
    expect(r.chapter).toBe(0);
    expect(r.map.layerCount).toBe(CHAPTERS[0].layers);
    expect(r.phase).toEqual({ kind: 'interlude', chapter: 0 });
    const s = startChapter(r);
    expect(s.phase.kind).toBe('map');
    expect(s.map).toEqual(r.map);
  });

  it('各章的層數越來越多，路線圖都合法', () => {
    for (let i = 1; i < CHAPTERS.length; i++) expect(CHAPTERS[i].layers).toBeGreaterThan(CHAPTERS[i - 1].layers);
    let r = createRun(6, { style: 'deliberate' });
    for (let c = 1; c < CHAPTERS.length; c++) {
      r = beatBoss(r);
      expect(r.phase).toEqual({ kind: 'interlude', chapter: c });
      r = startChapter(r);
      expect(r.map.layerCount).toBe(CHAPTERS[c].layers);
      expect(validateRouteMap(r.map)).toEqual([]);
    }
  });

  it('打倒本章頭目：照常拿經驗值，接著進過場；全隊回滿、陣亡的不復活；下一章重新開始路線圖', () => {
    const r = createRun(5, { style: 'deliberate' });
    const xp = r.xp ?? 0;
    const after = beatBoss(r);
    expect(after.phase).toEqual({ kind: 'interlude', chapter: 1 });
    expect((after.level ?? 1) > 1 || (after.xp ?? 0) > xp).toBe(true);
    expect(after.party[0]!.dead).toBe(true);
    for (const h of after.party.slice(1)) expect(h!.hp).toBe(maxHpOf(h!));
    const next = startChapter(after);
    expect(next.chapter).toBe(1);
    expect(next.phase.kind).toBe('map');
    expect(next.currentNodeId).toBeNull();
    expect(next.path).toEqual([]);
    expect(next.overworld!.turn).toBe(0);
    expect(next.party[0]!.dead).toBe(true);
  });

  it('最後一章的頭目打倒就是遠征勝利', () => {
    let r = createRun(8, { style: 'deliberate' });
    for (let c = 1; c < CHAPTERS.length; c++) r = startChapter(beatBoss(r));
    expect(r.chapter).toBe(CHAPTERS.length - 1);
    r = beatBoss(r);
    expect(r.phase).toEqual({ kind: 'ended', result: 'won' });
  });

  it('敵人強度看全程深度：後面章節同一層的敵人比較強', () => {
    const hp = (r: RunState) => {
      const node = r.map.nodes.find((n) => n.layer === 2)!;
      r.currentNodeId = node.id;
      r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
      const w = createBattleFromRun(r);
      const out = new Map<string, number>();
      for (const u of w.units) if (u.team === 'enemy' && u.def.rank !== 'elite') out.set(u.def.id, u.maxHp);
      return out;
    };
    const r0 = createRun(9, { style: 'deliberate' });
    const r2 = createRun(9, { style: 'deliberate' });
    r2.chapter = 2;
    expect(depthOffset(r2)).toBe(CHAPTERS[0].layers + CHAPTERS[1].layers);
    const a = hp(r0);
    const b = hp(r2);
    const common = [...a.keys()].filter((id) => b.has(id));
    expect(common.length).toBeGreaterThan(0);
    for (const id of common) expect(b.get(id)!, id).toBeGreaterThan(a.get(id)!);
  });
});

describe('冠軍不會搶走頭目戰（Alan 2026-10-21 回報）', () => {
  it('玩家走進頭目節點時，追獵中的冠軍停在門外，不會進頭目節點', async () => {
    const { advanceTurn, caught } = await import('../src/run/overworld');
    const { neighbors } = await import('../src/run/routeMap');
    const r = createRun(12, { style: 'deliberate' });
    const boss = r.map.nodes.find((n) => n.type === 'boss')!;
    const next = neighbors(r.map, boss.id)[0];
    r.overworld!.champion = { node: next, hunting: true, respawnAt: 0 };
    r.currentNodeId = boss.id;
    for (let k = 0; k < 5; k++) {
      advanceTurn(r, boss.id);
      expect(r.overworld!.champion.node).not.toBe(boss.id);
      expect(caught(r)).toBe(false);
    }
  });

  it('就算冠軍戰發生在頭目節點，打贏也不算打倒頭目', () => {
    const r = createRun(13, { style: 'deliberate' });
    const boss = r.map.nodes.find((n) => n.type === 'boss')!;
    r.currentNodeId = boss.id;
    r.phase = { kind: 'battle', nodeId: boss.id, encounterId: deliberateLevelId('elite'), fromEvent: false, mods: { champion: true } };
    const after = applyBattleResult(r, { won: true, time: 30, killed: [], heroes: r.party.map((_h, slot) => ({ slot, hp: 50, dead: false, kills: 0, damageDealt: 0, damageTaken: 0 })) });
    expect(after.chapterCleared).toBeFalsy();
    expect(after.phase.kind).not.toBe('interlude');
    expect(after.phase.kind).not.toBe('ended');
  });
});

describe('休息節點：訓練＝升級三選一、繼續趕路（Alan 2026-10-22）', () => {
  async function atRest(seed: number) {
    const { chooseNode } = await import('../src/run/progression');
    const { distances } = await import('../src/run/routeMap');
    let r = createRun(seed, { style: 'deliberate' });
    const rest = r.map.nodes.find((n) => n.type === 'rest')!;
    // 直接站到休息節點旁邊再走進去（路線圖的可前往判定）
    const nb = (r.map.nodes[rest.id].links ?? [])[0];
    r.currentNodeId = nb;
    r.overworld!.force = [];
    const far = [...distances(r.map, rest.id)].filter(([, d]) => d >= 3).map(([id]) => id)[0];
    r.overworld!.champion = { node: far, hunting: false, respawnAt: 0 };
    r = chooseNode(r, rest.id);
    return { r, rest, far };
  }

  it('訓練是兩個專屬＋一個通用，選了不提升隊伍等級', async () => {
    const { restTrain } = await import('../src/run/progression');
    const { r } = await atRest(21);
    if (r.phase.kind !== 'rest') throw new Error('應該在休息節點');
    const p = r.phase;
    expect(p.trainOptions).toHaveLength(3);
    expect(p.trainSlots?.slice(0, 2).every((s) => s !== null)).toBe(true);
    expect(p.trainSlots?.[2]).toBeNull();
    const level = r.level;
    // 專屬升級給別人不行
    const wrong = [0, 1, 2, 3].find((x) => x !== p.trainSlots![0])!;
    expect(() => restTrain(r, wrong, p.trainOptions[0])).toThrow();
    const after = restTrain(r, p.trainSlots![0]!, p.trainOptions[0]);
    expect(after.level).toBe(level);
    expect(after.party[p.trainSlots![0]!]!.upgrades.some((o) => o.id === p.trainOptions[0])).toBe(true);
  });

  it('紮營、訓練會引來冠軍；繼續趕路不會', async () => {
    const { leaveNode, restCamp, restTrain } = await import('../src/run/progression');
    const { distances } = await import('../src/run/routeMap');
    const { r, rest, far } = await atRest(22);
    if (r.phase.kind !== 'rest') throw new Error('應該在休息節點');
    const start = r.overworld!.champion.node!;
    const d0 = distances(r.map, rest.id).get(start)!;
    const closer = (x: RunState) => distances(x.map, rest.id).get(x.overworld!.champion.node ?? far)! < d0;
    expect(closer(restCamp(r))).toBe(true);
    expect(closer(restTrain(r, r.phase.trainSlots![0]!, r.phase.trainOptions[0]))).toBe(true);
    const left = leaveNode(r);
    expect(left.phase.kind).toBe('map');
    expect(left.overworld!.champion.node).toBe(start);
  });
});

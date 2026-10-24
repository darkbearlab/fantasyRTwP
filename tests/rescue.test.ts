/** 開局兩人、路上解救英雄、陣亡就是沒了（SPEC_SLICE7 §4、§5） */
import { describe, expect, it } from 'vitest';
import type { BattleOutcome } from '../src/run/battle';
import { battleOutcomeFromWorld, createBattleFromRun } from '../src/run/battle';
import { shopConsumables } from '../src/run/consumables';
import { BRANCHES } from '../src/run/data/branches';
import { JOURNEY } from '../src/run/data/journey';
import { UPGRADES } from '../src/run/data/upgrades';
import { rescueAt, rescueHero } from '../src/run/journey';
import { applyBattleResult, canAcceptRescue, canRecruit, canRevive, chooseNode, chooseReward, continueFromReward, resolveRescue } from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun } from '../src/run/runState';
import { DT } from '../src/sim/constants';
import { CAPTIVE } from '../src/sim/data/followers';
import { dist } from '../src/sim/math';

/** 一趟兩人出發的遠征，站在有被困英雄的戰鬥前一步 */
function besideRescue(level = 1): { r: RunState; node: number } {
  for (let s = 1; s < 200; s++) {
    const r = createRun(s, { style: 'deliberate', party: ['warrior', 'ranger'] });
    const node = r.map.nodes.find((n) => rescueAt(r, n.id) && r.map.nodes.some((p) => p.next.includes(n.id)));
    if (!node) continue;
    const prev = r.map.nodes.find((p) => p.next.includes(node.id))!;
    r.currentNodeId = prev.id;
    r.exitTo = node.id;
    r.level = level;
    return { r, node: node.id };
  }
  throw new Error('找不到有被困英雄的遠征');
}

const enter = (r: RunState, node: number) => chooseNode({ ...r, phase: { kind: 'map' } }, node);

describe('開局兩人', () => {
  it('兩人出發，另外兩格是空的；職業可以重複', () => {
    const r = createRun(1, { style: 'deliberate', party: ['ranger', 'ranger'] });
    expect(r.party.map((h) => h?.classId ?? null)).toEqual(['ranger', 'ranger', null, null]);
  });
});

describe('被困的英雄', () => {
  it('依種子固定、只在一般戰鬥；出口預告算「敵人以外的氣息」', () => {
    const { r, node } = besideRescue();
    expect(rescueAt(r, node)).toBe(rescueAt(r, node));
    for (const n of r.map.nodes) if (n.type !== 'battle') expect(rescueAt(r, n.id)).toBe(false);
  });

  it('加入前的成長已經配好：隊伍等級、(等級 − 1) 個升級、先走一個昇變分支', () => {
    const { r, node } = besideRescue(5);
    const h = rescueHero(r, node);
    expect(h.level).toBe(5);
    expect(h.upgrades.length).toBe(4 * JOURNEY.rescue.upgradesPerLevel);
    // 走滿一個分支就昇變
    const base = h.baseClass ?? h.classId;
    const branches = (BRANCHES[base] ?? []).map((b) => b.id);
    const taken = h.upgrades.map((o) => UPGRADES[o.id]?.branch?.id).filter(Boolean);
    expect(new Set(taken).size).toBeLessThanOrEqual(1);
    if (taken.length) expect(branches).toContain(taken[0]);
    expect(rescueHero(r, node)).toEqual(h);
  });

  it('戰鬥中：玩家靠近前不動、敵人也不打；靠近就被找到，看守開始進攻', () => {
    const { r, node } = besideRescue();
    const b = enter(r, node);
    const w = createBattleFromRun(b);
    const c = w.units.find((u) => u.rescue)!;
    expect(c).toBeDefined();
    expect(c.captive).toBe(true);
    expect(c.isHero).toBe(false);
    const guards = w.units.filter((u) => u.team === 'enemy' && u.squad === c.captiveSquad);
    expect(guards.length).toBeGreaterThan(0);
    for (const g of guards) expect(w.canTarget(g, c)).toBe(false);
    const at = { ...c.pos };
    for (let i = 0; i < 2 / DT; i++) w.step();
    expect(dist(c.pos, at)).toBeLessThan(0.01);
    // 把一名英雄放到旁邊
    const h = w.heroes()[0];
    h.pos = { x: c.pos.x + CAPTIVE.wakeRange - 1, y: c.pos.y };
    const evs: string[] = [];
    for (let i = 0; i < 3; i++) for (const ev of w.step()) evs.push(ev.type);
    expect(evs).toContain('captiveFreed');
    expect(c.captive).toBe(false);
    expect(c.masterId).toBe(h.id);
    expect(guards.every((g) => g.alerted)).toBe(true);
  });

  it('救出來跟著離開：戰後決定要不要讓他加入，加入就填進空欄位，接著照常進下一張圖', () => {
    const { r, node } = besideRescue();
    let b = enter(r, node);
    const w = createBattleFromRun(b);
    const c = w.units.find((u) => u.rescue)!;
    c.captive = false;
    w.result = 'hero';
    const out: BattleOutcome = { ...battleOutcomeFromWorld(w), exitNodeId: b.map.nodes[node].next[0] };
    expect(out.rescued).toBeDefined();
    expect(out.followers?.some((f) => f.kind === c.def.id)).toBe(false);
    b = applyBattleResult(b, out);
    for (let i = 0; i < 10 && b.phase.kind === 'reward'; i++) b = b.phase.options.length ? chooseReward(b, 'skip') : continueFromReward(b);
    expect(b.phase.kind).toBe('rescue');
    expect(canAcceptRescue(b)).toBe(true);
    const joined = resolveRescue(b, true);
    expect(joined.party[2]?.classId).toBe((b.phase as { hero: { classId: string } }).hero.classId);
    expect(joined.currentNodeId).toBe(out.exitNodeId);
    const left = resolveRescue(b, false);
    expect(left.party[2]).toBeNull();
  });

  it('沒找到（一直沒靠近）就不算救出', () => {
    const { r, node } = besideRescue();
    const w = createBattleFromRun(enter(r, node));
    w.result = 'hero';
    expect(battleOutcomeFromWorld(w).rescued).toBeUndefined();
  });

  it('隊伍滿了不能加入', () => {
    const { r, node } = besideRescue();
    const full = { ...r, party: createRun(1, { style: 'deliberate' }).party, pendingRescue: rescueHero(r, node) };
    expect(canAcceptRescue({ ...full, phase: { kind: 'rescue', hero: full.pendingRescue } })).toBe(false);
  });
});

describe('陣亡就是沒了', () => {
  it('休息點不能救人、不能招募；商人不賣鳳凰羽毛', () => {
    const r = createRun(3, { style: 'deliberate' });
    r.party[1]!.dead = true;
    expect(canRevive({ ...r, phase: { kind: 'rest', nodeId: 0, used: false, recruited: false, recruitCandidates: [], trainOptions: [] }, gold: 999 })).toBe(false);
    expect(canRecruit({ ...r, gold: 999 })).toBe(false);
    expect(shopConsumables(r)).not.toContain('phoenix');
  });

  it('陣亡英雄身上的裝備掉回背包', () => {
    let r = createRun(4, { style: 'deliberate', party: ['warrior', 'ranger'] });
    r.party[1]!.items = ['swiftBoots'];
    r = chooseNode(r, r.map.layers[0][0]);
    const out: BattleOutcome = {
      won: true,
      killed: [],
      time: 5,
      heroes: [
        { slot: 0, hp: 50, dead: false, kills: 0, damageDealt: 0, damageTaken: 0 },
        { slot: 1, hp: 0, dead: true, kills: 0, damageDealt: 0, damageTaken: 0 },
      ],
    };
    r = applyBattleResult(r, out);
    expect(r.party[1]!.dead).toBe(true);
    expect(r.party[1]!.items).toEqual([]);
    expect(r.inventory).toContain('swiftBoots');
  });
});

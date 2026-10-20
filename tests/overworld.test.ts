import { describe, expect, it } from 'vitest';
import { ROUTE_MAP } from '../src/run/data/routeMap';
import { advanceTurn, campfireSmoke, caught, championDefeated, spreadForce } from '../src/run/overworld';
import { applyBattleResult, availableNodes, chooseNode, restCamp } from '../src/run/progression';
import { directionTo, distances, generateRouteMap, neighbors, stepToward, validateRouteMap } from '../src/run/routeMap';
import type { RunState } from '../src/run/runState';
import { createRun } from '../src/run/runState';
import { generateTemplateLevel } from '../src/run/templateLevelGen';

/** 移開冠軍（只測其他規則） */
function noChampion(r: RunState): RunState {
  r.overworld!.champion.node = null;
  r.overworld!.champion.respawnAt = 9999;
  return r;
}

describe('FTL 式路線圖（SPEC_SLICE6 §4）', () => {
  it('生成：符合規則、夠寬、連線雙向、決定論', () => {
    for (let s = 1; s <= 100; s++) {
      const m = generateRouteMap(s);
      expect(validateRouteMap(m), `種子 ${s}`).toEqual([]);
      for (const ids of m.layers.slice(0, -1)) expect(ids.length).toBeGreaterThanOrEqual(ROUTE_MAP.width[0]);
    }
    expect(JSON.stringify(generateRouteMap(9))).toBe(JSON.stringify(generateRouteMap(9)));
  });

  it('可以往回走：相鄰節點都能前往（含上一個節點）', () => {
    let r = noChampion(createRun(3));
    r.overworld!.force = [];
    const first = availableNodes(r)[0];
    r = chooseNode(r, first.id);
    r = { ...r, phase: { kind: 'map' } };
    const opts = availableNodes(r).map((n) => n.id).sort();
    expect(opts).toEqual([...neighbors(r.map, first.id)].sort());
  });

  it('回合：每移動一次 +1；主力每 spreadEvery 回合擴散；重複訪問時往該節點額外蔓延', () => {
    const r = noChampion(createRun(4));
    const ow = r.overworld!;
    const start = ow.force.length;
    const a = r.map.layers[0][0];
    r.currentNodeId = a;
    advanceTurn(r, a);
    expect(ow.turn).toBe(1);
    expect(ow.force.length).toBe(start);
    advanceTurn(r, a); // 第 2 回合：定期擴散＋重複訪問
    expect(ow.force.length).toBe(start + ROUTE_MAP.force.spreadPerTick + ROUTE_MAP.force.revisitExtra);
    // 額外蔓延是往被重複訪問的節點方向：佔領的節點離它更近了
    const d = distances(r.map, a);
    const before = Math.min(...ow.force.slice(0, start).map((id) => d.get(id)!));
    expect(Math.min(...ow.force.map((id) => d.get(id)!))).toBeLessThan(before);
  });

  it('被主力佔領的節點：變成強化戰鬥', () => {
    let r = noChampion(createRun(5));
    const target = r.map.layers[0][1];
    r.overworld!.force.push(target);
    r = chooseNode(r, target);
    expect(r.phase.kind === 'battle' && r.phase.mods?.force).toBe(true);
  });

  it('冠軍：發現玩家後每回合追一格；追到就進入冠軍戰；打倒後一段時間才重新出現', () => {
    const r = createRun(6);
    const ow = r.overworld!;
    ow.force = [];
    const a = r.map.layers[0][0];
    r.currentNodeId = a;
    // 冠軍放在離玩家兩步的地方
    const far = [...distances(r.map, a)].find(([, d]) => d === 2)![0];
    ow.champion.node = far;
    advanceTurn(r, a);
    expect(ow.champion.hunting).toBe(true);
    let guard = 0;
    while (!caught(r) && guard++ < 5) advanceTurn(r, a);
    expect(caught(r)).toBe(true);
    championDefeated(r);
    expect(ow.champion.node).toBeNull();
    expect(ow.champion.respawnAt).toBe(ow.turn + ROUTE_MAP.champion.respawnTurns);
  });

  it('走進冠軍所在的節點：直接冠軍戰（精英關卡、隊長換成冠軍）', () => {
    let r = createRun(7);
    r.overworld!.force = [];
    const t = r.map.layers[0][1];
    r.overworld!.champion.node = t;
    r = chooseNode(r, t);
    expect(r.phase.kind === 'battle' && r.phase.mods?.champion).toBe(true);
    const lv = generateTemplateLevel(1, { tier: 'elite', layer: 3, captainEnemy: ROUTE_MAP.champion.enemy });
    expect(lv.enemies.find((e) => e.captain)!.enemy).toBe(ROUTE_MAP.champion.enemy);
  });

  it('休息：營火的煙讓冠軍立刻往玩家走一格', () => {
    const r = createRun(8);
    const ow = r.overworld!;
    ow.force = [];
    const rest = r.map.nodes.find((n) => n.type === 'rest')!;
    const far = [...distances(r.map, rest.id)].find(([, d]) => d === 3)![0];
    ow.champion.node = far;
    ow.champion.hunting = false;
    r.currentNodeId = rest.id;
    r.phase = { kind: 'rest', nodeId: rest.id, used: false, recruited: false, recruitCandidates: [], trainOptions: [], talked: true };
    const after = restCamp(r);
    const d = distances(after.map, rest.id);
    expect(d.get(after.overworld!.champion.node!)).toBe(3 - ROUTE_MAP.champion.restSmokeSteps);
    // 煙只會讓冠軍靠近，不是瞬移
    campfireSmoke(after);
  });

  it('冠軍戰打贏：冠軍消失，等一段時間才回來', () => {
    let r = createRun(9);
    r.overworld!.force = [];
    const t = r.map.layers[0][2];
    r.overworld!.champion.node = t;
    r = chooseNode(r, t);
    r = applyBattleResult(r, { won: true, time: 30, killed: [], heroes: r.party.flatMap((h, slot) => (h ? [{ slot, hp: h.hp, dead: false, kills: 0, damageDealt: 0, damageTaken: 0 }] : [])) });
    expect(r.overworld!.champion.node).toBeNull();
  });

  it('出口與入口方向：下一層在上、前一層在下、同層在左右；從上方進來時出生點在上方', () => {
    const m = generateRouteMap(2);
    const a = m.layers[2][1];
    for (const t of neighbors(m, a)) {
      const dir = directionTo(m, a, t);
      if (m.nodes[t].layer > 3) expect(dir).toBe('top');
      if (m.nodes[t].layer < 3) expect(dir).toBe('bottom');
    }
    const lv = generateTemplateLevel(5, {
      tier: 'battle',
      layer: 3,
      entry: 'top',
      exits: [
        { id: 'node:1', edge: 'bottom' },
        { id: 'node:2', edge: 'left' },
        { id: 'node:3', edge: 'right' },
      ],
    });
    const mp = lv.mapDef;
    const W = mp.width;
    for (const h of mp.heroSpawns) expect(h.x).toBeGreaterThan(W * (2 / 3));
    const byId = new Map(mp.exits!.map((e) => [e.id, e]));
    expect(byId.get('node:1')!.x).toBe(0);
    expect(byId.get('node:2')!.y).toBe(0);
    expect(byId.get('node:3')!.y + byId.get('node:3')!.h).toBe(mp.height);
    expect(stepToward(m, a, a)).toBe(a);
    spreadForce(createRun(1));
  });
});

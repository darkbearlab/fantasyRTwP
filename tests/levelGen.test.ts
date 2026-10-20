import { describe, expect, it } from 'vitest';
import { createBattleFromRun, encounterFor, levelEncounterId } from '../src/run/battle';
import { LEVELS } from '../src/run/data/levels';
import type { LevelTier } from '../src/run/levelGen';
import { generateLevel } from '../src/run/levelGen';
import { chooseNode, pickEncounter } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import { findPath } from '../src/sim/nav/astar';
import { NavGrid } from '../src/sim/nav/grid';
import { TICK_RATE } from '../src/sim/constants';
import { run } from './helpers';

const TIERS: LevelTier[] = ['battle', 'elite', 'boss', 'event'];

describe('大型關卡生成（遠征）', () => {
  it('決定論：同樣的種子與參數得到同樣的關卡', () => {
    for (const tier of TIERS) expect(JSON.stringify(generateLevel(42, { tier, layer: 3 }))).toBe(JSON.stringify(generateLevel(42, { tier, layer: 3 })));
    expect(JSON.stringify(generateLevel(1, { tier: 'battle', layer: 1 }))).not.toBe(JSON.stringify(generateLevel(2, { tier: 'battle', layer: 1 })));
  });

  it('各種節點類型、多個種子：出生點走得到出口（門全開）、生成點都可走、目標正確', () => {
    for (const tier of TIERS) {
      for (let s = 1; s <= 12; s++) {
        const lv = generateLevel(s * 101, { tier, layer: 1 + (s % 8) });
        const m = lv.mapDef;
        const size = LEVELS.size[tier];
        expect(m.width).toBe(size.width);
        expect(m.height).toBe(size.height);
        const g = NavGrid.fromMap(m, 0.5, 0.45);
        for (const p of m.heroSpawns) expect(g.isWalkable(p), `${tier} ${s} 出生點`).toBe(true);
        for (const sp of lv.horde!.spawners) expect(g.isWalkable(sp), `${tier} ${s} 生成點 ${sp.id}`).toBe(true);
        const goal = m.landmarks!.exit;
        expect(findPath(g, m.heroSpawns[0], goal), `${tier} ${s}`).not.toBeNull();
        expect(lv.horde!.fog).toBe(true);
        expect(lv.horde!.objective.type).toBe(tier === 'boss' ? 'kill' : 'exit');
        expect(lv.horde!.director!.stages.length).toBe(size.zones);
        // 波次用到的生成點都存在
        const ids = new Set(lv.horde!.spawners.map((x) => x.id));
        for (const w of lv.horde!.waves) for (const sp of w.spawns) expect(ids.has(sp.spawner), `${w.id} → ${sp.spawner}`).toBe(true);
      }
    }
  });

  it('精英關卡有隊長；頭目關卡最後一區有頭目；上鎖的門一定有絞盤與警報波次', () => {
    for (let s = 1; s <= 8; s++) {
      const elite = generateLevel(s, { tier: 'elite', layer: 4 });
      expect(elite.horde!.waves.some((w) => w.spawns.some((x) => x.captain))).toBe(true);
      const boss = generateLevel(s, { tier: 'boss', layer: 8 });
      expect(boss.horde!.waves.find((w) => w.id === 'boss')!.spawns[0].enemy).toBe(LEVELS.boss.enemy);
      for (const lv of [elite, boss]) {
        const locked = lv.mapDef.interactables!.filter((d) => d.locked);
        expect(locked.length).toBe(1);
        const lever = lv.mapDef.interactables!.find((d) => d.kind === 'lever')!;
        expect(lever.actions![0]).toEqual({ type: 'openDoor', door: locked[0].id });
        expect(lv.horde!.waves.some((w) => w.trigger.type === 'interact')).toBe(true);
      }
    }
  });

  it('實際模擬：門全開、英雄沿路線攻擊移動，可以抵達出口', () => {
    // 單向分層路線圖（這個測試只測封存的大型關卡）
    const r = createRun(7, { layers: 8 });
    const node = r.map.nodes.find((n) => n.layer === 1)!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: levelEncounterId('battle'), fromEvent: false };
    const w = createBattleFromRun(r);
    for (const h of w.units) if (h.team === 'hero') h.hp = h.def.maxHp = 1e6;
    for (const d of w.interactables.list) if (d.def.kind === 'door') w.setDoor(d, true);
    const m = w.map;
    const path = findPath(w.navGrid(0.5), m.heroSpawns[0], m.landmarks!.exit)!;
    const route = path.filter((_, i) => i % 6 === 5 || i === path.length - 1);
    let wp = 0;
    while (!w.result && w.tick < 400 * TICK_RATE) {
      const hs = w.units.filter((u) => u.team === 'hero' && !u.dead);
      if (wp < route.length && hs.every((h) => !h.order && !h.action)) w.enqueue({ type: 'attackMove', unitIds: hs.map((h) => h.id), point: route[wp++] });
      w.step();
    }
    expect(w.result).toBe('hero');
  });
});

describe('遠征改用大型關卡', () => {
  it('大型關卡遠征（封存模式）：戰鬥、精英、頭目節點都用生成的關卡', () => {
    const r = createRun(3, { style: 'horde' });
    expect(r.style).toBe('horde');
    for (const n of r.map.nodes) {
      if (n.type === 'battle' || n.type === 'elite' || n.type === 'boss') expect(pickEncounter(r, n)).toBe(levelEncounterId(n.type));
    }
    const first = r.map.layers[0][0];
    const b = chooseNode(r, first);
    expect(b.phase.kind).toBe('battle');
    const w = createBattleFromRun(b);
    expect(w.horde).not.toBeNull();
    expect(w.map.width).toBe(LEVELS.size.battle.width);
    // 同一趟遠征、同一節點：同一張關卡
    expect(JSON.stringify(encounterFor(b, first, levelEncounterId('battle')))).toBe(JSON.stringify(encounterFor(createRun(3, { style: 'horde' }), first, levelEncounterId('battle'))));
  });

  it('戰術模式（tactical）仍然用原本的遭遇池', () => {
    const r = createRun(3, { style: 'tactical' });
    const n = r.map.nodes[r.map.layers[0][0]];
    expect(pickEncounter(r, n).startsWith('level:')).toBe(false);
  });

  it('頭目關卡：擊倒頭目那一波就勝利', () => {
    const r = createRun(5);
    const node = r.map.nodes.find((n) => n.type === 'boss')!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: levelEncounterId('boss'), fromEvent: false };
    const w = createBattleFromRun(r);
    const heroes = w.units.filter((u) => u.team === 'hero');
    const last = w.horde!.waves.find((x) => x.id === 'boss')!.trigger as { rect: { x: number; y: number; w: number; h: number } };
    const den = w.horde!.spawners.find((s) => s.id === 'bossDen')!;
    for (const h of heroes) {
      h.hp = h.def.maxHp = 1e6;
      h.pos = { x: last.rect.x + 2, y: den.y };
    }
    run(w, 3);
    const boss = w.units.find((u) => u.waveId === 'boss')!;
    expect(boss).toBeDefined();
    expect(w.result).toBeNull();
    boss.hp = 0;
    boss.dead = true;
    run(w, 2);
    expect(w.result).toBe('hero');
  });
});

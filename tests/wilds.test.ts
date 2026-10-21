import { describe, expect, it } from 'vitest';
import { createBattleFromRun, deliberateLevelId, enemyDef } from '../src/run/battle';
import { FACTIONS } from '../src/run/data/factions';
import { createRun } from '../src/run/runState';
import type { RunState } from '../src/run/runState';
import { DT } from '../src/sim/constants';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { HEROES } from '../src/sim/data/heroes';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { World } from '../src/sim/world';

/** 第 2 章（荒野）的某一層戰鬥 */
function wildsBattle(seed: number, tier: 'battle' | 'elite' | 'boss', layer = 3): World {
  const r: RunState = createRun(seed, { style: 'deliberate' });
  r.chapter = 1;
  const node = tier === 'boss' ? r.map.nodes.find((n) => n.type === 'boss')! : r.map.nodes.find((n) => n.layer === layer)!;
  r.currentNodeId = node.id;
  r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId(tier), fromEvent: false };
  return createBattleFromRun(r);
}

const ORCS = FACTIONS.orcs;
const orcIds = new Set([
  ...Object.values(ORCS.sites).flatMap((s) => [...s.grunts.map((g) => g.enemy), s.anvil, s.totem].filter(Boolean) as string[]),
  ...Object.values(ORCS.pools).flatMap((p) => p.map((e) => e.enemy)),
  ...ORCS.captainPool,
]);

describe('第 2 章「荒野」：獸人部落（SPEC_CAMPAIGN）', () => {
  it('荒野的據點只有獸人部落的敵人，營地有戰鬥圖騰', () => {
    let totems = 0;
    for (const seed of [1, 2, 3, 4]) {
      const w = wildsBattle(seed, 'battle', 2 + (seed % 3));
      for (const u of w.units.filter((x) => x.team === 'enemy')) expect(orcIds.has(u.def.id), u.def.id).toBe(true);
      totems += w.units.filter((u) => u.def.id === 'warTotem').length;
    }
    expect(totems).toBeGreaterThan(0);
  });

  it('戰鬥圖騰：附近的同伴傷害上升，每根疊加；打掉就沒有', () => {
    const w = new World({
      seed: 1,
      map: { id: 't', name: 't', width: 30, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] },
      spawns: [
        { defId: 'warrior', def: { ...HEROES.warrior, skills: [] }, pos: { x: 25, y: 6 } },
        { defId: 'orcWarrior', def: enemyDef('orcWarrior', 1), pos: { x: 5, y: 6 }, squad: 's' },
        { defId: 'warTotem', def: enemyDef('warTotem', 1), pos: { x: 3, y: 6 }, squad: 's' },
        { defId: 'warTotem', def: enemyDef('warTotem', 1), pos: { x: 7, y: 6 }, squad: 's' },
      ],
      config: { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) },
    });
    const orc = w.units[1];
    const base = orc.outgoingDamageMult / (1 + orc.stackDamage);
    w.step();
    expect(orc.stackDamage).toBeCloseTo(0.3, 5);
    expect(orc.outgoingDamageMult).toBeCloseTo(base * 1.3, 5);
    w.units[2].hp = 0;
    w.units[2].dead = true;
    w.step();
    expect(orc.stackDamage).toBeCloseTo(0.15, 5);
  });

  it('頭目房：林中空地（沒有石牆）、獸人酋長、四根圖騰', () => {
    const w = wildsBattle(5, 'boss');
    const ids = w.units.filter((u) => u.team === 'enemy').map((u) => u.def.id);
    expect(ids).toContain('orcChief');
    expect(ids.filter((id) => id === 'warTotem')).toHaveLength(4);
    const art = w.map.art as { level: { walls: unknown[] } };
    expect(art.level.walls).toHaveLength(0);
    expect(w.map.name).toContain('獸人酋長');
  });

  it('獸人酋長會跳斬、投擲巨石；戰吼叫來哥布林', () => {
    const w = wildsBattle(6, 'boss');
    const chief = w.units.find((u) => u.def.id === 'orcChief')!;
    const heroes = w.units.filter((u) => u.team === 'hero');
    // 英雄散開站在酋長前方，酋長警覺
    heroes.forEach((h, i) => (h.pos = { x: chief.pos.x - 3 - i * 2.5, y: chief.pos.y + (i % 2 ? 2 : -2) }));
    for (const e of w.units) if (e.team === 'enemy') e.alerted = true;
    const used = new Set<string>();
    for (let t = 0; t < 40 / DT && !w.result; t++) {
      for (const ev of w.step()) if (ev.type === 'actionStart' && ev.unitId === chief.id && ev.skillId) used.add(ev.skillId);
      if (t === Math.round(20 / DT)) chief.hp = Math.min(chief.hp, chief.maxHp * 0.4);
      for (const h of heroes) h.hp = h.maxHp;
    }
    expect(used.has('chiefLeap') || used.has('boulder')).toBe(true);
    expect(used.has('orcWarcry')).toBe(true);
    expect(w.units.some((u) => u.def.id === 'goblin' && u.team === 'enemy')).toBe(true);
  });

  it('第 1 章維持帝國叛軍與戰爭領主', () => {
    const r = createRun(7, { style: 'deliberate' });
    const node = r.map.nodes.find((n) => n.type === 'boss')!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('boss'), fromEvent: false };
    const w = createBattleFromRun(r);
    expect(w.units.some((u) => u.def.id === 'warlord')).toBe(true);
  });
});

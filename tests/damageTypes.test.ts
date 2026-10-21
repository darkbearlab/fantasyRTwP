import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/run/battle';
import { deliberateSkillsOf } from '../src/run/loadout';
import { applyArmor } from '../src/sim/combat';
import { attackInfo, defenseOf, matchup, mitigate, typedDamage } from '../src/sim/actions';
import { DT } from '../src/sim/constants';
import { deliberateConfig } from '../src/sim/data/deliberate';
import { DAMAGE_FORMULA } from '../src/sim/data/damageTypes';
import { HEROES } from '../src/sim/data/heroes';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { World } from '../src/sim/world';

const MAP = { id: 't', name: 't', width: 30, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };
const DELIB = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG) };

function duel(hero: string, foe: string, seconds: number, seed = 1) {
  const w = new World({
    seed,
    map: MAP,
    spawns: [
      { defId: hero, def: { ...HEROES[hero], skills: [] }, pos: { x: 5, y: 6 } },
      { defId: foe, def: enemyDef(foe, 1), pos: { x: 6.2, y: 6 }, squad: 's' },
    ],
    config: DELIB,
  });
  const [h, e] = w.units;
  e.alerted = true;
  for (let t = 0; t < seconds / DT && !e.dead; t++) {
    if (t % 10 === 0) w.enqueue({ type: 'attack', unitIds: [h.id], targetId: e.id });
    w.step();
  }
  return { w, h, e };
}

describe('物理／特殊與屬性相剋（SPEC_DAMAGE）', () => {
  it('普攻與技能的類別、屬性', () => {
    const { h, e } = duel('cleric', 'shieldbearer', 0);
    expect(attackInfo(h, undefined, 'melee')).toEqual({ cat: 'phys', attrs: ['blunt'] });
    expect(attackInfo(h, 'flashFireball', 'spell')).toEqual({ cat: 'spec', attrs: ['fire', 'blunt'] });
    // 槌打盾兵：衝擊相剋；劍：切割被剋
    expect(matchup(e, { cat: 'phys', attrs: ['blunt'] })).toEqual({ w: 1, r: 0 });
    expect(matchup(e, { cat: 'phys', attrs: ['cut'] })).toEqual({ w: 0, r: 1 });
    expect(matchup(e, { cat: 'spec', attrs: ['fire', 'blunt'] })).toEqual({ w: 1, r: 0 });
  });
  it('比例減傷：相剋時傷害上升、被剋時護甲上升；特殊攻擊看特殊防禦', () => {
    const { e } = duel('cleric', 'shieldbearer', 0);
    const F = DAMAGE_FORMULA;
    // 盾兵舉盾：物理護甲 4＋4＝8
    expect(typedDamage(10, e, { cat: 'phys', attrs: [] }, { w: 0, r: 0 })).toBe(Math.round((10 * F.k) / (F.k + 8)));
    expect(typedDamage(10, e, { cat: 'phys', attrs: ['blunt'] }, { w: 1, r: 0 })).toBe(Math.round((10 * F.weakDamage * F.k) / (F.k + 8)));
    expect(typedDamage(10, e, { cat: 'phys', attrs: ['cut'] }, { w: 0, r: 1 })).toBe(Math.round((10 * F.k) / (F.k + 8 * F.resistArmor)));
    // 盾只加物理：特殊防禦是基本值
    expect(defenseOf(e, 'phys')).toBe(e.def.defense + e.def.shield!.defense);
    expect(defenseOf(e, 'spec')).toBe(e.def.defense);
  });
  it('舊模式不受影響（範圍傷害照舊扣護甲）', () => {
    const w = new World({ seed: 1, map: MAP, spawns: [{ defId: 'warrior', pos: { x: 5, y: 6 } }, { defId: 'shieldbearer', def: enemyDef('shieldbearer', 1), pos: { x: 8, y: 6 } }] });
    const [h, e] = w.units;
    expect(mitigate(w, h, e, 20, undefined, 'melee')).toBe(applyArmor(20, e.armor));
  });
  it('盾兵：帶衝擊的工具比拿劍硬砍快得多', () => {
    let cut = 0;
    let blunt = 0;
    for (const seed of [1, 2, 3, 4]) {
      cut += duel('warrior', 'shieldbearer', 20, seed).e.maxHp - duel('warrior', 'shieldbearer', 20, seed).e.hp;
      blunt += duel('cleric', 'shieldbearer', 20, seed).e.maxHp - duel('cleric', 'shieldbearer', 20, seed).e.hp;
    }
    expect(blunt).toBeGreaterThan(cut * 2);
  });
  it('戰士的盾擊（衝擊）打盾兵也有效', () => {
    const w = new World({
      seed: 3,
      map: MAP,
      spawns: [
        { defId: 'warrior', def: { ...HEROES.warrior, skills: deliberateSkillsOf('warrior') }, pos: { x: 5, y: 6 } },
        { defId: 'shieldbearer', def: enemyDef('shieldbearer', 1), pos: { x: 6.2, y: 6 }, squad: 's' },
      ],
      config: DELIB,
    });
    const [h, e] = w.units;
    expect(attackInfo(h, 'shieldBash', 'melee').attrs).toContain('blunt');
    expect(matchup(e, attackInfo(h, 'shieldBash', 'melee')).w).toBe(1);
  });
});

describe('牧師的聖鎚', () => {
  it('命中會打斷目標的準備動作（Alan 2026-10-21）', () => {
    let interrupted = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = new World({
        seed,
        map: MAP,
        spawns: [
          { defId: 'cleric', def: { ...HEROES.cleric, skills: [] }, pos: { x: 5, y: 6 } },
          { defId: 'axeman', def: enemyDef('axeman', 1), pos: { x: 6.2, y: 6 }, squad: 's' },
        ],
        config: DELIB,
      });
      const [h, e] = w.units;
      e.alerted = true;
      for (let t = 0; t < 30 / DT; t++) {
        if (t % 10 === 0) w.enqueue({ type: 'attack', unitIds: [h.id], targetId: e.id });
        for (const ev of w.step()) if (ev.type === 'interrupt' && ev.targetId === e.id) interrupted++;
      }
    }
    expect(interrupted).toBeGreaterThan(0);
  });
});

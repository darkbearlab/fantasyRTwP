/** 隨從（Alan 2026-10-23）：號召戰旗叫兵、跟著主人、自己打、不擋自己人、不算英雄、不補血、跨戰鬥延續 */
import { describe, expect, it } from 'vitest';
import { battleOutcomeFromWorld, createBattleFromRun, deliberateLevelId } from '../src/run/battle';
import { useOnMap } from '../src/run/consumables';
import { applyBattleResult } from '../src/run/progression';
import { createRun } from '../src/run/runState';
import type { RunState } from '../src/run/runState';
import { BAG } from '../src/sim/data/consumables';
import { FOLLOWER_RULES, FOLLOWERS, RALLY_POOL } from '../src/sim/data/followers';
import { DT } from '../src/sim/constants';
import { dist } from '../src/sim/math';
import type { World } from '../src/sim/world';
import { separateUnits } from '../src/sim/nav/avoidance';

const step = (w: World, sec: number) => {
  for (let t = 0; t < sec / DT; t++) w.step();
};

function battleRun(r: RunState): World {
  r.phase = { kind: 'battle', nodeId: r.map.layers[0][0], encounterId: deliberateLevelId('battle'), fromEvent: false };
  r.currentNodeId = r.map.layers[0][0];
  const w = createBattleFromRun(r);
  // 小衝突的援軍不要來打擾
  (w as unknown as { skirmish: unknown }).skirmish = null;
  return w;
}

const clearEnemies = (w: World) => {
  for (const u of w.units) if (u.team === 'enemy') {
    u.hp = 0;
    u.dead = true;
  }
};

describe('號召戰旗', () => {
  it('開局包包有一面（測試用）；戰鬥中用：叫 4 名兵跟著目標英雄', () => {
    expect(BAG.start).toContain('rallyBanner');
    const r = createRun(3, { style: 'deliberate' });
    const w = battleRun(r);
    const h = w.heroes()[0];
    w.enqueue({ type: 'useConsumable', itemId: 'rallyBanner', targetId: h.id });
    step(w, 0.1);
    const fs = w.units.filter((u) => u.follower);
    expect(fs.length).toBe(4);
    for (const f of fs) {
      expect(f.masterId).toBe(h.id);
      expect(RALLY_POOL).toContain(f.def.id);
      expect(f.team).toBe('hero');
      expect(f.isHero).toBe(false);
    }
    expect(w.bag).not.toContain('rallyBanner');
    // 隨從不算英雄
    expect(w.heroes().every((u) => !u.follower)).toBe(true);
  });

  it('路線圖上用：英雄身上多 4 名滿血的隨從', () => {
    let r = createRun(3, { style: 'deliberate' });
    r = useOnMap(r, 'rallyBanner', 0);
    const fs = r.party[0]!.followers!;
    expect(fs.length).toBe(4);
    for (const f of fs) expect(f.hp).toBe(FOLLOWERS[f.kind].maxHp);
  });
});

describe('隨從的行為', () => {
  it('跟著主人走：主人走遠，隨從跟上（在牽繩內）', () => {
    let r = createRun(3, { style: 'deliberate' });
    r = useOnMap(r, 'rallyBanner', 0);
    const w = battleRun(r);
    clearEnemies(w);
    const h = w.heroes()[0];
    const fs = w.units.filter((u) => u.follower);
    expect(fs.length).toBe(4);
    const dest = { x: h.pos.x + 8, y: h.pos.y };
    w.enqueue({ type: 'move', unitIds: [h.id], point: dest });
    step(w, 12);
    for (const f of fs) expect(dist(f.pos, h.pos)).toBeLessThan(FOLLOWER_RULES.leash);
  });

  it('自己打主人附近的敵人', () => {
    let r = createRun(3, { style: 'deliberate' });
    r = useOnMap(r, 'rallyBanner', 0);
    const w = battleRun(r);
    const h = w.heroes()[0];
    // 把一名敵人放到主人旁邊
    const e = w.units.find((u) => u.team === 'enemy' && !u.dead)!;
    e.pos = { x: h.pos.x + 2, y: h.pos.y };
    e.alerted = true;
    // 前期敵人生命很低（級距），英雄一下就打倒：給牠耐打一點，才看得到隨從出手
    e.hp = 500;
    step(w, 3);
    const fs = w.units.filter((u) => u.follower && !u.dead);
    expect(fs.some((f) => f.order?.type === 'attack' || f.action)).toBe(true);
  });

  it('不擋自己人：和英雄重疊時不互相推開；和敵人照樣推開', () => {
    let r = createRun(3, { style: 'deliberate' });
    r = useOnMap(r, 'rallyBanner', 0);
    const w = battleRun(r);
    const h = w.heroes()[0];
    const f = w.units.find((u) => u.follower)!;
    const e = w.units.find((u) => u.team === 'enemy')!;
    f.pos = { ...h.pos };
    const before = { ...h.pos };
    separateUnits([h, f], (u) => w.navFor(u));
    expect(h.pos).toEqual(before);
    e.pos = { x: f.pos.x + 0.1, y: f.pos.y };
    separateUnits([f, e], (u) => w.navFor(u));
    expect(dist(f.pos, e.pos)).toBeGreaterThan(0.1);
  });

  it('不算英雄：英雄全倒就輸（隨從還活著也一樣）；不吃全隊回血', () => {
    let r = createRun(3, { style: 'deliberate' });
    r = useOnMap(r, 'rallyBanner', 0);
    const w = battleRun(r);
    const fs = w.units.filter((u) => u.follower);
    for (const f of fs) f.hp = 1;
    w.bag = ['elixir'];
    w.enqueue({ type: 'useConsumable', itemId: 'elixir' });
    step(w, 0.1);
    for (const f of fs) expect(f.hp).toBe(1);
    for (const h of w.heroes()) {
      h.hp = 0;
      h.dead = true;
    }
    step(w, 0.1);
    expect(w.result).toBe('enemy');
  });
});

describe('跨戰鬥', () => {
  it('戰後只留下活著的隨從，生命照戰後的樣子（不補血）；下一場跟著出場', () => {
    let r = createRun(3, { style: 'deliberate' });
    r = useOnMap(r, 'rallyBanner', 0);
    const w = battleRun(r);
    const fs = w.units.filter((u) => u.follower);
    fs[0].hp = 0;
    fs[0].dead = true;
    fs[1].hp = 3;
    w.result = 'hero';
    const r2 = applyBattleResult(r, battleOutcomeFromWorld(w));
    const left = r2.party[0]!.followers!;
    expect(left.length).toBe(3);
    expect(left.some((f) => f.hp === 3)).toBe(true);
    // 下一場：3 名跟著主人出場，生命延續
    const w2 = battleRun(r2);
    const fs2 = w2.units.filter((u) => u.follower);
    expect(fs2.length).toBe(3);
    expect(fs2.some((f) => f.hp === 3)).toBe(true);
    const master = w2.getUnit(fs2[0].masterId)!;
    expect(master.heroSlot).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { dist } from '../src/sim/math';
import { MAPS } from '../src/sim/data/maps';
import { ZOC_CONTACT_SLACK, zoneDistance } from '../src/sim/zoc';
import { HOLD, makeWorld, run } from './helpers';

/** E＝蠻兵（產生控制區、AI 不動），X＝遊俠（緊貼著 E） */
function pinSetup(config = {}) {
  const w = makeWorld(
    [
      { defId: 'ranger', pos: { x: 6.2, y: 6 } },
      { defId: 'brute', pos: { x: 5, y: 6 } },
      { defId: 'warrior', pos: { x: 5, y: 3 } },
    ],
    config,
  );
  const [x, e, war] = w.units;
  return { w, x, e, war, zone: zoneDistance(e, x, w.config) };
}

describe('控制區 pin 模式（SPEC §7.1）', () => {
  it('被牽制的單位無法遠離，並顯示「被牽制」', () => {
    const { w, x, e, zone } = pinSetup();
    w.enqueue({ type: 'move', unitIds: [x.id], point: { x: 12, y: 6 } });
    const evs = run(w, 60);
    expect(dist(x.pos, e.pos)).toBeLessThanOrEqual(zone + 1e-6);
    expect(evs.some((ev) => ev.type === 'pinned' && ev.unitId === x.id && ev.byId === e.id)).toBe(true);
  });

  it('被牽制時仍可朝 E 移動', () => {
    const { w, x, e } = pinSetup();
    const d0 = dist(x.pos, e.pos);
    w.enqueue({ type: 'move', unitIds: [x.id], point: { x: 4, y: 6 } });
    run(w, 5);
    expect(dist(x.pos, e.pos)).toBeLessThan(d0);
  });

  it('E 正在與他人近戰時，控制區失效，可以離開', () => {
    const { w, x, e, war, zone } = pinSetup();
    w.enqueue({ type: 'attack', unitIds: [war.id], targetId: e.id });
    run(w, 40); // 戰士走過去開始近戰
    w.enqueue({ type: 'move', unitIds: [x.id], point: { x: 12, y: 6 } });
    run(w, 60);
    expect(dist(x.pos, e.pos)).toBeGreaterThan(zone + 1);
  });

  it('關閉「近戰進行中」例外時，即使 E 正在近戰也無法離開', () => {
    const { w, x, e, war, zone } = pinSetup({ zocEngagedException: false });
    w.enqueue({ type: 'attack', unitIds: [war.id], targetId: e.id });
    run(w, 40);
    w.enqueue({ type: 'move', unitIds: [x.id], point: { x: 12, y: 6 } });
    run(w, 60);
    expect(dist(x.pos, e.pos)).toBeLessThanOrEqual(zone + 1e-6);
  });

  it('ignoresZoc 技能（翻滾）可以離開控制區', () => {
    const { w, x, e, zone } = pinSetup();
    w.enqueue({ type: 'skill', unitId: x.id, skillId: 'tumble', point: { x: 11, y: 6 } });
    run(w, 40);
    expect(dist(x.pos, e.pos)).toBeGreaterThan(zone + 2);
  });

  it('off 模式下可以自由離開', () => {
    const { w, x, e, zone } = pinSetup({ zocMode: 'off' });
    w.enqueue({ type: 'move', unitIds: [x.id], point: { x: 12, y: 6 } });
    run(w, 60);
    expect(dist(x.pos, e.pos)).toBeGreaterThan(zone + 2);
  });

  it('執行中可用 setConfig 指令切換 ZOC 模式', () => {
    const { w, x, e, zone } = pinSetup();
    w.enqueue({ type: 'setConfig', patch: { zocMode: 'off' } });
    w.enqueue({ type: 'move', unitIds: [x.id], point: { x: 12, y: 6 } });
    run(w, 60);
    expect(w.config.zocMode).toBe('off');
    expect(dist(x.pos, e.pos)).toBeGreaterThan(zone + 2);
  });
});

describe('控制區 disengage 模式（SPEC §7.2）', () => {
  it('離開控制區的那一刻被免費攻擊一次', () => {
    const { w, x, e, zone } = pinSetup({ zocMode: 'disengage' });
    w.enqueue({ type: 'move', unitIds: [x.id], point: { x: 12, y: 6 } });
    const evs = run(w, 60);
    expect(dist(x.pos, e.pos)).toBeGreaterThan(zone);
    const free = evs.filter((ev) => (ev.type === 'hit' || ev.type === 'miss') && ev.sourceId === e.id && ev.freeAttack);
    expect(free.length).toBe(1);
  });
});

describe('arena01 隘口（SPEC §16）', () => {
  const map = MAPS.arena01;
  const choke = map.landmarks!.choke;

  it('戰士卡在隘口時，蠻兵被牽制無法繞過', () => {
    const w = makeWorld(
      [
        { defId: 'warrior', pos: { x: choke.x + 0.6, y: choke.y } },
        { defId: 'mage', pos: { x: 6, y: 12 } },
        { defId: 'brute', pos: { x: 26, y: 11 } },
      ],
      {},
      map,
      1,
      HOLD,
    );
    const [war, mage, brute] = w.units;
    w.enqueue({ type: 'attack', unitIds: [brute.id], targetId: mage.id });
    let minX = Infinity;
    let pinned = false;
    for (let i = 0; i < 30 * 15; i++) {
      for (const ev of w.step()) if (ev.type === 'pinned' && ev.unitId === brute.id) pinned = true;
      if (brute.order?.type !== 'attack') w.enqueue({ type: 'attack', unitIds: [brute.id], targetId: mage.id });
      minX = Math.min(minX, brute.pos.x);
    }
    expect(pinned).toBe(true);
    // 最多只能貼到戰士身側，無法越過
    expect(minX).toBeGreaterThan(war.pos.x - (war.radius + brute.radius + ZOC_CONTACT_SLACK));
    expect(mage.hp).toBe(mage.maxHp);
  });

  it('刺客會繞開英雄控制區，走側翼通道', () => {
    const w = makeWorld(
      [
        { defId: 'warrior', pos: { x: choke.x + 0.6, y: choke.y } },
        { defId: 'mage', pos: { x: 5, y: 12 } },
        { defId: 'skirmisher', pos: { x: 32, y: 12 } },
      ],
      {},
      map,
      1,
      HOLD,
    );
    const [, mage, sk] = w.units;
    w.enqueue({ type: 'attack', unitIds: [sk.id], targetId: mage.id });
    let maxY = 0;
    for (let i = 0; i < 30 * 20 && !mage.dead; i++) {
      w.step();
      maxY = Math.max(maxY, sk.pos.y);
      if (dist(sk.pos, mage.pos) < 1.5) break;
    }
    expect(maxY).toBeGreaterThan(18.5); // 走了下方的側翼通道
    expect(dist(sk.pos, mage.pos)).toBeLessThan(1.5);
  });
});

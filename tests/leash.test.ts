import { describe, expect, it } from 'vitest';
import { dist } from '../src/sim/math';
import { makeWorld, run } from './helpers';

/** 戰士在 (5,6)；蠻兵在 3 m 外，AI 不主動（PASSIVE） */
function setup(config = {}) {
  const w = makeWorld(
    [
      { defId: 'warrior', pos: { x: 3, y: 6 } },
      { defId: 'brute', pos: { x: 9, y: 6 } },
    ],
    config,
  );
  const [war, brute] = w.units;
  return { w, war, brute };
}

describe('駐守點（SPEC §10.4）', () => {
  it('完成玩家移動指令後記錄駐守點', () => {
    const { w, war } = setup();
    w.enqueue({ type: 'move', unitIds: [war.id], point: { x: 5, y: 6 } });
    run(w, 30);
    expect(war.guardPoint).not.toBeNull();
    expect(dist(war.guardPoint!, { x: 5, y: 6 })).toBeLessThan(0.15);
  });

  it('駐守中的近戰英雄不會追擊離開範圍的敵人', () => {
    const { w, war, brute } = setup();
    w.enqueue({ type: 'move', unitIds: [war.id], point: { x: 5, y: 6 } });
    run(w, 30);
    const guard = { ...war.guardPoint! };
    // 敵人在 6 m 閒置追擊距離內，但不離開駐守範圍就打不到
    expect(dist(war.pos, brute.pos) - war.radius - brute.radius).toBeLessThan(w.config.heroIdleAggroRange);
    run(w, 30 * 5);
    expect(dist(war.pos, guard)).toBeLessThanOrEqual(w.config.heroLeashRange + 0.05);
    expect(war.order?.type === 'attack').toBe(false);
  });

  it('敵人走進駐守範圍內就自動普攻；敵人退出範圍後放棄並走回駐守點', () => {
    const { w, war, brute } = setup();
    w.enqueue({ type: 'move', unitIds: [war.id], point: { x: 5, y: 6 } });
    run(w, 30);
    const guard = { ...war.guardPoint! };
    w.enqueue({ type: 'move', unitIds: [brute.id], point: { x: 6.6, y: 6 } });
    let attacked = false;
    for (let i = 0; i < 90; i++) for (const e of w.step()) if ((e.type === 'hit' || e.type === 'miss') && e.sourceId === war.id) attacked = true;
    expect(attacked).toBe(true);
    // 蠻兵撤退到很遠
    w.enqueue({ type: 'setConfig', patch: { zocMode: 'off' } });
    w.enqueue({ type: 'move', unitIds: [brute.id], point: { x: 16, y: 6 } });
    let maxD = 0;
    for (let i = 0; i < 30 * 8; i++) {
      // 被打後敵人 AI 會甦醒，持續命令它撤退
      if (brute.order?.type !== 'move') w.enqueue({ type: 'move', unitIds: [brute.id], point: { x: 16, y: 6 } });
      w.step();
      maxD = Math.max(maxD, dist(war.pos, guard));
    }
    expect(maxD).toBeLessThanOrEqual(w.config.heroLeashRange + 0.3);
    expect(dist(war.pos, guard)).toBeLessThan(0.4);
  });

  it('攻擊指令會清除駐守點，之後可以自由追擊', () => {
    const { w, war, brute } = setup();
    w.enqueue({ type: 'move', unitIds: [war.id], point: { x: 5, y: 6 } });
    run(w, 30);
    w.enqueue({ type: 'attack', unitIds: [war.id], targetId: brute.id });
    run(w, 60);
    expect(war.guardPoint).toBeNull();
    expect(dist(war.pos, brute.pos)).toBeLessThan(1.3);
  });

  it('沒有駐守點時維持原本的 6 m 自動追擊', () => {
    const { w, war, brute } = setup();
    run(w, 30 * 3);
    expect(war.guardPoint).toBeNull();
    expect(dist(war.pos, brute.pos)).toBeLessThan(1.3);
  });

  it('遠程駐守時不會為了射程或視線離開駐守點', () => {
    const w = makeWorld([
      { defId: 'ranger', pos: { x: 1, y: 6 } },
      { defId: 'brute', pos: { x: 16, y: 6 } },
    ]);
    const [r] = w.units;
    w.enqueue({ type: 'move', unitIds: [r.id], point: { x: 2, y: 6 } });
    run(w, 30 * 4);
    expect(dist(r.pos, r.guardPoint!)).toBeLessThan(0.2);
  });
});

describe('傷害類型與範圍結算（SPEC §19.6）', () => {
  it('每筆傷害都帶 damageType；範圍效果對每個受體各自結算', () => {
    const w = makeWorld([
      { defId: 'mage', pos: { x: 2, y: 6 } },
      { defId: 'brute', pos: { x: 10, y: 5.2 } },
      { defId: 'brute', pos: { x: 10, y: 6.8 } },
      { defId: 'warrior', pos: { x: 11, y: 6 } },
    ]);
    const [m] = w.units;
    w.enqueue({ type: 'skill', unitId: m.id, skillId: 'fireball', point: { x: 10, y: 6 } });
    const evs = run(w, 30 * 3).filter((e) => e.type === 'hit' && e.skillId === 'fireball');
    const targets = new Set(evs.map((e) => e.type === 'hit' && e.targetId));
    expect(targets.size).toBe(3);
    for (const e of evs) expect(e.type === 'hit' && e.damageType).toBe('area');
  });

  it('普攻的傷害類型：近戰 melee、弓箭 projectile、法師 spell', () => {
    const w = makeWorld([
      { defId: 'warrior', pos: { x: 5, y: 3 } },
      { defId: 'ranger', pos: { x: 2, y: 6 } },
      { defId: 'mage', pos: { x: 2, y: 9 } },
      { defId: 'brute', pos: { x: 5.95, y: 3 } },
      { defId: 'brute', pos: { x: 8, y: 6 } },
      { defId: 'brute', pos: { x: 8, y: 9 } },
    ]);
    const [war, r, m, b1, b2, b3] = w.units;
    w.enqueue({ type: 'attack', unitIds: [war.id], targetId: b1.id });
    w.enqueue({ type: 'attack', unitIds: [r.id], targetId: b2.id });
    w.enqueue({ type: 'attack', unitIds: [m.id], targetId: b3.id });
    const hits = run(w, 30 * 8).filter((e) => e.type === 'hit');
    const typeOf = (id: number) => hits.find((e) => e.type === 'hit' && e.sourceId === id && !e.skillId);
    expect(typeOf(war.id)).toMatchObject({ damageType: 'melee' });
    expect(typeOf(r.id)).toMatchObject({ damageType: 'projectile' });
    expect(typeOf(m.id)).toMatchObject({ damageType: 'spell' });
  });
});

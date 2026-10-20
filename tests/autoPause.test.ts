import { describe, expect, it } from 'vitest';
import { enemyDef } from '../src/run/battle';
import { ENEMIES, enemyRank } from '../src/sim/data/enemies';
import { HEROES } from '../src/sim/data/heroes';
import type { MapDef } from '../src/sim/data/types';
import { World } from '../src/sim/world';
import { BattleSession } from '../src/game/session';
import { installAutoPause } from '../src/game/autoPause';
import { beginSkill } from '../src/game/input/targeting';
import { HOLD, OPEN_MAP, PASSIVE, makeWorld, run } from './helpers';

const WIDE: MapDef = { ...OPEN_MAP, id: 'wide', width: 60, height: 12 };

describe('鉤子：敵方小隊第一次出現在視野內（squadSighted）', () => {
  it('沒有迷霧：開場每一隊各發一次，之後不再發', () => {
    const w = makeWorld(
      [
        { defId: 'warrior', pos: { x: 2, y: 6 } },
        { defId: 'brute', pos: { x: 10, y: 4 }, squad: 'a' },
        { defId: 'brute', pos: { x: 10, y: 8 }, squad: 'a' },
        { defId: 'archer', pos: { x: 14, y: 6 }, squad: 'b' },
      ],
      PASSIVE,
      undefined,
      1,
      HOLD,
    );
    const first = run(w, 1).filter((e) => e.type === 'squadSighted');
    expect(first.map((e) => (e.type === 'squadSighted' ? e.squad : '')).sort()).toEqual(['a', 'b']);
    const a = first.find((e) => e.type === 'squadSighted' && e.squad === 'a');
    expect(a && a.type === 'squadSighted' && a.unitIds.length).toBe(2);
    expect(run(w, 60).some((e) => e.type === 'squadSighted')).toBe(false);
  });

  it('有迷霧：走進視野時才發', () => {
    const w = new World({
      seed: 1,
      map: WIDE,
      fog: true,
      config: PASSIVE,
      spawns: [
        { defId: 'warrior', pos: { x: 2, y: 6 } },
        { defId: 'brute', pos: { x: 50, y: 6 }, squad: 'far' },
      ],
    });
    expect(run(w, 30).some((e) => e.type === 'squadSighted')).toBe(false);
    w.getUnit(1)!.pos = { x: 44, y: 6 };
    const evs = run(w, 30).filter((e) => e.type === 'squadSighted');
    expect(evs.length).toBe(1);
  });
});

describe('敵人階級', () => {
  it('精英隊長＝elite、戰爭領主＝boss、一般敵人＝normal', () => {
    expect(enemyRank(enemyDef('shieldbearer', 1, true))).toBe('elite');
    expect(enemyRank(enemyDef('shieldbearer', 1))).toBe('normal');
    expect(enemyRank(ENEMIES.warlord)).toBe('boss');
  });
});

describe('自動暫停（設定選單的選項）', () => {
  const setup = () => {
    const w = makeWorld([{ defId: 'mage', def: { ...HEROES.mage, skills: ['flashFireball'] }, pos: { x: 2, y: 6 } }, { defId: 'brute', pos: { x: 10, y: 6 } }], PASSIVE, undefined, 1, HOLD);
    const s = new BattleSession(1, { world: w });
    installAutoPause(s);
    const saved = { ...s.autoPause };
    return { w, s, restore: () => s.setAutoPause(saved) };
  };

  it('發現新的一隊敵人：開啟時暫停，關閉時不暫停；開場 0.5 秒內不算', () => {
    const { w, s, restore } = setup();
    s.setAutoPause({ squadSighted: true });
    s.hooks.emit('simEvent', { type: 'squadSighted', squad: 'a', unitIds: [2] });
    expect(s.paused).toBe(false);
    run(w, 30);
    s.hooks.emit('simEvent', { type: 'squadSighted', squad: 'a', unitIds: [2] });
    expect(s.paused).toBe(true);
    expect(s.pauseReason).toBe('發現敵人');
    s.setPaused(false);
    s.setAutoPause({ squadSighted: false });
    s.hooks.emit('simEvent', { type: 'squadSighted', squad: 'b', unitIds: [2] });
    expect(s.paused).toBe(false);
    restore();
  });

  it('精英、頭目準備技能：只有精英／頭目會觸發', () => {
    const w = makeWorld(
      [
        { defId: 'warrior', pos: { x: 2, y: 6 } },
        { defId: 'shieldbearer', def: enemyDef('shieldbearer', 1, true), pos: { x: 10, y: 6 } },
        { defId: 'archer', pos: { x: 12, y: 6 } },
      ],
      PASSIVE,
      undefined,
      1,
      HOLD,
    );
    const s = new BattleSession(1, { world: w });
    installAutoPause(s);
    const saved = { ...s.autoPause };
    s.setAutoPause({ eliteSkill: true, enemyAoeWindup: false });
    s.hooks.emit('simEvent', { type: 'actionStart', unitId: 3, skillId: 'aimedShot' });
    expect(s.paused).toBe(false);
    s.hooks.emit('simEvent', { type: 'actionStart', unitId: 2, skillId: 'sweep' });
    expect(s.paused).toBe(true);
    // 普攻（沒有 skillId）不算
    s.setPaused(false);
    s.hooks.emit('simEvent', { type: 'actionStart', unitId: 2 });
    expect(s.paused).toBe(false);
    s.setAutoPause(saved);
  });

  it('按下技能準備瞄準時：開啟時進入瞄準就暫停', () => {
    const { s, restore } = setup();
    s.setAutoPause({ skillAim: true });
    beginSkill(s, 0, 0, 0);
    expect(s.targeting).toEqual({ unitId: 1, skillId: 'flashFireball' });
    expect(s.paused).toBe(true);
    // 關閉時不暫停
    s.setPaused(false);
    s.targeting = null;
    s.setAutoPause({ skillAim: false });
    beginSkill(s, 0, 0, 0);
    expect(s.paused).toBe(false);
    restore();
  });

  it('鉤子：玩家下達技能指令時發 skillCommand', () => {
    const { s } = setup();
    const got: string[] = [];
    s.hooks.on('skillCommand', (p) => got.push(p.skillId));
    s.enqueue({ type: 'skill', unitId: 1, skillId: 'flashFireball', point: { x: 9, y: 6 } });
    expect(got).toEqual(['flashFireball']);
  });
});

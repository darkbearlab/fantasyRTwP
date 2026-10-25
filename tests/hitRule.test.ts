/** 基礎命中 95%、英雄的盾（Alan 2026-10-25） */
import { describe, expect, it } from 'vitest';
import { hitFromRoll } from '../src/sim/combat';
import { DELIBERATE_PACE, deliberateConfig } from '../src/sim/data/deliberate';
import { LEGACY_HIT_RULE, hitBaseRule } from '../src/sim/data/hit';
import { HEROES } from '../src/sim/data/heroes';
import { HERO_SHIELD } from '../src/sim/data/passives';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { HOLD, PASSIVE, makeWorld } from './helpers';

/** 命中與防禦相差 x 時，命中率、爆擊率（擲 1～100 全部算一次） */
function rates(rule: { missBelow: number; critAt: number }, x: number) {
  let hit = 0;
  let crit = 0;
  for (let d = 1; d <= 100; d++) {
    const r = hitFromRoll(d + x, rule);
    if (r !== 'miss') hit++;
    if (r === 'crit') crit++;
  }
  return { hit, crit };
}

describe('命中公式', () => {
  it('基礎 95%：命中和防禦相等時 95% 命中；多出來超過 100% 的部分變成爆擊', () => {
    const R = hitBaseRule(95);
    expect(rates(R, 0)).toEqual({ hit: 95, crit: 0 });
    expect(rates(R, 15)).toEqual({ hit: 100, crit: 10 });
    expect(rates(R, -25)).toEqual({ hit: 70, crit: 0 });
  });

  it('沉穩節奏用基礎 95%；舊模式照舊（51% ＋ 命中 − 防禦，另外 1% ＋ 命中 − 防禦 爆擊）', () => {
    expect(deliberateConfig(DEFAULT_SIM_CONFIG).hitRule).toEqual(hitBaseRule(DELIBERATE_PACE.hitBase));
    expect(DEFAULT_SIM_CONFIG.hitRule).toEqual(LEGACY_HIT_RULE);
    expect(rates(LEGACY_HIT_RULE, 0)).toEqual({ hit: 51, crit: 1 });
  });
});

describe('英雄的盾', () => {
  it('戰士拿著盾：防禦 +25；再裝盾牌道具也不疊加', () => {
    const w = makeWorld([{ defId: 'warrior', def: HEROES.warrior, pos: { x: 5, y: 6 }, items: ['ironShield', 'towerShield'] }], { ...PASSIVE, battleStyle: 'deliberate' }, undefined, 1, HOLD);
    const u = w.heroes()[0];
    // 嘲諷光環 +10、盾 +25（三面盾只算一次）
    expect(u.defense).toBe(HEROES.warrior.defense + 10 + HERO_SHIELD.defense);
  });

  it('沒有盾的職業裝上盾牌道具：防禦 +25', () => {
    const w = makeWorld([{ defId: 'mage', def: HEROES.mage, pos: { x: 5, y: 6 }, items: ['ironShield'] }], { ...PASSIVE, battleStyle: 'deliberate' }, undefined, 1, HOLD);
    const u = w.heroes()[0];
    const bare = makeWorld([{ defId: 'mage', def: HEROES.mage, pos: { x: 5, y: 6 } }], { ...PASSIVE, battleStyle: 'deliberate' }, undefined, 1, HOLD).heroes()[0];
    expect(u.defense - bare.defense).toBe(HERO_SHIELD.defense);
  });
});

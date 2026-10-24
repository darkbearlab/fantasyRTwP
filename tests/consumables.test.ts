import { describe, expect, it } from 'vitest';
import { applyBattleResult } from '../src/run/progression';
import { buyConsumable, canUseOnMap, useOnMap } from '../src/run/consumables';
import { createBattleFromRun, battleOutcomeFromWorld, deliberateLevelId } from '../src/run/battle';
import { createRun } from '../src/run/runState';
import type { RunState } from '../src/run/runState';
import { maxHpOf } from '../src/run/upgrades';
import { BAG } from '../src/sim/data/consumables';
import { DT } from '../src/sim/constants';
import type { World } from '../src/sim/world';

function battle(r: RunState): World {
  const node = r.map.nodes.find((n) => n.layer === 3)!;
  r.currentNodeId = node.id;
  r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
  return createBattleFromRun(r);
}
const step = (w: World, sec: number) => {
  for (let t = 0; t < sec / DT; t++) w.step();
};

describe('消耗品（Alan 2026-10-21）', () => {
  it('遠征開始時包包有兩瓶治療藥水；戰鬥中用掉會從包包拿掉，戰後寫回遠征', () => {
    const r = createRun(3, { style: 'deliberate' });
    expect(r.bag).toEqual(BAG.start);
    // 開局包包現在多一面號召戰旗（測試用，Alan 2026-10-23）：這裡只測藥水
    r.bag = ['potion', 'potion'];
    const w = battle(r);
    const h = w.units.find((u) => u.team === 'hero')!;
    h.hp = 20;
    w.enqueue({ type: 'useConsumable', itemId: 'potion', targetId: h.id });
    step(w, 0.1);
    expect(h.hp).toBe(20 + Math.round(h.maxHp * 0.4));
    expect(w.bag).toEqual(['potion']);
    // 共用冷卻：馬上再用一瓶不會生效
    w.enqueue({ type: 'useConsumable', itemId: 'potion', targetId: h.id });
    step(w, 0.1);
    expect(w.bag).toEqual(['potion']);
    step(w, BAG.cooldown);
    w.enqueue({ type: 'useConsumable', itemId: 'potion', targetId: h.id });
    step(w, 0.1);
    expect(w.bag).toEqual([]);
    const out = battleOutcomeFromWorld(w);
    expect(out.bag).toEqual([]);
  });
  it('鳳凰羽毛：戰鬥中讓陣亡的英雄復活；煙霧彈：全隊隱身', () => {
    const r = createRun(3, { style: 'deliberate' });
    r.bag = ['phoenix', 'smoke'];
    const w = battle(r);
    const [a, b] = w.units.filter((u) => u.team === 'hero');
    a.hp = 0;
    a.dead = true;
    w.enqueue({ type: 'useConsumable', itemId: 'phoenix', targetId: a.id });
    step(w, 0.1);
    expect(a.dead).toBe(false);
    expect(a.hp).toBe(Math.round(a.maxHp * 0.3));
    step(w, BAG.cooldown);
    w.enqueue({ type: 'useConsumable', itemId: 'smoke' });
    step(w, 0.1);
    expect(b.stealthTime).toBeGreaterThan(2);
  });
  it('路線圖上用藥水、在商人那裡買消耗品', () => {
    let r = createRun(3, { style: 'deliberate' });
    r.bag = ['potion', 'potion'];
    const h = r.party[0]!;
    h.hp = 10;
    expect(canUseOnMap(r, 'potion', 0)).toBe(true);
    r = useOnMap(r, 'potion', 0);
    expect(r.party[0]!.hp).toBe(10 + Math.round(maxHpOf(h) * 0.4));
    expect(r.bag).toEqual(['potion']);
    expect(canUseOnMap(r, 'smoke')).toBe(false);
    r.phase = { kind: 'shop', nodeId: 0, stock: [], sold: [] };
    const gold = r.gold;
    r = buyConsumable(r, 'elixir');
    expect(r.bag).toContain('elixir');
    expect(r.gold).toBe(gold - 50);
  });
});

describe('牧師的戰地救護', () => {
  const won = (r: RunState, clericDead: boolean) => {
    const w = battle(r);
    for (const u of w.units.filter((x) => x.team === 'hero')) u.hp = Math.round(u.maxHp / 2);
    const cleric = w.units.find((u) => u.def.id === 'cleric')!;
    if (clericDead) {
      cleric.hp = 0;
      cleric.dead = true;
    }
    const out = battleOutcomeFromWorld(w);
    out.won = true;
    return applyBattleResult(r, out);
  };
  it('牧師活著：打贏後回復一部分損失的生命；牧師陣亡：沒有', () => {
    const party = ['warrior', 'ranger', 'mage', 'cleric'];
    const a = won(createRun(3, { style: 'deliberate', party }), false);
    const b = won(createRun(3, { style: 'deliberate', party }), true);
    const hpA = a.party[0]!.hp;
    const hpB = b.party[0]!.hp;
    expect(hpA).toBeGreaterThan(hpB);
  });
});

describe('出口通往哪裡（Alan 2026-10-21）', () => {
  it('每個出口有字母、顏色、方向、節點類型與層數', async () => {
    const { exitInfos } = await import('../src/game/exitInfo');
    const r = createRun(3, { forward: false, style: 'deliberate' });
    const w = battle(r);
    const infos = exitInfos(w, r);
    expect(infos.length).toBe(w.map.exits!.length);
    infos.forEach((info, i) => {
      expect(info.letter).toBe(String.fromCharCode(65 + i));
      expect(info.nodeId).toBeDefined();
      expect(info.title).toMatch(/^[A-Z] [↑↓←→]/);
      expect(info.detail).toMatch(/層/);
    });
    // 沒有遠征資料（快速戰鬥）時也不會壞
    expect(exitInfos(w, null).every((x) => x.detail === '')).toBe(true);
  });
});

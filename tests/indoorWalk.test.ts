/**
 * 實際走一遍室內地圖（Alan 2026-10-22 回報：第 3 章尋路死掉、隊伍開不進房間）：
 * 清掉敵人，下令全隊走到每個房間的中間，模擬時間，全隊都要走進房間。
 * 抓過的問題：房間擺設擋路、出生點貼牆動不了、繞路時直線距離變長被當成卡住而放棄移動。
 */
import { describe, expect, it } from 'vitest';
import { createBattleFromRun, deliberateLevelId } from '../src/run/battle';
import { gridToWorld } from '../src/run/fbbLevel';
import type { IndoorLevel } from '../src/run/indoorGen';
import { createRun } from '../src/run/runState';
import { DT } from '../src/sim/constants';

describe('室內地圖：全隊走得進每個房間', () => {
  for (const [chapter, seed] of [
    [2, 2],
    [3, 8],
    [4, 5],
  ] as const)
    it(`第 ${chapter + 1} 章 種子 ${seed}`, () => {
      const r = createRun(seed, { style: 'deliberate' });
      r.chapter = chapter;
      const node = r.map.nodes.find((n) => n.layer === 2)!;
      r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
      const lv = (createBattleFromRun(r).map.art as unknown as { level: IndoorLevel }).level;
      for (const room of lv.rooms) {
        const w = createBattleFromRun(r);
        for (const u of w.units) if (u.team === 'enemy') {
          u.hp = 0;
          u.dead = true;
        }
        // 小衝突的援軍會打斷移動：這裡只測走路
        (w as unknown as { skirmish: unknown }).skirmish = null;
        const heroes = w.units.filter((u) => u.team === 'hero');
        const nav = w.navFor(heroes[0]);
        let target: { x: number; y: number } | null = null;
        for (let rad = 0; rad < 4 && !target; rad++)
          for (let dy = -rad; dy <= rad && !target; dy++)
            for (let dx = -rad; dx <= rad && !target; dx++) {
              const c = gridToWorld(room.x + Math.floor(room.w / 2) + dx, room.y + Math.floor(room.h / 2) + dy, lv.h);
              const p = { x: c.x + 0.5, y: c.y + 0.5 };
              if (nav.isWalkable(p)) target = p;
            }
        expect(target, room.role).not.toBeNull();
        w.enqueue({ type: 'move', unitIds: heroes.map((h) => h.id), point: target! });
        for (let i = 0; i < 120 / DT && !w.result; i++) w.step();
        const inRoom = (p: { x: number; y: number }) => {
          const gx = Math.floor(p.y);
          const gy = lv.h - 1 - Math.floor(p.x);
          return gx >= room.x - 1 && gx <= room.x + room.w && gy >= room.y - 1 && gy <= room.y + room.h;
        };
        expect(heroes.filter((h) => inRoom(h.pos)).length, `${room.role} (${room.x},${room.y})`).toBe(heroes.length);
      }
    }, 60000);

  // Alan 2026-10-22 回報：地洞的出口全隊擠過去了還是離不開（出口區只有 2 格深，四個人塞不進去）
  for (const [chapter, seed] of [
    [2, 1],
    [3, 4],
    [4, 5],
  ] as const)
    it(`第 ${chapter + 1} 章 種子 ${seed}：全隊走得出每個出口`, () => {
      const r = createRun(seed, { style: 'deliberate' });
      r.chapter = chapter;
      const node = r.map.nodes.find((n) => n.layer === 2)!;
      r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
      const exits = createBattleFromRun(r).map.exits ?? [];
      expect(exits.length).toBeGreaterThan(0);
      for (const e of exits) {
        const w = createBattleFromRun(r);
        for (const u of w.units) if (u.team === 'enemy') {
          u.hp = 0;
          u.dead = true;
        }
        (w as unknown as { skirmish: unknown }).skirmish = null;
        const heroes = w.units.filter((u) => u.team === 'hero');
        w.enqueue({ type: 'move', unitIds: heroes.map((h) => h.id), point: { x: e.x + e.w / 2, y: e.y + e.h / 2 } });
        for (let i = 0; i < 120 / DT && !w.result; i++) w.step();
        expect(w.result, e.id).toBe('hero');
        expect(w.exitId).toBe(e.id);
      }
    }, 60000);
});

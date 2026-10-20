/**
 * 小衝突導演的量測（data/skirmish.ts）：沉穩節奏遠征的城內（第 1 層）與野外（第 4 層）地圖上，
 * 一波從「被看到」到「全滅」要幾秒、三分鐘出了幾波、英雄損血。
 * 自動玩家很笨：每秒叫全隊打最近、看得到的敵人，不卡位、不放技能、不移動——真人玩會更快。
 *
 *   npx tsx tools/skirmishMeasure.ts
 */
import { createRun } from '../src/run/runState';
import { createBattleFromRun, deliberateLevelId } from '../src/run/battle';
import { DT } from '../src/sim/constants';
for (const layerWanted of [1, 4]) {
  for (const seed of [3, 9]) {
    const r = createRun(seed, { style: 'deliberate' });
    const node = r.map.nodes.find((n) => n.layer === layerWanted && n.type === 'battle') ?? r.map.nodes.find((n) => n.layer === layerWanted)!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false } as any;
    const w = createBattleFromRun(r);
    const sighted = new Map<string, number>();
    const done: string[] = [];
    let hpLost = 0;
    for (let t = 0; t < 180 / DT; t++) {
      // 玩家：每秒叫全隊打最近、看得到的敵人；沒有就原地等
      if (t % Math.round(1 / DT) === 0) {
        const heroes = w.units.filter((u) => u.team === 'hero' && !u.dead);
        const seen = w.units.filter((u) => u.team === 'enemy' && !u.dead && u.alerted && (!w.vision || w.vision.isVisible(u.pos)));
        if (seen.length && heroes.length) {
          const c = heroes[0].pos;
          const near = seen.reduce((a, b) => (Math.hypot(a.pos.x - c.x, a.pos.y - c.y) < Math.hypot(b.pos.x - c.x, b.pos.y - c.y) ? a : b));
          w.enqueue({ type: 'attack', unitIds: heroes.map((u) => u.id), targetId: near.id });
        }
      }
      for (const ev of w.step()) {
        if (ev.type === 'squadSighted' && ev.squad.startsWith('wave')) sighted.set(ev.squad, w.time);
        if (ev.type === "hit" && w.getUnit((ev as any).targetId)?.team === 'hero') hpLost += (ev as any).damage;
      }
      for (const [sq, t0] of sighted) {
        const mem = w.units.filter((u) => u.squad === sq);
        if (mem.every((u) => u.dead)) {
          done.push(`${sq}(${mem.map((u) => u.def.id).join('+')}) ${(w.time - t0).toFixed(1)}s`);
          sighted.delete(sq);
        }
      }
      if (w.result || w.units.filter((u) => u.team === 'hero').every((u) => u.dead)) break;
    }
    const heroes = w.units.filter((u) => u.team === 'hero');
    console.log(`層 ${layerWanted} 種子 ${seed}：導演出了 ${w.skirmish?.waves} 波；英雄存活 ${heroes.filter((u) => !u.dead).length}/4，總損血 ${hpLost.toFixed(0)}，時間 ${w.time.toFixed(0)}s`);
    console.log('  ' + done.join('；'));
  }
}

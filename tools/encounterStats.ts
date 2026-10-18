/** 除錯用：每個遭遇用滿血隊伍、腳本 AI 各打 N 場，看勝率、陣亡與剩餘生命。npx tsx tools/encounterStats.ts [N] */
import { TICK_RATE } from '../src/sim/constants';
import { ENCOUNTERS } from '../src/run/data/encounters';
import { battleOutcomeFromWorld, createBattleFromRun } from '../src/run/battle';
import { createRun } from '../src/run/runState';
import { HeroScript } from './heroScript';

const N = Number(process.argv[2] ?? 20);
for (const e of Object.values(ENCOUNTERS)) {
  let wins = 0, deaths = 0, hpLeft = 0, time = 0;
  for (let s = 1; s <= N; s++) {
    const r = createRun(s, { style: 'tactical' });
    const L = Number(process.env.LAYER ?? 0) || Math.min(e.minLayer, 7);
    const node = r.map.nodes.find((n) => n.layer === L)!;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: e.id, fromEvent: false };
    const w = createBattleFromRun(r);
    const sc = new HeroScript(w);
    while (!w.result && w.tick < 300 * TICK_RATE) { sc.update(); w.step(); }
    const o = battleOutcomeFromWorld(w);
    if (o.won) wins++;
    deaths += o.heroes.filter((h) => h.dead).length;
    hpLeft += o.heroes.reduce((a, h) => a + h.hp, 0) / 370;
    time += o.time;
  }
  console.log(`${e.id.padEnd(16)} L${e.minLayer} 勝 ${((wins / N) * 100).toFixed(0).padStart(3)}%  陣亡 ${(deaths / N).toFixed(2)}  剩餘生命 ${((hpLeft / N) * 100).toFixed(0)}%  ${(time / N).toFixed(0)}s`);
}

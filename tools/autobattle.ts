/**
 * 無畫面自動對戰：npm run autobattle -- --runs 200 [--seed 1] [--zoc pin|disengage|off] [--noscript]
 * 輸出勝率、平均戰鬥時間、各單位平均傷害。
 */
import type { ZocMode } from '../src/sim/simConfig';
import { runBattle } from './runBattle';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runs = Number(arg('runs') ?? 200);
const seed0 = Number(arg('seed') ?? 1);
const zoc = arg('zoc') as ZocMode | undefined;
const scripted = !process.argv.includes('--noscript');

const t0 = Date.now();
let wins = 0;
let timeouts = 0;
let totalTime = 0;
const agg = new Map<string, { team: string; dealt: number; taken: number; survived: number; n: number }>();

for (let i = 0; i < runs; i++) {
  const r = runBattle(seed0 + i, zoc ? { zocMode: zoc } : undefined, 300, scripted);
  if (r.winner === 'hero') wins++;
  if (r.winner === 'timeout') timeouts++;
  totalTime += r.time;
  for (const u of r.units) {
    const a = agg.get(u.name) ?? { team: u.team, dealt: 0, taken: 0, survived: 0, n: 0 };
    a.dealt += u.dealt;
    a.taken += u.taken;
    a.survived += u.alive ? 1 : 0;
    a.n++;
    agg.set(u.name, a);
  }
}

const pct = (x: number) => `${((x / runs) * 100).toFixed(1)}%`;
console.log(`\n=== 自動對戰：${runs} 場（種子 ${seed0}–${seed0 + runs - 1}，ZOC=${zoc ?? 'pin'}，英雄${scripted ? '腳本' : '閒置'} AI）===`);
console.log(`英雄勝率：${pct(wins)}　敵方勝率：${pct(runs - wins - timeouts)}　逾時：${pct(timeouts)}`);
console.log(`平均戰鬥時間：${(totalTime / runs).toFixed(1)} 秒`);
console.log('\n單位（每場平均）      造成傷害   承受傷害   存活率');
for (const [name, a] of agg) {
  const per = a.n / runs;
  console.log(
    `${a.team === 'hero' ? '英雄' : '敵人'} ${name.padEnd(4, '　')}`.padEnd(14) +
      `${(a.dealt / a.n).toFixed(1).padStart(9)}  ${(a.taken / a.n).toFixed(1).padStart(9)}  ${((a.survived / a.n) * 100).toFixed(0).padStart(6)}%` +
      (per > 1 ? `（每場 ${per} 隻）` : ''),
  );
}
console.log(`\n耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);

/**
 * 無畫面整趟自動遠征（SPEC_SLICE2 §12）：npm run autorun -- --runs 100 [--seed 1] [--layers 8]
 * 輸出：通關率、平均抵達層數、平均陣亡人數、平均剩餘金幣、各節點類型的平均戰鬥時間、全滅最常發生的層數。
 */
import type { RunState } from '../src/run/runState';
import { playRun } from './runPolicy';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runs = Number(arg('runs') ?? 100);
const seed0 = Number(arg('seed') ?? 1);
const layers = arg('layers') ? Number(arg('layers')) : undefined;

const TYPE_LABEL: Record<string, string> = { battle: '戰鬥', elite: '精英', boss: '頭目', eventBattle: '事件戰鬥' };
const t0 = Date.now();
const results: RunState[] = [];
for (let i = 0; i < runs; i++) results.push(playRun(seed0 + i, { layers }));

const won = results.filter((r) => r.phase.kind === 'ended' && r.phase.result === 'won');
const reached = results.map((r) => (r.currentNodeId === null ? 0 : r.map.nodes[r.currentNodeId].layer));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const lostAt = new Map<number, number>();
for (const r of results) if (r.stats.lostAtLayer) lostAt.set(r.stats.lostAtLayer, (lostAt.get(r.stats.lostAtLayer) ?? 0) + 1);
const byType = new Map<string, { count: number; time: number }>();
for (const r of results)
  for (const [k, v] of Object.entries(r.stats.battleTimeByType)) {
    const a = byType.get(k) ?? { count: 0, time: 0 };
    a.count += v!.count;
    a.time += v!.time;
    byType.set(k, a);
  }

console.log(`\n=== 自動遠征：${runs} 趟（種子 ${seed0}–${seed0 + runs - 1}，${results[0]?.map.layerCount ?? '?'} 層，腳本 AI）===`);
console.log(`通關率：${((won.length / runs) * 100).toFixed(1)}%`);
console.log(`平均抵達層數：${avg(reached).toFixed(2)}`);
console.log(`平均陣亡人次：${avg(results.map((r) => r.stats.heroesLost)).toFixed(2)}　（結束時仍陣亡：${avg(results.map((r) => r.party.filter((h) => h?.dead).length)).toFixed(2)} 人）`);
console.log(`平均剩餘金幣：${avg(results.map((r) => r.gold)).toFixed(0)}`);
console.log('各節點類型的平均戰鬥時間：');
for (const [k, v] of byType) console.log(`  ${(TYPE_LABEL[k] ?? k).padEnd(5, '　')} ${(v.time / v.count).toFixed(1)} 秒（共 ${v.count} 場）`);
const sorted = [...lostAt.entries()].sort((a, b) => b[1] - a[1]);
console.log(`全滅層數分布：${[...lostAt.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `第${l}層 ${n}`).join('、') || '（無）'}`);
if (sorted.length) console.log(`全滅最常發生在：第 ${sorted[0][0]} 層（${sorted[0][1]} 趟）`);
console.log(`\n耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);

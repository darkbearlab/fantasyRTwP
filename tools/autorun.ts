/**
 * 無畫面整趟自動遠征（SPEC_SLICE2 §12、SPEC_SLICE3 §8）：npm run autorun -- --runs 100 [--seed 1] [--layers 8] [--fixed]
 * 隊伍預設 4 名隨機組隊；--fixed 改用四個 Archetype（與切片 2 比較用）。
 * 輸出：通關率、平均抵達層數、平均陣亡人數、平均剩餘金幣、各節點類型的平均戰鬥時間、全滅最常發生的層數。
 */
import type { RunState } from '../src/run/runState';
import { HEROES } from '../src/sim/data/heroes';
import { CLASS_ORDER } from '../src/sim/data/classes';
import { autoParty, playRun } from './runPolicy';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runs = Number(arg('runs') ?? 100);
const seed0 = Number(arg('seed') ?? 1);
const layers = arg('layers') ? Number(arg('layers')) : undefined;
const partyMode = process.argv.includes('--fixed') ? 'fixed' : 'random';

const TYPE_LABEL: Record<string, string> = { battle: '戰鬥', elite: '精英', boss: '頭目', eventBattle: '事件戰鬥' };
const t0 = Date.now();
const results: RunState[] = [];
const parties: string[][] = [];
for (let i = 0; i < runs; i++) {
  results.push(playRun(seed0 + i, { layers, party: partyMode }));
  parties.push(autoParty(seed0 + i, partyMode) ?? results[i].party.map((h) => h!.classId));
}

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

console.log(`\n=== 自動遠征：${runs} 趟（種子 ${seed0}–${seed0 + runs - 1}，${results[0]?.map.layerCount ?? '?'} 層，腳本 AI，${partyMode === 'random' ? '隨機組隊' : '固定四職業'}）===`);
console.log(`通關率：${((won.length / runs) * 100).toFixed(1)}%`);
console.log(`平均抵達層數：${avg(reached).toFixed(2)}`);
console.log(`平均陣亡人次：${avg(results.map((r) => r.stats.heroesLost)).toFixed(2)}　（結束時仍陣亡：${avg(results.map((r) => r.party.filter((h) => h?.dead).length)).toFixed(2)} 人）`);
console.log(`平均剩餘金幣：${avg(results.map((r) => r.gold)).toFixed(0)}`);
console.log('各節點類型的平均戰鬥時間：');
for (const [k, v] of byType) console.log(`  ${(TYPE_LABEL[k] ?? k).padEnd(5, '　')} ${(v.time / v.count).toFixed(1)} 秒（共 ${v.count} 場）`);
const sorted = [...lostAt.entries()].sort((a, b) => b[1] - a[1]);
console.log(`全滅層數分布：${[...lostAt.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `第${l}層 ${n}`).join('、') || '（無）'}`);
if (sorted.length) console.log(`全滅最常發生在：第 ${sorted[0][0]} 層（${sorted[0][1]} 趟）`);
if (partyMode === 'random') {
  console.log('各職業（出發隊伍有該職業的趟數）的通關率：');
  for (const id of CLASS_ORDER) {
    const idx = parties.map((p, i) => (p.includes(id) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const w = idx.filter((i) => results[i].phase.kind === 'ended' && (results[i].phase as { result: string }).result === 'won').length;
    console.log(`  ${HEROES[id].name.padEnd(4, '　')} ${((w / idx.length) * 100).toFixed(0).padStart(3)}%（${idx.length} 趟）`);
  }
}
console.log(`\n耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);

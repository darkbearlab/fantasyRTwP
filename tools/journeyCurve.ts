/**
 * 一路向前的強度曲線實測（SPEC_SLICE7 §3.3）：npm run curve -- --runs 20 [--seed 1] [--policy exit|clear] [--perDepth 0.06] [--chapterMult 0.7,1,1,1,1] [--xpMult 0.6]
 * 腳本 AI 從兩人出發、照預設規則一路往前打（遇到被困的英雄有空位就收），記錄每張圖進場時的隊伍等級、人數，
 * 以及每張圖的勝負與戰鬥時間。和「每張圖預期的等級」（JOURNEY_CURVE.targetLevel）放在一起比。
 */
import { STARTER_CLASSES } from '../src/run/data/branches';
import { CHAPTERS } from '../src/run/data/chapters';
import { JOURNEY } from '../src/run/data/journey';
import { targetLevelAt } from '../src/run/xp';
import type { RunState } from '../src/run/runState';
import { createRun, livingHeroes } from '../src/run/runState';
import { rngFor } from '../src/run/seed';
import { stepRun } from './runPolicy';
import { SCRIPT } from './deliberateScript';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runs = Number(arg('runs') ?? 20);
const seed0 = Number(arg('seed') ?? 1);
// 打法：exit（預設，像玩家一樣往出口走）／clear（全部打完才走）
SCRIPT.mode = (arg('policy') ?? 'exit') as typeof SCRIPT.mode;
// 試數值用：--perDepth 0.06 --chapterMult 0.7,1,1,1,1 --xpMult 0.6（不改資料檔）
if (arg('perDepth')) JOURNEY.curve.perDepth = Number(arg('perDepth'));
if (arg('chapterMult')) JOURNEY.curve.chapterMult = arg('chapterMult')!.split(',').map(Number);
if (arg('xpMult')) JOURNEY.curve.xpMult = Number(arg('xpMult'));

interface MapRow {
  /** 整趟的第幾張圖（1 起算） */
  index: number;
  chapter: number;
  layer: number;
  type: string;
  level: number;
  alive: number;
  won?: boolean;
  time?: number;
}

const rows: MapRow[] = [];
const ends: { chapter: number; won: boolean; level: number; alive: number; rescued: number }[] = [];
const t0 = Date.now();
for (let i = 0; i < runs; i++) {
  const seed = seed0 + i;
  const rng = rngFor(seed, 'curveParty');
  const party = Array.from({ length: JOURNEY.startParty }, () => STARTER_CLASSES[rng.int(0, STARTER_CLASSES.length - 1)]);
  let r: RunState = createRun(seed, { style: 'deliberate', party });
  let index = 0;
  let rescued = 0;
  for (let guard = 0; guard < 800 && r.phase.kind !== 'ended'; guard++) {
    if (r.phase.kind === 'battle') {
      index++;
      const node = r.map.nodes[r.phase.nodeId];
      const row: MapRow = { index, chapter: r.chapter ?? 0, layer: node.layer, type: node.type, level: r.level ?? 1, alive: livingHeroes(r).length };
      const time = r.stats.battleTime;
      r = stepRun(r);
      row.won = !(r.phase.kind === 'ended' && r.phase.result !== 'won');
      row.time = r.stats.battleTime - time;
      rows.push(row);
      continue;
    }
    if (r.phase.kind === 'rescue') rescued += r.party.some((h) => !h || h.dead) ? 1 : 0;
    r = stepRun(r);
  }
  const won = r.phase.kind === 'ended' && r.phase.result === 'won';
  ends.push({ chapter: r.chapter ?? 0, won, level: r.level ?? 1, alive: livingHeroes(r).length, rescued });
  process.stdout.write(`第 ${i + 1}/${runs} 趟：${won ? '通關' : `第 ${(r.chapter ?? 0) + 1} 章全滅`}，等級 ${r.level}，剩 ${livingHeroes(r).length} 人，收了 ${rescued} 人\n`);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
console.log(`\n=== 一路向前：${runs} 趟（種子 ${seed0}–${seed0 + runs - 1}，兩人出發，腳本 AI，${SCRIPT.mode}）===`);
console.log(`曲線：${JSON.stringify(JOURNEY.curve)}`);
console.log(`通關率：${((ends.filter((e) => e.won).length / runs) * 100).toFixed(0)}%`);
console.log(`結束時的章節分布：${CHAPTERS.map((c, i) => `${c.name} ${ends.filter((e) => !e.won && e.chapter === i).length}`).join('、')}`);
console.log(`平均收進隊伍的人數：${avg(ends.map((e) => e.rescued)).toFixed(1)}`);
console.log('\n每張圖（整趟第幾張）：進場等級（預期）、活著的人數、勝率、平均戰鬥秒數、打到這張的趟數');
const maxIndex = Math.max(0, ...rows.map((x) => x.index));
for (let k = 1; k <= maxIndex; k++) {
  const at = rows.filter((x) => x.index === k);
  if (!at.length) continue;
  const ch = at[0].chapter;
  const lv = avg(at.map((x) => x.level));
  console.log(
    `  #${String(k).padStart(2)} 第${ch + 1}章 第${at[0].layer}層 ${at[0].type.padEnd(6)} 等級 ${lv.toFixed(1)}（${targetLevelAt(k)}）  人數 ${avg(at.map((x) => x.alive)).toFixed(1)}  勝率 ${((at.filter((x) => x.won).length / at.length) * 100).toFixed(0).padStart(3)}%  ${avg(at.map((x) => x.time ?? 0)).toFixed(0).padStart(3)} 秒  ${at.length} 趟`,
  );
}
console.log(`\n耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);

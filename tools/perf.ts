/**
 * 怪群效能量測（SPEC_SLICE4 §8）：npm run perf [敵人數=80] [秒數=30]
 * 4 名英雄（腳本 AI）在 96 × 96 m 的開放地圖中央，敵人從四邊生成後湧上來；
 * 量每節拍的 sim 耗時（目標：80 名敵人時平均 ≤ 4 ms）。
 * 另外跑一次怪群遭遇 hordePass（腳本 AI），輸出勝負、時間、擊殺與英雄承受傷害。
 */
import { performance } from 'node:perf_hooks';
import { TICK_RATE } from '../src/sim/constants';
import { ENEMIES } from '../src/sim/data/enemies';
import { HEROES } from '../src/sim/data/heroes';
import type { HordeSetup, MapDef } from '../src/sim/data/types';
import { World } from '../src/sim/world';
import { battleOutcomeFromWorld, createBattleFromRun } from '../src/run/battle';
import { createRun } from '../src/run/runState';
import { HeroScript } from './heroScript';

const N = Number(process.argv[2] ?? 80);
const SECONDS = Number(process.argv[3] ?? 30);

// 開放地圖＋幾塊障礙物（讓流場有東西可以繞）
const obstacles = [];
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  obstacles.push({ x: 48 + Math.cos(a) * 18 - 1.5, y: 48 + Math.sin(a) * 18 - 1.5, w: 3, h: 3 });
}
const map: MapDef = { id: 'perf', name: '效能測試', width: 96, height: 96, obstacles, heroSpawns: [], enemySpawns: [] };
const per = Math.ceil(N / 4);
const horde: HordeSetup = {
  spawners: [
    { id: 'n', x: 48, y: 6, radius: 4 },
    { id: 's', x: 48, y: 90, radius: 4 },
    { id: 'w', x: 6, y: 48, radius: 4 },
    { id: 'e', x: 90, y: 48, radius: 4 },
  ],
  waves: [{ id: 'all', trigger: { type: 'start' }, spawns: ['n', 's', 'w', 'e'].map((s, i) => ({ spawner: s, enemy: i === 3 ? 'skitter' : 'thrall', count: per })) }],
  objective: { type: 'clear' },
};
// 英雄血量放大，才能撐完整段量測
const heroes = ['warrior', 'ranger', 'mage', 'cleric'].map((id, i) => ({
  defId: id,
  def: { ...HEROES[id], maxHp: 100000 },
  pos: { x: 47 + (i % 2) * 2, y: 47 + Math.floor(i / 2) * 2 },
}));
const world = new World({ seed: 1, map, spawns: heroes, horde, defs: { ...HEROES, ...ENEMIES } });
const script = new HeroScript(world);
const times: number[] = [];
for (let t = 0; t < SECONDS * TICK_RATE && !world.result; t++) {
  const t0 = performance.now();
  script.update();
  world.step();
  times.push(performance.now() - t0);
}
const alive = world.units.filter((u) => u.team === 'enemy' && !u.dead).length;
times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`=== 怪群效能：${N} 名敵人、${SECONDS} 秒（${times.length} 節拍）===`);
console.log(`每節拍：平均 ${avg.toFixed(2)} ms、中位數 ${times[Math.floor(times.length / 2)].toFixed(2)} ms、p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms、最大 ${times[times.length - 1].toFixed(2)} ms`);
console.log(`結束時存活敵人：${alive}／${N}　目標 ≤ 4 ms：${avg <= 4 ? '達成' : '未達成'}`);

// 怪群遭遇（滿血隊伍、腳本 AI）
const runs = Number(process.env.RUNS ?? 10);
let wins = 0, time = 0, kills = 0, taken = 0, deaths = 0;
for (let s = 1; s <= runs; s++) {
  const r = createRun(s);
  const node = r.map.nodes.find((n) => n.layer === 1)!;
  r.currentNodeId = node.id;
  r.phase = { kind: 'battle', nodeId: node.id, encounterId: 'hordePass', fromEvent: false };
  const w = createBattleFromRun(r);
  const sc = new HeroScript(w);
  while (!w.result && w.tick < 300 * TICK_RATE) {
    sc.update();
    w.step();
  }
  const o = battleOutcomeFromWorld(w);
  if (o.won) wins++;
  time += o.time;
  kills += o.heroes.reduce((a, h) => a + h.kills, 0);
  taken += o.heroes.reduce((a, h) => a + h.damageTaken, 0);
  deaths += o.heroes.filter((h) => h.dead).length;
}
console.log(`=== 怪群遭遇 hordePass（${runs} 場，腳本 AI）===`);
console.log(`勝率 ${((wins / runs) * 100).toFixed(0)}%　平均 ${(time / runs).toFixed(1)} 秒　擊殺 ${(kills / runs).toFixed(1)}（每分鐘 ${((kills / time) * 60).toFixed(1)}）　英雄承受傷害 ${(taken / runs).toFixed(0)}　陣亡 ${(deaths / runs).toFixed(2)}`);

// 深淵礦坑（hordeMoria）：全隊沿路點攻擊移動到出口（腳本 AI 不會自己推進地圖）
const ROUTE = [
  { x: 20, y: 66.5 }, { x: 32, y: 66.5 }, { x: 47, y: 52 }, { x: 47, y: 30 }, { x: 51, y: 14.5 },
  { x: 54, y: 30 }, { x: 54, y: 52 }, { x: 66, y: 76.5 }, { x: 76, y: 76.5 }, { x: 92, y: 60 }, { x: 92, y: 30 }, { x: 91, y: 4 },
];
const mRuns = Number(process.env.MORIA_RUNS ?? 5);
let mWins = 0, mTime = 0, mKills = 0, mTaken = 0, mDeaths = 0, mMaxEnemies = 0;
const mTimes: number[] = [];
for (let s = 1; s <= mRuns; s++) {
  const r = createRun(s);
  const node = r.map.nodes.find((n) => n.layer === 1)!;
  r.currentNodeId = node.id;
  r.phase = { kind: 'battle', nodeId: node.id, encounterId: 'hordeMoria', fromEvent: false };
  const w = createBattleFromRun(r);
  // 腳本 AI 不會開門：開場直接把門全部打開
  for (const d of w.interactables.list) if (d.def.kind === 'door') w.setDoor(d, true);
  let wp = 0;
  while (!w.result && w.tick < 400 * TICK_RATE) {
    const hs = w.units.filter((u) => u.team === 'hero' && !u.dead);
    // 全員閒置（到達或卡住）就前往下一個路點
    if (wp < ROUTE.length && hs.every((h) => !h.order && !h.action)) {
      w.enqueue({ type: 'attackMove', unitIds: hs.map((h) => h.id), point: ROUTE[wp] });
      wp++;
    }
    const t0 = performance.now();
    w.step();
    mTimes.push(performance.now() - t0);
    mMaxEnemies = Math.max(mMaxEnemies, w.units.filter((u) => u.team === 'enemy' && !u.dead).length);
  }
  const o = battleOutcomeFromWorld(w);
  if (o.won) mWins++;
  mTime += o.time;
  mKills += o.heroes.reduce((a, h) => a + h.kills, 0);
  mTaken += o.heroes.reduce((a, h) => a + h.damageTaken, 0);
  mDeaths += o.heroes.filter((h) => h.dead).length;
}
mTimes.sort((a, b) => a - b);
console.log(`=== 深淵礦坑 hordeMoria（${mRuns} 場，沿路點攻擊移動）===`);
console.log(`勝率 ${((mWins / mRuns) * 100).toFixed(0)}%　平均 ${(mTime / mRuns).toFixed(1)} 秒　擊殺 ${(mKills / mRuns).toFixed(1)}（每分鐘 ${((mKills / mTime) * 60).toFixed(1)}）　英雄承受傷害 ${(mTaken / mRuns).toFixed(0)}　陣亡 ${(mDeaths / mRuns).toFixed(2)}　同時最多敵人 ${mMaxEnemies}`);
console.log(`每節拍：平均 ${(mTimes.reduce((a, b) => a + b, 0) / mTimes.length).toFixed(2)} ms、p95 ${mTimes[Math.floor(mTimes.length * 0.95)].toFixed(2)} ms、最大 ${mTimes[mTimes.length - 1].toFixed(2)} ms`);

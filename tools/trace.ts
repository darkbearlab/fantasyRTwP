/** 除錯用：印出一場戰鬥的時間軸。npx tsx tools/trace.ts [seed] [每幾秒] */
import { createBattle } from '../src/sim/battle';
import { HeroScript } from './heroScript';

const seed = Number(process.argv[2] ?? 1);
const every = Number(process.argv[3] ?? 2);
const w = createBattle(seed);
const s = new HeroScript(w);
const name = (id: number) => { const u = w.getUnit(id); return u ? `${u.def.letter}${u.id}` : '?'; };
while (!w.result && w.time < 300) {
  s.update();
  const evs = w.step();
  for (const e of evs) {
    if (e.type === 'interrupt' || e.type === 'death' || e.type === 'pinned' || e.type === 'aoe' || e.type === 'aggro' || e.type === 'battleEnd')
      console.log(`  ${w.time.toFixed(2)} ${e.type} ${JSON.stringify(e).replace(/"(sourceId|unitId|targetId|byId)":(\d+)/g, (_m, k, v) => `"${k}":"${name(+v)}"`)}`);
  }
  if (w.tick % Math.round(every * 30) === 0) {
    console.log(`t=${w.time.toFixed(1)} ` + w.units.filter(u => !u.dead).map(u => `${u.def.letter}${u.id}(${u.pos.x.toFixed(1)},${u.pos.y.toFixed(1)} ${u.hp} ${u.state[0]}${u.order ? ':' + u.order.type[0] + ((u.order as any).targetId ? name((u.order as any).targetId) : '') : ''})`).join(' '));
  }
}
console.log('result', w.result, w.time.toFixed(1));

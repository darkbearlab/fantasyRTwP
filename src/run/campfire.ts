/**
 * 營火對話的挑選（純函式）：依遠征種子＋節點決定這次聊哪一段、誰來說，同一個節點每次都一樣。
 */
import { HEROES } from '../sim/data/heroes';
import type { CampfireTalk } from './data/campfire';
import { CAMPFIRE_SOLO, CAMPFIRE_TALKS } from './data/campfire';
import type { RunState } from './runState';
import { livingHeroes } from './runState';
import { pickN, rngFor } from './seed';

export interface CampfireLine {
  /** 說話的英雄欄位 */
  slot: number;
  text: string;
}

/** 這次營火要聊的台詞；沒有存活英雄時是空的 */
export function campfireTalk(run: RunState, nodeId: number): CampfireLine[] {
  const alive = livingHeroes(run);
  if (alive.length === 0) return [];
  const rng = rngFor(run.seed, 'campfire', nodeId);
  const pool: CampfireTalk[] = alive.length === 1 ? CAMPFIRE_SOLO : CAMPFIRE_TALKS.filter((t) => t.speakers <= alive.length);
  const talk = pool[rng.int(0, pool.length - 1)];
  const cast = pickN(rng, alive, talk.speakers);
  const name = (i: number) => HEROES[cast[i].hero.classId].name;
  return talk.lines.map((l) => ({ slot: cast[l.s].slot, text: l.t.replace(/\{(\d)\}/g, (_, d: string) => name(Number(d))) }));
}

import { createBattle } from '../src/sim/battle';
import type { SimConfig } from '../src/sim/simConfig';
import { TICK_RATE } from '../src/sim/constants';
import { HeroScript } from './heroScript';

export interface BattleResult {
  seed: number;
  winner: 'hero' | 'enemy' | 'timeout';
  time: number;
  units: { name: string; team: string; dealt: number; taken: number; alive: boolean }[];
}

/** 無畫面跑一場戰鬥（英雄用腳本 AI） */
export function runBattle(seed: number, config?: Partial<SimConfig>, maxSeconds = 300, scripted = true): BattleResult {
  const world = createBattle(seed, config);
  const script = scripted ? new HeroScript(world) : null;
  const maxTicks = maxSeconds * TICK_RATE;
  while (!world.result && world.tick < maxTicks) {
    script?.update();
    world.step();
  }
  return {
    seed,
    winner: world.result ?? 'timeout',
    time: world.time,
    units: world.units.map((u) => ({ name: u.def.name, team: u.team, dealt: u.stats.damageDealt, taken: u.stats.damageTaken, alive: !u.dead })),
  };
}

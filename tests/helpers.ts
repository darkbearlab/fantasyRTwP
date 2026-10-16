import type { MapDef } from '../src/sim/data/types';
import type { SimConfig } from '../src/sim/simConfig';
import type { UnitSpawn } from '../src/sim/world';
import { World } from '../src/sim/world';
import type { SimEvent } from '../src/sim/events';
import type { IdleBehavior } from '../src/sim/ai/idleBehavior';

/** 空曠的測試地圖 */
export const OPEN_MAP: MapDef = {
  id: 'test-open',
  name: '測試',
  width: 20,
  height: 12,
  obstacles: [],
  heroSpawns: [],
  enemySpawns: [],
};

/** 節奏倍率固定為 1：測試驗證的是機制本身，不受調數值影響 */
export const NEUTRAL_PACING: Partial<SimConfig> = { actionSpeedMult: 1, heroDamageMult: 1 };

/** 敵人 AI 不會主動進攻的設定（方便控制測試情境） */
export const PASSIVE: Partial<SimConfig> = { enemyAggroRange: 0, enemyAggroTime: 1e9, ...NEUTRAL_PACING };

/** 不做任何事的閒置行為（讓英雄原地待命） */
export const HOLD: IdleBehavior = { decide: () => null };

export function makeWorld(
  spawns: UnitSpawn[],
  config: Partial<SimConfig> = {},
  map: MapDef = OPEN_MAP,
  seed = 1,
  idleBehavior?: IdleBehavior,
): World {
  return new World({ seed, map, spawns, config: { ...PASSIVE, ...config }, idleBehavior });
}

/** 推進 n 個節拍並收集所有事件 */
export function run(world: World, ticks: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) all.push(...world.step());
  return all;
}

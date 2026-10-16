import { HERO_ORDER } from './data/heroes';
import { MAPS } from './data/maps';
import type { SimConfig } from './simConfig';
import type { UnitSpawn } from './world';
import { World } from './world';

/** 建立切片 1 的戰鬥：arena01，4 名英雄對 7 名敵人 */
export function createBattle(seed: number, config?: Partial<SimConfig>, mapId = 'arena01'): World {
  const map = MAPS[mapId];
  const spawns: UnitSpawn[] = [];
  HERO_ORDER.forEach((id, i) => spawns.push({ defId: id, pos: map.heroSpawns[i], heroSlot: i }));
  for (const e of map.enemySpawns) spawns.push({ defId: e.enemy, pos: { x: e.x, y: e.y } });
  return new World({ seed, map, spawns, config });
}

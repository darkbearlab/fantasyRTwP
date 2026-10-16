import type { MapDef } from '../types';
import arena01 from './arena01.json';
import boss01 from './boss01.json';
import bridge01 from './bridge01.json';
import forest01 from './forest01.json';
import ruins01 from './ruins01.json';

export const MAPS: Record<string, MapDef> = {
  arena01: arena01 as MapDef,
  forest01: forest01 as MapDef,
  ruins01: ruins01 as MapDef,
  bridge01: bridge01 as MapDef,
  boss01: boss01 as MapDef,
};

/// <reference types="vite/client" />
/**
 * finalbossblues 地形素材的載入（授權素材，在 public/assets/licensed/fbb/；沒有時程序生成的地圖改用程式畫的佔位）。
 * 圖塊對照在 fbbTiles.ts；拼地圖在 fbbMapView.ts。
 */
import type Phaser from 'phaser';
import { registerTilePrefabs } from '../../run/tilePrefabRegistry';
import { parseTilePrefab } from '../../run/tilePrefab';
import type { TilePrefabFile } from '../../run/tilePrefab';

export type FbbSeason = 'summer' | 'fall' | 'winter';

/** 有季節版的三張表（四季格號相同，夏季就是 hometown 原表） */
const SEASONAL = ['tileA2', 'tileA5_outside', 'tileB_outside'] as const;

export const fbbKey = (name: string, season: FbbSeason = 'summer'): string => (season === 'summer' ? `fbb_${name}` : `fbb_${name}_${season}`);

const FILES: [string, string][] = [
  ...SEASONAL.map((n) => [fbbKey(n), `fbb/hometown/tilesets/${n}.png`] as [string, string]),
  ...(['fall', 'winter'] as const).flatMap((s) => SEASONAL.map((n) => [fbbKey(n, s), `fbb/seasons/${n}_${s}.png`] as [string, string])),
  [fbbKey('tileB_town'), 'fbb/hometown/tilesets/tileB_town.png'],
  [fbbKey('master'), 'fbb/hometown/master_everything.png'],
  [fbbKey('fires'), 'fbb/hometown/characters/fires.png'],
  [fbbKey('smoke'), 'fbb/hometown/characters/smoke.png'],
];

/** 加入載入佇列（BootScene，和 Matt Walkden 素材一起） */
export function queueFbb(load: Phaser.Loader.LoaderPlugin, scene: Phaser.Scene): void {
  for (const [key, path] of FILES) if (!scene.textures.exists(key)) load.image(key, `assets/licensed/${path}`);
}

/** 拼地圖需要的圖都載入了嗎 */
export function fbbReady(scene: Phaser.Scene): boolean {
  return FILES.every(([key]) => scene.textures.exists(key));
}

/** 手工預製件（src/run/data/tilePrefabs/*.json）：用 Vite 打包進來，登記給城內生成器 */
export function registerBundledPrefabs(): void {
  const files = import.meta.glob<TilePrefabFile>('../../run/data/tilePrefabs/*.json', { eager: true, import: 'default' });
  registerTilePrefabs(
    Object.entries(files).map(([path, file]) => {
      const id = path.split('/').pop()!.replace(/\.json$/, '');
      return parseTilePrefab(id, file);
    }),
  );
}

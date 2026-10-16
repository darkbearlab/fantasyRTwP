/**
 * 美術模式（色塊／Flare 試裝）與 Flare 素材載入。
 * Flare 素材由 tools/importFlare.py 產生在 public/assets/flare/（CC-BY-SA 3.0，見 ASSET_LICENSES.md）。
 */
import type Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import flareArt from './flareArt.json';
import { isIso, worldToScreen } from './projection';

export type ArtMode = 'blocks' | 'flare';

export interface FlareArtConfig {
  heightPxPerM: number;
  anims: string[];
  heroSets: Record<string, { heightM: number; scaleFrom: string; scale?: number }>;
  heroes: Record<string, { set: string; layers: string[] }>;
  enemySheets: Record<string, { heightM: number; scale?: number }>;
  enemies: Record<string, string>;
  tiles: { tileset: string; floor: number[]; fancy: number[]; tileW: number; tileH: number };
}

export const FLARE = flareArt as unknown as FlareArtConfig;

/** 動作資訊（匯入腳本寫在圖集 JSON 的 anims） */
export interface FlareAnimMeta {
  frames: number;
  duration: number;
  type: string;
}

let art: ArtMode = GAME_CONFIG.art;

export function getArt(): ArtMode {
  return art;
}

export function setArt(a: ArtMode): void {
  art = a;
}

/** 圖集的 texture key */
export const flareKey = (sheet: string): string => `flare_${sheet}`;
export const FLARE_TILES = flareKey('tiles');

/** 所有要載入的圖集（不含副檔名） */
export function flareSheets(): string[] {
  const out = new Set<string>();
  for (const h of Object.values(FLARE.heroes)) for (const l of h.layers) out.add(`${h.set}_${l}`);
  for (const s of Object.keys(FLARE.enemySheets)) out.add(`enemy_${s}`);
  out.add('tiles');
  return [...out];
}

let loading = false;
let failed = false;
const waiting: (() => void)[] = [];

export function flareLoaded(scene: Phaser.Scene): boolean {
  return flareSheets().every((s) => scene.textures.exists(flareKey(s)));
}

/** 需要時才載入 Flare 素材（約 9 MB）；載入完成後呼叫 onDone */
export function ensureFlareLoaded(scene: Phaser.Scene, onDone: () => void): void {
  if (flareLoaded(scene)) {
    onDone();
    return;
  }
  if (failed) return;
  waiting.push(onDone);
  if (loading) return;
  loading = true;
  queueFlare(scene.load, scene);
  scene.load.once('loaderror', () => (failed = true));
  scene.load.once('complete', () => {
    loading = false;
    for (const cb of waiting.splice(0)) cb();
  });
  scene.load.start();
}

/** 把 Flare 圖集加入載入佇列（BootScene 的 preload 也用這個） */
export function queueFlare(load: Phaser.Loader.LoaderPlugin, scene: Phaser.Scene): void {
  for (const s of flareSheets()) {
    if (!scene.textures.exists(flareKey(s))) load.atlas(flareKey(s), `assets/flare/${s}.png`, `assets/flare/${s}.json`);
  }
}

/** 是否實際使用 Flare 畫角色與地板（只支援等角投影） */
export function useFlare(scene: Phaser.Scene): boolean {
  return art === 'flare' && isIso() && flareLoaded(scene);
}

/**
 * 方向換算設定（除錯面板「方向對照」可即時調整）：
 * - screen：Flare 的 8 方向視為「螢幕方向」——世界面向先經等角投影，再取最接近的螢幕方向
 * - map：Flare 的 8 方向視為「地圖方向」（等角地圖的格子軸）——直接用世界角度，與螢幕方向差 45 度
 * - offset：最後再整體偏移幾格（0–7），方便對照素材
 * - spin：轉向測試，所有角色的外觀每秒轉一個方向（只影響畫面）
 */
export type DirMode = 'screen' | 'map';
export const DIR_SETTINGS = { mode: 'screen' as DirMode, offset: 0, spin: false };

/** 0=西、1=西南、2=南、3=東南、4=東、5=東北、6=北、7=西北 */
export const DIR_NAMES = ['西', '西南', '南', '東南', '東', '東北', '北', '西北'];

/** 角色面向（世界角度）→ Flare 的 8 方向 */
export function flareDir(facing: number): number {
  let base: number;
  if (DIR_SETTINGS.mode === 'map') {
    // 地圖方向：西 = −x、南 = +y、東 = +x、北 = −y
    base = ((Math.round((Math.PI - facing) / (Math.PI / 4)) % 8) + 8) % 8;
  } else {
    const o = worldToScreen(0, 0);
    const p = worldToScreen(Math.cos(facing), Math.sin(facing));
    const a = Math.atan2(p.y - o.y, p.x - o.x); // 螢幕角度：0=東、π/2=南
    const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; // 0=東、1=東南、2=南…
    base = (4 - k + 8) % 8;
  }
  return (base + DIR_SETTINGS.offset + 8) % 8;
}

/** 轉向測試時顯示用的面向（世界角度）；平時就是單位的面向 */
export function displayFacing(facing: number): number {
  if (!DIR_SETTINGS.spin) return facing;
  return Math.floor(performance.now() / 1000) * (Math.PI / 4);
}

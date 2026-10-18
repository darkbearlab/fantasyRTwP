/**
 * 自製 3D 預渲染英雄 sprite（美術試裝 config.art = 'heroes3d'）的資料與載入。
 * 素材在 public/assets/heroes3d/：每個動作一張 PNG，列 = 8 方向（順序同 Flare）、欄 = 影格，每格 192×192。
 */
import type Phaser from 'phaser';
import cleric from '../../../public/assets/heroes3d/cleric/sprites.json';
import mage from '../../../public/assets/heroes3d/mage/sprites.json';
import ranger from '../../../public/assets/heroes3d/ranger/sprites.json';
import sorceress from '../../../public/assets/heroes3d/sorceress/sprites.json';
import warrior from '../../../public/assets/heroes3d/warrior/sprites.json';
import art from './heroes3dArt.json';
import { queueProps3d } from './props3d';

export interface H3DSheet {
  cell: number;
  origin: number[];
  px_per_meter: number;
  anims: Record<string, { frames: number; loop: boolean }>;
}

/** 動作計畫：pre = 準備期間先播的動作與占比；anim = 主要動作（生效時落在 peak 影格） */
export interface H3DPlan {
  pre?: [string, number][];
  anim: string;
}

export interface H3DArtConfig {
  heroes: Record<string, string>;
  mageLooks: string[];
  avoid: Record<string, string[]>;
  scaleMul: Record<string, number>;
  fps: Record<string, number>;
  peaks: Record<string, number>;
  attack: Record<string, H3DPlan>;
  skills: Record<string, string>;
  kinds: Record<string, string>;
  fallback: Record<string, string[]>;
}

export const H3D = art as unknown as H3DArtConfig;
export const H3D_SHEETS: Record<string, H3DSheet> = { warrior, cleric, ranger, mage, sorceress };

/** 除錯面板可切換：法師外觀（mage／sorceress） */
export const H3D_SETTINGS = { mageLook: 'mage' };

/** 英雄 def.id → 素材角色（沒有對應的英雄回傳 undefined，改用 Flare） */
export function h3dCharFor(defId: string): string | undefined {
  const c = H3D.heroes[defId];
  if (c === 'mage') return H3D_SETTINGS.mageLook;
  return c;
}

export const h3dKey = (char: string, anim: string): string => `h3d_${char}_${anim}`;

/** 角色實際擁有的動作（依替代順序找） */
export function h3dResolve(char: string, anim: string): string {
  const anims = H3D_SHEETS[char].anims;
  const avoid = H3D.avoid[char] ?? [];
  const ok = (a: string) => !!anims[a] && !avoid.includes(a);
  if (ok(anim)) return anim;
  for (const f of H3D.fallback[anim] ?? []) if (ok(f)) return f;
  return 'idle';
}

function allKeys(): { key: string; url: string; cell: number }[] {
  const out: { key: string; url: string; cell: number }[] = [];
  for (const [char, s] of Object.entries(H3D_SHEETS)) {
    for (const anim of Object.keys(s.anims)) out.push({ key: h3dKey(char, anim), url: `assets/heroes3d/${char}/${anim}.png`, cell: s.cell });
  }
  return out;
}

export function heroes3dLoaded(scene: Phaser.Scene): boolean {
  return allKeys().every((k) => scene.textures.exists(k.key));
}

/** 把 heroes3d 的動作圖加入載入佇列（約 7 MB） */
export function queueHeroes3d(load: Phaser.Loader.LoaderPlugin, scene: Phaser.Scene): void {
  for (const k of allKeys()) {
    if (!scene.textures.exists(k.key)) load.spritesheet(k.key, k.url, { frameWidth: k.cell, frameHeight: k.cell });
  }
}

let loading = false;
let failed = false;

/** 需要時才載入 */
export function ensureHeroes3dLoaded(scene: Phaser.Scene): void {
  if (loading || failed || heroes3dLoaded(scene)) return;
  loading = true;
  queueHeroes3d(scene.load, scene);
  queueProps3d(scene.load, scene);
  scene.load.once('loaderror', () => (failed = true));
  scene.load.once('complete', () => (loading = false));
  scene.load.start();
}

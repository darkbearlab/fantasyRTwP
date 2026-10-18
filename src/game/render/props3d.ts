/**
 * 自製 3D 預渲染地形物件（public/assets/props3d/，與 heroes3d 同相機、同比例）的載入。
 * 每個物件一張圖、只有一個角度；擺放計畫見 props3dPlan.ts。
 */
import type Phaser from 'phaser';
import { PROP_META } from './props3dPlan';

export const p3dKey = (id: string): string => `p3d_${id}`;

export function props3dLoaded(scene: Phaser.Scene): boolean {
  return Object.keys(PROP_META).every((id) => scene.textures.exists(p3dKey(id)));
}

/** 把物件圖加入載入佇列（約 0.4 MB） */
export function queueProps3d(load: Phaser.Loader.LoaderPlugin, scene: Phaser.Scene): void {
  for (const id of Object.keys(PROP_META)) if (!scene.textures.exists(p3dKey(id))) load.image(p3dKey(id), `assets/props3d/${id}.png`);
}

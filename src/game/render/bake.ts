import Phaser from 'phaser';

/** 把靜態 Graphics 烘成貼圖並換成 Image */
export function bakeGraphics(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, key: string, w: number, h: number, depth: number): Phaser.GameObjects.Image {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  g.generateTexture(key, Math.ceil(w), Math.ceil(h));
  g.destroy();
  return scene.add.image(0, 0, key).setOrigin(0).setDepth(depth);
}

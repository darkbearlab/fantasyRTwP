import Phaser from 'phaser';

/**
 * 把靜態 Graphics 烘成貼圖並換成 Image。
 * 圖形若有負座標（等角投影），呼叫端先 g.translateCanvas(-ox, -oy)，這裡把貼圖放回 (ox, oy)。
 */
export function bakeGraphics(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  key: string,
  w: number,
  h: number,
  depth: number,
  ox = 0,
  oy = 0,
): Phaser.GameObjects.Image {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  g.generateTexture(key, Math.ceil(w), Math.ceil(h));
  g.destroy();
  return scene.add.image(ox, oy, key).setOrigin(0).setDepth(depth);
}

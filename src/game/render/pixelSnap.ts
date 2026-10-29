/**
 * 像素對齊（試看，Alan 2026-10-29）：戰鬥鏡頭整個畫面改成 size×size 的大像素，格子跟著世界座標走。
 * 每一格只取中心一點的顏色（不混色），所以角色、地板、圈圈、生命條、迷霧都落在同一個格子上。
 * 只是後製濾鏡，不改素材、不改座標；除錯面板開關，記在瀏覽器裡。
 */
import Phaser from 'phaser';

const KEY = 'rtwp.pixelSnap';

/** 大像素的邊長（畫面 px）＝角色素材的放大倍率（PIXEL.unitScale） */
export const PIXEL_SNAP_SIZE = 3;

let on = ((): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

export function getPixelSnap(): boolean {
  return on;
}

export function setPixelSnap(v: boolean): void {
  on = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    // 存不了就只在這次有效
  }
}

const FRAG = `
#define SHADER_NAME PIXEL_SNAP_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 resolution;
uniform float size;
uniform vec2 offset;
varying vec2 outTexCoord;
void main() {
  // 換成左上角原點的畫面座標，依世界座標的格子取那一格的中心
  vec2 p = outTexCoord * resolution;
  p.y = resolution.y - p.y;
  vec2 c = (floor((p + offset) / size) + 0.5) * size - offset;
  c.y = resolution.y - c.y;
  gl_FragColor = texture2D(uMainSampler, c / resolution);
}
`;

export class PixelSnapFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  /** 鏡頭捲動量除以格子的餘數（畫面 px）：讓格子黏在世界上，不跟著畫面滑動 */
  offsetX = 0;
  offsetY = 0;

  constructor(game: Phaser.Game) {
    super({ game, name: 'PixelSnapFX', fragShader: FRAG });
  }

  onPreRender(): void {
    this.set1f('size', PIXEL_SNAP_SIZE);
    this.set2f('offset', this.offsetX, this.offsetY);
    this.set2f('resolution', this.renderer.width, this.renderer.height);
  }
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** 每一格畫面呼叫：開關有變就掛上／拿掉濾鏡，並更新格子的偏移 */
export function updatePixelSnap(cam: Phaser.Cameras.Scene2D.Camera): void {
  const renderer = cam.scene.game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  let fx = cam.getPostPipeline(PixelSnapFX) as PixelSnapFX | PixelSnapFX[] | undefined;
  if (Array.isArray(fx)) fx = fx[0];
  if (on && !fx) {
    if (!renderer.pipelines.getPostPipeline('PixelSnapFX')) renderer.pipelines.addPostPipeline('PixelSnapFX', PixelSnapFX);
    cam.setPostPipeline(PixelSnapFX);
    fx = cam.getPostPipeline(PixelSnapFX) as PixelSnapFX;
  } else if (!on && fx) {
    cam.removePostPipeline('PixelSnapFX');
    return;
  }
  if (fx && !Array.isArray(fx)) {
    fx.offsetX = mod(cam.scrollX * cam.zoom, PIXEL_SNAP_SIZE);
    fx.offsetY = mod(cam.scrollY * cam.zoom, PIXEL_SNAP_SIZE);
  }
}

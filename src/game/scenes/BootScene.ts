import Phaser from 'phaser';
import { getArt, queueFlare } from '../render/art';
import { queuePixel } from '../render/pixelArt';
import { queueHeroes3d } from '../render/heroes3d';
import { queueProps3d } from '../render/props3d';
import { isIso } from '../render/projection';

/** 開機：美術為 Flare／heroes3d 時先載入素材（約 9 MB＋7 MB），再進標題 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    if (getArt() === 'blocks') return;
    const { width, height } = this.scale;
    if (getArt() === 'pixel') {
      // 2D 像素：授權素材（licensed/）可能不存在（PR 的 CI、fork、沒拉素材的本機）——載入失敗的圖改用色塊，不顯示錯誤
      const label = this.add.text(width / 2, height / 2, '載入美術素材… 0%', { fontSize: '18px', color: '#c8d0dc' }).setOrigin(0.5);
      this.load.on('progress', (v: number) => label.setText(`載入美術素材… ${Math.round(v * 100)}%`));
      queuePixel(this.load, this);
      return;
    }
    const label = this.add.text(width / 2, height / 2, '載入美術素材… 0%', { fontSize: '18px', color: '#c8d0dc' }).setOrigin(0.5);
    this.load.on('progress', (v: number) => label.setText(`載入美術素材… ${Math.round(v * 100)}%`));
    // 素材載入失敗時退回色塊版，不影響遊戲
    this.load.on('loaderror', () => label.setText('美術素材載入失敗，改用色塊'));
    queueFlare(this.load, this);
    if (getArt() === 'heroes3d') {
      queueHeroes3d(this.load, this);
      // 地形物件（props3d）是等角素材，只有等角投影會用到
      if (isIso()) queueProps3d(this.load, this);
    }
  }

  create(): void {
    this.scene.start('Title');
  }
}

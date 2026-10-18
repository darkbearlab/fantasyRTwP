import Phaser from 'phaser';
import { getArt, queueFlare } from '../render/art';
import { queueHeroes3d } from '../render/heroes3d';
import { queueProps3d } from '../render/props3d';

/** 開機：美術為 Flare／heroes3d 時先載入素材（約 9 MB＋7 MB），再進標題 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    if (getArt() === 'blocks') return;
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, '載入美術素材… 0%', { fontSize: '18px', color: '#c8d0dc' }).setOrigin(0.5);
    this.load.on('progress', (v: number) => label.setText(`載入美術素材… ${Math.round(v * 100)}%`));
    // 素材載入失敗時退回色塊版，不影響遊戲
    this.load.on('loaderror', () => label.setText('美術素材載入失敗，改用色塊'));
    queueFlare(this.load, this);
    if (getArt() === 'heroes3d') {
      queueHeroes3d(this.load, this);
      queueProps3d(this.load, this);
    }
  }

  create(): void {
    this.scene.start('Title');
  }
}

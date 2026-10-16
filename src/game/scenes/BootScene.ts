import Phaser from 'phaser';

/** 開機：目前沒有資源要載入，直接進標題 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Title');
  }
}

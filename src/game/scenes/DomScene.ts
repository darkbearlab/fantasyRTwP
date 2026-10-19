import Phaser from 'phaser';
import { el, uiRoot } from '../ui/dom';

/** 以 DOM 呈現的畫面：create 時掛上根節點，shutdown 時移除 */
export abstract class DomScene extends Phaser.Scene {
  protected root!: HTMLElement;
  protected abstract screenClass: string;

  create(data?: object): void {
    this.root = el('div', `screen interactive ${this.screenClass}`);
    uiRoot().appendChild(this.root);
    this.events.once('shutdown', () => this.root.remove());
    // 視窗大小改變（手機轉向）：依新的版面重建
    let last = `${this.scale.width}x${this.scale.height}`;
    const onResize = () => {
      // refresh() 也會發出 resize：尺寸真的變了才重建
      const now = `${this.scale.width}x${this.scale.height}`;
      if (now === last) return;
      last = now;
      this.rebuild();
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
    this.build(data);
  }

  protected abstract build(data?: object): void;

  protected rebuild(): void {
    this.root.innerHTML = '';
    this.build();
  }
}

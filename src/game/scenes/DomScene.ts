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
    this.build(data);
  }

  protected abstract build(data?: object): void;

  protected rebuild(): void {
    this.root.innerHTML = '';
    this.build();
  }
}

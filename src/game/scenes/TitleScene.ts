import { button, el } from '../ui/dom';
import { randomRunSeed, startNewRun, switchTo } from '../runFlow';
import { DomScene } from './DomScene';

/** 標題（SPEC_SLICE2 §10.1）：開始遠征、可輸入種子 */
export class TitleScene extends DomScene {
  protected screenClass = 'title-screen';

  constructor() {
    super('Title');
  }

  protected build(): void {
    const box = el('div', 'title-box');
    box.append(el('h1', '', 'fantasyRTwP'), el('div', 'subtitle', '帶著四名英雄穿越八層險地，擊敗戰爭領主。死去的人不會回來——除非你付得起代價。'));
    const seedRow = el('div', 'seed-row');
    const input = el('input');
    input.placeholder = '種子（留空＝隨機）';
    input.inputMode = 'numeric';
    const q = new URLSearchParams(window.location.search).get('seed');
    if (q) input.value = q;
    const seedOf = () => (/^\d+$/.test(input.value.trim()) ? Number(input.value.trim()) : randomRunSeed());
    seedRow.append(input);
    const start = button('開始遠征', 'primary big', () => startNewRun(this, seedOf()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startNewRun(this, seedOf());
    });
    const quick = button('快速戰鬥（隘口，單場）', 'small', () => switchTo(this, 'Battle', { seed: seedOf() }));
    box.append(seedRow, start, quick);
    box.appendChild(el('div', 'title-hint', '操作：1–4 選人（連按跳鏡頭）、Tab 切換、Q E R 技能、右鍵移動／攻擊、空白鍵暫停、WASD 鏡頭'));
    this.root.appendChild(box);
  }
}

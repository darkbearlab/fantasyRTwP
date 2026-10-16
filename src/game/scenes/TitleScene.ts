import { button, el } from '../ui/dom';
import { randomRunSeed, startNewRun, switchTo } from '../runFlow';
import { DomScene } from './DomScene';
import { ENCOUNTERS } from '../../run/data/encounters';
import { MAPS } from '../../sim/data/maps';

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
    const quickRow = el('div', 'btn-row center');
    const sel = el('select', 'quick-select');
    const opt0 = el('option', '', '隘口之戰（切片 1）');
    opt0.value = '';
    sel.appendChild(opt0);
    for (const e of Object.values(ENCOUNTERS)) {
      const o = el('option', '', `${e.name}（${MAPS[e.map].name}・${e.tier === 'boss' ? '頭目' : e.tier === 'elite' ? '精英' : e.tier === 'event' ? '事件' : '戰鬥'}）`);
      o.value = e.id;
      sel.appendChild(o);
    }
    const layerSel = el('select', 'quick-select');
    for (let l = 1; l <= 8; l++) {
      const o = el('option', '', `第 ${l} 層強度`);
      o.value = String(l);
      layerSel.appendChild(o);
    }
    const quick = button('快速戰鬥（單場）', 'small', () =>
      switchTo(this, 'Battle', sel.value ? { seed: seedOf(), encounterId: sel.value, layer: Number(layerSel.value) } : { seed: seedOf() }),
    );
    quickRow.append(sel, layerSel, quick);
    box.append(seedRow, start, quickRow);
    box.appendChild(el('div', 'title-hint', '操作：1–4 選人（連按跳鏡頭）、Tab 切換、Q E R 技能、右鍵移動／攻擊、空白鍵暫停、WASD 鏡頭'));
    this.root.appendChild(box);
  }
}

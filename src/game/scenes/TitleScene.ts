import { button, el } from '../ui/dom';
import { randomRunSeed, startNewRun, switchTo } from '../runFlow';
import { DomScene } from './DomScene';
import { ENCOUNTERS } from '../../run/data/encounters';
import { deliberateLevelId, levelEncounterId } from '../../run/battle';
import { MAPS } from '../../sim/data/maps';
import { CREDITS } from '../credits';

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
    // 沉穩節奏的遠征關卡（48 × 48，依種子生成；SPEC_SLICE5 §15.3）
    for (const [tier, label] of [['battle', '遭遇'], ['elite', '精英'], ['boss', '最終決戰'], ['event', '突發']] as const) {
      const o = el('option', '', `遠征關卡：${label}（依種子生成）`);
      o.value = deliberateLevelId(tier);
      sel.appendChild(o);
    }
    // 怪群模式的大型關卡（封存；每次依種子生成）
    for (const [tier, label] of [['battle', '探索'], ['elite', '精英'], ['boss', '最終決戰'], ['event', '突發']] as const) {
      const o = el('option', '', `怪群大型關卡：${label}（封存）`);
      o.value = levelEncounterId(tier);
      sel.appendChild(o);
    }
    for (const e of Object.values(ENCOUNTERS)) {
      const o = el('option', '', `${e.name}（${MAPS[e.map].name}・${e.tier === 'boss' ? '頭目' : e.tier === 'elite' ? '精英' : e.tier === 'event' ? '事件' : e.tier === 'horde' ? '怪群' : '戰鬥'}）`);
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
    const creditsRow = el('div', 'btn-row center');
    creditsRow.appendChild(button('製作人員', 'small', () => this.showCredits()));
    box.appendChild(creditsRow);
    const touch = window.matchMedia('(pointer: coarse)').matches;
    box.appendChild(
      el(
        'div',
        'title-hint',
        touch
          ? '操作：點英雄卡上的名字選人 → 點地圖攻擊移動；點卡片下半放技能；沙漏暫停；拖曳移動鏡頭、雙指縮放'
          : '操作：點英雄卡名字選人 → 點地圖攻擊移動；點卡片下半（或 1–4 再按 1）放技能；空白鍵暫停；拖曳或 WASD 移動鏡頭',
      ),
    );
    this.root.appendChild(box);
  }

  /** 製作人員名單（含 Flare 美術貢獻者，CC-BY-SA 3.0 署名） */
  private showCredits(): void {
    const overlay = el('div', 'credits-overlay');
    const panel = el('div', 'panel credits-panel');
    panel.append(el('h2', '', '製作人員'));
    for (const line of CREDITS.game) panel.append(el('div', '', line));
    const f = CREDITS.flare;
    panel.append(el('div', 'step-title', f.title), el('div', 'meta', f.note), el('div', 'meta', f.source));
    panel.append(el('div', 'step-title', 'Art'), el('div', 'credits-names', f.art.join('、')));
    panel.append(el('div', 'step-title', 'Additional Art'), el('div', 'credits-names', f.additional.join('、')));
    panel.append(button('關閉', 'small', () => overlay.remove()));
    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => e.target === overlay && overlay.remove());
    this.root.appendChild(overlay);
  }
}

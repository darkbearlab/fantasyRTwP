import { tr } from '../../i18n';
import { button, el } from '../ui/dom';
import { languageRow } from '../ui/language';
import { continueRun, randomRunSeed, startNewRun, switchTo } from '../runFlow';
import { clearSave, loadRun, saveSummary } from '../save';
import { HEROES } from '../../sim/data/heroes';
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
    box.append(el('h1', '', 'fantasyRTwP'), el('div', 'subtitle', tr("帶著四名英雄穿越八層險地，擊敗戰爭領主。死去的人不會回來——除非你付得起代價。")));
    const seedRow = el('div', 'seed-row');
    const input = el('input');
    input.placeholder = tr("種子（留空＝隨機）");
    input.inputMode = 'numeric';
    const q = new URLSearchParams(window.location.search).get('seed');
    if (q) input.value = q;
    const seedOf = () => (/^\d+$/.test(input.value.trim()) ? Number(input.value.trim()) : randomRunSeed());
    seedRow.append(input);
    // 有存檔：「繼續遠征」排在最前面；開新遠征會蓋掉存檔，先確認
    const summary = saveSummary();
    const startNew = () => {
      if (summary && !window.confirm(tr("開始新的遠征會覆蓋目前的存檔，確定嗎？"))) return;
      clearSave();
      startNewRun(this, seedOf());
    };
    const start = button(tr("開始遠征"), summary ? 'big' : 'primary big', startNew);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startNew();
    });
    if (summary) {
      const cont = el('div', 'continue-box');
      const when = new Date(summary.savedAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      const names = summary.classes.map((c) => HEROES[c]?.name ?? c).join(tr("、"));
      cont.append(
        button(tr("繼續遠征"), 'primary big', () => {
          const run = loadRun();
          if (run) continueRun(this, run);
        }),
        el(
          'div',
          'continue-info',
          tr("{0}・隊伍等級 {1}・存活 {2} 人（{3}）・{4}/{5} {6}:{7}", { 0: summary.layer ? tr("第 {0}／{1} 層", { 0: summary.layer, 1: summary.layers }) : tr("尚未出發"), 1: summary.level, 2: summary.alive, 3: names, 4: when.getMonth() + 1, 5: when.getDate(), 6: pad(when.getHours()), 7: pad(when.getMinutes()) }),
        ),
      );
      box.append(cont);
    }
    const quickRow = el('div', 'btn-row center');
    const sel = el('select', 'quick-select');
    const opt0 = el('option', '', tr("隘口之戰（切片 1）"));
    opt0.value = '';
    sel.appendChild(opt0);
    // 沉穩節奏的遠征關卡（48 × 48，依種子生成；SPEC_SLICE5 §15.3）
    for (const [tier, label] of [['battle', tr("遭遇")], ['elite', tr("精英")], ['boss', tr("最終決戰")], ['event', tr("突發")]] as const) {
      const o = el('option', '', tr("遠征關卡：{0}（依種子生成）", { 0: label }));
      o.value = deliberateLevelId(tier);
      sel.appendChild(o);
    }
    // 怪群模式的大型關卡（封存；每次依種子生成）
    for (const [tier, label] of [['battle', tr("探索")], ['elite', tr("精英")], ['boss', tr("最終決戰")], ['event', tr("突發")]] as const) {
      const o = el('option', '', tr("怪群大型關卡：{0}（封存）", { 0: label }));
      o.value = levelEncounterId(tier);
      sel.appendChild(o);
    }
    for (const e of Object.values(ENCOUNTERS)) {
      const o = el('option', '', tr("{0}（{1}・{2}）", { 0: e.name, 1: MAPS[e.map].name, 2: e.tier === 'boss' ? tr("頭目") : e.tier === 'elite' ? tr("精英") : e.tier === 'event' ? tr("事件") : e.tier === 'horde' ? tr("怪群") : tr("戰鬥") }));
      o.value = e.id;
      sel.appendChild(o);
    }
    const layerSel = el('select', 'quick-select');
    for (let l = 1; l <= 8; l++) {
      const o = el('option', '', tr("第 {0} 層強度", { 0: l }));
      o.value = String(l);
      layerSel.appendChild(o);
    }
    const quick = button(tr("快速戰鬥（單場）"), 'small', () =>
      switchTo(this, 'Battle', sel.value ? { seed: seedOf(), encounterId: sel.value, layer: Number(layerSel.value) } : { seed: seedOf() }),
    );
    quickRow.append(sel, layerSel, quick);
    box.append(seedRow, start, quickRow);
    const creditsRow = el('div', 'btn-row center');
    creditsRow.appendChild(button(tr("製作人員"), 'small', () => this.showCredits()));
    creditsRow.appendChild(languageRow());
    box.appendChild(creditsRow);
    const touch = window.matchMedia('(pointer: coarse)').matches;
    box.appendChild(
      el(
        'div',
        'title-hint',
        touch
          ? tr("操作：點英雄卡上的名字選人 → 輕點地圖移動、按住不放攻擊移動；點卡片下半放技能；沙漏暫停；拖曳移動鏡頭")
          : tr("操作：點英雄卡名字或按 1–4 選人（在卡片上左右拖曳可以一次選多名）→ 點地圖移動、按住（或右鍵）攻擊移動；點卡片下半或按 Q 放技能；空白鍵暫停；拖曳或 WASD 移動鏡頭"),
      ),
    );
    this.root.appendChild(box);
  }

  /** 製作人員名單（含 Flare 美術貢獻者，CC-BY-SA 3.0 署名） */
  private showCredits(): void {
    const overlay = el('div', 'credits-overlay');
    const panel = el('div', 'panel credits-panel');
    panel.append(el('h2', '', tr("製作人員")));
    for (const line of CREDITS.game) panel.append(el('div', '', line));
    for (const p of CREDITS.pixel) panel.append(el('div', 'step-title', p.title), el('div', 'meta', p.line));
    const f = CREDITS.flare;
    panel.append(el('div', 'step-title', f.title), el('div', 'meta', f.note), el('div', 'meta', f.source));
    panel.append(el('div', 'step-title', 'Art'), el('div', 'credits-names', f.art.join(tr("、"))));
    panel.append(el('div', 'step-title', 'Additional Art'), el('div', 'credits-names', f.additional.join(tr("、"))));
    panel.append(button(tr("關閉"), 'small', () => overlay.remove()));
    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => e.target === overlay && overlay.remove());
    this.root.appendChild(overlay);
  }
}

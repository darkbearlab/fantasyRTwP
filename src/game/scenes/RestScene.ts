import { tr } from '../../i18n';
import { HEROES } from '../../sim/data/heroes';
import { CLASSES } from '../../sim/data/classes';
import { SKILLS } from '../../sim/data/skills';
import { swapOptions, swapSkill } from '../../run/classes';
import { className } from '../ui/classInfo';
import { ECONOMY } from '../../run/data/economy';
import { canRecruit, canRevive, finishCampfire, leaveNode, restCamp, restRecruit, restRevive, restTrain } from '../../run/progression';
import { hex } from '../render/palette';
import { button, el } from '../ui/dom';
import { partyPanel } from '../ui/partyPanel';
import { upgradePicker } from '../ui/upgradePicker';
import { advance, getRun, setRun } from '../runFlow';
import { firstEmptySlot, livingHeroes } from '../../run/runState';
import { campfireTalk } from '../../run/campfire';
import { battleSkillsOf } from '../../run/loadout';
import { maxHpOf } from '../../run/upgrades';
import { DomScene } from './DomScene';
import { showEvolutions } from '../ui/evolutionShow';

type Mode = 'menu' | 'revive' | 'train';
type Tab = 'rest' | 'skills';

/** 休息（SPEC_SLICE2 §5）：紮營／救人／訓練 三選一，另可額外招募 */
export class RestScene extends DomScene {
  protected screenClass = 'panel-screen';
  private mode: Mode = 'menu';
  private tab: Tab = 'rest';
  /** 營火對話進行中（場景停止是排隊處理的，不能用 isActive 判斷） */
  private campfireOpen = false;

  constructor() {
    super('Rest');
  }

  create(data?: object): void {
    // 場景物件會重複使用：每次進入休息節點都重新開始
    this.campfireOpen = false;
    super.create(data);
  }

  protected build(): void {
    const run = getRun(this);
    if (run.phase.kind !== 'rest') return;
    const p = run.phase;
    // 營火對話（Alan）：先看英雄們圍著火堆聊幾句，說完才打開休息選單
    if (!p.talked && !this.campfireOpen) {
      const lines = campfireTalk(run, p.nodeId);
      if (lines.length > 0) {
        this.root.style.display = 'none';
        this.campfireOpen = true;
        const heroes = livingHeroes(run).map(({ slot, hero }) => ({ slot, classId: hero.classId }));
        const cards = run.party.flatMap((h, slot) =>
          h ? [{ slot, classId: h.classId, hp: h.hp, maxHp: maxHpOf(h), dead: h.dead, skillName: SKILLS[battleSkillsOf(run, h)[0]]?.name ?? '—' }] : [],
        );
        this.scene.launch('Campfire', {
          heroes,
          lines,
          cards,
          slots: run.party.length,
          onDone: () => {
            this.campfireOpen = false;
            this.root.style.display = '';
            setRun(this, finishCampfire(getRun(this)));
            this.rebuild();
          },
        });
        return;
      }
    }
    if (this.campfireOpen) return;
    const box = el('div', 'panel wide');
    box.append(el('h2', '', tr("🔥 營火")), el('div', 'meta', tr("💰 {0} 金幣", { 0: run.gold })));
    const set = (r: typeof run) => this.afterTrain(r);
    const tabs = el('div', 'tabs');
    const tabBtn = (t: Tab, label: string) => {
      const b = button(label, `tab${this.tab === t ? ' active' : ''}`, () => {
        this.tab = t;
        this.rebuild();
      });
      tabs.appendChild(b);
    };
    tabBtn('rest', tr("休息"));
    // 沉穩節奏每名英雄只有一招主動，沒有舊的技能欄可以換
    const deliberate = run.style === 'deliberate';
    if (!deliberate) tabBtn('skills', tr("技能（不佔三選一）"));
    box.appendChild(tabs);
    if (this.tab === 'skills' && !deliberate) {
      box.appendChild(this.skillsTab(run, (r) => {
        setRun(this, r);
        this.rebuild();
      }));
      box.appendChild(button(p.used ? tr("繼續上路") : tr("不休息，繼續上路"), p.used ? 'primary' : '', () => advance(this, leaveNode(getRun(this)))));
      this.root.appendChild(box);
      return;
    }

    if (!p.used) {
      if (this.mode === 'menu') {
        box.appendChild(el('div', 'step-title', tr("選擇一項：")));
        const row = el('div', 'rest-options');
        // Alan 2026-10-22：在營火停留（紮營、訓練、救人）會引來冠軍；繼續趕路不會
        const smoke = run.overworld ? tr("（營火的煙會引來冠軍）") : '';
        row.appendChild(button(tr("紮營：全隊恢復 {0}% 生命{1}", { 0: ECONOMY.campHealRatio * 100, 1: smoke }), 'rest-option', () => set(restCamp(getRun(this)))));
        row.appendChild(button(deliberate ? tr("訓練：一次升級三選一（不提升隊伍等級）{0}", { 0: smoke }) : tr("訓練：一名英雄從 3 個強化中選 1"), 'rest-option', () => {
          this.mode = 'train';
          this.rebuild();
        }));
        // 一路向前：陣亡就是沒了（SPEC_SLICE7 §5）
        if (!run.forward)
          row.appendChild(button(tr("救人：花 {0} 金幣復活一名陣亡者（{1}% 生命）{2}", { 0: ECONOMY.reviveCost, 1: ECONOMY.reviveHpRatio * 100, 2: smoke }), 'rest-option', () => {
            this.mode = 'revive';
            this.rebuild();
          }, !canRevive(run)));
        row.appendChild(button(tr("繼續趕路：跳過這裡（不會引來冠軍）"), 'rest-option', () => advance(this, leaveNode(getRun(this)))));
        box.appendChild(row);
      } else if (this.mode === 'revive') {
        box.appendChild(el('div', 'step-title', tr("要救誰？")));
        box.appendChild(partyPanel(run, { pickable: (s) => canRevive(run, s), onPick: (s) => set(restRevive(getRun(this), s)) }));
        box.appendChild(button(tr("返回"), 'small', () => ((this.mode = 'menu'), this.rebuild())));
      } else {
        box.appendChild(el('div', 'step-title', tr("訓練：選擇強化")));
        box.appendChild(upgradePicker(run, p.trainOptions, (c) => this.afterTrain(restTrain(getRun(this), c.slot, c.upgradeId, c.skillId)), undefined, p.trainSlots));
        box.appendChild(button(tr("返回"), 'small', () => ((this.mode = 'menu'), this.rebuild())));
      }
    } else box.appendChild(el('div', 'event-result', p.resultText ?? ''));

    // 招募（不佔三選一）；一路向前：隊友靠路上解救（SPEC_SLICE7 §4）
    const rec = el('div', 'recruit');
    if (run.forward) rec.style.display = 'none';
    rec.appendChild(el('div', 'step-title', tr("招募（{0} 金幣，填入第一個空欄位）：", { 0: ECONOMY.recruitCost })));
    const slot = firstEmptySlot(run);
    const replaced = slot >= 0 ? run.party[slot] : null;
    if (replaced?.dead) rec.appendChild(el('div', 'meta warn-text', tr("新英雄會取代欄位 {0} 陣亡的{1}（之後就不能再救他）。", { 0: slot + 1, 1: HEROES[replaced.classId].name })));
    const recRow = el('div', 'btn-row');
    if (p.recruited) recRow.appendChild(el('span', 'meta', tr("本次已招募。")));
    else
      for (const cls of p.recruitCandidates) {
        const d = HEROES[cls];
        const b = button(`${d.letter} ${className(cls)}`, 'recruit-btn', () => set(restRecruit(getRun(this), cls)), !canRecruit(run));
        b.style.borderColor = hex(d.color);
        recRow.appendChild(b);
      }
    rec.appendChild(recRow);
    box.appendChild(rec);

    box.appendChild(partyPanel(run));
    if (p.used) box.appendChild(button(tr("繼續上路"), 'primary', () => advance(this, leaveNode(getRun(this)))));
    this.root.appendChild(box);
    // 訓練完剛好昇變：在這裡演出（SPEC_CLASSES §5）
    showEvolutions(this, this.root, () => this.rebuild());
  }

  /** 訓練、紮營、救人之後：被冠軍追上就直接開打，否則留在營火畫面 */
  private afterTrain(r: ReturnType<typeof getRun>): void {
    this.mode = 'menu';
    if (r.phase.kind !== 'rest') {
      advance(this, r);
      return;
    }
    setRun(this, r);
    this.rebuild();
  }

  /** 技能分頁（SPEC_SLICE3 §1.1）：第 1 欄專用技能固定，第 2、3 欄從同系共用池替換 */
  private skillsTab(run: ReturnType<typeof getRun>, set: (r: ReturnType<typeof getRun>) => void): HTMLElement {
    const box = el('div', 'skill-tab');
    box.appendChild(el('div', 'meta', tr("🔒 專用技能不能替換；其他兩欄可以換成同系的共用技能，免費、不限次數。技能順序在路線圖上調整。")));
    run.party.forEach((h, slot) => {
      if (!h || h.dead) return;
      const row = el('div', 'skill-row');
      const d = HEROES[h.classId];
      const name = el('div', 'skill-hero', `${slot + 1}. ${className(h.classId)}`);
      name.style.color = hex(d.color);
      row.appendChild(name);
      h.skills.forEach((sk, idx) => {
        const cell = el('div', 'skill-slot');
        cell.appendChild(el('div', 'skill-key', tr("{0}／{1}", { 0: idx + 1, 1: ['Q', 'E', 'R'][idx] })));
        if (sk === CLASSES[h.classId].signature) {
          cell.appendChild(el('div', 'skill-fixed', `🔒 ${SKILLS[sk].name}`));
        } else {
          const sel = el('select', 'skill-select');
          for (const id of [sk, ...swapOptions(h.classId, h.skills, idx)]) {
            const o = el('option', '', SKILLS[id].name);
            o.value = id;
            o.selected = id === sk;
            sel.appendChild(o);
          }
          sel.disabled = sel.options.length <= 1;
          sel.addEventListener('change', () => set(swapSkill(getRun(this), slot, idx, sel.value)));
          cell.appendChild(sel);
        }
        cell.title = SKILLS[sk].description;
        cell.appendChild(el('div', 'skill-desc', SKILLS[sk].description));
        row.appendChild(cell);
      });
      box.appendChild(row);
    });
    return box;
  }
}

import { tr } from '../../i18n';
import { heroName } from '../../run/characters';
import { NODE_ICON } from '../../run/mapGen';
import { button, el } from '../ui/dom';
import { getRun, randomRunSeed, startNewRun } from '../runFlow';
import { DomScene } from './DomScene';

/** 遠征結算（SPEC_SLICE2 §8） */
export class RunEndScene extends DomScene {
  protected screenClass = 'panel-screen';

  constructor() {
    super('RunEnd');
  }

  protected build(): void {
    const run = getRun(this);
    const won = run.phase.kind === 'ended' && run.phase.result === 'won';
    const box = el('div', 'panel wide result-panel');
    box.appendChild(el('h1', won ? 'win' : 'lose', won ? tr("遠征勝利") : tr("全軍覆沒")));
    const t = run.stats.battleTime;
    box.appendChild(
      el('div', 'meta', tr("戰鬥 {0} 場　·　戰鬥時間 {1} 分 {2} 秒　·　剩餘 {3} 金幣　·　種子 {4}", { 0: run.stats.battles, 1: Math.floor(t / 60), 2: Math.round(t % 60), 3: run.gold, 4: run.seed })),
    );
    const path = el('div', 'run-path');
    run.path.forEach((id, i) => {
      const n = run.map.nodes[id];
      path.appendChild(el('span', `path-node t-${n.type}`, NODE_ICON[n.type]));
      if (i < run.path.length - 1) path.appendChild(el('span', 'path-sep', '→'));
    });
    box.appendChild(path);
    const table = el('table');
    table.innerHTML = tr("<thead><tr><th>英雄</th><th>戰鬥</th><th>擊殺</th><th>造成傷害</th><th>承受傷害</th><th>強化</th><th>狀態</th></tr></thead>");
    const tbody = el('tbody');
    run.party.forEach((h) => {
      if (!h) return;
      const row = el('tr', h.dead ? 'dead' : '');
      row.innerHTML = tr("<td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td>", { 0: heroName(h), 1: h.battles, 2: h.kills, 3: h.damageDealt, 4: h.damageTaken, 5: h.upgrades.length, 6: h.dead ? tr('陣亡') : tr('存活') });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    box.appendChild(table);
    box.appendChild(el('div', 'meta', tr("陣亡次數：{0}", { 0: run.stats.heroesLost })));
    const journal = el('div', 'journal long');
    for (const j of run.journal) journal.appendChild(el('div', '', j));
    box.appendChild(journal);
    const row = el('div', 'btn-row');
    row.append(button(tr("同種子重來"), '', () => startNewRun(this, run.seed)), button(tr("再來一趟（新種子）"), 'primary', () => startNewRun(this, randomRunSeed())));
    box.appendChild(row);
    this.root.appendChild(box);
  }
}

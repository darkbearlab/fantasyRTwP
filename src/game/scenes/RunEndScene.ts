import { HEROES } from '../../sim/data/heroes';
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
    box.appendChild(el('h1', won ? 'win' : 'lose', won ? '遠征勝利' : '全軍覆沒'));
    const t = run.stats.battleTime;
    box.appendChild(
      el('div', 'meta', `戰鬥 ${run.stats.battles} 場　·　戰鬥時間 ${Math.floor(t / 60)} 分 ${Math.round(t % 60)} 秒　·　剩餘 ${run.gold} 金幣　·　種子 ${run.seed}`),
    );
    const path = el('div', 'run-path');
    run.path.forEach((id, i) => {
      const n = run.map.nodes[id];
      path.appendChild(el('span', `path-node t-${n.type}`, NODE_ICON[n.type]));
      if (i < run.path.length - 1) path.appendChild(el('span', 'path-sep', '→'));
    });
    box.appendChild(path);
    const table = el('table');
    table.innerHTML = '<thead><tr><th>英雄</th><th>戰鬥</th><th>擊殺</th><th>造成傷害</th><th>承受傷害</th><th>強化</th><th>狀態</th></tr></thead>';
    const tbody = el('tbody');
    run.party.forEach((h) => {
      if (!h) return;
      const tr = el('tr', h.dead ? 'dead' : '');
      tr.innerHTML = `<td>${HEROES[h.classId].name}</td><td>${h.battles}</td><td>${h.kills}</td><td>${h.damageDealt}</td><td>${h.damageTaken}</td><td>${h.upgrades.length}</td><td>${h.dead ? '陣亡' : '存活'}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
    box.appendChild(el('div', 'meta', `陣亡次數：${run.stats.heroesLost}`));
    const journal = el('div', 'journal long');
    for (const j of run.journal) journal.appendChild(el('div', '', j));
    box.appendChild(journal);
    const row = el('div', 'btn-row');
    row.append(button('同種子重來', '', () => startNewRun(this, run.seed)), button('再來一趟（新種子）', 'primary', () => startNewRun(this, randomRunSeed())));
    box.appendChild(row);
    this.root.appendChild(box);
  }
}

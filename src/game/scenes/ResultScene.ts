import Phaser from 'phaser';
import type { BattleSession } from '../session';
import type { BattleScene } from './BattleScene';

/** 結算畫面（SPEC §12）：戰鬥時間、各英雄造成與承受的傷害、重來按鈕 */
export class ResultScene extends Phaser.Scene {
  private box: HTMLElement | null = null;

  constructor() {
    super('Result');
  }

  create(): void {
    const s = this.registry.get('session') as BattleSession;
    const battle = this.scene.get('Battle') as BattleScene;
    const w = s.world;
    const win = w.result === 'hero';
    const box = document.createElement('div');
    box.className = 'result interactive';
    const t = w.time;
    const rows = w.units
      .filter((u) => u.team === 'hero')
      .sort((a, b) => a.heroSlot - b.heroSlot)
      .map(
        (u) =>
          `<tr class="${u.dead ? 'dead' : ''}"><td><span class="dot" style="background:#${u.def.color.toString(16).padStart(6, '0')}">${u.def.letter}</span>${u.def.name}</td>` +
          `<td>${u.stats.damageDealt}</td><td>${u.stats.damageTaken}</td><td>${u.stats.healing}</td><td>${u.stats.kills}</td><td>${u.dead ? '陣亡' : `${u.hp}/${u.maxHp}`}</td></tr>`,
      )
      .join('');
    box.innerHTML = `
      <div class="panel">
        <h1 class="${win ? 'win' : 'lose'}">${win ? '勝利！' : '失敗'}</h1>
        <div class="meta">戰鬥時間 ${Math.floor(t / 60)} 分 ${(t % 60).toFixed(1)} 秒　·　種子 ${s.seed}</div>
        <table>
          <thead><tr><th>英雄</th><th>造成傷害</th><th>承受傷害</th><th>治療</th><th>擊倒</th><th>狀態</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="buttons">
          <button class="btn" data-act="same">重來（同種子）</button>
          <button class="btn primary" data-act="new">重來（新種子）</button>
        </div>
      </div>`;
    box.querySelectorAll('button').forEach((b) => {
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        const act = (b as HTMLElement).dataset.act;
        battle.restartBattle(act === 'same' ? s.seed : 1 + Math.floor(Math.random() * 999999));
      });
    });
    document.getElementById('ui')!.appendChild(box);
    this.box = box;
    this.events.once('shutdown', () => {
      this.box?.remove();
      this.box = null;
    });
  }
}

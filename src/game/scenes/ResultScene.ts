import Phaser from 'phaser';
import { applyBattleResult } from '../../run/progression';
import { battleOutcomeFromWorld } from '../../run/battle';
import { advance, getRun, switchTo } from '../runFlow';
import type { BattleSession } from '../session';
import type { BattleScene } from './BattleScene';
import { showArcadeResult } from '../ui/arcadeResult';

/** 單場戰鬥結算（SPEC §12）：戰鬥時間、各英雄造成與承受的傷害；遠征模式按「繼續」回到流程 */
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
    // 遠征中打贏：大型電玩風格的結算畫面（Alan 2026-10-22），演完再去選升級
    if (s.mode === 'run' && win) {
      const before = getRun(this);
      const after = applyBattleResult(before, battleOutcomeFromWorld(w));
      const root = showArcadeResult(this, w, before, after, () => advance(this, after));
      document.getElementById('ui')!.appendChild(root);
      this.box = root;
      this.events.once('shutdown', () => {
        this.box?.remove();
        this.box = null;
      });
      return;
    }
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
    const buttons =
      s.mode === 'run'
        ? `<button class="btn primary" data-act="continue">繼續</button>`
        : `<button class="btn" data-act="same">重來（同種子）</button><button class="btn primary" data-act="new">重來（新種子）</button><button class="btn" data-act="title">回標題</button>`;
    box.innerHTML = `
      <div class="panel">
        <h1 class="${win ? 'win' : 'lose'}">${win ? '勝利！' : '失敗'}</h1>
        <div class="meta">戰鬥時間 ${Math.floor(t / 60)} 分 ${(t % 60).toFixed(1)} 秒　·　種子 ${s.seed}</div>
        <table>
          <thead><tr><th>英雄</th><th>造成傷害</th><th>承受傷害</th><th>治療</th><th>擊倒</th><th>狀態</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${s.mode === 'run' && !win ? '<div class="meta">隊伍全滅，遠征結束。</div>' : ''}
        <div class="buttons">${buttons}</div>
      </div>`;
    box.querySelectorAll('button').forEach((b) => {
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        const act = (b as HTMLElement).dataset.act;
        if (act === 'continue') advance(this, applyBattleResult(getRun(this), battleOutcomeFromWorld(w)));
        else if (act === 'title') switchTo(this, 'Title');
        else battle.restartBattle(act === 'same' ? s.seed : 1 + Math.floor(Math.random() * 999999));
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

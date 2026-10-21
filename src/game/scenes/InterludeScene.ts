import { CHAPTERS, chapterAt } from '../../run/data/chapters';
import { startChapter } from '../../run/campaign';
import { HEROES } from '../../sim/data/heroes';
import { maxHpOf } from '../../run/upgrades';
import { button, el } from '../ui/dom';
import { advance, getRun } from '../runFlow';
import { DomScene } from './DomScene';

/**
 * 章節過場（SPEC_CAMPAIGN）：章名、開場文字一段一段淡入，下面列出隊伍狀態（回滿、陣亡的不復活），按「出發」開始這一章。
 */
export class InterludeScene extends DomScene {
  protected screenClass = 'panel-screen interlude-screen';

  constructor() {
    super('Interlude');
  }

  protected build(): void {
    const run = getRun(this);
    if (run.phase.kind !== 'interlude') return;
    const n = run.phase.chapter;
    const ch = chapterAt(n);
    const box = el('div', 'panel wide interlude');
    box.append(el('div', 'chapter-no', `第 ${n + 1} 章／共 ${CHAPTERS.length} 章`), el('h1', 'chapter-name', ch.name));
    const story = el('div', 'chapter-story');
    ch.intro.forEach((line, i) => {
      const p = el('p', 'story-line', line);
      p.style.animationDelay = `${0.4 + i * 0.9}s`;
      story.appendChild(p);
    });
    box.appendChild(story);
    if (n > 0) {
      const party = el('div', 'chapter-party');
      for (const h of run.party) {
        if (!h) continue;
        party.appendChild(el('div', h.dead ? 'cp dead' : 'cp', h.dead ? `${HEROES[h.classId].name}：陣亡` : `${HEROES[h.classId].name}：${h.hp}／${maxHpOf(h)}`));
      }
      box.append(el('div', 'meta', '全隊回復了生命（陣亡的英雄不會回來）。'), party);
    }
    const row = el('div', 'btn-row');
    row.appendChild(button('出發', 'primary big', () => advance(this, startChapter(getRun(this)))));
    box.appendChild(row);
    this.root.appendChild(box);
  }
}

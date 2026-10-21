/**
 * 戰役（SPEC_CAMPAIGN）：五章、章節之間的過場。純函式，不修改傳入的物件。
 * - 打倒本章頭目（不是最後一章）：照常拿戰果與升級，回到路線圖之前先進過場（chapterCleared）。
 * - 過場：全隊回滿生命，陣亡的英雄不復活；按「出發」才產生下一章的路線圖、主力與冠軍。
 */
import { CHAPTERS, chapterAt, chapterDepth } from './data/chapters';
import { initOverworld } from './overworld';
import { generateRouteMap } from './routeMap';
import type { RunState } from './runState';
import { cloneRun, livingHeroes } from './runState';
import { deriveSeed } from './seed';
import { maxHpOf } from './upgrades';

/** 目前這一章 */
export function currentChapter(run: RunState) {
  return chapterAt(run.chapter);
}

/** 是不是最後一章 */
export function isFinalChapter(run: RunState): boolean {
  return (run.chapter ?? 0) >= CHAPTERS.length - 1;
}

/** 敵人強度用的深度加成（前面各章累積的層數） */
export function depthOffset(run: RunState): number {
  return run.style === 'deliberate' ? chapterDepth(run.chapter) : 0;
}

/** 本章頭目打倒後要進過場（原地修改；呼叫端已經 clone）：全隊回滿，陣亡的不復活 */
export function enterInterlude(r: RunState): void {
  r.chapterCleared = undefined;
  const next = (r.chapter ?? 0) + 1;
  for (const { hero } of livingHeroes(r)) hero.hp = maxHpOf(hero);
  r.journal.push(`第 ${next} 章「${CHAPTERS[(r.chapter ?? 0)].name}」突破！全隊回復了生命。`);
  r.phase = { kind: 'interlude', chapter: next };
}

/** 過場看完：開始這一章（第 0 章只是開場，路線圖已經有了） */
export function startChapter(run: RunState): RunState {
  if (run.phase.kind !== 'interlude') throw new Error('目前不在章節過場');
  const r = cloneRun(run);
  const n = run.phase.chapter;
  if (n !== (run.chapter ?? 0)) {
    const ch = chapterAt(n);
    r.chapter = n;
    r.map = generateRouteMap(deriveSeed(r.seed, 'chapter', n), ch.layers);
    r.currentNodeId = null;
    r.path = [];
    r.exitTo = null;
    r.overworld = initOverworld(r);
    r.journal.push(`第 ${n + 1} 章「${ch.name}」開始。`);
  }
  r.phase = { kind: 'map' };
  return r;
}

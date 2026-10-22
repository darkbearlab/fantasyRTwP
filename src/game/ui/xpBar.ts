/** 隊伍等級與經驗值條（SPEC_SLICE6 §3）：戰果畫面與路線圖共用 */
import { tr } from '../../i18n';
import type { RunState } from '../../run/runState';
import { xpToNext } from '../../run/xp';
import { el } from './dom';

export function xpBar(run: RunState, gained?: number): HTMLElement {
  const level = run.level ?? 1;
  const xp = run.xp ?? 0;
  const need = xpToNext(level);
  const box = el('div', 'xp-box');
  const head = el('div', 'xp-head', tr("隊伍等級 {0}", { 0: level }));
  if (gained !== undefined) head.appendChild(el('span', 'xp-gain', tr("　經驗值 +{0}", { 0: gained })));
  const bar = el('div', 'xp-bar');
  const fill = el('div', 'fill');
  fill.style.width = `${Math.min(100, (xp / need) * 100)}%`;
  bar.append(fill, el('span', 'xp-text', `${xp} / ${need}`));
  box.append(head, bar);
  return box;
}

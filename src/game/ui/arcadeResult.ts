/**
 * 戰鬥結算（Alan 2026-10-22：做成獨立畫面、有點像大型電玩）：
 * 1. 標題「第 N 章　N-L 完成」（重訪的節點寫「重訪」）。
 * 2. 每名英雄一行：左邊英雄 sprite，右邊是他打倒的敵人 sprite，由左到右一個一個演出被擊敗的動畫；接著標出 MVP。
 * 3. 隊伍等級的經驗值條：先顯示原本的經驗值，剛才打倒的敵人變成光點飛到條的末端，條往右長，看最後升幾級。
 * 4. 按「繼續」才去選升級。可以按「略過」直接跳到最後。
 * MVP 的額外獎勵先留鉤子（run/progression.ts 的 mvpReward）。
 */
import type Phaser from 'phaser';
import type { RunState } from '../../run/runState';
import { mvpReward } from '../../run/progression';
import { xpToNext } from '../../run/xp';
import { HEROES } from '../../sim/data/heroes';
import type { Unit } from '../../sim/unit';
import type { World } from '../../sim/world';
import { PIXEL_UNITS } from '../render/pixelArtData';
import { portraitSheetUrl } from '../render/pixelArt';
import { getArt } from '../render/art';
import { button, el } from './dom';

const KILL_STEP = 0.16;
const ICON = 48;

/** 單位的小圖（Matt Walkden：正面待機第一格；0x72：第一格；沒有素材時用字母圓點） */
function unitIcon(scene: Phaser.Scene, defId: string, cls: string): HTMLElement {
  const box = el('div', `arc-icon ${cls}`);
  const art = PIXEL_UNITS[defId];
  const pixel = getArt() === 'pixel';
  if (pixel && art?.kind === 'mw') {
    const url = portraitSheetUrl(scene, defId);
    if (url) {
      const k = ICON / 32;
      box.style.backgroundImage = `url("${url}")`;
      box.style.backgroundSize = `${256 * k}px ${448 * k}px`;
      box.style.backgroundPosition = `0 ${-5 * 32 * k}px`;
      return box;
    }
  }
  if (pixel && art?.kind === 'm72') {
    const img = document.createElement('img');
    img.src = `assets/0x72/frames/${art.idle}_f0.png`;
    box.appendChild(img);
    return box;
  }
  const def = HEROES[defId];
  box.classList.add('letter');
  box.textContent = def?.letter ?? '?';
  return box;
}

/** 某等級某經驗值的累計經驗 */
function cumulative(level: number, xp: number): number {
  let t = xp;
  for (let l = 1; l < level; l++) t += xpToNext(l);
  return t;
}

export function showArcadeResult(scene: Phaser.Scene, world: World, before: RunState, after: RunState, onDone: () => void): HTMLElement {
  const root = el('div', 'arcade interactive');
  const phase = before.phase.kind === 'battle' ? before.phase : null;
  const node = phase ? before.map.nodes[phase.nodeId] : null;
  const ch = (before.chapter ?? 0) + 1;
  const revisit = (phase?.visit ?? 1) > 1;
  const title = el('div', 'arc-title', `第 ${ch} 章　${ch}-${node?.layer ?? 1}${revisit ? '　重訪' : ''}　完成`);
  root.appendChild(title);

  // ── 英雄與擊殺 ──
  const heroes = world.units.filter((u) => u.team === 'hero').sort((a, b) => a.heroSlot - b.heroSlot);
  const board = el('div', 'arc-board');
  const killIcons: HTMLElement[] = [];
  const rows = new Map<Unit, HTMLElement>();
  let longest = 0;
  for (const u of heroes) {
    const row = el('div', `arc-row${u.dead ? ' dead' : ''}`);
    const who = el('div', 'arc-who');
    who.append(unitIcon(scene, u.def.id, 'hero'), el('div', 'arc-name', u.def.name));
    const kills = el('div', 'arc-kills');
    u.killList.forEach((id, i) => {
      const k = unitIcon(scene, id, 'kill');
      k.style.animationDelay = `${0.6 + i * KILL_STEP}s, ${0.6 + i * KILL_STEP + 0.22}s`;
      kills.appendChild(k);
      killIcons.push(k);
    });
    longest = Math.max(longest, u.killList.length);
    const count = el('div', 'arc-count', `× ${u.killList.length}`);
    row.append(who, kills, count);
    board.appendChild(row);
    rows.set(u, row);
  }
  root.appendChild(board);

  // MVP：打倒最多的（同數比造成傷害）
  const mvp = [...heroes].sort((a, b) => b.killList.length - a.killList.length || b.stats.damageDealt - a.stats.damageDealt)[0];
  const mvpAt = 0.6 + longest * KILL_STEP + 0.6;
  const mvpLine = el('div', 'arc-mvp-line');
  root.appendChild(mvpLine);

  // ── 經驗值條 ──
  const xpBox = el('div', 'arc-xp');
  const lvLabel = el('div', 'arc-lv');
  const bar = el('div', 'arc-bar');
  const fill = el('div', 'arc-fill');
  const xpText = el('span', 'arc-xp-text');
  const upLabel = el('div', 'arc-up');
  bar.append(fill, xpText);
  xpBox.append(lvLabel, bar, upLabel);
  root.appendChild(xpBox);
  let level = before.level ?? 1;
  let xp = before.xp ?? 0;
  const gained = Math.max(0, cumulative(after.level ?? 1, after.xp ?? 0) - cumulative(level, xp));
  const draw = () => {
    const need = xpToNext(level);
    lvLabel.textContent = `隊伍等級 ${level}`;
    fill.style.width = `${Math.min(100, (xp / need) * 100)}%`;
    xpText.textContent = `${Math.floor(xp)} / ${need}`;
  };
  draw();
  let ups = 0;
  const addXp = (n: number) => {
    xp += n;
    while (xp >= xpToNext(level)) {
      xp -= xpToNext(level);
      level++;
      ups++;
      upLabel.textContent = ups > 1 ? `LEVEL UP ×${ups}` : 'LEVEL UP!';
      upLabel.classList.remove('pop');
      void upLabel.offsetWidth;
      upLabel.classList.add('pop');
    }
    draw();
  };

  const btns = el('div', 'btn-row arc-buttons');
  const next = button('繼續', 'primary big', () => {
    cleanup();
    onDone();
  });
  next.style.visibility = 'hidden';
  const timers: number[] = [];
  const later = (sec: number, fn: () => void) => timers.push(window.setTimeout(fn, sec * 1000));
  const cleanup = () => {
    for (const t of timers) window.clearTimeout(t);
    root.remove();
  };
  // 全部演完：直接跳到最後的狀態
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    for (const t of timers) window.clearTimeout(t);
    root.classList.add('skip');
    showMvp();
    level = after.level ?? 1;
    xp = after.xp ?? 0;
    ups = Math.max(ups, (after.level ?? 1) - (before.level ?? 1));
    if (ups > 0) upLabel.textContent = ups > 1 ? `LEVEL UP ×${ups}` : 'LEVEL UP!';
    draw();
    for (const d of root.querySelectorAll('.arc-dot')) d.remove();
    next.style.visibility = 'visible';
    skip.style.visibility = 'hidden';
  };
  const skip = button('略過', 'small', finish);
  btns.append(skip, next);
  root.appendChild(btns);

  let mvpShown = false;
  const showMvp = () => {
    if (mvpShown || !mvp) return;
    mvpShown = true;
    rows.get(mvp)?.classList.add('mvp');
    const reward = mvpReward(after, mvp.heroSlot);
    mvpLine.textContent = `MVP　${mvp.def.name}${reward ? `　${reward}` : ''}`;
    mvpLine.classList.add('show');
  };
  later(mvpAt, showMvp);

  // 光點：每個擊殺圖示飛到經驗值條的末端，一個一個加經驗值
  const flyAt = mvpAt + 1.0;
  later(flyAt - 0.3, () => xpBox.classList.add('show'));
  const per = killIcons.length ? gained / killIcons.length : 0;
  if (killIcons.length === 0 && gained > 0) later(flyAt, () => addXp(gained));
  killIcons.forEach((k, i) => {
    later(flyAt + i * 0.07, () => {
      const scale = root.getBoundingClientRect().width / root.offsetWidth || 1;
      const r0 = root.getBoundingClientRect();
      const a = k.getBoundingClientRect();
      const b = fill.getBoundingClientRect();
      const dot = el('div', 'arc-dot');
      const x0 = (a.left + a.width / 2 - r0.left) / scale;
      const y0 = (a.top + a.height / 2 - r0.top) / scale;
      const x1 = (b.right - r0.left) / scale;
      const y1 = (b.top + b.height / 2 - r0.top) / scale;
      dot.style.left = `${x0}px`;
      dot.style.top = `${y0}px`;
      root.appendChild(dot);
      k.classList.add('spent');
      requestAnimationFrame(() => {
        dot.style.transform = `translate(${x1 - x0}px, ${y1 - y0}px) scale(0.6)`;
        dot.style.opacity = '0.9';
      });
      later(0.55, () => {
        dot.remove();
        addXp(per);
      });
    });
  });
  later(flyAt + killIcons.length * 0.07 + 0.9, finish);
  return root;
}

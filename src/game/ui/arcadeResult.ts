/**
 * 戰鬥結算（Alan 2026-10-22：做成獨立畫面、有點像大型電玩）：
 * 節奏（Alan 2026-10-22 第二版）：
 * 1. 標題「第 N 章　N-L 完成」（重訪的節點寫「重訪」）。
 * 2. 列出四名英雄的行；陣亡的英雄在這裡倒下，那一行變灰。
 * 3. 一名一名英雄依序列出他打倒的敵人。
 * 4. 一名一名英雄依序讓那些敵人倒下。接著標出 MVP。
 * 5. 一名一名英雄依序讓倒下的敵人變成光點，飛進隊伍等級的經驗值條，條往右長，看最後升幾級。
 * 6. 按「繼續」才去選升級。可以按「略過」直接跳到最後。
 * MVP 的額外獎勵先留鉤子（run/progression.ts 的 mvpReward）。
 */
import { tr } from '../../i18n';
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

const ICON = 48;
/** 節奏（秒）：每一行出現、每個擊殺出現、每個擊殺倒下、每個光點；名與名之間多停一下 */
const PACE = { row: 0.3, dead: 0.5, pop: 0.07, down: 0.09, dot: 0.06, hero: 0.25, stage: 0.4 };

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

/** 英雄的小圖：具名角色用 32×32 頭像（Alan 2026-10-31），其他照 unitIcon */
function heroIcon(scene: Phaser.Scene, u: Unit): HTMLElement {
  if (!u.def.portrait) return unitIcon(scene, u.def.id, 'hero');
  const box = el('div', 'arc-icon hero face');
  box.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/portraits/mini/${u.def.portrait}.png")`;
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
  const title = el('div', 'arc-title', tr("第 {0} 章　{1}-{2}{3}　完成", { 0: ch, 1: ch, 2: node?.layer ?? 1, 3: revisit ? tr("　重訪") : '' }));
  root.appendChild(title);

  // ── 英雄與擊殺 ──
  const heroes = world.units.filter((u) => u.isHero).sort((a, b) => a.heroSlot - b.heroSlot);
  const board = el('div', 'arc-board');
  const killIcons: HTMLElement[] = [];
  const rows = new Map<Unit, HTMLElement>();
  for (const u of heroes) {
    const row = el('div', 'arc-row');
    const who = el('div', 'arc-who');
    who.append(heroIcon(scene, u), el('div', 'arc-name', u.def.name));
    const kills = el('div', 'arc-kills');
    for (const id of u.killList) {
      const k = unitIcon(scene, id, 'kill');
      kills.appendChild(k);
      killIcons.push(k);
    }
    const count = el('div', 'arc-count', `× ${u.killList.length}`);
    row.append(who, kills, count);
    board.appendChild(row);
    rows.set(u, row);
  }
  root.appendChild(board);

  // MVP：打倒最多的（同數比造成傷害）
  const mvp = [...heroes].sort((a, b) => b.killList.length - a.killList.length || b.stats.damageDealt - a.stats.damageDealt)[0];
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
    lvLabel.textContent = tr("隊伍等級 {0}", { 0: level });
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
  const next = button(tr("繼續"), 'primary big', () => {
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
    for (const [u, row] of rows) {
      row.classList.add('in');
      if (u.dead) row.classList.add('fallen');
    }
    for (const k of killIcons) k.classList.add('pop', 'down', 'spent');
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
  const skip = button(tr("略過"), 'small', finish);
  btns.append(skip, next);
  root.appendChild(btns);

  let mvpShown = false;
  const showMvp = () => {
    if (mvpShown || !mvp) return;
    mvpShown = true;
    rows.get(mvp)?.classList.add('mvp');
    const reward = mvpReward(after, mvp.heroSlot);
    mvpLine.textContent = tr("MVP　{0}{1}", { 0: mvp.def.name, 1: reward ? tr("　{0}", { 0: reward }) : '' });
    mvpLine.classList.add('show');
  };
  // ── 時間軸 ──
  let t = 0.6;
  // 2. 每一行出現；陣亡的英雄倒下、整行變灰
  for (const [u, row] of rows) {
    later(t, () => row.classList.add('in'));
    t += PACE.row;
    if (u.dead) {
      later(t, () => row.classList.add('fallen'));
      t += PACE.dead;
    }
  }
  t += PACE.stage;
  // 3. 一名一名列出打倒的敵人
  const byHero = heroes.map((u) => [...rows.get(u)!.querySelectorAll<HTMLElement>('.arc-icon.kill')]);
  for (const ks of byHero) {
    if (!ks.length) continue;
    for (const k of ks) {
      later(t, () => k.classList.add('pop'));
      t += PACE.pop;
    }
    t += PACE.hero;
  }
  t += PACE.stage;
  // 4. 一名一名讓敵人倒下
  for (const ks of byHero) {
    if (!ks.length) continue;
    for (const k of ks) {
      later(t, () => k.classList.add('down'));
      t += PACE.down;
    }
    t += PACE.hero;
  }
  t += PACE.stage;
  later(t, showMvp);
  t += 1.0;

  // 5. 一名一名讓倒下的敵人變成光點飛進經驗值條，一個一個加經驗值
  later(t - 0.4, () => xpBox.classList.add('show'));
  const per = killIcons.length ? gained / killIcons.length : 0;
  if (killIcons.length === 0 && gained > 0) later(t, () => addXp(gained));
  const flights: { k: HTMLElement; at: number }[] = [];
  for (const ks of byHero) {
    if (!ks.length) continue;
    for (const k of ks) {
      flights.push({ k, at: t });
      t += PACE.dot;
    }
    t += PACE.hero;
  }
  flights.forEach(({ k, at }) => {
    later(at, () => {
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
  later(t + 0.9, finish);
  return root;
}

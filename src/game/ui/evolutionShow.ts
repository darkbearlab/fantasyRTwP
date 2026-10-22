/**
 * 昇變演出（SPEC_CLASSES §5）：剛昇變的英雄在戰果畫面或路線圖上播一小段——
 * 舊外觀閃光換成新外觀，加上職業名、一句台詞、拿到的昇變被動。看完（點「繼續」）就從遠征狀態清掉。
 */
import type Phaser from 'phaser';
import { CLASS_PASSIVES, PASSIVES } from '../../sim/data/passives';
import { HEROES } from '../../sim/data/heroes';
import { SKILLS } from '../../sim/data/skills';
import { activeSkillOf, deliberateSkillsOf } from '../../run/loadout';
import { cloneRun } from '../../run/runState';
import { portraitSheetUrl } from '../render/pixelArt';
import { getArt } from '../render/art';
import { getRun, setRun } from '../runFlow';
import { button, el } from './dom';
import { VFX_SHEETS, VFX_USE, vfxFrame } from '../render/vfxData';

function sprite(scene: Phaser.Scene, classId: string, cls: string): HTMLElement {
  const box = el('div', `evo-portrait ${cls}`);
  const url = getArt() === 'pixel' ? portraitSheetUrl(scene, classId) : undefined;
  if (url) {
    const s = el('div', 'evo-sprite');
    s.style.backgroundImage = `url("${url}")`;
    box.appendChild(s);
  } else box.appendChild(el('div', 'evo-letter', HEROES[classId].letter));
  return box;
}

/** 有待演出的昇變就蓋一層在畫面上；全部看完後呼叫 onDone */
export function showEvolutions(scene: Phaser.Scene, root: HTMLElement, onDone?: () => void): void {
  const run = getRun(scene);
  const ev = run.evolutionShow?.[0];
  if (!ev) return;
  const overlay = el('div', 'evo-overlay');
  const card = el('div', 'evo-card');
  const pics = el('div', 'evo-pics');
  const after = sprite(scene, ev.to, 'new');
  pics.append(sprite(scene, ev.from, 'old'), el('div', 'evo-arrow', '➜'), after);
  // 昇變閃光：逐格特效疊在新外觀上（素材 session 建議 33、38，染成金色；沒有素材時只剩 CSS 的閃光）
  VFX_USE.evolve.forEach((u, k) => {
    const n = VFX_SHEETS[u.id]?.frames ?? 0;
    if (!n) return;
    const img = document.createElement('img');
    img.className = 'evo-vfx';
    img.style.animationDelay = `${k * 0.12}s`;
    let i = 0;
    img.src = `assets/licensed/${vfxFrame(u.id, 0)}`;
    img.onerror = () => img.remove();
    const tick = window.setInterval(() => {
      i++;
      if (i >= n) {
        window.clearInterval(tick);
        img.remove();
        return;
      }
      img.src = `assets/licensed/${vfxFrame(u.id, i)}`;
    }, 1000 / 12 + k * 20);
    after.appendChild(img);
  });
  // 昇變後新拿到的被動與主動
  const gained = (CLASS_PASSIVES[ev.to] ?? []).filter((id) => !(CLASS_PASSIVES[ev.from] ?? []).includes(id));
  const list = el('div', 'evo-gains');
  for (const id of gained) list.appendChild(el('div', 'evo-gain', `◆ ${PASSIVES[id].name}：${PASSIVES[id].description}`));
  const skills = deliberateSkillsOf(ev.to);
  if (skills.join() !== deliberateSkillsOf(ev.from).join() || activeSkillOf(ev.to) !== activeSkillOf(ev.from))
    list.appendChild(el('div', 'evo-gain', `◆ 主動：${skills.map((s) => SKILLS[s].name).join(' → ')}`));
  card.append(
    el('div', 'evo-title', '昇變！'),
    pics,
    el('div', 'evo-name', `${HEROES[ev.from].name} → ${HEROES[ev.to].name}`),
    el('div', 'evo-line', `「${ev.line}」`),
    list,
  );
  const row = el('div', 'btn-row');
  row.appendChild(
    button('繼續', 'primary', () => {
      const r = cloneRun(getRun(scene));
      r.evolutionShow = (r.evolutionShow ?? []).slice(1);
      if (r.evolutionShow.length === 0) delete r.evolutionShow;
      setRun(scene, r);
      overlay.remove();
      if (r.evolutionShow) showEvolutions(scene, root, onDone);
      else onDone?.();
    }),
  );
  card.appendChild(row);
  overlay.appendChild(card);
  root.appendChild(overlay);
}

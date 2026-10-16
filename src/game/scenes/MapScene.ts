import { ENCOUNTERS } from '../../run/data/encounters';
import type { MapNode } from '../../run/mapGen';
import { NODE_ICON, NODE_LABEL } from '../../run/mapGen';
import { availableNodes, chooseNode, pickEncounter, setHeroPersonality } from '../../run/progression';
import { el, noFocus } from '../ui/dom';
import { partyPanel } from '../ui/partyPanel';
import { advance, getRun, setRun } from '../runFlow';
import { DomScene } from './DomScene';

const NODE_DESC: Record<string, string> = {
  battle: '一般戰鬥。勝利後獲得金幣與強化。',
  elite: '精英戰：敵人帶著隊長。獎勵四選一，保證一個稀有強化。',
  event: '未知的遭遇。',
  rest: '休息：紮營回血、救回陣亡者或訓練；也可以招募。',
  boss: '戰爭領主。擊敗他就結束這趟遠征。',
};

/** 路線圖（SPEC_SLICE2 §2.3）：左側隊伍面板、右側分層節點 */
export class MapScene extends DomScene {
  protected screenClass = 'map-screen';

  constructor() {
    super('Map');
  }

  protected build(): void {
    const run = getRun(this);
    const side = el('div', 'map-side');
    side.append(el('div', 'map-title', '遠征'), el('div', 'gold', `💰 ${run.gold} 金幣`));
    side.appendChild(
      partyPanel(run, {
        onPersonality: (slot, p) => {
          setRun(this, setHeroPersonality(getRun(this), slot, p));
          this.rebuild();
        },
      }),
    );
    const layer = run.currentNodeId === null ? 0 : run.map.nodes[run.currentNodeId].layer;
    side.appendChild(el('div', 'map-progress', `第 ${layer} / ${run.map.layerCount} 層　·　種子 ${run.seed}`));
    if (run.nextBattleBuff) side.appendChild(el('div', 'buff-note', '下一場戰鬥有事件加成'));
    const journal = el('div', 'journal');
    for (const j of run.journal.slice(-6)) journal.appendChild(el('div', '', j));
    side.appendChild(journal);

    const area = el('div', 'map-area');
    const W = 940;
    const H = 640;
    const L = run.map.layerCount;
    const pos = (n: MapNode) => {
      const ids = run.map.layers[n.layer - 1];
      const x = 50 + ((n.layer - 1) / (L - 1)) * (W - 100);
      const y = H / 2 + (n.index - (ids.length - 1) / 2) * 170;
      return { x, y };
    };
    const avail = new Set(availableNodes(run).map((n) => n.id));
    const visited = new Set(run.path);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.classList.add('map-lines');
    for (const n of run.map.nodes) {
      for (const t of n.next) {
        const a = pos(n);
        const b = pos(run.map.nodes[t]);
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(a.x));
        line.setAttribute('y1', String(a.y));
        line.setAttribute('x2', String(b.x));
        line.setAttribute('y2', String(b.y));
        const walked = visited.has(n.id) && visited.has(t) && run.path.indexOf(t) === run.path.indexOf(n.id) + 1;
        const open = n.id === run.currentNodeId && avail.has(t);
        line.setAttribute('class', walked ? 'walked' : open ? 'open' : '');
        svg.appendChild(line);
      }
    }
    area.appendChild(svg);
    const tip = el('div', 'map-tip');
    for (const n of run.map.nodes) {
      const p = pos(n);
      const b = el('div', `map-node t-${n.type}`, NODE_ICON[n.type]);
      b.style.left = `${p.x}px`;
      b.style.top = `${p.y}px`;
      if (visited.has(n.id)) b.classList.add('visited');
      if (n.id === run.currentNodeId) b.classList.add('current');
      if (avail.has(n.id)) b.classList.add('available');
      else if (!visited.has(n.id)) b.classList.add('locked');
      noFocus(b);
      b.addEventListener('mouseenter', () => {
        let text = `<b>${NODE_LABEL[n.type]}</b>（第 ${n.layer} 層）<br>${NODE_DESC[n.type]}`;
        if (n.type === 'battle' || n.type === 'elite' || n.type === 'boss') {
          const enc = ENCOUNTERS[pickEncounter(run, n)];
          text += `<br>難度 ${'★'.repeat(enc.difficulty)}${'☆'.repeat(Math.max(0, 5 - enc.difficulty))}`;
        }
        tip.innerHTML = text;
        tip.style.left = `${p.x + 36}px`;
        tip.style.top = `${p.y - 20}px`;
        tip.classList.add('show');
      });
      b.addEventListener('mouseleave', () => tip.classList.remove('show'));
      if (avail.has(n.id)) b.addEventListener('click', () => advance(this, chooseNode(getRun(this), n.id)));
      area.appendChild(b);
    }
    area.appendChild(tip);
    this.root.append(side, area);
  }
}

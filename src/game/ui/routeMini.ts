/**
 * 戰鬥中的迷你路線圖（Alan 2026-10-21：出口要看得出通到大地圖的哪裡）。
 * 上方 🗺 鈕打開／收起；畫出整張路線圖（由下往上推進，和直拿的路線圖一樣），
 * 標出目前所在的節點、魔王主力、冠軍，以及每個出口通往的節點（和地上的出口方塊同一個字母與顏色）。
 * 點地上的出口方塊時，對應的節點會閃一下（session.exitPing）。
 */
import { tr } from '../../i18n';
import { NODE_ICON } from '../../run/mapGen';
import type { RunState } from '../../run/runState';
import type { ExitInfo } from '../exitInfo';
import type { BattleSession } from '../session';
import { el } from './dom';

const W = 210;
const H = 250;
const SVG = 'http://www.w3.org/2000/svg';

export class RouteMini {
  readonly root: HTMLElement;
  private nodes = new Map<number, SVGElement>();
  private exitNode = new Map<string, number>();
  private pingUntil = 0;

  constructor() {
    this.root = el('div', 'route-mini');
  }

  /** 依遠征狀態畫一次（換場戰鬥時重畫） */
  build(run: RunState, infos: ExitInfo[]): void {
    this.root.innerHTML = '';
    this.nodes.clear();
    this.exitNode.clear();
    const map = run.map;
    const L = map.layerCount;
    const most = Math.max(...map.layers.map((l) => l.length));
    const pos = (id: number) => {
      const n = map.nodes[id];
      const ids = map.layers[n.layer - 1];
      const off = n.index - (ids.length - 1) / 2;
      return { x: W / 2 + off * Math.min(44, (W - 30) / Math.max(1, most - 1)), y: H - 16 - ((n.layer - 1) / (L - 1)) * (H - 32) };
    };
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    const ow = run.overworld;
    const cur = run.phase.kind === 'battle' ? run.phase.nodeId : run.currentNodeId;
    for (const n of map.nodes)
      for (const t of n.links ? n.links.filter((x) => x > n.id) : n.next) {
        const a = pos(n.id);
        const b = pos(t);
        const line = document.createElementNS(SVG, 'line');
        line.setAttribute('x1', String(a.x));
        line.setAttribute('y1', String(a.y));
        line.setAttribute('x2', String(b.x));
        line.setAttribute('y2', String(b.y));
        line.setAttribute('class', 'rm-line');
        svg.appendChild(line);
      }
    const exitOf = new Map<number, ExitInfo>();
    for (const info of infos) if (info.nodeId !== undefined) (exitOf.set(info.nodeId, info), this.exitNode.set(info.id, info.nodeId));
    for (const n of map.nodes) {
      const p = pos(n.id);
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('transform', `translate(${p.x},${p.y})`);
      const occupied = ow?.force.includes(n.id) && n.type !== 'boss';
      const ex = exitOf.get(n.id);
      const c = document.createElementNS(SVG, 'circle');
      c.setAttribute('r', '9');
      c.setAttribute('class', `rm-node${occupied ? ' occupied' : ''}${n.id === cur ? ' current' : ''}${run.path.includes(n.id) ? ' visited' : ''}`);
      if (ex) {
        c.setAttribute('stroke', ex.css);
        c.setAttribute('stroke-width', '3');
      }
      g.appendChild(c);
      const icon = document.createElementNS(SVG, 'text');
      icon.setAttribute('class', 'rm-icon');
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('dy', '4');
      icon.textContent = NODE_ICON[n.type];
      g.appendChild(icon);
      if (ex) {
        const tag = document.createElementNS(SVG, 'text');
        tag.setAttribute('class', 'rm-letter');
        tag.setAttribute('x', '12');
        tag.setAttribute('dy', '-6');
        tag.setAttribute('fill', ex.css);
        tag.textContent = ex.letter;
        g.appendChild(tag);
      }
      if (ow && ow.champion.node === n.id) {
        const ch = document.createElementNS(SVG, 'text');
        ch.setAttribute('class', 'rm-icon');
        ch.setAttribute('x', '-14');
        ch.setAttribute('dy', '-6');
        ch.textContent = '👹';
        g.appendChild(ch);
      }
      svg.appendChild(g);
      this.nodes.set(n.id, c);
    }
    this.root.appendChild(el('div', 'rm-legend', tr("字母＝出口通往的節點・☠ 紅色＝主力佔領")));
    this.root.appendChild(svg);
  }

  /** 每幀：開關、點到出口時閃一下 */
  update(s: BattleSession, now: number): void {
    const ping = s.exitPing;
    if (ping) {
      s.routeOpen = true;
      this.pingUntil = now + 1600;
      const id = this.exitNode.get(ping.id);
      for (const [nid, c] of this.nodes) c.classList.toggle('ping', nid === id);
      s.exitPing = null;
    }
    if (this.pingUntil && now > this.pingUntil) {
      this.pingUntil = 0;
      for (const c of this.nodes.values()) c.classList.remove('ping');
    }
    this.root.classList.toggle('open', s.routeOpen);
  }
}

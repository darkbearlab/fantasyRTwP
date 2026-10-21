import { ENCOUNTERS } from '../../run/data/encounters';
import { isGeneratedEncounter } from '../../run/battle';
import type { LevelTier } from '../../run/levelGen';
import { levelDifficulty } from '../../run/levelGen';
import type { MapNode } from '../../run/mapGen';
import { NODE_ICON, NODE_LABEL } from '../../run/mapGen';
import { availableNodes, chooseNode, pickEncounter, setHeroPersonality } from '../../run/progression';
import { button, el, noFocus } from '../ui/dom';
import { bagPanel } from '../ui/bagPanel';
import { partyPanel } from '../ui/partyPanel';
import { swapHeroSlots, swapSkillOrder } from '../../run/classes';
import { advance, getRun, setRun } from '../runFlow';
import { DomScene } from './DomScene';
import { xpBar } from '../ui/xpBar';
import { ROUTE_MAP } from '../../run/data/routeMap';
import { showEvolutions } from '../ui/evolutionShow';

const NODE_DESC: Record<string, string> = {
  battle: '一般戰鬥。勝利後獲得金幣與強化。',
  elite: '精英戰：敵人帶著隊長。獎勵四選一，保證一個稀有強化。',
  event: '未知的遭遇。',
  rest: '休息：紮營回血、救回陣亡者或訓練；也可以招募。',
  boss: '戰爭領主。擊敗他就結束這趟遠征。',
  shop: '商人：用金幣買道具（每件道具提供一個被動）。',
};

/** 路線圖（SPEC_SLICE2 §2.3）：左側隊伍面板、右側分層節點 */
export class MapScene extends DomScene {
  protected screenClass = 'map-screen';
  /** 背包面板是否打開 */
  private bagOpen = false;

  constructor() {
    super('Map');
  }

  protected build(): void {
    const run = getRun(this);
    const side = el('div', 'map-side');
    side.append(el('div', 'map-title', '遠征'), el('div', 'gold', `💰 ${run.gold} 金幣`));
    // 隊伍等級與經驗值（SPEC_SLICE6 §3，沉穩節奏）
    if (run.style === 'deliberate') side.appendChild(xpBar(run));
    side.appendChild(
      partyPanel(run, {
        onPersonality: (slot, p) => {
          setRun(this, setHeroPersonality(getRun(this), slot, p));
          this.rebuild();
        },
        onSwapHero: (a, b) => {
          setRun(this, swapHeroSlots(getRun(this), a, b));
          this.rebuild();
        },
        onSwapSkill: (slot, a, b) => {
          setRun(this, swapSkillOrder(getRun(this), slot, a, b));
          this.rebuild();
        },
      }),
    );
    // 背包與裝備（沉穩節奏，SPEC_SLICE5 §17）
    if (run.style === 'deliberate') {
      const n = (run.inventory?.length ?? 0) + (run.bag?.length ?? 0);
      side.appendChild(
        button(this.bagOpen ? '收起背包' : `🎒 背包與裝備${n ? `（${n}）` : ''}`, 'small bag-toggle', () => {
          this.bagOpen = !this.bagOpen;
          this.rebuild();
        }),
      );
      if (this.bagOpen)
        side.appendChild(
          bagPanel(run, (r) => {
            setRun(this, r);
            this.rebuild();
          }),
        );
    }
    const layer = run.currentNodeId === null ? 0 : run.map.nodes[run.currentNodeId].layer;
    side.appendChild(el('div', 'map-progress', `第 ${layer} / ${run.map.layerCount} 層　·　種子 ${run.seed}`));
    // FTL 式路線圖（SPEC_SLICE6 §4）：回合、主力、冠軍
    const ow = run.overworld;
    if (ow) {
      const c = ow.champion;
      const champ = c.node === null ? `冠軍：重整中（第 ${c.respawnAt} 回合回來）` : c.hunting ? '冠軍：發現你了，正在追擊！' : '冠軍：在圖上遊蕩';
      const box = el('div', 'ow-status');
      box.append(el('div', '', `第 ${ow.turn} 回合　·　魔王主力佔領 ${ow.force.length} 個節點（每 ${ROUTE_MAP.force.spreadEvery} 回合擴散）`), el('div', c.hunting && c.node !== null ? 'ow-hunt' : '', champ));
      side.appendChild(box);
    }
    if (run.nextBattleBuff) side.appendChild(el('div', 'buff-note', '下一場戰鬥有事件加成'));
    const journal = el('div', 'journal');
    for (const j of run.journal.slice(-6)) journal.appendChild(el('div', '', j));
    side.appendChild(journal);

    const area = el('div', 'map-area');
    // 直拿（行動版）：路線圖改成由下往上推進，隊伍面板放在下面
    const portrait = this.scale.width < this.scale.height;
    const W = portrait ? this.scale.width - 24 : 940;
    const H = portrait ? Math.max(560, this.scale.height - 140) : 640;
    const L = run.map.layerCount;
    const pos = (n: MapNode) => {
      const ids = run.map.layers[n.layer - 1];
      const off = n.index - (ids.length - 1) / 2;
      // 每層最多幾個節點決定間距（FTL 式路線圖比較寬）
      const most = Math.max(...run.map.layers.map((l) => l.length));
      if (portrait) return { x: W / 2 + off * Math.min(130, (W - 60) / Math.max(1, most - 1)), y: H - 40 - ((n.layer - 1) / (L - 1)) * (H - 80) };
      const x = 50 + ((n.layer - 1) / (L - 1)) * (W - 100);
      const y = H / 2 + off * Math.min(170, (H - 80) / Math.max(1, most - 1));
      return { x, y };
    };
    area.style.width = `${W}px`;
    area.style.height = `${H}px`;
    const avail = new Set(availableNodes(run).map((n) => n.id));
    const visited = new Set(run.path);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.classList.add('map-lines');
    for (const n of run.map.nodes) {
      // 雙向的路線圖每條線只畫一次
      for (const t of n.links ? n.links.filter((x) => x > n.id) : n.next) {
        const a = pos(n);
        const b = pos(run.map.nodes[t]);
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(a.x));
        line.setAttribute('y1', String(a.y));
        line.setAttribute('x2', String(b.x));
        line.setAttribute('y2', String(b.y));
        const walked = run.path.some((id, i) => i > 0 && ((run.path[i - 1] === n.id && id === t) || (run.path[i - 1] === t && id === n.id)));
        const open = (n.id === run.currentNodeId && avail.has(t)) || (t === run.currentNodeId && avail.has(n.id));
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
      if (ow?.force.includes(n.id)) b.classList.add('occupied');
      if (ow && ow.champion.node === n.id) {
        const badge = el('span', `champ-badge${ow.champion.hunting ? ' hunting' : ''}`, '👹');
        b.appendChild(badge);
      }
      noFocus(b);
      const showTip = () => {
        let text = `<b>${NODE_LABEL[n.type]}</b>（第 ${n.layer} 層）<br>${NODE_DESC[n.type]}`;
        if (ow?.force.includes(n.id) && n.type !== 'boss') text += '<br><span class="ow-hunt">被魔王的主力佔領：進去會遇到更強的敵人</span>';
        if (ow && ow.champion.node === n.id) text += '<br><span class="ow-hunt">魔王的冠軍在這裡</span>';
        if (ow && (ow.visits[n.id] ?? 0) > 0) text += `<br>已經來過 ${ow.visits[n.id]} 次（重新來會遇到新的敵人，主力也會往這裡蔓延）`;
        if (n.type === 'battle' || n.type === 'elite' || n.type === 'boss') {
          const id = pickEncounter(run, n);
          // 大型關卡進場時才生成；預覽只算難度
          const difficulty = isGeneratedEncounter(id) ? levelDifficulty(n.type as LevelTier, n.layer) : ENCOUNTERS[id].difficulty;
          text += `<br>難度 ${'★'.repeat(difficulty)}${'☆'.repeat(Math.max(0, 5 - difficulty))}`;
        }
        tip.innerHTML = text;
        tip.style.left = `${p.x + 36}px`;
        tip.style.top = `${p.y - 20}px`;
        tip.classList.add('show');
        tip.dataset.node = String(n.id);
      };
      // 只有真的滑鼠才用「移上」顯示說明（觸控點擊時瀏覽器也會補發滑鼠移入事件）
      let touch = false;
      b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && showTip());
      b.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && tip.classList.remove('show'));
      b.addEventListener('pointerdown', (e) => (touch = e.pointerType !== 'mouse'));
      // 觸控：第一下顯示說明，第二下才前往
      b.addEventListener('click', () => {
        if (touch && tip.dataset.node !== String(n.id)) {
          showTip();
          return;
        }
        if (avail.has(n.id)) advance(this, chooseNode(getRun(this), n.id));
      });
      area.appendChild(b);
    }
    area.appendChild(tip);
    if (portrait) this.root.append(area, side);
    else this.root.append(side, area);
    // 昇變演出（SPEC_CLASSES §5）
    showEvolutions(this, this.root);
  }
}

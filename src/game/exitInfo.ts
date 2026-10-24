/**
 * 出口通往哪裡（Alan 2026-10-21：戰鬥地圖的出口要看得出這條路通到大地圖的哪裡）。
 * 每個出口一個字母和顏色（地上的方塊、出口文字、迷你路線圖用同一組），文字寫方向、類型、層數與危險。
 */
import { tr } from '../i18n';
import { NODE_ICON, NODE_LABEL } from '../run/mapGen';
import type { RunState } from '../run/runState';
import type { World } from '../sim/world';
import type { PathPreview } from '../run/journey';
import { previewOf } from '../run/journey';

/** 出口預告的文字（SPEC_SLICE7 §1）：威脅、敵人以外的氣息、可能取得的東西；不說節點類型 */
export function previewLines(p: PathPreview): string[] {
  const out: string[] = [];
  if (p.threat === 'boss') out.push(tr("💀 頭目"));
  else if (p.threat === 'elite') out.push(tr("⚔ 精英"));
  if (p.presence) out.push(tr("✨ 前方有敵人以外的氣息"));
  if (p.loot.length) out.push(tr("可能有：{0}", { 0: p.loot.join(tr("、")) }));
  return out;
}

export interface ExitInfo {
  id: string;
  /** 通往的節點（遠征中才有） */
  nodeId?: number;
  letter: string;
  color: number;
  css: string;
  /** 第一行：字母、方向、節點類型 */
  title: string;
  /** 第二行：層數與危險 */
  detail: string;
  /** 回程（通往較前面的層） */
  back: boolean;
}

/** 出口的顏色（依序給 A、B、C…） */
export const EXIT_COLORS = [0xffd23f, 0x4fc3f7, 0xff8a65, 0xb388ff, 0x81c784, 0xf06292];

const ARROW: Record<string, string> = { top: '↑', bottom: '↓', left: '←', right: '→' };

export function exitInfos(world: World, run: RunState | null): ExitInfo[] {
  const cur = run && run.phase.kind === 'battle' ? run.map.nodes[run.phase.nodeId] : null;
  const ow = run?.overworld;
  return (world.map.exits ?? []).map((e, i) => {
    const color = EXIT_COLORS[i % EXIT_COLORS.length];
    const css = `#${color.toString(16).padStart(6, '0')}`;
    const letter = String.fromCharCode(65 + i);
    const m = e.id.match(/^node:(\d+)$/);
    const nodeId = m ? Number(m[1]) : undefined;
    const node = run && nodeId !== undefined ? run.map.nodes[nodeId] : null;
    // 一路向前：只預告地形、威脅、氣息與可能取得的東西
    if (run?.forward && node) {
      const p = previewOf(run, node.id);
      return { id: e.id, nodeId, letter, color, css, title: `${letter} ${ARROW[e.edge ?? 'top'] ?? ''} ${p.terrain}`, detail: previewLines(p).join('\n'), back: false };
    }
    const type = (node?.type ?? e.label) as keyof typeof NODE_LABEL | undefined;
    const kind = type && NODE_LABEL[type] ? `${NODE_ICON[type]} ${NODE_LABEL[type]}` : tr("出口");
    const title = `${letter} ${ARROW[e.edge ?? 'top'] ?? ''} ${kind}`;
    const parts: string[] = [];
    if (node && cur) parts.push(node.layer === cur.layer ? tr("同一層") : node.layer > cur.layer ? tr("第 {0} 層", { 0: node.layer }) : tr("回第 {0} 層", { 0: node.layer }));
    if (node && ow?.force.includes(node.id) && node.type !== 'boss') parts.push(tr("☠ 主力佔領"));
    if (node && ow && ow.champion.node === node.id) parts.push(tr("👹 冠軍在那裡"));
    if (node && ow && (ow.visits[node.id] ?? 0) > 0) parts.push(tr("去過"));
    const back = !!(node && cur && node.layer < cur.layer);
    return { id: e.id, nodeId, letter, color, css, title, detail: parts.join('・'), back };
  });
}

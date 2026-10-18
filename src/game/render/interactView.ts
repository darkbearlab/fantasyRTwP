/**
 * 互動物件的外觀（門、拉桿；SPEC_SLICE4 §15.1）。只讀 sim 的狀態，不改 sim。
 * 等角模式：門關著時是立體木門（每公尺一段，各自依深度排序），打開時只剩兩側門柱；拉桿是底座＋把手。
 * 正俯視模式：畫成地面上的矩形。
 */
import type Phaser from 'phaser';
import type { InteractableState } from '../../sim/interact';
import type { World } from '../../sim/world';
import { darken, lighten } from './palette';
import { depthOf, groundRect, isIso, worldToScreen } from './projection';
import { OBJECT_DEPTH_BASE } from './unitView';

/** 外觀設定（畫面用，不放進 sim 資料） */
export const INTERACT_VISUAL = {
  doorHeight: 2.4,
  doorColor: 0x7a5530,
  lockedColor: 0x5d5f66,
  postWidth: 0.25,
  leverHeight: 0.9,
  leverColor: 0x8d7a5a,
  leverUsedColor: 0x4f8f5a,
  hoverColor: 0xffe066,
};

/** 畫一個立體方塊（側面依投影旋轉決定看得到哪幾面，最後畫頂面）；回傳畫面上的外框 */
export function drawBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, d: number, h: number, color: number, edge?: number): { x0: number; x1: number; y0: number; y1: number } {
  const P = (px: number, py: number, pz: number) => worldToScreen(px, py, pz);
  const poly = (pts: { x: number; y: number }[], fill: number) => {
    g.fillStyle(fill, 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, edge ?? darken(color, 0.45), 0.9);
    g.strokePath();
  };
  const o = worldToScreen(0, 0);
  const faces: { n: [number, number]; a: [number, number]; b: [number, number] }[] = [
    { n: [1, 0], a: [x + w, y], b: [x + w, y + d] },
    { n: [0, 1], a: [x, y + d], b: [x + w, y + d] },
    { n: [-1, 0], a: [x, y], b: [x, y + d] },
    { n: [0, -1], a: [x, y], b: [x + w, y] },
  ];
  for (const f of faces) {
    const ns = worldToScreen(f.n[0], f.n[1]);
    if (ns.y - o.y <= 0) continue;
    const shade = ns.x - o.x > 0 ? 0.8 : 0.62;
    poly([P(f.a[0], f.a[1], 0), P(f.b[0], f.b[1], 0), P(f.b[0], f.b[1], h), P(f.a[0], f.a[1], h)], darken(color, shade));
  }
  poly([P(x, y, h), P(x + w, y, h), P(x + w, y + d, h), P(x, y + d, h)], lighten(color, 1.2));
  const pts = [P(x, y, 0), P(x + w, y, 0), P(x + w, y + d, 0), P(x, y + d, 0), P(x, y, h), P(x + w, y, h), P(x + w, y + d, h), P(x, y + d, h)];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

interface Piece {
  state: InteractableState;
  objs: Phaser.GameObjects.Graphics[];
  /** 畫面上的點選範圍（每一塊的外框；打開的門只有門柱，門洞照常可以點地面移動） */
  bounds: { x0: number; x1: number; y0: number; y1: number }[];
  drawnOpen: boolean;
  drawnHover: boolean;
}

export class InteractablesView {
  private pieces: Piece[] = [];
  private version = -1;

  constructor(
    private scene: Phaser.Scene,
    private world: World,
  ) {
    for (const s of world.interactables.list) this.pieces.push({ state: s, objs: [], bounds: [], drawnOpen: !s.open, drawnHover: false });
  }

  /** 狀態或滑鼠移上的物件改變時重畫 */
  update(hoverId: string | null): void {
    const v = this.world.interactables.version;
    for (const p of this.pieces) {
      const hover = p.state.def.id === hoverId;
      if (v === this.version && p.drawnOpen === p.state.open && p.drawnHover === hover) continue;
      this.draw(p, hover);
    }
    this.version = v;
  }

  /** 畫面座標下的互動物件（取最前面的） */
  objectAtScreen(sx: number, sy: number): InteractableState | undefined {
    let best: InteractableState | undefined;
    let bestD = -Infinity;
    for (const p of this.pieces) {
      const pad = 4;
      if (!p.bounds.some((b) => sx >= b.x0 - pad && sx <= b.x1 + pad && sy >= b.y0 - pad && sy <= b.y1 + pad)) continue;
      const d = p.state.def;
      const depth = depthOf(d.x + d.w / 2, d.y + d.h / 2);
      if (depth > bestD) {
        bestD = depth;
        best = p.state;
      }
    }
    return best;
  }

  /** 物件上方（名稱提示用）的畫面座標 */
  labelPoint(s: InteractableState): { x: number; y: number } {
    const d = s.def;
    const h = d.kind === 'door' && !s.open ? INTERACT_VISUAL.doorHeight : INTERACT_VISUAL.leverHeight;
    return worldToScreen(d.x + d.w / 2, d.y + d.h / 2, h + 0.4);
  }

  destroy(): void {
    for (const p of this.pieces) for (const o of p.objs) o.destroy();
    this.pieces = [];
  }

  private draw(p: Piece, hover: boolean): void {
    for (const o of p.objs) o.destroy();
    p.objs = [];
    p.drawnOpen = p.state.open;
    p.drawnHover = hover;
    const d = p.state.def;
    const V = INTERACT_VISUAL;
    const edge = hover ? V.hoverColor : undefined;
    const boxes: { x: number; y: number; w: number; d: number; h: number; color: number }[] = [];
    if (d.kind === 'door') {
      const color = d.locked ? V.lockedColor : V.doorColor;
      if (!p.state.open) {
        // 每公尺一段，各自依深度排序（和障礙物方塊一樣）
        for (let x = d.x; x < d.x + d.w - 1e-6; x += 1) {
          for (let y = d.y; y < d.y + d.h - 1e-6; y += 1) boxes.push({ x, y, w: Math.min(1, d.x + d.w - x), d: Math.min(1, d.y + d.h - y), h: V.doorHeight, color });
        }
      } else {
        // 打開：只剩兩端的門柱
        const pw = V.postWidth;
        if (d.h >= d.w) {
          boxes.push({ x: d.x, y: d.y, w: d.w, d: pw, h: V.doorHeight, color }, { x: d.x, y: d.y + d.h - pw, w: d.w, d: pw, h: V.doorHeight, color });
        } else {
          boxes.push({ x: d.x, y: d.y, w: pw, d: d.h, h: V.doorHeight, color }, { x: d.x + d.w - pw, y: d.y, w: pw, d: d.h, h: V.doorHeight, color });
        }
      }
    } else {
      boxes.push({ x: d.x, y: d.y, w: d.w, d: d.h, h: 0.25, color: darken(V.leverColor, 0.8) });
      // 把手：拉下前直立，拉下後變綠、變矮
      const pulled = p.state.open;
      const s = Math.min(d.w, d.h) * 0.3;
      boxes.push({ x: d.x + d.w / 2 - s / 2, y: d.y + d.h / 2 - s / 2, w: s, d: s, h: pulled ? 0.45 : V.leverHeight, color: pulled ? V.leverUsedColor : V.leverColor });
    }
    p.bounds = [];
    for (const k of boxes) {
      const g = this.scene.add.graphics();
      if (isIso()) {
        p.bounds.push(drawBox(g, k.x, k.y, k.w, k.d, k.h, k.color, edge));
        g.setDepth(OBJECT_DEPTH_BASE + depthOf(k.x + k.w / 2, k.y + k.d / 2));
      } else {
        groundRect(g, k.x, k.y, k.w, k.d, { fill: k.color, stroke: edge ?? darken(k.color, 0.5), width: 2 });
        g.setDepth(4);
        const a = worldToScreen(k.x, k.y);
        const c = worldToScreen(k.x + k.w, k.y + k.d);
        p.bounds.push({ x0: Math.min(a.x, c.x), x1: Math.max(a.x, c.x), y0: Math.min(a.y, c.y), y1: Math.max(a.y, c.y) });
      }
      p.objs.push(g);
    }
  }
}

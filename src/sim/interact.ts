/**
 * 互動物件（SPEC_SLICE4 §15.1）：通用的「互動 → 觸發動作」。
 * 目前有門與拉桿；之後的寶箱、可撿取的道具沿用同一套（互動 → 執行 actions、記錄互動次數給波次觸發）。
 * 門關著時視為障礙物：導航格子、視線格子、流場都會即時更新（原地改寫，所有引用同一份格子的系統自動跟上）。
 */
import { INTERACT } from './data/interact';
import type { InteractAction, InteractableDef, Rect } from './data/types';
import type { Vec } from './math';
import type { Unit } from './unit';

export interface InteractableState {
  readonly def: InteractableDef;
  /** 門：是否打開（拉桿：是否已拉下） */
  open: boolean;
  /** 被英雄互動過幾次 */
  uses: number;
}

export class Interactables {
  readonly list: InteractableState[];
  private byId = new Map<string, InteractableState>();
  /** 門的狀態改變次數（畫面據此重畫） */
  version = 0;

  constructor(defs: InteractableDef[]) {
    this.list = defs.map((def) => ({ def, open: def.kind === 'door' ? !!def.open : false, uses: 0 }));
    for (const s of this.list) this.byId.set(s.def.id, s);
  }

  get(id: string): InteractableState | undefined {
    return this.byId.get(id);
  }

  /** 關著的門（當作障礙物） */
  closedDoors(): Rect[] {
    return this.list.filter((s) => s.def.kind === 'door' && !s.open).map((s) => rectOf(s.def));
  }

  /** 玩家能不能和它互動（上鎖的門、用過的一次性物件不行） */
  usable(s: InteractableState): boolean {
    if (s.def.locked) return false;
    if (isOnce(s.def) && s.uses > 0) return false;
    return true;
  }

  /** 互動後要執行的動作（門省略時是切換自己） */
  actionsOf(s: InteractableState): InteractAction[] {
    if (s.def.actions) return s.def.actions;
    return s.def.kind === 'door' ? [{ type: 'toggleDoor', door: s.def.id }] : [];
  }
}

export function isOnce(def: InteractableDef): boolean {
  return def.once ?? def.kind !== 'door';
}

export function rectOf(d: InteractableDef): Rect {
  return { x: d.x, y: d.y, w: d.w, h: d.h };
}

/** 點到矩形的距離（在矩形內為 0） */
export function distToRect(p: Vec, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** 單位是否在互動距離內 */
export function inInteractRange(u: Unit, d: InteractableDef): boolean {
  return distToRect(u.pos, rectOf(d)) <= u.radius + INTERACT.range;
}

/** 走過去互動的站位：矩形上離單位最近的點，往單位那一側退出半徑＋一點距離 */
export function approachPoint(u: Unit, d: InteractableDef): Vec {
  const r = rectOf(d);
  const cx = Math.max(r.x, Math.min(r.x + r.w, u.pos.x));
  const cy = Math.max(r.y, Math.min(r.y + r.h, u.pos.y));
  let nx = u.pos.x - cx;
  let ny = u.pos.y - cy;
  let len = Math.hypot(nx, ny);
  if (len < 1e-6) {
    // 單位在範圍內（開著的門口）：往矩形中心反方向退
    nx = u.pos.x - (r.x + r.w / 2);
    ny = u.pos.y - (r.y + r.h / 2);
    len = Math.hypot(nx, ny) || 1;
  }
  const off = u.radius + INTERACT.range * 0.5;
  return { x: cx + (nx / len) * off, y: cy + (ny / len) * off };
}

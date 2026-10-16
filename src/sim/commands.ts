import type { Vec } from './math';
import type { SimConfig } from './simConfig';

/** 畫面層 → sim 的唯一管道 */
export type Command =
  | { type: 'move'; unitIds: number[]; point: Vec }
  | { type: 'attack'; unitIds: number[]; targetId: number }
  | { type: 'follow'; unitIds: number[]; targetId: number }
  | { type: 'skill'; unitId: number; skillId: string; targetId?: number; point?: Vec }
  | { type: 'stop'; unitIds: number[] }
  | { type: 'setConfig'; patch: Partial<SimConfig> };

/** 單位層級的指令（單位目前在做的事） */
export type Order =
  | { type: 'move'; point: Vec }
  | { type: 'attack'; targetId: number }
  | { type: 'follow'; targetId: number }
  | { type: 'skill'; skillId: string; targetId?: number; point?: Vec };

export function sameOrder(a: Order | null, b: Order | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'move': {
      const p = (b as typeof a).point;
      return Math.abs(p.x - a.point.x) < 0.05 && Math.abs(p.y - a.point.y) < 0.05;
    }
    case 'attack':
    case 'follow':
      return a.targetId === (b as typeof a).targetId;
    case 'skill':
      return false; // 技能指令每次都視為新的
  }
}

import type { Vec } from './math';
import type { SimConfig } from './simConfig';
import type { Personality } from './data/types';

/** 畫面層 → sim 的唯一管道 */
export type Command =
  | { type: 'move'; unitIds: number[]; point: Vec }
  | { type: 'attack'; unitIds: number[]; targetId: number }
  | { type: 'follow'; unitIds: number[]; targetId: number }
  | { type: 'skill'; unitId: number; skillId: string; targetId?: number; point?: Vec }
  | { type: 'stop'; unitIds: number[] }
  | { type: 'setConfig'; patch: Partial<SimConfig> }
  | { type: 'setPersonality'; unitId: number; personality: Personality }
  /** 攻擊移動（SPEC_SLICE4 §3.1b）：往目標點移動，途中遇到敵人就攻擊 */
  | { type: 'attackMove'; unitIds: number[]; point: Vec }
  /** 技能自動施放開關（SPEC_SLICE4 §3.4） */
  | { type: 'setAutocast'; unitId: number; skillId: string; on: boolean }
  /** 使用包包裡的消耗品（不佔英雄的動作，共用冷卻；Alan 2026-10-21） */
  | { type: 'useConsumable'; itemId: string; targetId?: number }
  /** 和地圖物件互動（開關門、拉桿）：走過去再互動（SPEC_SLICE4 §15.1） */
  | { type: 'interact'; unitId: number; objectId: string }
  /** 換裝備（SPEC_SLICE7 §2）：非戰鬥中才有效，戰鬥中直接忽略 */
  | { type: 'setItems'; heroSlot: number; items: string[] };

/** 單位層級的指令（單位目前在做的事） */
export type Order =
  /** fromPlayer：玩家下達的移動，完成後設定駐守點（SPEC §10.4） */
  | { type: 'move'; point: Vec; fromPlayer?: boolean }
  /** leashed：閒置自動普攻，不得離開駐守點超過 heroLeashRange */
  | { type: 'attack'; targetId: number; leashed?: boolean }
  | { type: 'follow'; targetId: number }
  | { type: 'skill'; skillId: string; targetId?: number; point?: Vec }
  /** targetId：途中接戰的目標（執行時填入）；engaged：已經出過手（沉穩節奏的英雄接戰後就地駐守） */
  | { type: 'attackMove'; point: Vec; targetId?: number; engaged?: boolean }
  /** point：走過去的站位（第一次執行時決定） */
  | { type: 'interact'; objectId: string; point?: Vec };

export function sameOrder(a: Order | null, b: Order | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'move':
    case 'attackMove': {
      const p = (b as typeof a).point;
      return Math.abs(p.x - a.point.x) < 0.05 && Math.abs(p.y - a.point.y) < 0.05;
    }
    case 'attack':
    case 'follow':
      return a.targetId === (b as typeof a).targetId;
    case 'interact':
      return a.objectId === (b as typeof a).objectId;
    case 'skill':
      return false; // 技能指令每次都視為新的
  }
}

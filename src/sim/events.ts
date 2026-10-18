import type { Vec } from './math';
import type { DamageType, Team } from './data/types';

/** sim → 畫面層：每個節拍產生的事件 */
export type SimEvent =
  | { type: 'actionStart'; unitId: number; skillId?: string; targetId?: number; point?: Vec }
  | { type: 'hit'; sourceId: number; targetId: number; damage: number; crit: boolean; damageType: DamageType; skillId?: string; freeAttack?: boolean }
  /** blocked：投射物在飛行途中撞到障礙物（point 為撞擊位置） */
  | { type: 'miss'; sourceId: number; targetId: number; skillId?: string; freeAttack?: boolean; blocked?: boolean; point?: Vec }
  | { type: 'heal'; sourceId: number; targetId: number; amount: number }
  | { type: 'interrupt'; sourceId: number; targetId: number; skillId?: string; point?: Vec }
  | { type: 'death'; unitId: number; killerId?: number }
  | { type: 'pinned'; unitId: number; byId: number }
  | { type: 'guardRedirect'; guardId: number; protectedId: number }
  | { type: 'status'; unitId: number; text: string }
  | { type: 'aoe'; sourceId: number; point: Vec; radius: number; skillId: string }
  | { type: 'knockback'; unitId: number; from: Vec; to: Vec }
  | { type: 'notice'; unitId: number; text: string }
  | { type: 'aggro' }
  | { type: 'spawn'; unitId: number; byId?: number; waveId?: string }
  /** 怪群模式：一波敵人出現（SPEC_SLICE4 §2） */
  | { type: 'waveStart'; waveId: string }
  | { type: 'warcry'; unitId: number }
  /** 英雄和地圖物件互動（SPEC_SLICE4 §15.1） */
  | { type: 'interact'; unitId: number; objectId: string }
  /** 門打開或關上；blocked：想關門但門口有人 */
  | { type: 'door'; objectId: string; open: boolean; blocked?: boolean }
  | { type: 'battleEnd'; winner: Team };

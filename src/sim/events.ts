import type { Vec } from './math';
import type { DamageType, Team } from './data/types';

/** sim → 畫面層：每個節拍產生的事件 */
export type SimEvent =
  | { type: 'actionStart'; unitId: number; skillId?: string; targetId?: number; point?: Vec }
  | { type: 'hit'; sourceId: number; targetId: number; damage: number; crit: boolean; damageType: DamageType; skillId?: string; freeAttack?: boolean }
  | { type: 'miss'; sourceId: number; targetId: number; skillId?: string; freeAttack?: boolean }
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
  | { type: 'spawn'; unitId: number; byId?: number }
  | { type: 'warcry'; unitId: number }
  | { type: 'battleEnd'; winner: Team };

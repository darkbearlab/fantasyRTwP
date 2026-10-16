import type { Order } from './commands';
import type { Team, UnitDef } from './data/types';
import type { Vec } from './math';

export enum UnitState {
  Idle = 'Idle',
  Moving = 'Moving',
  Windup = 'Windup',
  Recovery = 'Recovery',
  Stunned = 'Stunned',
  Dead = 'Dead',
}

export type ActionPhase = 'windup' | 'dash' | 'recovery';

/** 進行中的動作（普攻或技能） */
export interface Action {
  kind: 'attack' | 'skill';
  skillId?: string;
  targetId?: number;
  point?: Vec;
  phase: ActionPhase;
  ticksLeft: number;
  ticksTotal: number;
  /** 衝刺階段已經過的秒數 */
  dashTime?: number;
}

export interface UnitStats {
  damageDealt: number;
  damageTaken: number;
  healing: number;
  kills: number;
}

export class Unit {
  readonly id: number;
  readonly def: UnitDef;
  readonly team: Team;
  /** 英雄欄位（0–3）；敵人為 -1 */
  readonly heroSlot: number;

  pos: Vec;
  prevPos: Vec;
  facing = 0;
  hp: number;
  dead = false;

  order: Order | null = null;
  /** 恢復期間收到的指令；undefined 表示沒有，null 表示「停止」 */
  nextOrder: Order | null | undefined = undefined;
  /** 駐守點：玩家移動指令完成後的位置；攻擊／跟隨／技能指令會清除（SPEC §10.4） */
  guardPoint: Vec | null = null;
  /** 施放技能後要恢復的普攻指令 */
  resumeOrder: Order | null = null;
  action: Action | null = null;

  stunTime = 0;
  rootTime = 0;
  blessTime = 0;
  blessAccuracy = 0;
  blessDefense = 0;
  guardedBy = -1;
  guardTime = 0;
  guardChance = 0;
  cooldowns: Record<string, number> = {};

  path: Vec[] | null = null;
  pathIndex = 0;
  pathGoal: Vec | null = null;
  repathTimer = 0;
  movedThisTick = false;
  /** 本指令是否已顯示過「被牽制」 */
  pinnedNotified = false;

  aiTimer = 0;
  retreatCooldown = 0;

  stats: UnitStats = { damageDealt: 0, damageTaken: 0, healing: 0, kills: 0 };

  constructor(id: number, def: UnitDef, pos: Vec, heroSlot: number) {
    this.id = id;
    this.def = def;
    this.team = def.team;
    this.heroSlot = heroSlot;
    this.pos = { ...pos };
    this.prevPos = { ...pos };
    this.hp = def.maxHp;
    this.facing = def.team === 'hero' ? 0 : Math.PI;
  }

  get radius(): number {
    return this.def.radius;
  }
  get maxHp(): number {
    return this.def.maxHp;
  }
  get armor(): number {
    return this.def.armor;
  }
  get accuracy(): number {
    return this.def.accuracy + (this.blessTime > 0 ? this.blessAccuracy : 0);
  }
  get defense(): number {
    return this.def.defense + (this.blessTime > 0 ? this.blessDefense : 0);
  }
  get isMelee(): boolean {
    return this.def.range < 1;
  }
  get rooted(): boolean {
    return this.rootTime > 0;
  }

  get state(): UnitState {
    if (this.dead) return UnitState.Dead;
    if (this.stunTime > 0) return UnitState.Stunned;
    if (this.action) {
      if (this.action.phase === 'windup') return UnitState.Windup;
      if (this.action.phase === 'recovery') return UnitState.Recovery;
      return UnitState.Moving;
    }
    if (this.movedThisTick) return UnitState.Moving;
    return UnitState.Idle;
  }

  /** 動作進度 0–1（畫面層進度條用） */
  get actionProgress(): number {
    if (!this.action || this.action.ticksTotal <= 0) return 0;
    return 1 - this.action.ticksLeft / this.action.ticksTotal;
  }
}

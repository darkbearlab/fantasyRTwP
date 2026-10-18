import type { Order } from './commands';
import type { Personality, Team, UnitDef } from './data/types';
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
  /** 閒置性格（可用 setPersonality 指令切換） */
  personality: Personality;
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
  /** 技能冷卻剩餘秒數（正在回復下一次使用） */
  cooldowns: Record<string, number> = {};
  /** 技能目前可用次數（一般為 0 或 1；「二連」最多 2） */
  charges: Record<string, number> = {};
  /** 剛攻擊過：在草叢裡也會暴露（秒） */
  revealTime = 0;
  /** 燃燒狀態（秒）與下一次燃燒傷害的倒數 */
  burnTime = 0;
  burnTick = 0;
  burnSourceId = -1;
  /** 衰弱詛咒：行動條變慢比例、受到傷害增加比例 */
  curseTime = 0;
  curseSlow = 0;
  curseVuln = 0;
  /** 煙霧彈：隱匿、無視控制區（秒） */
  stealthTime = 0;
  /** 這場戰鬥已不能再用的技能（一次性、被打斷就失去） */
  spentSkills: string[] = [];
  /** 暫時的傷害增益（頭目戰吼等） */
  damageBuffMult = 1;
  damageBuffTime = 0;

  path: Vec[] | null = null;
  pathIndex = 0;
  pathGoal: Vec | null = null;
  repathTimer = 0;
  movedThisTick = false;
  /** 本指令是否已顯示過「被牽制」 */
  pinnedNotified = false;

  aiTimer = 0;
  retreatCooldown = 0;
  /** 雜兵目前追擊的英雄（-1 = 無） */
  hordeTargetId = -1;
  /** 雜兵貼牆時偏好的偏轉方向（1 / -1），避免在牆角左右來回 */
  steerSign = 1;
  /** 包圍時分配到的角度（弧度）與對象；null = 尚未進入包圍 */
  encircleAngle: number | null = null;
  encircleTargetId = -1;
  /** 怪群模式普攻：累計次數（重擊）、下一擊立即出手（擊殺重置） */
  attackCount = 0;
  attackResetPending = false;
  /** 身上的咒彈詛咒：死亡時擴散 */
  hexed = false;
  hexSpread = 0;
  /** 開啟自動施放的技能 */
  autocast = new Set<string>();
  autocastTimer = 0;

  stats: UnitStats = { damageDealt: 0, damageTaken: 0, healing: 0, kills: 0 };

  constructor(id: number, def: UnitDef, pos: Vec, heroSlot: number) {
    this.id = id;
    this.def = def;
    this.team = def.team;
    this.heroSlot = heroSlot;
    this.pos = { ...pos };
    this.prevPos = { ...pos };
    this.hp = def.maxHp;
    this.personality = def.personality ?? 'steadfast';
    for (const s of def.skills) this.charges[s] = this.maxCharges(s);
    if (def.startsHidden) this.stealthTime = Infinity;
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
  maxCharges(skillId: string): number {
    return Math.max(1, this.def.skillMods?.[skillId]?.charges ?? 1);
  }

  skillCooldown(skillId: string, base: number): number {
    return base * (this.def.skillMods?.[skillId]?.cooldownMult ?? 1);
  }

  skillReady(skillId: string): boolean {
    return (this.charges[skillId] ?? 1) > 0 && !this.spentSkills.includes(skillId);
  }

  /** 造成傷害的總倍率 */
  get outgoingDamageMult(): number {
    return (this.def.damageMult ?? 1) * (this.damageBuffTime > 0 ? this.damageBuffMult : 1);
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

import type { Vec } from '../math';

export type Team = 'hero' | 'enemy';
export type EnemyArchetype = 'brute' | 'skirmisher' | 'archer' | 'caster';
/** 投射物外觀種類（畫面層據此決定顏色大小） */
export type ProjectileKind = 'arrow' | 'bolt' | 'fireball' | 'missile' | 'frost';

export interface UnitDef {
  id: string;
  name: string;
  letter: string;
  /** 占位色塊顏色（0xRRGGBB） */
  color: number;
  team: Team;
  maxHp: number;
  armor: number;
  accuracy: number;
  defense: number;
  damage: [number, number];
  /** 普攻射程（公尺，從兩圓邊緣算） */
  range: number;
  windup: number;
  recovery: number;
  /** 作用於 windup / recovery 的倍率，越大越快 */
  attackSpeed: number;
  moveSpeed: number;
  radius: number;
  projectsZoc: boolean;
  /** 遠程普攻的投射物速度（m/s）；近戰省略 */
  projectileSpeed?: number;
  projectileKind?: ProjectileKind;
  /** 技能 id，依序對應快捷鍵 */
  skills: string[];
  ai?: EnemyArchetype;
}

export type SkillTarget = 'enemy' | 'ally' | 'allyOrSelf' | 'ground' | 'self';

export type SkillEffect =
  | {
      kind: 'strike';
      melee: boolean;
      mult: number;
      accBonus?: number;
      /** 指定固定傷害區間（取代普攻傷害） */
      flatDamage?: [number, number];
      interrupts?: boolean;
      stun?: number;
      knockback?: number;
      projectileSpeed?: number;
      projectileKind?: ProjectileKind;
    }
  | {
      kind: 'aoe';
      radius: number;
      damage: [number, number];
      friendlyFire: boolean;
      interrupts?: boolean;
      projectileSpeed?: number;
      projectileKind?: ProjectileKind;
    }
  | { kind: 'root'; duration: number; projectileSpeed?: number; projectileKind?: ProjectileKind }
  | { kind: 'heal'; amount: number }
  | { kind: 'guard'; duration: number; chance: number }
  | { kind: 'bless'; radius: number; duration: number; accuracy: number; defense: number }
  | { kind: 'charge'; speedMult: number; maxDuration: number }
  | { kind: 'tumble'; speed: number };

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  target: SkillTarget;
  /** 射程：單位目標為邊緣距離；地面目標為中心距離 */
  range: number;
  windup: number;
  recovery: number;
  cooldown: number;
  requiresLos: boolean;
  /** 無視控制區（衝鋒、翻滾） */
  ignoresZoc?: boolean;
  /** 準備期間在地面顯示紅色預警圈 */
  telegraph?: boolean;
  effect: SkillEffect;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  obstacles: Rect[];
  heroSpawns: Vec[];
  enemySpawns: { enemy: string; x: number; y: number }[];
  /** 給腳本 AI 與鏡頭參考的地標 */
  landmarks?: Record<string, Vec>;
}

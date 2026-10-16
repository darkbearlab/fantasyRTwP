import type { Vec } from '../math';

export type Team = 'hero' | 'enemy';
export type EnemyArchetype = 'brute' | 'skirmisher' | 'archer' | 'caster' | 'boss';
/** 投射物外觀種類（畫面層據此決定顏色大小） */
export type ProjectileKind = 'arrow' | 'bolt' | 'fireball' | 'missile' | 'frost';
/**
 * 傷害類型（SPEC §19.6）：切片 1 尚無抗性，但每筆傷害都帶類型，
 * 之後的隨從系統會依此決定吸收權重與抗性。
 */
export type DamageType = 'melee' | 'projectile' | 'spell' | 'area';
/**
 * 英雄閒置性格（決定沒有指令時的行為）：
 * - steadfast 堅守：附近有敵人就自動普攻，受駐守點限制
 * - aggressive 好戰：看到一定距離內的敵人就主動衝出去打，並且一路追擊（無視駐守點）
 * - guerrilla 游擊：敵人靠近就往反方向逃跑，不會自動攻擊（要玩家下指令才接戰）
 */
export type Personality = 'steadfast' | 'aggressive' | 'guerrilla';

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
  /** 普攻的傷害類型；省略時近戰為 melee、遠程為 projectile */
  attackDamageType?: DamageType;
  /** 造成傷害的倍率（強化用；省略為 1） */
  damageMult?: number;
  /** 被打斷時不會暈眩（強化「堅定」） */
  interruptStunImmune?: boolean;
  /** 個別技能的修飾：冷卻倍率、可儲存次數（強化「熟練」「二連」） */
  skillMods?: Record<string, { cooldownMult?: number; charges?: number }>;
  /** 閒置性格（英雄用；省略為 steadfast） */
  personality?: Personality;
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
      /** 省略時近戰為 melee、遠程為 projectile */
      damageType?: DamageType;
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
  /** 前方扇形範圍攻擊（以施放者為圓心、朝目標點方向） */
  | { kind: 'cone'; radius: number; angle: number; damage: [number, number]; friendlyFire: boolean }
  /** 戰吼：召喚援軍，並讓全體友軍暫時提高傷害 */
  | { kind: 'warcry'; summon: { enemy: string; count: number }; damageBuff: number; duration: number }
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
  /** 每場戰鬥只能用一次 */
  oncePerBattle?: boolean;
  /** 被打斷就不能再用 */
  lostOnInterrupt?: boolean;
  effect: SkillEffect;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 是否遮擋視線（預設 true；河水等只擋路不擋視線設為 false） */
  blocksSight?: boolean;
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
  /** 援軍進場位置（頭目戰吼） */
  summonPoints?: Vec[];
}

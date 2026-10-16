import type { Vec } from '../math';

export type Team = 'hero' | 'enemy';
export type EnemyArchetype = 'brute' | 'skirmisher' | 'archer' | 'caster' | 'boss' | 'siege' | 'bomber' | 'lurker';
/** 投射物外觀種類（畫面層據此決定顏色大小） */
export type ProjectileKind = 'arrow' | 'bolt' | 'fireball' | 'missile' | 'frost' | 'flask' | 'curse';
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
  /** 生命越低傷害越高：生命 0 時傷害 +此值（狂戰士 0.5） */
  lowHpDamageBonus?: number;
  /** 從目標背後普攻的傷害倍率（盜賊） */
  backstabMult?: number;
  /** 普攻為拋物線：不需視線、不受掩體影響（煉金術士） */
  arcAttack?: boolean;
  /** 無視控制區（攻城兵） */
  ignoresZoc?: boolean;
  /** 戰鬥開始時隱匿，第一次攻擊才現身（潛行者） */
  startsHidden?: boolean;
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
      /** 近戰重擊：定身中的目標「碎冰」（SPEC_SLICE3 §1.6） */
      shatters?: boolean;
      /** 從目標背後攻擊的傷害倍率（背刺） */
      behindMult?: number;
      /** 暈眩中的目標必定爆擊（背刺） */
      critVsStunned?: boolean;
      /** 擊退撞到障礙物時額外暈眩（聖光震擊） */
      wallStun?: boolean;
      projectileSpeed?: number;
      projectileKind?: ProjectileKind;
    }
  | {
      kind: 'aoe';
      radius: number;
      damage: [number, number];
      friendlyFire: boolean;
      interrupts?: boolean;
      /** 會點燃草叢 */
      ignites?: boolean;
      /** 命中的單位開始燃燒（火焰瓶） */
      burns?: boolean;
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
  /** 旋風斬：打周圍所有敵人（每個目標各自命中判定） */
  | { kind: 'whirlwind'; radius: number; mult: number; shatters?: boolean }
  /** 衰弱詛咒：目標行動條變慢、受到傷害增加 */
  | { kind: 'curse'; duration: number; actionSlow: number; damageTakenPct: number; projectileSpeed?: number; projectileKind?: ProjectileKind }
  /** 煙霧彈：一段時間內無視控制區、敵人看不到（貼近除外） */
  | { kind: 'smoke'; duration: number }
  /** 地面區域：敵人在範圍內移動變慢（沼澤） */
  | { kind: 'zone'; radius: number; duration: number; moveMult: number }
  /** 範圍治療（治療藥瓶） */
  | { kind: 'aoeHeal'; radius: number; amount: number; projectileSpeed?: number; projectileKind?: ProjectileKind }
  /** 衝鋒（knockback：抵達時的攻擊附帶擊退，攻城兵的撞擊） */
  | { kind: 'charge'; speedMult: number; maxDuration: number; knockback?: number }
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
  /** 只影響畫面：cliff＝高地邊緣的斷崖（通常搭配 blocksSight: false） */
  style?: 'cliff';
}

/** 戰術地形種類（SPEC_SLICE3 §2） */
export type TerrainKind = 'brush' | 'shallow' | 'hedge' | 'high';

export interface TerrainRect {
  kind: TerrainKind;
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
  /** 戰術地形 */
  terrain?: TerrainRect[];
  /** 援軍進場位置（頭目戰吼） */
  summonPoints?: Vec[];
}

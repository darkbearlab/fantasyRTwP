import type { Vec } from '../math';

export type Team = 'hero' | 'enemy';
export type EnemyArchetype =
  | 'brute' | 'skirmisher' | 'archer' | 'caster' | 'boss' | 'siege' | 'bomber' | 'lurker' | 'horde' | 'nest'
  // 沉穩節奏的新敵人（SPEC_SLICE5 §15.2）
  | 'charger' | 'assassin' | 'hooker' | 'priest' | 'summoner' | 'exploder';

/**
 * 敵人選目標的權重（SPEC_SLICE5 §15.1，只在沉穩節奏生效）：每次評估對看得到的英雄打分，最高分者為目標。
 * 各因子都先換算成 0–1 再乘權重；sticky 是現任目標的加分（換目標要比現任高出這麼多）。
 */
export interface TargetingWeights {
  /** 距離：越近越高（20 m 以外為 0） */
  distance: number;
  /** 生命比例：越低越高 */
  lowHp: number;
  /** 後排：不產生控制區的英雄（非戰士系）加分 */
  backline: number;
  /** 仇恨：最近 5 秒對自己造成的傷害（40 以上為滿分） */
  threat: number;
  /** 標記：帶有負面狀態（暈眩、定身、燃燒、詛咒）的英雄加分 */
  marked: number;
  /** 現任目標的黏著度 */
  sticky: number;
}
/** 敵人層級（SPEC_SLICE4 §1）：雜兵大量、簡單；精英少量、有完整 AI。省略視為 elite */
export type UnitTier = 'fodder' | 'elite';
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
  /** 敵人層級（省略為 elite） */
  tier?: UnitTier;
  /** 敵人階級（自動暫停等用）：精英隊長、頭目；省略為一般。頭目也可以由 ai === 'boss' 判斷（見 enemyRank） */
  rank?: 'elite' | 'boss';
  /** 不會被推開（巢穴） */
  immovable?: boolean;
  /** 和同隊保持的間隔（公尺，身體邊緣之間）；省略時用 SimConfig.unitSpacing。大型單位可以要大一點 */
  spacing?: number;
  /** 保持間隔時的推動權重（越大越不容易被同伴推開，預設 1） */
  pushWeight?: number;
  /** 盾（盾兵，SPEC_SLICE5 v0.4）：生命高於 hpFrac 之前防禦、護甲較高；跌破後盾破，不再恢復 */
  shield?: { hpFrac: number; defense: number; armor: number };
  /** 選目標的權重（沉穩節奏）；省略用 ENEMY_TARGETING.default */
  targeting?: Partial<TargetingWeights>;
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
      /** 在地上留下持續區域（通用的持續效果，src/sim/zones.ts） */
      lingering?: LingeringDef;
      projectileSpeed?: number;
      projectileKind?: ProjectileKind;
    }
  | { kind: 'root'; duration: number; projectileSpeed?: number; projectileKind?: ProjectileKind }
  | { kind: 'heal'; amount: number }
  | { kind: 'guard'; duration: number; chance: number }
  | { kind: 'bless'; radius: number; duration: number; accuracy: number; defense: number }
  /** 附魔（Alan：法師的主動，只加攻擊力）：範圍內隊友 duration 秒內造成傷害 ×(1＋damagePct) */
  | { kind: 'enchant'; radius: number; duration: number; damagePct: number }
  /** 前方扇形範圍攻擊（以施放者為圓心、朝目標點方向） */
  | { kind: 'cone'; radius: number; angle: number; damage: [number, number]; friendlyFire: boolean }
  /** 戰吼：召喚援軍，並讓全體友軍暫時提高傷害 */
  /** deliberateSummon：沉穩節奏改叫這些（Alan：沒有打斷手段時，戰吼叫來的是很弱的雜魚） */
  | { kind: 'warcry'; summon: { enemy: string; count: number }; deliberateSummon?: { enemy: string; count: number }; damageBuff: number; duration: number }
  /** 旋風斬：打周圍所有敵人（每個目標各自命中判定） */
  | { kind: 'whirlwind'; radius: number; mult: number; shatters?: boolean }
  /** 衰弱詛咒：目標行動條變慢、受到傷害增加 */
  | { kind: 'curse'; duration: number; actionSlow: number; damageTakenPct: number; projectileSpeed?: number; projectileKind?: ProjectileKind }
  /** 煙霧彈：一段時間內無視控制區、敵人看不到（貼近除外） */
  | { kind: 'smoke'; duration: number }
  /** 地面區域：敵人在範圍內移動變慢（沼澤） */
  /** 在地上留下持續區域（沼澤等；通用的持續效果，src/sim/zones.ts） */
  | { kind: 'zone'; radius: number; lingering: LingeringDef }
  /** 範圍治療（治療藥瓶） */
  | { kind: 'aoeHeal'; radius: number; amount: number; projectileSpeed?: number; projectileKind?: ProjectileKind }
  /** 衝鋒（knockback：抵達時的攻擊附帶擊退，攻城兵的撞擊） */
  | { kind: 'charge'; speedMult: number; maxDuration: number; knockback?: number }
  | { kind: 'tumble'; speed: number }
  // ── 沉穩節奏的敵人技能（SPEC_SLICE5 §15.2；全部有預兆） ──
  /** 直線衝鋒：朝目標點方向衝 distance 公尺，途中撞到的英雄各受一次傷害（v0.4：不擊倒）；預兆線寬 width */
  | { kind: 'rush'; distance: number; speed: number; width: number; damage: [number, number] }
  /**
   * 抓起來丟（戰爭領主，Alan 2026-10-21）：抓住身邊的一名英雄（單位目標），丟向遠處另一名英雄所在的位置（地面點，預兆圈）；
   * 飛行 flight 秒，落地時對落點 radius 內的英雄（含被丟的）造成傷害；被丟的人落地後再暈眩 stun 秒。
   * minDist～maxDist：丟的距離（公尺，AI 挑目標用）。
   */
  | { kind: 'hurl'; radius: number; damage: [number, number]; flight: number; stun: number; minDist: number; maxDist: number }
  /** 跳躍突進：跳到目標點（預兆圈），落地時打 radius 內的敵人 */
  | { kind: 'leap'; speed: number; radius: number; mult: number }
  /** 鉤鎖：把目標拉到自己身前（需要視線；被擋住就落空） */
  | { kind: 'pull'; mult: number; projectileKind?: ProjectileKind }
  /** 召喚：在自己周圍召喚 count 名 enemy */
  | { kind: 'summon'; enemy: string; count: number; radius: number }
  /** 詛咒爆裂（咒術師的循環第二招）：目標身上有詛咒就引爆（傷害 damage、解除詛咒），沒有就只造成 uncursedDamage */
  | { kind: 'curseBurst'; damage: [number, number]; uncursedDamage: [number, number]; projectileSpeed?: number; projectileKind?: ProjectileKind }
  /** 自爆：以自己為中心的範圍傷害，之後死亡 */
  | { kind: 'explode'; radius: number; damage: [number, number] };

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
  /** 準備期間在地面顯示紅色預警（圈、線、扇形依效果而定） */
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
/** 持續區域的效果：減速、燃燒（維持燃燒狀態）、每秒傷害、每秒回復 */
export type ZoneEffect = { kind: 'slow'; moveMult: number } | { kind: 'burn' } | { kind: 'damage'; perSecond: number } | { kind: 'heal'; perSecond: number };

/** 持續區域的定義（Alan：持續效果做成通用的 helper）；style 只影響畫面顏色 */
export interface LingeringDef {
  duration: number;
  affects: 'enemy' | 'ally' | 'all';
  effects: ZoneEffect[];
  style?: 'swamp' | 'fire' | 'holy';
}

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
  /** 怪群模式的生成點（SPEC_SLICE4 §2）；遭遇也可以自帶 */
  spawners?: SpawnerDef[];
  /** 可互動的地圖物件（門、拉桿；SPEC_SLICE4 §15.1） */
  interactables?: InteractableDef[];
  /** 主題（生成的關卡用；畫面依主題挑地形物件） */
  theme?: string;
  /**
   * 出口（SPEC_SLICE6 §2）：存活英雄全部進入同一個出口就離開（勝利）。有出口時不再以全滅判定勝利。
   * label：畫面上的說明（例：下一個節點的類型）
   */
  exits?: ExitDef[];
  /**
   * 勝利條件的門檻：captain＝打倒所有精英隊長、boss＝打倒頭目，出口才打開；
   * 有門檻但沒有出口（最後的頭目戰）＝達成門檻就勝利。
   */
  exitLock?: 'captain' | 'boss';
  /**
   * 畫面用的地圖資料（sim 不讀）：finalbossblues 地形的程序生成地圖（野外、城內）帶著生成結果，
   * 畫面層照它拼圖塊。kind 決定格式（見 src/run/fbbLevel.ts）。
   */
  art?: { kind: string; [k: string]: unknown };
}

export interface ExitDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** 出口在地圖哪一邊（top＝往路線圖的下一層） */
  edge?: 'top' | 'bottom' | 'left' | 'right';
}

// ───────────── 互動物件（SPEC_SLICE4 §15.1：通用的「互動 → 觸發動作」） ─────────────

/** door：關著時擋路、擋視線與投射物；lever：拉下後觸發動作（之後的寶箱、道具沿用同一套） */
export type InteractableKind = 'door' | 'lever';

/** 互動後執行的動作；波次可以用觸發條件 { type: 'interact' } 接在互動後面 */
export type InteractAction = { type: 'openDoor' | 'closeDoor' | 'toggleDoor'; door: string };

export interface InteractableDef {
  id: string;
  kind: InteractableKind;
  /** 名稱（戰鬥紀錄、滑鼠提示） */
  name?: string;
  /** 範圍（門：關著時擋住的矩形；拉桿：底座） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 門的初始狀態（預設關著） */
  open?: boolean;
  /** 只能互動一次（預設：拉桿是、門不是） */
  once?: boolean;
  /** 上鎖：玩家不能直接開關，只能被其他物件的動作打開（例如拉桿） */
  locked?: boolean;
  /** 互動後的動作；門省略時是切換自己 */
  actions?: InteractAction[];
}

// ───────────── 怪群模式：生成點、波次、目標（SPEC_SLICE4 §2） ─────────────

export interface SpawnerDef {
  id: string;
  x: number;
  y: number;
  /** 生成時在此半徑內散開 */
  radius: number;
  /** 有巢穴：戰鬥開始時在此放一個巢穴，巢穴被摧毀後這個生成點不再生成 */
  nest?: boolean;
}

export type WaveTrigger =
  | { type: 'start' }
  /** 戰鬥開始後第 t 秒 */
  | { type: 'time'; t: number }
  /** 任一存活英雄進入區域 */
  | { type: 'area'; rect: Rect }
  /** 存活敵人（不含巢穴）剩下 count 名以下；after：指定的波次已出現後才開始判定 */
  | { type: 'remaining'; count: number; after?: string }
  /** 有英雄和指定的互動物件互動過（拉桿、開門；SPEC_SLICE4 §15.1） */
  | { type: 'interact'; id: string };

export interface WaveDef {
  id: string;
  trigger: WaveTrigger;
  /** captain：精英隊長（生命、傷害提高） */
  spawns: { spawner: string; enemy: string; count: number; captain?: boolean }[];
  /** 觸發後重複出現：每 interval 秒一次，共 times 次（-1 = 直到戰鬥結束） */
  repeat?: { interval: number; times: number };
}

/**
 * 自動出怪（Alan 回饋：敵人要小群、密集、從四面八方來）：
 * 依隊伍附近的敵人數量自動補一小群，出現在隊伍周圍、視野外的位置，而且刻意分散方向。
 * 壓力有起伏：累積 → 高峰 → 喘息，循環。stages：觸發後套用該階段的目標數量（後觸發的覆蓋先觸發的）。
 */
export interface DirectorDef {
  /** 會出現的雜兵與權重 */
  enemies: { enemy: string; weight: number }[];
  /** 每群幾隻 [最少, 最多] */
  packSize: [number, number];
  /** 出現位置與最近英雄的距離 [最近, 最遠]（公尺） */
  spawnDistance: [number, number];
  /** 每群之間至少間隔幾秒 */
  cooldown: number;
  /** 計算「附近敵人」的半徑（公尺，以隊伍中心為準） */
  nearbyRadius: number;
  /** 全場存活雜兵上限 */
  maxAlive: number;
  /** 總共最多出幾隻（省略 = 不限；目標為 clear 時必須設定） */
  budget?: number;
  /** 壓力循環秒數：累積（目標從 low 漲到 high）、高峰（維持 high）、喘息（目標 0，不補怪） */
  cycle: { buildUp: number; peak: number; relax: number };
  /** 各階段：觸發後附近敵人目標數量在 [low, high] 之間依壓力循環變化；budget：這個階段最多出幾隻（省略 = 不限） */
  stages: { trigger: WaveTrigger; low: number; high: number; budget?: number }[];
}

export type Objective =
  | { type: 'clear' }
  | { type: 'nests' }
  /** 所有存活英雄進入出口區域 */
  | { type: 'exit'; rect: Rect }
  /** 擊倒指定波次的所有敵人（頭目關卡：wave 出現後全滅即勝利） */
  | { type: 'kill'; wave: string };

export interface HordeSetup {
  spawners: SpawnerDef[];
  waves: WaveDef[];
  objective: Objective;
  /** 啟用視線與戰爭迷霧（SPEC_SLICE4 §6） */
  fog?: boolean;
  /** 自動出怪 */
  director?: DirectorDef;
}

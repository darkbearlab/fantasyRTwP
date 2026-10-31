import { tr } from '../i18n/lang';
import { tickBear } from './actions';
import type { Command, Order } from './commands';
import { sameOrder } from './commands';
import { DT, NAV_CELL, RANGE_TOLERANCE } from './constants';
import { BOSS_INTRO, ENEMIES, enemyRank } from './data/enemies';
import { BAG, CONSUMABLES } from './data/consumables';
import { SHRINE_RULES, SHRINES } from './data/shrines';
import { CAPTIVE, FOLLOWER_RULES, FOLLOWERS } from './data/followers';
import { followerOrder } from './ai/follower';
import { ACTIVE_CYCLES } from './data/cycles';
import { offCycle } from './cycle';
import { HEROES } from './data/heroes';
import { SKILLS } from './data/skills';
import type { DamageType, HordeSetup, InteractAction, LootDef, MapDef, ShrineKind, Personality, ProjectileKind, Rect, SkillDef, SpawnerDef, Team, UnitDef, WaveDef, WaveTrigger } from './data/types';
import { INTERACT } from './data/interact';
import { COMBAT_STATE } from './data/deliberate';
import { CLASS_PASSIVES, PASSIVES } from './data/passives';
import type { GroundZone } from './zones';
import { updateZones, zoneMoveMult } from './zones';
import type { InteractableState } from './interact';
import { Interactables, approachPoint, distToRect, inInteractRange, rectOf } from './interact';
import { HORDE, HORDE_VISION } from './data/horde';
import { Vision } from './vision';
import { Director } from './director';
import { SkirmishDirector } from './skirmishDirector';
import type { SkirmishDef } from './data/skirmish';
import { FlowField } from './nav/flowField';
import { hordeThink } from './ai/hordeAI';
import { autocastOrder, canAutocast } from './ai/autocast';
import { AUTOCAST_INTERVAL } from './data/autocast';
import type { SimEvent } from './events';
import { canSeeCircle, canSeePoint, clearLine, segmentClear } from './los';
import type { Vec } from './math';
import { dist, norm, sub } from './math';
import { tickFocus } from './focus';
import { findPath } from './nav/astar';
import { separateUnits } from './nav/avoidance';
import { NavGrid } from './nav/grid';
import { lineWalkable, smoothPath } from './nav/smooth';
import { SlotManager } from './nav/slots';
import { Rng } from './rng';
import { T_BRUSH, T_HEDGE, T_HIGH, T_SHALLOW, TerrainGrid } from './terrain';
import { TERRAIN } from './data/terrain';
import { STAGGER } from './data/stagger';
import { traceSupercover } from './nav/raycast';
import type { SimConfig } from './simConfig';
import { DEFAULT_SIM_CONFIG, scaleRange } from './simConfig';
import { Unit } from './unit';
import type { ZocContext } from './zoc';
import { disengagedFrom, edgeDistance, pinBlocker, zoneDistance } from './zoc';
import { applyDamage, finishWindup, freeAttack, landHurl, resolveProjectilePayload, skillCooldownOf, startAction, tickDash } from './actions';
import type { IdleBehavior } from './ai/idleBehavior';
import { IDLE_BEHAVIORS, leashedApproachPoint, returnToGuard, withinLeash } from './ai/idleBehavior';
import { enemyThink } from './ai/enemyAI';

export interface UnitSpawn {
  defId: string;
  pos: Vec;
  /** 直接指定定義（遠征套用強化後的英雄）；省略時以 defId 查表 */
  def?: UnitDef;
  /** 初始生命（跨戰鬥延續）；省略為滿血 */
  hp?: number;
  personality?: Personality;
  /** 未指定時依英雄出現順序自動編號 */
  heroSlot?: number;
  /** 敵人的小隊（沉穩節奏：同小隊一起警覺） */
  squad?: string;
  /** 英雄裝備的道具（沉穩節奏：每件提供一個被動，SPEC_SLICE5 §17） */
  items?: string[];
  /** 額外的被動（升級給的，PASSIVES 的 id；沉穩節奏） */
  passives?: string[];
  /** 初始面向（弧度）；省略時英雄朝 +x、敵人朝 −x */
  facing?: number;
  /** 隨從：主人的英雄欄位（Alan 2026-10-23） */
  followerOf?: number;
  /** 被困的英雄（SPEC_SLICE7 §4）：看守的小隊 id */
  captive?: string;
  /** 開場就倒在地上的屍體（被困英雄身邊的布景，Alan 2026-10-31）：不算擊殺、不給經驗 */
  corpse?: boolean;
  /** 職業被動與等級（Alan 2026-10-25）；省略時照職業的預設（CLASS_PASSIVES，第 1 級） */
  classPassives?: { id: string; rank: number }[];
}

export interface WorldOptions {
  seed: number;
  map: MapDef;
  spawns: UnitSpawn[];
  config?: Partial<SimConfig>;
  defs?: Record<string, UnitDef>;
  idleBehavior?: IdleBehavior;
  /** 戰鬥中召喚的敵人定義（遠征會套上層數成長） */
  enemyDefFor?: (enemyId: string, captain?: boolean) => UnitDef;
  /** 怪群模式：生成點、波次、勝利目標（SPEC_SLICE4 §2） */
  horde?: HordeSetup;
  /** 啟用視線與戰爭迷霧（非怪群遭遇用；怪群遭遇看 horde.fog） */
  fog?: boolean;
  /** 小衝突導演（沉穩節奏的程序生成地圖；layer＝敵人池解鎖的層數） */
  skirmish?: { def: SkirmishDef; layer: number };
  /** 魔王的冠軍（Alan 2026-10-22）：開戰 delay 秒後從 pos（他來的方向的地圖邊緣）進場，已經知道玩家在哪；line：登場台詞 */
  champion?: { def: UnitDef; pos: Vec; delay: number; line?: string };
  /** 隊伍包包裡的消耗品（戰鬥中可以用；戰後把剩下的寫回遠征） */
  bag?: string[];
}

export type ProjectilePayload =
  | {
      type: 'strike';
      melee: false;
      damageType: DamageType;
      mult: number;
      accBonus?: number;
      flatDamage?: [number, number];
      interrupts?: boolean;
      stun?: number;
      knockback?: number;
      shatters?: boolean;
      arc?: boolean;
      skillId?: string;
      /** 怪群模式的普攻（命中後套用該英雄的普攻效果） */
      basic?: boolean;
      /** 穿透：還能再穿幾名、已經打過的單位 */
      pierceLeft?: number;
      hitIds?: number[];
    }
  | { type: 'aoe'; skillId: string }
  | { type: 'root'; duration: number; skillId: string }
  | { type: 'curse'; duration: number; actionSlow: number; damageTakenPct: number; skillId: string }
  | { type: 'aoeHeal'; skillId: string }
  | { type: 'curseBurst'; skillId: string };

/** 光環效果離開範圍後還維持多久（秒） */
const AURA_LINGER = 0.25;

/** 「還沒到齊」提示的最短間隔（秒） */
const EXIT_NOTICE_INTERVAL = 4;

export interface Projectile {
  id: number;
  sourceId: number;
  /** 發射位置（矮籬掩體判定用） */
  origin: Vec;
  /** 瞄準點相對於目標中心的偏移（從看得見的取樣點射過去） */
  aim?: Vec;
  /** 飛行中會被遮擋視線的障礙物擋下（單體目標的直射投射物） */
  collides: boolean;
  targetId?: number;
  point?: Vec;
  pos: Vec;
  prevPos: Vec;
  speed: number;
  kind: ProjectileKind;
  payload: ProjectilePayload;
}

export type MoveResult = 'arrived' | 'moving' | 'pinned' | 'rooted' | 'nopath';

export interface MoveOptions {
  speed?: number;
  ignoreZoc?: boolean;
  ignoreRoot?: boolean;
  /** 尋路時避開敵方控制區（刺客） */
  avoidZoc?: boolean;
  stopDist?: number;
}

const AVOID_ZOC_COST = 20;
/** 攻擊移動（目標點模式）：目標離開目標點超過接戰距離再多這麼遠就放棄 */
const ATTACK_MOVE_LEASH = 2;
/** 攻擊移動（目標點模式）途中還手：這幾秒內打過自己、而且現在打得到的敵人（Alan 2026-10-31） */
const RETALIATE_SEC = 2;
/** 移動指令連續這麼多秒沒有進展就放棄 */
const MOVE_STALL_TIME = 1.5;
/** 雜兵直線移動受阻時嘗試的偏轉角 */
const STEER_TURNS = [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4, -Math.PI / 2];

/**
 * 戰鬥模擬世界。純 TypeScript，以固定節拍推進；只吃 Command、只吐 SimEvent。
 */
export class World implements ZocContext {
  readonly map: MapDef;
  readonly config: SimConfig;
  readonly rng: Rng;
  readonly seed: number;
  readonly sight: NavGrid;
  /** 互動物件（門、拉桿；SPEC_SLICE4 §15.1） */
  readonly interactables: Interactables;
  readonly slots = new SlotManager();
  readonly units: Unit[] = [];
  projectiles: Projectile[] = [];
  tick = 0;
  result: Team | null = null;
  /** 從哪個出口離開（出口制） */
  exitId: string | null = null;
  /** 上次發出「還沒到齊」提示的時間與出口（避免每節拍都發） */
  private exitNotice = { time: -99, key: '' };
  enemyAggro = false;
  /** 已經被我方看到過的敵方小隊（squadSighted 只發一次） */
  private sightedSquads = new Set<string>();
  /** 指定時所有英雄都用這個閒置行為（測試用）；否則依各英雄的性格 */
  idleBehavior: IdleBehavior | null;

  readonly enemyDefFor: (enemyId: string, captain?: boolean) => UnitDef;
  /** 戰術地形（草叢會被燒掉，所以每場戰鬥各一份） */
  readonly terrain: TerrainGrid;
  /** 燃燒中的格子：格子索引 → 狀態 */
  readonly fire = new Map<number, { time: number; spread: number; sourceId: number }>();
  /** 地面區域效果（沼澤）：對施放者的敵人減速 */
  /** 持續性地面區域（沼澤、火焰瓶的地面火…；src/sim/zones.ts） */
  zones: GroundZone[] = [];
  private nextUnitId = 1;
  private navGrids = new Map<number, NavGrid>();
  private queue: Command[] = [];
  private events: SimEvent[] = [];
  private nextProjectileId = 1;
  private unitById = new Map<number, Unit>();
  /** 怪群模式（SPEC_SLICE4） */
  readonly horde: HordeSetup | null;
  private spawners = new Map<string, SpawnerDef>();
  /** 生成點 → 巢穴單位 id */
  readonly nestBySpawner = new Map<string, number>();
  private waveState: { def: WaveDef; fired: boolean; repeatsLeft: number; nextAt: number }[] = [];
  private flow: FlowField | null = null;
  /** 視線與戰爭迷霧（只有啟用迷霧的怪群遭遇才有） */
  readonly vision: Vision | null = null;
  /** 自動出怪（只有設定了 director 的怪群遭遇才有） */
  readonly director: Director | null = null;
  /** 小衝突導演（沉穩節奏：一直有小波次從不同方向湧上來） */
  readonly skirmish: SkirmishDirector | null = null;
  private flowTick = -Infinity;

  constructor(opts: WorldOptions) {
    this.seed = opts.seed;
    this.map = opts.map;
    this.config = { ...DEFAULT_SIM_CONFIG, ...(opts.config ?? {}) };
    this.rng = new Rng(opts.seed);
    this.interactables = new Interactables(opts.map.interactables ?? []);
    // 視線格子只算會遮擋視線的障礙物（河水擋路不擋視線）；關著的門也擋
    this.sight = new NavGrid(opts.map.width, opts.map.height, NAV_CELL, 0, this.sightBlockers());
    this.enemyDefFor = opts.enemyDefFor ?? ((id) => ENEMIES[id]);
    this.terrain = new TerrainGrid(opts.map);
    this.idleBehavior = opts.idleBehavior ?? null;
    const defs = opts.defs ?? { ...HEROES, ...ENEMIES };
    let heroSlot = 0;
    for (const s of opts.spawns) {
      const def = s.def ?? defs[s.defId];
      if (!def) throw new Error(`未知的單位定義：${s.defId}`);
      const follower = s.followerOf !== undefined || s.captive !== undefined;
      const slot = def.team === 'hero' && !follower ? (s.heroSlot ?? heroSlot++) : -1;
      const u = new Unit(this.nextUnitId++, def, s.pos, slot);
      u.follower = follower;
      if (s.captive !== undefined) {
        u.captive = true;
        u.rescue = true;
        u.captiveSquad = s.captive;
      }
      if (s.hp !== undefined) u.hp = Math.max(1, Math.min(def.maxHp, Math.round(s.hp)));
      if (s.corpse) {
        u.corpse = true;
        u.dead = true;
        u.hp = 0;
      }
      if (s.personality) u.personality = s.personality;
      if (s.squad) u.squad = s.squad;
      if (s.facing !== undefined) u.facing = s.facing;
      // 沉穩節奏（SPEC_SLICE5 §14）：英雄帶職業被動
      if (def.team === 'hero' && (!follower || u.rescue) && this.config.battleStyle === 'deliberate') {
        // 職業被動的等級：setItems 會加上道具給的等級再掛上去
        if (s.classPassives) u.classRanks = s.classPassives.map((p) => ({ ...p }));
        else for (const id of CLASS_PASSIVES[def.id] ?? []) u.addPassive(PASSIVES[id]);
        u.setItems(s.items ?? []);
        for (const id of s.passives ?? []) if (PASSIVES[id]) u.addPassive(PASSIVES[id]);
        // 技能循環（SPEC_SLICE5 §16）：英雄帶齊循環的每一招才啟用
        const cyc = ACTIVE_CYCLES[def.id];
        if (cyc && cyc.steps.every((sk) => def.skills.includes(sk))) u.cycle = cyc;
      }
      // 單位定義本身帶的被動（例：戰鬥圖騰的光環）
      if (this.config.battleStyle === 'deliberate') for (const id of def.passives ?? []) if (PASSIVES[id]) u.addPassive(PASSIVES[id]);
      // 錯開敵人 AI 評估時間
      u.aiTimer = this.rng.range(0, 0.4);
      this.units.push(u);
      this.unitById.set(u.id, u);
    }
    // 隨從認主人（依英雄欄位）
    opts.spawns.forEach((s, i) => {
      if (s.followerOf === undefined) return;
      const u = this.units[i];
      const master = this.units.find((m) => m.heroSlot === s.followerOf && m.isHero);
      if (u && master) u.masterId = master.id;
    });
    this.horde = opts.horde ?? null;
    if (this.horde) {
      for (const s of this.horde.spawners) {
        this.spawners.set(s.id, s);
        if (s.nest) this.nestBySpawner.set(s.id, this.spawnUnit(this.enemyDefFor('nest'), { x: s.x, y: s.y }).id);
      }
      this.waveState = this.horde.waves.map((def) => ({ def, fired: false, repeatsLeft: 0, nextAt: 0 }));
      if (this.horde.director) this.director = new Director(this.horde.director);
    }
    if (this.horde?.fog || opts.fog) {
      this.vision = new Vision(this.map.width, this.map.height, HORDE_VISION.cell, this.sight);
      this.updateVision();
    }
    if (opts.skirmish) this.skirmish = new SkirmishDirector(opts.skirmish.def, opts.skirmish.layer, this);
    this.championPending = opts.champion ?? null;
    this.championLine = opts.champion?.line;
    this.bag = [...(opts.bag ?? [])];
  }

  /** 包包（消耗品）：剩下的；戰鬥中用掉就拿掉 */
  bag: string[] = [];
  /** 戰鬥中從寶箱、地上撿到、要在戰後結算的東西（裝備、經驗值、金幣；Alan 2026-10-22） */
  loot: LootDef[] = [];
  /** 消耗品的共用冷卻：到這個時間才能再用 */
  consumableReadyAt = 0;

  /** 能不能用這個消耗品（在包包裡、冷卻好了、目標合理） */
  canUseConsumable(itemId: string, targetId?: number): boolean {
    const def = CONSUMABLES[itemId];
    if (!def || !def.inBattle || !this.bag.includes(itemId) || this.time < this.consumableReadyAt || this.result) return false;
    if (def.target === 'party') return true;
    const t = targetId !== undefined ? this.getUnit(targetId) : undefined;
    if (!t || !t.isHero) return false;
    return def.target === 'fallen' ? t.dead : !t.dead;
  }

  private useConsumable(itemId: string, targetId?: number): void {
    if (!this.canUseConsumable(itemId, targetId)) return;
    const def = CONSUMABLES[itemId];
    this.bag.splice(this.bag.indexOf(itemId), 1);
    this.consumableReadyAt = this.time + BAG.cooldown;
    const heroes = this.units.filter((u) => u.isHero && !u.dead);
    const heal = (u: Unit, frac: number) => {
      const amount = Math.min(Math.round(u.maxHp * frac), u.maxHp - u.hp);
      if (amount <= 0) return;
      u.hp += amount;
      this.emit({ type: 'heal', sourceId: u.id, targetId: u.id, amount });
    };
    const t = targetId !== undefined ? this.getUnit(targetId) : undefined;
    if (def.heal) for (const u of def.target === 'party' ? heroes : t ? [t] : []) heal(u, def.heal);
    if (def.revive && t?.dead) this.reviveUnit(t, def.revive);
    // 號召戰旗：隨機叫幾隻兵跟著這名英雄
    if (def.summon && t && !t.dead) this.summonFollowers(t, Array.from({ length: def.summon.count }, () => def.summon!.pool[this.rng.int(0, def.summon!.pool.length - 1)]));
    if (def.stealth)
      for (const u of heroes) {
        u.stealthTime = Math.max(u.stealthTime, def.stealth);
        u.revealTime = 0;
      }
    this.emit({ type: 'itemUsed', itemId, targetId });
  }

  /** 陣亡的單位復活（鳳凰羽毛） */
  reviveUnit(u: Unit, hpFrac: number): void {
    if (!u.dead) return;
    u.dead = false;
    u.hp = Math.max(1, Math.round(u.maxHp * hpFrac));
    u.action = null;
    u.order = null;
    u.stunTime = 0;
    u.stagger = 0;
    u.prevPos = { ...u.pos };
    this.emit({ type: 'revive', unitId: u.id });
  }

  /** 戰爭迷霧是否生效（有迷霧資料且設定沒關掉） */
  get fogActive(): boolean {
    return !!this.vision && this.config.fogOfWar;
  }

  /** 暫時的視野（頭目登場：頭目身邊的迷霧解開）：跟著單位走，到 until 為止 */
  private reveals: { unitId: number; range: number; until: number }[] = [];
  /** 已經登場過的頭目 */
  private bossesSighted = new Set<number>();

  private updateVision(): void {
    if (!this.vision) return;
    this.reveals = this.reveals.filter((r) => r.until > this.time && !this.getUnit(r.unitId)?.dead);
    const extra = this.reveals.map((r) => ({ pos: this.getUnit(r.unitId)!.pos, range: r.range }));
    // 被抓的英雄（待解救）沒有視野：救出來之前看不到他周圍（Alan 2026-10-30）
    this.vision.update([...this.units.filter((u) => u.team === 'hero' && !u.dead && !u.captive).map((u) => ({ pos: u.pos, range: HORDE_VISION.heroSightRange })), ...extra]);
  }

  // ───────────── 公開查詢 ─────────────

  get time(): number {
    return this.tick * DT;
  }

  getUnit(id: number): Unit | undefined {
    return this.unitById.get(id);
  }

  heroes(): Unit[] {
    return this.units.filter((u) => u.isHero);
  }

  /**
   * 召喚隨從（Alan 2026-10-23）：在主人身邊生成 kinds 的小兵，跟著主人。
   * 回傳生成的單位；遠征在戰後把活著的隨從記回英雄身上。
   */
  summonFollowers(master: Unit, kinds: string[]): Unit[] {
    return kinds.map((kind, i) => {
      const a = master.facing + Math.PI + (i - (kinds.length - 1) / 2) * 0.7;
      const u = this.spawnUnit(FOLLOWERS[kind], { x: master.pos.x + Math.cos(a) * 1.4, y: master.pos.y + Math.sin(a) * 1.4 });
      u.follower = true;
      u.masterId = master.id;
      return u;
    });
  }

  enemies(): Unit[] {
    return this.units.filter((u) => u.team === 'enemy');
  }

  /** 尚未生效的指令（暫停中下的指令；畫面層畫幽靈線用） */
  get pendingCommands(): readonly Command[] {
    return this.queue;
  }

  /** 依單位半徑取得膨脹後的導航格子（支援多張） */
  navGrid(radius: number): NavGrid {
    const key = Math.ceil(radius * 10 - 1e-6) / 10;
    let g = this.navGrids.get(key);
    if (!g) {
      g = new NavGrid(this.map.width, this.map.height, NAV_CELL, key, this.blockers());
      this.navGrids.set(key, g);
    }
    return g;
  }

  navFor(u: Unit): NavGrid {
    return this.navGrid(u.radius);
  }

  /** 擋路的障礙物：地圖障礙物＋關著的門 */
  blockers(): Rect[] {
    return [...this.map.obstacles, ...this.interactables.closedDoors()];
  }

  /** 擋視線的障礙物：地圖上擋視線的障礙物＋關著的門 */
  sightBlockers(): Rect[] {
    return [...this.map.obstacles.filter((o) => o.blocksSight !== false), ...this.interactables.closedDoors()];
  }

  // ───────────── 互動物件（SPEC_SLICE4 §15.1） ─────────────

  /** 英雄和物件互動：記錄次數、執行動作（開關門、拉桿）；波次可以用 { type: 'interact' } 觸發 */
  interact(u: Unit, s: InteractableState): void {
    if (!this.interactables.usable(s)) return;
    s.uses++;
    if (s.def.kind !== 'door' && s.def.kind !== 'merchant') {
      // 拉桿拉下、寶箱打開、道具撿走、祭壇用過
      s.open = true;
      this.interactables.version++;
    }
    this.emit({ type: 'interact', unitId: u.id, objectId: s.def.id });
    if (s.def.loot) this.takeLoot(u, s.def.id, s.def.loot);
    if (s.def.shrine) this.useShrine(u, s.def.id, s.def.shrine);
    for (const a of this.interactables.actionsOf(s)) this.runInteractAction(a);
  }

  /** 寶箱、地上的道具：回血立刻生效，消耗品放進包包（滿了換金幣），其他戰後結算 */
  private takeLoot(u: Unit, objectId: string, loot: LootDef): void {
    let toGold = false;
    if (loot.kind === 'heal') {
      for (const h of this.units) {
        if (!h.isHero || h.dead) continue;
        const amount = Math.min(Math.round(h.maxHp * loot.pct), h.maxHp - h.hp);
        if (amount <= 0) continue;
        h.hp += amount;
        this.emit({ type: 'heal', sourceId: u.id, targetId: h.id, amount });
      }
    } else if (loot.kind === 'consumable') {
      if (this.bag.length < BAG.capacity) this.bag.push(loot.id);
      else {
        toGold = true;
        this.loot.push({ kind: 'gold', amount: loot.gold });
      }
    } else this.loot.push(loot);
    this.emit({ type: 'loot', unitId: u.id, objectId, loot, toGold });
  }

  /** 祭壇：活著的英雄全部得到增益（新的蓋掉舊的） */
  private useShrine(u: Unit, objectId: string, shrine: ShrineKind): void {
    for (const h of this.units) {
      if (!h.isHero || h.dead) continue;
      h.shrine = shrine;
      h.shrineTime = SHRINE_RULES.duration;
    }
    this.emit({ type: 'shrine', unitId: u.id, objectId, shrine });
  }

  private runInteractAction(a: InteractAction): void {
    const door = this.interactables.get(a.door);
    if (!door || door.def.kind !== 'door') return;
    const open = a.type === 'openDoor' ? true : a.type === 'closeDoor' ? false : !door.open;
    this.setDoor(door, open);
  }

  /** 開關門；門口有單位時關不上（回傳是否成功） */
  setDoor(door: InteractableState, open: boolean): boolean {
    if (door.open === open) return true;
    const r = rectOf(door.def);
    if (!open && this.units.some((u) => !u.dead && distToRect(u.pos, r) < u.radius + INTERACT.closeClearance)) {
      this.emit({ type: 'door', objectId: door.def.id, open: door.open, blocked: true });
      return false;
    }
    door.open = open;
    this.interactables.version++;
    // 原地重算門附近的格子：導航、視線、流場（迷霧與投射物都引用同一份視線格子）
    const block = this.blockers();
    for (const g of this.navGrids.values()) g.refresh(r, block);
    this.sight.refresh(r, this.sightBlockers());
    if (this.flow) {
      this.flow.grid.refresh(r, block);
      this.flowTick = -Infinity;
    }
    // 路徑可能穿過剛關上的門，或剛打開的門有捷徑：全部重新尋路
    for (const u of this.units) u.path = null;
    this.emit({ type: 'door', objectId: door.def.id, open });
    return true;
  }

  // ───────────── 地形 ─────────────

  onHigh(u: Unit): boolean {
    return this.terrain.has(u.pos, T_HIGH);
  }

  /** 位置的移動倍率（淺水、矮籬） */
  moveMultAt(p: Vec): number {
    const f = this.terrain.flagsAt(p);
    let m = 1;
    if (f & T_SHALLOW) m = Math.min(m, TERRAIN.shallowMoveMult);
    if (f & T_HEDGE) m = Math.min(m, TERRAIN.hedgeMoveMult);
    return m;
  }

  /** 移動倍率：地形 × 敵方區域效果（沼澤） */
  moveMultFor(u: Unit): number {
    // 減速取最慢（地形、地面區域），再乘上被動的移動速度加成
    return Math.min(this.moveMultAt(u.pos), zoneMoveMult(this, u)) * (1 + u.mods.moveSpeedPct + (u.shrineDef?.moveSpeedPct ?? 0)) * (u.chillTime > 0 ? 1 - u.chillSlow : 1);
  }

  private updateZones(): void {
    updateZones(this);
  }

  /** 普攻射程：遠程單位站在高地上射程增加 */
  attackRange(u: Unit): number {
    return scaleRange(this.config, u.def.range) + u.mods.range + (!u.isMelee && this.onHigh(u) ? TERRAIN.highRangeBonus : 0);
  }

  /** 技能射程：遠程單體／地面技能站在高地上射程增加 */
  skillRange(u: Unit, def: SkillDef): number {
    const melee = def.effect.kind === 'strike' && def.effect.melee;
    return scaleRange(this.config, def.range) + (!melee && def.range >= 1 && this.onHigh(u) ? TERRAIN.highRangeBonus : 0);
  }

  /**
   * 草叢隱匿（敵我通用）：viewer 能否把 target 當成目標。
   * 草叢裡的單位對「不在同一片草叢」的敵人隱藏，除非距離夠近或剛攻擊過。
   */
  canTarget(viewer: Unit, target: Unit): boolean {
    if (target.dead) return false;
    if (viewer.team === target.team) return true;
    if (target.captive) return false;
    // 戰爭迷霧：英雄看不到視野外的敵人（SPEC_SLICE4 §6）
    if (viewer.team === 'hero' && this.fogActive && !this.vision!.isVisible(target.pos)) return false;
    // 煙霧彈：貼近才看得到；潛行（刺客）：完全看不到
    if (target.stealthTime > 0) return !target.stealthFull && dist(viewer.pos, target.pos) <= TERRAIN.brushRevealDistance;
    if (!this.terrain.any) return true;
    const patch = this.terrain.patchAt(target.pos);
    if (patch < 0 || target.revealTime > 0) return true;
    // 遊俠的鷹眼：同一方有人看穿這片草叢
    if (this.brushSeen.get(viewer.team)?.has(target.id)) return true;
    if (this.terrain.patchAt(viewer.pos) === patch) return true;
    return dist(viewer.pos, target.pos) <= TERRAIN.brushRevealDistance;
  }

  /** 對某一方是否可見（畫面用：任一存活成員看得到就算） */
  visibleToTeam(u: Unit, team: Team): boolean {
    if (u.team === team) return true;
    return this.units.some((v) => !v.dead && v.team === team && this.canTarget(v, u));
  }

  /** 矮籬掩體（SPEC_SLICE3 §2.3）：遠程攻擊路徑穿過貼近目標、但不貼近攻擊者的矮籬 */
  hasCover(origin: Vec, target: Unit): boolean {
    if (!this.terrain.any) return false;
    const r = TERRAIN.hedgeCoverRange;
    let cover = false;
    traceSupercover(this.terrain.cell, origin, target.pos, (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= this.terrain.cols || cy >= this.terrain.rows) return true;
      const i = cy * this.terrain.cols + cx;
      if (!(this.terrain.flags[i] & T_HEDGE)) return true;
      const c = this.terrain.centerOf(i);
      if (dist(c, target.pos) <= r + target.radius && dist(c, origin) > r) {
        cover = true;
        return false;
      }
      return true;
    });
    return cover;
  }

  /** 射入混戰：origin → target 的路徑上是否有其他單位擋著 */
  hasBodyCover(origin: Vec, target: Unit, srcId: number): boolean {
    const dx = target.pos.x - origin.x;
    const dy = target.pos.y - origin.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return false;
    for (const u of this.units) {
      if (u.dead || u.id === srcId || u === target) continue;
      if (dist(u.pos, origin) <= TERRAIN.bodyCoverShooterClearance) continue;
      const t = ((u.pos.x - origin.x) * dx + (u.pos.y - origin.y) * dy) / len2;
      if (t <= 0 || t >= 1) continue;
      const cx = origin.x + dx * t;
      const cy = origin.y + dy * t;
      if (Math.hypot(u.pos.x - cx, u.pos.y - cy) <= u.radius) return true;
    }
    return false;
  }

  /** 點燃半徑內的草叢 */
  ignite(point: Vec, radius: number, sourceId: number): void {
    const t = this.terrain;
    for (let i = 0; i < t.flags.length; i++) {
      if (!(t.flags[i] & T_BRUSH) || this.fire.has(i)) continue;
      if (dist(t.centerOf(i), point) <= radius) this.fire.set(i, { time: TERRAIN.fireDuration, spread: TERRAIN.fireSpreadInterval, sourceId });
    }
  }

  private updateFire(): void {
    if (this.fire.size === 0) return;
    const t = this.terrain;
    const spreadTo: [number, number][] = [];
    for (const [i, f] of this.fire) {
      f.time -= DT;
      f.spread -= DT;
      if (f.spread <= 0) {
        f.spread = TERRAIN.fireSpreadInterval;
        for (const n of t.neighbors(i)) if (t.flags[n] & T_BRUSH && !this.fire.has(n)) spreadTo.push([n, f.sourceId]);
      }
    }
    for (const [n, src] of spreadTo) if (!this.fire.has(n)) this.fire.set(n, { time: TERRAIN.fireDuration, spread: TERRAIN.fireSpreadInterval, sourceId: src });
    for (const [i, f] of [...this.fire]) {
      if (f.time <= 0) {
        this.fire.delete(i);
        t.clearBrush(i);
      }
    }
    // 站在火上的單位會燃燒
    for (const u of this.units) {
      if (u.dead) continue;
      const f = this.fire.get(t.indexOf(u.pos));
      if (!f) continue;
      if (u.burnTime <= 0) u.burnTick = 0;
      u.burnTime = Math.max(u.burnTime, TERRAIN.burnDuration);
      u.burnSourceId = f.sourceId;
    }
  }

  canSee(a: Unit, b: Unit): boolean {
    return canSeeCircle(this.sight, a.pos, a.radius, b.pos, b.radius);
  }

  canSeePoint(a: Unit, p: Vec): boolean {
    return canSeePoint(this.sight, a.pos, a.radius, p);
  }

  emit(ev: SimEvent): void {
    this.events.push(ev);
    // 敵我有人打中對方＝交戰中
    if (ev.type === 'hit' && this.getUnit(ev.sourceId)?.team !== this.getUnit(ev.targetId)?.team) this.lastClash = this.time;
  }

  /** 被困的英雄：有英雄靠近、或看守被驚動，就開打（SPEC_SLICE7 §4） */
  private updateCaptives(): void {
    for (const c of this.units) {
      if (!c.captive || c.dead) continue;
      const heroes = this.units.filter((h) => h.isHero && !h.dead);
      const near = heroes.filter((h) => dist(h.pos, c.pos) <= CAPTIVE.wakeRange);
      const guards = this.units.filter((e) => e.team === 'enemy' && !e.dead && e.squad === c.captiveSquad);
      if (!near.length && !guards.some((e) => e.alerted)) continue;
      c.captive = false;
      const master = [...heroes].sort((a, b) => dist(a.pos, c.pos) - dist(b.pos, c.pos))[0];
      c.masterId = master ? master.id : -1;
      if (guards[0]) this.alertUnit(guards[0]);
      this.emit({ type: 'captiveFreed', unitId: c.id });
      // 救出來就有視野了（被抓時不算）
      this.updateVision();
    }
  }

  /** 戰鬥中／非戰鬥中（SPEC_SLICE7 §2）：非戰鬥中才能換裝備 */
  inCombat = false;

  /** 這個單位在交戰中嗎（失衡值不消退）：我方看戰鬥狀態；敵人要已經警覺而且戰鬥中 */
  engaged(u: Unit): boolean {
    return this.inCombat && (u.team !== 'enemy' || u.alerted);
  }
  private lastClash = -Infinity;

  private updateCombatState(): void {
    const C = COMBAT_STATE;
    if (this.tick % C.interval !== 0) return;
    const ours = this.units.filter((u) => u.team === 'hero' && !u.dead);
    const near = this.units.some((e) => e.team === 'enemy' && !e.dead && e.alerted && ours.some((h) => dist(e.pos, h.pos) <= C.engageRange));
    if (near) this.lastClash = this.time;
    const now = this.time - this.lastClash < C.exitDelay;
    if (now === this.inCombat) return;
    this.inCombat = now;
    this.emit({ type: 'combatState', inCombat: now });
  }

  // ───────────── 指令 ─────────────

  enqueue(cmd: Command): void {
    this.queue.push(cmd);
  }

  /** 推進一個節拍，回傳本節拍產生的事件 */
  step(): SimEvent[] {
    this.events = [];
    if (this.result) {
      this.queue = [];
      return this.events;
    }
    const cmds = this.queue;
    this.queue = [];
    for (const c of cmds) this.applyCommand(c);

    for (const u of this.units) {
      u.prevPos = { x: u.pos.x, y: u.pos.y };
      u.movedThisTick = false;
    }
    for (const p of this.projectiles) p.prevPos = { x: p.pos.x, y: p.pos.y };

    if (this.vision && this.tick % HORDE_VISION.interval === 0) this.updateVision();
    this.updateWaves();
    this.director?.update(this);
    this.skirmish?.update(this);
    this.updateChampion();
    this.updateAggro();
    this.updateAuras();
    this.updateBrushSight();
    this.updateSighting();
    this.updateThrown();
    for (const u of this.units) this.tickTimers(u);
    for (const u of this.units) this.updateUnit(u);
    this.updateProjectiles();
    this.updateFire();
    this.updateZones();
    this.updateCombatState();
    this.updateCaptives();
    separateUnits(this.units, (u) => this.navFor(u), this.config.unitSpacing > 0 ? { gap: this.config.unitSpacing, rate: this.config.unitSpacingRate } : undefined);
    this.checkEnd();
    this.tick++;
    return this.events;
  }

  private applyCommand(cmd: Command): void {
    switch (cmd.type) {
      case 'move': {
        const units = this.liveUnits(cmd.unitIds);
        const points = this.formationPoints(units, cmd.point);
        units.forEach((u, i) => {
          u.guardPoint = null;
          this.issueOrder(u, { type: 'move', point: points[i], fromPlayer: true });
        });
        break;
      }
      case 'attack': {
        const t = this.getUnit(cmd.targetId);
        if (!t || t.dead) return;
        for (const u of this.liveUnits(cmd.unitIds)) {
          if (u.team !== t.team && this.canTarget(u, t)) {
            u.guardPoint = null;
            this.issueOrder(u, { type: 'attack', targetId: t.id });
          }
        }
        break;
      }
      case 'follow': {
        const t = this.getUnit(cmd.targetId);
        if (!t || t.dead) return;
        for (const u of this.liveUnits(cmd.unitIds)) {
          if (u !== t && u.team === t.team) {
            u.guardPoint = null;
            this.issueOrder(u, { type: 'follow', targetId: t.id });
          }
        }
        break;
      }
      case 'skill': {
        const u = this.getUnit(cmd.unitId);
        if (!u || u.dead) return;
        if (!u.def.skills.includes(cmd.skillId) || !SKILLS[cmd.skillId]) return;
        u.guardPoint = null;
        this.issueOrder(u, { type: 'skill', skillId: cmd.skillId, targetId: cmd.targetId, point: cmd.point });
        break;
      }
      case 'stop':
        for (const u of this.liveUnits(cmd.unitIds)) this.issueOrder(u, null);
        break;
      case 'setConfig':
        Object.assign(this.config, cmd.patch);
        break;
      case 'setPersonality': {
        const u = this.getUnit(cmd.unitId);
        if (u) u.personality = cmd.personality;
        break;
      }
      case 'attackMove': {
        const units = this.liveUnits(cmd.unitIds);
        const points = this.formationPoints(units, cmd.point);
        units.forEach((u, i) => {
          u.guardPoint = null;
          this.issueOrder(u, { type: 'attackMove', point: points[i] });
        });
        break;
      }
      case 'useConsumable':
        this.useConsumable(cmd.itemId, cmd.targetId);
        break;
      case 'stockBag':
        // 向地圖上的商人買的消耗品（金幣由遠征那邊扣）
        if (!this.inCombat && CONSUMABLES[cmd.itemId] && this.bag.length < BAG.capacity) this.bag.push(cmd.itemId);
        break;
      case 'setItems': {
        const u = this.units.find((o) => o.isHero && o.heroSlot === cmd.heroSlot);
        if (!u || u.dead || this.inCombat) break;
        u.setItems(cmd.items);
        break;
      }
      case 'setSkills': {
        const u = this.units.find((o) => o.isHero && o.heroSlot === cmd.heroSlot);
        if (!u || u.dead || this.inCombat || !cmd.skills.every((id) => SKILLS[id])) break;
        // def 是每名單位自己的一份（battle.ts 生成時複製），換技能時整份換掉，不改到共用的資料
        (u as unknown as { def: UnitDef }).def = { ...u.def, skills: [...cmd.skills] };
        break;
      }
      case 'interact': {
        const u = this.getUnit(cmd.unitId);
        const s = this.interactables.get(cmd.objectId);
        if (!u || u.dead || !u.isHero || !s) break;
        if (!this.interactables.usable(s)) {
          this.emit({ type: 'notice', unitId: u.id, text: s.def.locked ? tr("上鎖了") : tr("已經用過了") });
          break;
        }
        u.guardPoint = null;
        this.issueOrder(u, { type: 'interact', objectId: s.def.id });
        break;
      }
      case 'setAutocast': {
        const u = this.getUnit(cmd.unitId);
        if (!u || !u.def.skills.includes(cmd.skillId) || !canAutocast(cmd.skillId)) break;
        if (cmd.on) u.autocast.add(cmd.skillId);
        else u.autocast.delete(cmd.skillId);
        break;
      }
    }
  }

  private liveUnits(ids: number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const u = this.getUnit(id);
      // 被困的英雄（SPEC_SLICE7 §4）還沒被找到前不聽指令
      if (u && !u.dead && !u.captive && !out.includes(u)) out.push(u);
    }
    return out;
  }

  /** 群體移動隊形：以目標點為中心，依選取順序向外排列 */
  formationPoints(units: Unit[], center: Vec): Vec[] {
    if (units.length <= 1) return units.map(() => center);
    const spacing = 1.0;
    const candidates: { x: number; y: number; d: number; a: number }[] = [];
    for (let j = -3; j <= 3; j++) {
      for (let i = -3; i <= 3; i++) {
        candidates.push({ x: i * spacing, y: j * spacing, d: Math.hypot(i, j), a: Math.atan2(j, i) });
      }
    }
    candidates.sort((p, q) => p.d - q.d || p.a - q.a);
    const used = new Set<number>();
    return units.map((u) => {
      const grid = this.navFor(u);
      for (let k = 0; k < candidates.length; k++) {
        if (used.has(k)) continue;
        const p = { x: center.x + candidates[k].x, y: center.y + candidates[k].y };
        if (!grid.isWalkable(p)) continue;
        if (k > 0 && !lineWalkable(grid, center, p) && grid.isWalkable(center)) continue;
        used.add(k);
        return p;
      }
      return center;
    });
  }

  /**
   * 對單位下指令（SPEC §5.3）：
   * 準備中 → 取消準備，立即換指令；恢復中 → 存為下一個指令；相同指令不重複下達。
   */
  issueOrder(u: Unit, order: Order | null): void {
    if (u.dead) return;
    if (order && u.order && sameOrder(order, u.order)) {
      if (u.action && u.action.phase !== 'windup') u.nextOrder = undefined;
      return;
    }
    if (u.action) {
      if (u.action.phase === 'windup') {
        u.action = null;
      } else {
        u.nextOrder = order;
        return;
      }
    }
    this.setOrder(u, order);
  }

  setOrder(u: Unit, order: Order | null): void {
    if (order?.type === 'skill') {
      if (u.order?.type === 'attack' || u.order?.type === 'attackMove') u.resumeOrder = u.order;
    } else {
      u.resumeOrder = null;
    }
    this.slots.release(u.id);
    u.order = order;
    u.path = null;
    u.pathGoal = null;
    u.pinnedNotified = false;
    u.stallBest = Infinity;
    u.stallTime = 0;
  }

  /**
   * 移動卡住（被敵人堵在牆角等）：剩下的路程連續 MOVE_STALL_TIME 秒沒有縮短。
   * 有路徑時量「沿著路徑還要走多遠」：要繞路時直線距離會先變長（Alan 2026-10-22：室內地圖繞過牆時英雄半路放棄）
   */
  private moveStalled(u: Unit, goal: Vec): boolean {
    // 這一拍路徑被清掉（下一拍會重新尋路）：直線距離比路程短很多，拿來比會誤判成卡住，這一拍不算
    if (!u.path || u.pathIndex >= u.path.length) return false;
    const d = this.remainingPath(u, goal);
    if (d < u.stallBest - 0.05) {
      u.stallBest = d;
      u.stallTime = 0;
      return false;
    }
    // 被隊友擋住（一起走進窄門時常見）不算卡住：等隊友讓開就能繼續走
    if (this.units.some((o) => o !== u && !o.dead && o.team === u.team && dist(o.pos, u.pos) < o.radius + u.radius + 0.25)) return false;
    u.stallTime += DT;
    return u.stallTime >= MOVE_STALL_TIME;
  }

  /** 沿著目前的路徑走到終點還有多遠；沒有路徑時是直線距離 */
  private remainingPath(u: Unit, goal: Vec): number {
    const p = u.path;
    if (!p || u.pathIndex >= p.length) return dist(u.pos, goal);
    let d = dist(u.pos, p[u.pathIndex]);
    for (let i = u.pathIndex + 1; i < p.length; i++) d += dist(p[i - 1], p[i]);
    return d + dist(p[p.length - 1], goal);
  }

  // ───────────── 每節拍更新 ─────────────

  private updateAggro(): void {
    if (this.config.battleStyle === 'deliberate') {
      this.updateAlert();
      return;
    }
    if (this.enemyAggro) return;
    let trigger = this.time >= this.config.enemyAggroTime;
    if (!trigger) {
      outer: for (const h of this.units) {
        if (h.team !== 'hero' || h.dead) continue;
        for (const e of this.units) {
          if (e.team !== 'enemy' || e.dead) continue;
          if (dist(h.pos, e.pos) <= this.config.enemyAggroRange) {
            trigger = true;
            break outer;
          }
        }
      }
    }
    if (trigger) this.triggerAggro();
  }

  /** 敵人開始進攻；沉穩節奏下只有被打的那名（與同小隊）警覺 */
  triggerAggro(by?: Unit): void {
    if (this.config.battleStyle === 'deliberate') {
      if (by) this.alertUnit(by);
      return;
    }
    if (this.enemyAggro) return;
    this.enemyAggro = true;
    this.emit({ type: 'aggro' });
  }

  /**
   * 沉穩節奏的個別警覺（SPEC_SLICE5 §15）：英雄進入察覺距離且看得到就警覺，同小隊的同伴一起警覺。
   * 沒有全場一起衝過來的計時。
   */
  private updateAlert(): void {
    if (this.tick % 5 !== 0) return;
    const heroes = this.units.filter((h) => h.team === 'hero' && !h.dead);
    for (const e of this.units) {
      if (e.team !== 'enemy' || e.dead || e.alerted || e.def.ai === 'nest') continue;
      const spotted = heroes.some((h) => dist(h.pos, e.pos) <= this.config.enemyAggroRange && this.canTarget(e, h) && this.canSee(e, h));
      if (spotted) {
        this.alertUnit(e);
        this.emit({ type: 'notice', unitId: e.id, text: tr("！") });
      }
    }
  }

  /**
   * 敵方小隊第一次進入我方視野（迷霧、草叢隱匿都算；沒有迷霧時開場就全部看得到）：發 squadSighted。
   * 畫面層用來自動暫停等；每 3 個節拍檢查一次。
   */
  /** 被丟出去的單位：沿直線飛到落點，落地時範圍傷害（擲人） */
  private updateThrown(): void {
    for (const u of this.units) {
      const th = u.thrown;
      if (!th || u.dead) continue;
      th.t += DT;
      const s = Math.min(1, th.t / th.dur);
      u.pos = { x: th.from.x + (th.to.x - th.from.x) * s, y: th.from.y + (th.to.y - th.from.y) * s };
      u.movedThisTick = true;
      if (s < 1) continue;
      u.thrown = null;
      const src = this.getUnit(th.srcId);
      if (src) landHurl(this, src, u, th.to, SKILLS[th.skillId]);
    }
  }

  private updateSighting(): void {
    if (this.tick % 3 !== 0) return;
    const fresh = new Map<string, number[]>();
    for (const e of this.units) {
      if (e.team !== 'enemy' || e.dead) continue;
      const key = e.squad ?? `unit${e.id}`;
      if (this.sightedSquads.has(key) || !this.visibleToTeam(e, 'hero')) continue;
      const list = fresh.get(key);
      if (list) list.push(e.id);
      else fresh.set(key, [e.id]);
    }
    for (const [squad, unitIds] of fresh) {
      this.sightedSquads.add(squad);
      this.emit({ type: 'squadSighted', squad, unitIds });
    }
    // 頭目登場：第一次看到頭目本人時，頭目身邊暫時有視線（演出時看得清楚）
    for (const e of this.units) {
      if (e.team !== 'enemy' || e.dead || this.bossesSighted.has(e.id) || enemyRank(e.def) !== 'boss' || !this.visibleToTeam(e, 'hero')) continue;
      this.bossesSighted.add(e.id);
      this.reveals.push({ unitId: e.id, range: BOSS_INTRO.revealRange, until: this.time + BOSS_INTRO.revealSec });
      this.updateVision();
      this.emit({ type: 'bossSighted', unitId: e.id });
    }
  }

  /**
   * 光環（被動 aura）：每節拍給範圍內的隊友命中／防禦（沿用祝福的欄位）、給範圍內的敵人寒氣減速；
   * 效果只維持很短的時間，離開範圍就消失。
   */
  private updateAuras(): void {
    const linger = AURA_LINGER;
    // 疊加型光環（戰鬥圖騰）每個節拍重算
    for (const u of this.units) u.stackDamage = 0;
    for (const src of this.units) {
      if (src.dead) continue;
      for (const p of src.passives) {
        const a = p.aura;
        if (!a) continue;
        for (const t of this.units) {
          if (t.dead || dist(t.pos, src.pos) > a.radius + t.radius) continue;
          if (t.team === src.team && a.allies) {
            const active = t.blessTime > 0;
            t.blessTime = Math.max(t.blessTime, linger);
            t.blessAccuracy = Math.max(active ? t.blessAccuracy : 0, a.allies.accuracy);
            t.blessDefense = Math.max(active ? t.blessDefense : 0, a.allies.defense);
            t.blessDamage = Math.max(active ? t.blessDamage : 0, a.allies.damagePct ?? 0);
            t.blessHaste = Math.max(active ? t.blessHaste : 0, a.allies.attackSpeedPct ?? 0);
          }
          // 疊加型光環：每個來源都加一次
          if (t.team === src.team && a.stackDamagePct && t !== src) t.stackDamage += a.stackDamagePct;
          // 分擔光環：範圍內的隊友（不含主人自己）受到的傷害，一部分改由主人承受
          if (t.team === src.team && a.cover && t !== src) {
            t.coverTime = Math.max(t.coverTime, linger);
            t.coverBy = src.id;
            t.coverPct = a.cover;
          }
          // 吸血光環：範圍內的隊友（不含主人自己）打中敵人時傷害上升並吸血，主人扣血
          if (t.team === src.team && a.drain && t !== src) {
            t.drainAuraTime = Math.max(t.drainAuraTime, linger);
            t.drainAuraOwner = src.id;
            t.drainAuraDamagePct = a.drain.damagePct;
            t.drainAuraLifesteal = a.drain.lifesteal;
            t.drainAuraOwnerCost = a.drain.ownerCost;
          } else if (t.team !== src.team && a.enemies) {
            const active = t.chillTime > 0;
            t.chillTime = Math.max(t.chillTime, linger);
            t.chillSlow = Math.max(active ? t.chillSlow : 0, a.enemies.slow ?? 0);
            t.chillVuln = Math.max(active ? t.chillVuln : 0, a.enemies.vuln ?? 0);
            t.chillStagger = Math.max(active ? t.chillStagger : 0, a.enemies.staggerVuln ?? 0);
          }
        }
      }
    }
  }

  /** 魔王的冠軍：還沒進場的資料、登場台詞、是否已經預告 */
  private championPending: { def: UnitDef; pos: Vec; delay: number } | null = null;
  championLine: string | undefined;
  private championWarned = false;

  /** 冠軍：開戰時預告，時間到從地圖邊緣進場，直接進入追獵（沿流場朝隊伍走） */
  private updateChampion(): void {
    const c = this.championPending;
    if (!c) return;
    if (!this.championWarned) {
      this.championWarned = true;
      this.emit({ type: 'championIncoming', seconds: c.delay, point: { ...c.pos } });
    }
    if (this.time < c.delay) return;
    this.championPending = null;
    const u = this.spawnUnit(c.def, c.pos);
    u.squad = 'champion';
    u.alerted = true;
    u.hunting = true;
    this.emit({ type: 'championArrived', unitId: u.id });
  }

  /** 看穿草叢（被動 seesBrush）：範圍內、看得到的草叢裡的敵人，對同一方全體現形（視野分享） */
  private brushSeen = new Map<string, Set<number>>();
  private updateBrushSight(): void {
    this.brushSeen.clear();
    if (!this.terrain.any) return;
    for (const v of this.units) {
      if (v.dead) continue;
      const r = v.passives.reduce((m, p) => Math.max(m, p.seesBrush ?? 0), 0);
      if (r <= 0) continue;
      for (const t of this.units) {
        if (t.dead || t.team === v.team || dist(t.pos, v.pos) > r || this.terrain.patchAt(t.pos) < 0) continue;
        if (!this.canSee(v, t)) continue;
        let set = this.brushSeen.get(v.team);
        if (!set) this.brushSeen.set(v.team, (set = new Set()));
        set.add(t.id);
      }
    }
  }

  /** 讓一名敵人（與同小隊的同伴）警覺 */
  alertUnit(u: Unit): void {
    if (u.team !== 'enemy' || u.alerted) return;
    const group = u.squad ? this.units.filter((o) => o.team === 'enemy' && !o.dead && o.squad === u.squad) : [u];
    for (const o of group) o.alerted = true;
    u.alerted = true;
    if (!this.enemyAggro) {
      this.enemyAggro = true;
      this.emit({ type: 'aggro' });
    }
  }

  private tickTimers(u: Unit): void {
    if (u.dead) return;
    if (u.revealTime > 0) u.revealTime = Math.max(0, u.revealTime - DT);
    if (u.curseTime > 0) u.curseTime = Math.max(0, u.curseTime - DT);
    if (u.chillTime > 0) u.chillTime = Math.max(0, u.chillTime - DT);
    if (u.drainAuraTime > 0) u.drainAuraTime = Math.max(0, u.drainAuraTime - DT);
    if (u.coverTime > 0) u.coverTime = Math.max(0, u.coverTime - DT);
    if (u.enchantAttrTime > 0) u.enchantAttrTime = Math.max(0, u.enchantAttrTime - DT);
    if (u.sunderTime > 0) {
      u.sunderTime = Math.max(0, u.sunderTime - DT);
      if (u.sunderTime === 0) u.sunderStacks = 0;
    }
    tickFocus(this, u);
    if (u.stealthTime > 0) u.stealthTime = Math.max(0, u.stealthTime - DT);
    if (u.stealthTime <= 0) u.stealthFull = false;
    if (u.burnTime > 0) {
      u.burnTime = Math.max(0, u.burnTime - DT);
      u.burnTick -= DT;
      if (u.burnTick <= 0) {
        u.burnTick = 1;
        const src = this.getUnit(u.burnSourceId) ?? u;
        applyDamage(this, u, TERRAIN.burnDamagePerSecond, 'area', src, { skillId: 'burn', dot: true });
        if (u.dead) return;
      }
    }
    if (u.rootTime > 0) u.rootTime = Math.max(0, u.rootTime - DT);
    if (u.blessTime > 0) u.blessTime = Math.max(0, u.blessTime - DT);
    if (u.markTime > 0) u.markTime = Math.max(0, u.markTime - DT);
    if (u.empowerTime > 0) u.empowerTime = Math.max(0, u.empowerTime - DT);
    if (u.shrineTime > 0) {
      u.shrineTime = Math.max(0, u.shrineTime - DT);
      // 復甦祭壇：每秒回復（累積到整數才加，不跳字）
      const regen = u.shrine ? SHRINES[u.shrine].regenPct : undefined;
      if (regen && !u.dead) {
        u.shrineRegen += u.maxHp * regen * DT;
        const whole = Math.floor(u.shrineRegen);
        if (whole > 0) {
          u.shrineRegen -= whole;
          u.hp = Math.min(u.maxHp, u.hp + whole);
        }
      }
    }
    if (u.guardTime > 0) {
      u.guardTime = Math.max(0, u.guardTime - DT);
      if (u.guardTime === 0) u.guardedBy = -1;
    }
    if (u.aiTimer > 0) u.aiTimer -= DT;
    if (u.retreatCooldown > 0) u.retreatCooldown = Math.max(0, u.retreatCooldown - DT);
    if (u.damageBuffTime > 0) u.damageBuffTime = Math.max(0, u.damageBuffTime - DT);
    if (u.counterWardTime > 0) u.counterWardTime = Math.max(0, u.counterWardTime - DT);
    if (u.bearTime > 0) tickBear(this, u);
    if (u.hasteTime > 0) u.hasteTime = Math.max(0, u.hasteTime - DT);
    if (u.bloodMarkTime > 0) u.bloodMarkTime = Math.max(0, u.bloodMarkTime - DT);
    for (const k in u.cooldowns) {
      if (u.cooldowns[k] <= 0) continue;
      u.cooldowns[k] = Math.max(0, u.cooldowns[k] - DT);
      if (u.cooldowns[k] === 0) {
        // 冷卻完成：回復一次使用；還沒滿就繼續回復下一次
        const max = u.maxCharges(k);
        u.charges[k] = Math.min(max, (u.charges[k] ?? 0) + 1);
        if (u.charges[k] < max) u.cooldowns[k] = skillCooldownOf(this, u, k);
      }
    }
  }

  private updateUnit(u: Unit): void {
    if (u.dead) return;
    // 失衡（SPEC_STAGGER §3）：交戰中不消退；脫離交戰後 decaySec 秒從滿退到 0
    if (u.stagger > 0 && !this.engaged(u)) u.stagger = Math.max(0, u.stagger - (u.poise * DT) / STAGGER.decaySec);
    if (u.stunTime > 0) {
      u.stunTime = Math.max(0, u.stunTime - DT);
      return;
    }
    if (u.staggerHalf > 0) u.staggerHalf = Math.max(0, u.staggerHalf - DT);
    if (u.action) {
      const a = u.action;
      if (a.phase === 'windup') {
        if (!this.actionTargetValid(u)) {
          u.action = null;
          this.setOrder(u, u.resumeOrder ?? null);
        } else {
          this.faceActionTarget(u);
          a.ticksLeft--;
          if (a.ticksLeft <= 0) finishWindup(this, u);
        }
      } else if (a.phase === 'dash') {
        tickDash(this, u);
      } else {
        a.ticksLeft--;
        if (a.ticksLeft <= 0) {
          u.action = null;
          if (u.nextOrder !== undefined) {
            this.setOrder(u, u.nextOrder);
            u.nextOrder = undefined;
          }
        }
      }
      return;
    }

    if (u.team === 'enemy') {
      if (u.def.ai === 'horde') hordeThink(this, u);
      else if (u.def.ai !== 'nest') enemyThink(this, u);
    } else if (u.totem) {
      // 圖騰（杜爾根）：不移動；會揮砍的（大圖騰）打射程內最近的敵人
      if (u.aiTimer <= 0) {
        u.aiTimer = FOLLOWER_RULES.thinkInterval;
        const reach = u.def.range + 0.5;
        const t = u.def.damage[1] > 0 ? this.units.filter((e) => !e.dead && e.team !== u.team && this.canTarget(u, e) && dist(e.pos, u.pos) <= reach + e.radius).sort((a, b) => dist(a.pos, u.pos) - dist(b.pos, u.pos))[0] : undefined;
        if (t && !(u.order?.type === 'attack' && u.order.targetId === t.id)) this.setOrder(u, { type: 'attack', targetId: t.id });
        else if (!t && u.order) this.setOrder(u, null);
      }
    } else if (u.follower) {
      // 隨從（Alan 2026-10-23）：跟著主人、自己打；被困的英雄還沒被找到前不動
      if (u.captive) return;
      if (u.aiTimer <= 0) {
        u.aiTimer = FOLLOWER_RULES.thinkInterval;
        const o = followerOrder(this, u);
        if (o === null) this.setOrder(u, null);
        else if (o && !sameOrder(o, u.order)) this.setOrder(u, o);
      }
    } else if (u.autocast.size > 0 && (!u.order || u.order.type === 'attack' || u.order.type === 'attackMove')) {
      // 技能自動施放：玩家正在移動或施放其他技能時不搶指令
      u.autocastTimer -= DT;
      if (u.autocastTimer <= 0) {
        u.autocastTimer = AUTOCAST_INTERVAL;
        const o = autocastOrder(this, u);
        if (o) this.setOrder(u, o);
      }
    }
    else if (!u.order) {
      // 沉穩節奏（Alan）：性格一律是堅守
      const personality = this.config.battleStyle === 'deliberate' ? 'steadfast' : u.personality;
      const o = (this.idleBehavior ?? IDLE_BEHAVIORS[personality]).decide(this, u);
      if (o?.type === 'move' && !this.idleBehavior && personality === 'guerrilla') this.emit({ type: 'notice', unitId: u.id, text: tr("逃跑！") });
      if (o) this.setOrder(u, o);
    }
    if (u.order) this.executeOrder(u);
  }

  private actionTargetValid(u: Unit): boolean {
    const a = u.action!;
    if (a.targetId === undefined) return true;
    const t = this.getUnit(a.targetId);
    return !!t && !t.dead;
  }

  private faceActionTarget(u: Unit): void {
    const a = u.action!;
    let p: Vec | undefined = a.point;
    if (a.targetId !== undefined) p = this.getUnit(a.targetId)?.pos;
    if (p && (p.x !== u.pos.x || p.y !== u.pos.y)) u.facing = Math.atan2(p.y - u.pos.y, p.x - u.pos.x);
  }

  private executeOrder(u: Unit): void {
    const o = u.order!;
    switch (o.type) {
      case 'move': {
        const r = this.moveAlong(u, o.point);
        if (r === 'arrived' && o.fromPlayer) u.guardPoint = { x: u.pos.x, y: u.pos.y };
        if (r === 'arrived' || r === 'nopath') this.setOrder(u, null);
        else if (r === 'pinned') this.stopPinned(u);
        // 卡住走不到（例如逃跑時被敵人堵住）：放棄這個移動，交回閒置行為重新判斷
        else if (this.moveStalled(u, o.point)) this.setOrder(u, null);
        break;
      }
      case 'follow': {
        const t = this.getUnit(o.targetId);
        if (!t || t.dead) {
          this.setOrder(u, null);
          break;
        }
        if (edgeDistance(u, t) > 1.2) {
          const r = this.moveAlong(u, t.pos, { stopDist: u.radius + t.radius + 0.8 });
          if (r === 'pinned') this.stopPinned(u);
        }
        break;
      }
      case 'attack': {
        const t = this.getUnit(o.targetId);
        if (!t || t.dead || t.team === u.team || !this.canTarget(u, t)) {
          // 目標死亡或躲進草叢：失去目標；沉穩節奏的英雄就地駐守（Alan 2026-10-31：點敵人＝鎖定它，打倒後不亂跑）
          if (!u.guardPoint && u.team === 'hero' && this.config.battleStyle === 'deliberate') u.guardPoint = { x: u.pos.x, y: u.pos.y };
          this.setOrder(u, null);
          break;
        }
        const inRange = edgeDistance(u, t) <= this.attackRange(u) + RANGE_TOLERANCE && (u.isMelee || u.def.arcAttack || this.canSee(u, t));
        const guard = o.leashed ? u.guardPoint : null;
        if (guard && !inRange && !withinLeash(this, u, t, guard)) {
          // 目標跑出駐守範圍：放棄，走回駐守點
          this.setOrder(u, returnToGuard(u, guard));
          break;
        }
        if (inRange) {
          startAction(this, u, { kind: 'attack', targetId: t.id });
          break;
        }
        const r = guard ? this.moveAlong(u, leashedApproachPoint(this, u, t, guard), { stopDist: 0.05 }) : this.approachUnit(u, t, u.isMelee);
        if (r === 'pinned') this.stopPinned(u);
        else if (r === 'nopath') this.setOrder(u, null);
        break;
      }
      case 'skill':
        this.executeSkillOrder(u, o);
        break;
      case 'attackMove':
        this.executeAttackMove(u, o);
        break;
      case 'interact':
        this.executeInteract(u, o);
        break;
    }
  }

  /** 互動指令：走到物件旁邊再互動 */
  private executeInteract(u: Unit, o: Extract<Order, { type: 'interact' }>): void {
    const s = this.interactables.get(o.objectId);
    if (!s || !this.interactables.usable(s)) {
      this.setOrder(u, null);
      return;
    }
    if (inInteractRange(u, s.def)) {
      this.setOrder(u, null);
      u.guardPoint = { x: u.pos.x, y: u.pos.y };
      this.interact(u, s);
      return;
    }
    if (!o.point) o.point = approachPoint(u, s.def);
    const r = this.moveAlong(u, o.point, { stopDist: 0.05 });
    if (r === 'pinned') this.stopPinned(u);
    else if (r === 'nopath' || (r === 'arrived' && !inInteractRange(u, s.def))) this.setOrder(u, null);
  }

  /** 攻擊移動（SPEC_SLICE4 §3.1b）：途中接戰射程附近的敵人，打完繼續走 */
  private executeAttackMove(u: Unit, o: Extract<Order, { type: 'attackMove' }>): void {
    let t = o.targetId !== undefined ? this.getUnit(o.targetId) : undefined;
    const atPoint = this.config.attackMoveFocus === 'point';
    // 目標點模式：目標離開目標點太遠就放棄（不會被拖著跑）；但現在打得到的目標不放
    if (t && atPoint && !this.canHitNow(u, t) && dist(t.pos, o.point) - t.radius > this.config.attackMoveRange + ATTACK_MOVE_LEASH) t = undefined;
    if (!t || t.dead || !this.canTarget(u, t)) {
      t = atPoint ? this.acquireNearPoint(u, o.point, this.config.attackMoveRange) : this.acquireTarget(u, this.attackRange(u) + this.config.attackMoveRange);
      o.targetId = t?.id;
    }
    // 目標點模式途中被打（Alan 2026-10-31）：打自己、而且現在打得到的敵人優先還手；沒被打就照舊不理路邊的敵人（才能脫離）
    if (atPoint && (!t || !this.canHitNow(u, t))) {
      const r = this.retaliationTarget(u);
      if (r) {
        t = r;
        o.targetId = r.id;
      }
    }
    // 沉穩節奏的英雄（Alan 2026-10-21）：攻擊移動一接戰就不再往目標點前進——
    // 目標被推開、跑掉或死掉時就地駐守（不會為了原本的目標點往前走而停止輸出、暴露後排）；遠程英雄也不追出射程
    const hold = o.engaged && u.team === 'hero' && this.config.battleStyle === 'deliberate';
    if (hold && (!t || (!u.isMelee && edgeDistance(u, t) > this.attackRange(u) + RANGE_TOLERANCE))) {
      u.guardPoint = { x: u.pos.x, y: u.pos.y };
      this.setOrder(u, null);
      return;
    }
    if (t) {
      if (this.canHitNow(u, t)) {
        o.engaged = true;
        startAction(this, u, { kind: 'attack', targetId: t.id });
        return;
      }
      const r = this.approachUnit(u, t, u.isMelee);
      if (r !== 'pinned' && r !== 'nopath') return;
      // 接近不了：放棄這個目標，繼續往目標點走
      o.targetId = undefined;
    }
    const r = this.moveAlong(u, o.point);
    if (r === 'arrived') u.guardPoint = { x: u.pos.x, y: u.pos.y };
    if (r === 'arrived' || r === 'nopath') this.setOrder(u, null);
    else if (r === 'pinned') this.stopPinned(u);
  }

  /** 不用移動就打得到 t（射程內；遠程要有視線） */
  private canHitNow(u: Unit, t: Unit): boolean {
    return edgeDistance(u, t) <= this.attackRange(u) + RANGE_TOLERANCE && (u.isMelee || !!u.def.arcAttack || this.canSee(u, t));
  }

  /** 還手的對象：正在對自己出手、或 RETALIATE_SEC 秒內打中過自己，而且現在打得到的敵人裡最近的 */
  private retaliationTarget(u: Unit): Unit | undefined {
    const since = this.time - RETALIATE_SEC;
    const recent = new Set<number>();
    for (let i = u.threatLog.length - 1; i >= 0 && u.threatLog[i].t >= since; i--) recent.add(u.threatLog[i].id);
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const e of this.units) {
      if (e.dead || e.team === u.team || !this.canTarget(u, e)) continue;
      if (!recent.has(e.id) && e.action?.targetId !== u.id) continue;
      if (!this.canHitNow(u, e)) continue;
      const d = edgeDistance(u, e);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** 攻擊移動（目標點模式）：離目標點最近的敵人（距離 ≤ range），途中身邊的敵人不理會 */
  private acquireNearPoint(u: Unit, point: Vec, range: number): Unit | undefined {
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const e of this.units) {
      if (e.dead || e.team === u.team || !this.canTarget(u, e)) continue;
      const d = dist(e.pos, point) - e.radius;
      if (d > range || d >= bestD) continue;
      bestD = d;
      best = e;
    }
    return best;
  }

  /** 最近的可攻擊敵人（邊緣距離 ≤ range；遠程需要視線） */
  private acquireTarget(u: Unit, range: number): Unit | undefined {
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const e of this.units) {
      if (e.dead || e.team === u.team || !this.canTarget(u, e)) continue;
      const d = edgeDistance(u, e);
      if (d > range || d >= bestD) continue;
      if (!u.isMelee && !u.def.arcAttack && !this.canSee(u, e)) continue;
      bestD = d;
      best = e;
    }
    return best;
  }

  private executeSkillOrder(u: Unit, o: Extract<Order, { type: 'skill' }>): void {
    const def = SKILLS[o.skillId];
    if (!def) {
      this.setOrder(u, null);
      return;
    }
    if (offCycle(u, def.id)) {
      this.emit({ type: 'notice', unitId: u.id, text: tr("還沒輪到這一招") });
      this.setOrder(u, u.resumeOrder ?? null);
      return;
    }
    if (!u.skillReady(def.id)) {
      this.emit({ type: 'notice', unitId: u.id, text: tr("冷卻中") });
      this.setOrder(u, u.resumeOrder ?? null);
      return;
    }
    const dashSkill = def.effect.kind === 'charge' || def.effect.kind === 'tumble' || def.effect.kind === 'rush' || def.effect.kind === 'leap';
    if (dashSkill && u.rooted) {
      this.emit({ type: 'notice', unitId: u.id, text: tr("被定身") });
      this.setOrder(u, u.resumeOrder ?? null);
      return;
    }
    // 潛行：附近有敵人時不能用（Alan 2026-10-25：被鎖定時仍可用，但要離敵人一段距離）
    if (def.effect.kind === 'stealth') {
      const r = def.effect.minEnemyDist;
      if (this.units.some((e) => !e.dead && e.team !== u.team && !e.captive && dist(e.pos, u.pos) <= r)) {
        this.emit({ type: 'notice', unitId: u.id, text: tr("敵人太近") });
        this.setOrder(u, u.resumeOrder ?? null);
        return;
      }
    }
    if (def.target === 'self') {
      startAction(this, u, { kind: 'skill', skillId: def.id });
      return;
    }
    if (def.target === 'ground') {
      const p = o.point;
      if (!p) {
        this.setOrder(u, null);
        return;
      }
      if (dist(u.pos, p) <= this.skillRange(u, def) + RANGE_TOLERANCE && (!def.requiresLos || this.canSeePoint(u, p))) {
        startAction(this, u, { kind: 'skill', skillId: def.id, point: { ...p } });
        return;
      }
      const r = this.moveAlong(u, p, { stopDist: 0.05 });
      if (r === 'pinned') this.stopPinned(u);
      else if (r === 'nopath' || r === 'arrived') {
        // 走到點上仍不符合（例如沒有視線）：放棄
        if (r === 'nopath' || !(dist(u.pos, p) <= this.skillRange(u, def))) this.setOrder(u, null);
      }
      return;
    }
    const t = o.targetId !== undefined ? this.getUnit(o.targetId) : undefined;
    if (!t || t.dead || !this.validSkillTarget(u, def, t) || !this.canTarget(u, t)) {
      this.setOrder(u, u.resumeOrder ?? null);
      return;
    }
    const melee = def.effect.kind === 'strike' && def.effect.melee;
    if (edgeDistance(u, t) <= this.skillRange(u, def) + RANGE_TOLERANCE && (!def.requiresLos || this.canSee(u, t))) {
      startAction(this, u, { kind: 'skill', skillId: def.id, targetId: t.id, point: o.point ? { ...o.point } : undefined });
      return;
    }
    const r = this.approachUnit(u, t, melee);
    if (r === 'pinned') this.stopPinned(u);
    else if (r === 'nopath') this.setOrder(u, null);
  }

  validSkillTarget(u: Unit, def: SkillDef, t: Unit): boolean {
    switch (def.target) {
      case 'enemy':
        return t.team !== u.team;
      case 'ally':
        return t.team === u.team && t !== u;
      case 'allyOrSelf':
        return t.team === u.team;
      case 'unit':
        return t !== u;
      default:
        return false;
    }
  }

  private stopPinned(u: Unit): void {
    const by = this.pinnedByForMove(u);
    if (!u.pinnedNotified) {
      this.emit({ type: 'pinned', unitId: u.id, byId: by?.id ?? -1 });
      u.pinnedNotified = true;
    }
    this.setOrder(u, null);
  }

  private pinnedByForMove(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const e of this.units) {
      if (e.dead || e.team === u.team || !e.def.projectsZoc) continue;
      const d = dist(u.pos, e.pos) - zoneDistance(e, u, this.config);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** 接近目標單位：近戰走向分配到的站位，遠程直接走向目標（每節拍會先檢查射程與視線） */
  approachUnit(u: Unit, t: Unit, melee: boolean): MoveResult {
    if (melee) {
      const grid = this.navFor(u);
      const slot = this.slots.claim(t.id, t.pos, t.radius, u.id, u.pos, u.radius, (p) => grid.isWalkable(p));
      return this.moveAlong(u, slot.pos, { stopDist: 0.05, avoidZoc: u.def.ai === 'skirmisher' || u.def.ai === 'lurker' });
    }
    return this.moveAlong(u, t.pos, { stopDist: u.radius + t.radius });
  }

  /** 沿路徑移動一個節拍 */
  moveAlong(u: Unit, goal: Vec, opts: MoveOptions = {}): MoveResult {
    if (u.rooted && !opts.ignoreRoot) return 'rooted';
    const stopDist = opts.stopDist ?? 0.1;
    if (dist(u.pos, goal) <= stopDist) {
      u.path = null;
      return 'arrived';
    }
    const grid = this.navFor(u);
    if (!u.path || !u.pathGoal || dist(u.pathGoal, goal) > 0.3 || u.repathTimer <= 0) {
      const path = this.computePath(u, goal, !!opts.avoidZoc);
      if (!path || path.length === 0) {
        u.path = null;
        return 'nopath';
      }
      u.path = path;
      u.pathIndex = 0;
      u.pathGoal = { x: goal.x, y: goal.y };
      u.repathTimer = 0.75;
    }
    u.repathTimer -= DT;

    const speed = (opts.speed ?? u.def.moveSpeed * this.config.moveSpeedMult) * this.moveMultFor(u);
    const ignoreZoc = opts.ignoreZoc || u.def.ignoresZoc || u.stealthTime > 0;
    let step = speed * DT;
    let moved = false;
    // 一個節拍內可能經過多個路徑點
    for (let guard = 0; guard < 4 && step > 1e-6 && u.path && u.pathIndex < u.path.length; guard++) {
      const wp = u.path[u.pathIndex];
      const d = dist(u.pos, wp);
      let to: Vec;
      let used: number;
      if (d <= step) {
        to = { x: wp.x, y: wp.y };
        used = d;
      } else {
        to = { x: u.pos.x + ((wp.x - u.pos.x) / d) * step, y: u.pos.y + ((wp.y - u.pos.y) / d) * step };
        used = step;
      }
      if (!ignoreZoc) {
        const blocker = pinBlocker(this, u, u.pos, to);
        if (blocker) return moved ? 'moving' : 'pinned';
      }
      if (!grid.isWalkable(to)) {
        u.path = null;
        break;
      }
      if (!ignoreZoc) {
        for (const e of disengagedFrom(this, u, u.pos, to)) freeAttack(this, e, u);
        if (u.dead) return 'moving';
      }
      if (to.x !== u.pos.x || to.y !== u.pos.y) u.facing = Math.atan2(to.y - u.pos.y, to.x - u.pos.x);
      u.pos = to;
      moved = true;
      u.movedThisTick = true;
      step -= used;
      if (dist(u.pos, wp) < 0.1) u.pathIndex++;
      if (d > used) break;
    }
    if (dist(u.pos, goal) <= stopDist || (u.path && u.pathIndex >= u.path.length)) {
      u.path = null;
      return 'arrived';
    }
    return 'moving';
  }

  private computePath(u: Unit, goal: Vec, avoidZoc: boolean): Vec[] | null {
    const grid = this.navFor(u);
    let extraCost: ((cx: number, cy: number) => number) | undefined;
    if (avoidZoc) {
      const zones = this.units
        .filter((e) => !e.dead && e.team !== u.team && e.def.projectsZoc && this.config.zocMode !== 'off')
        .map((e) => ({ p: e.pos, r: zoneDistance(e, u, this.config) + 0.3 }));
      if (zones.length > 0) {
        extraCost = (cx, cy) => {
          const c = grid.cellCenter(cx, cy);
          for (const z of zones) if (dist(c, z.p) <= z.r) return AVOID_ZOC_COST;
          return 0;
        };
      }
    }
    if (!extraCost && grid.isWalkable(goal) && lineWalkable(grid, u.pos, goal)) return [{ x: goal.x, y: goal.y }];
    const raw = findPath(grid, u.pos, goal, { extraCost });
    if (!raw) return null;
    if (!extraCost) return smoothPath(grid, u.pos, raw);
    const ec = extraCost;
    const startCost = ec(grid.cellOf(u.pos).cx, grid.cellOf(u.pos).cy);
    return smoothPath(grid, u.pos, raw, (cx, cy) => ec(cx, cy) <= startCost);
  }

  /** 戰鬥中生成單位（援軍）；位置不可走時找最近的可走點 */
  spawnUnit(def: UnitDef, pos: Vec, byId?: number, waveId?: string): Unit {
    const grid = this.navGrid(def.radius);
    let p = pos;
    if (!grid.isWalkable(p)) {
      const c = grid.cellOf(p);
      const n = grid.nearestWalkableCell(c.cx, c.cy);
      if (n) p = grid.cellCenter(n.cx, n.cy);
    }
    const u = new Unit(this.nextUnitId++, def, p, -1);
    u.aiTimer = 0;
    // 沉穩節奏：戰鬥中召喚出來的援軍直接進入戰鬥
    if (byId !== undefined && this.config.battleStyle === 'deliberate') u.alerted = true;
    this.units.push(u);
    this.unitById.set(u.id, u);
    this.emit({ type: 'spawn', unitId: u.id, byId, waveId });
    return u;
  }

  // ───────────── 怪群模式：流場、直線移動、波次（SPEC_SLICE4） ─────────────

  /** 流場的下一步（往最近的英雄）；每 HORDE.flowInterval 節拍重算一次 */
  flowNext(p: Vec): Vec | null {
    if (!this.flow) this.flow = new FlowField(new NavGrid(this.map.width, this.map.height, HORDE.flowCell, HORDE.flowRadius, this.blockers()));
    if (this.tick - this.flowTick >= HORDE.flowInterval) {
      this.flowTick = this.tick;
      this.flow.compute(this.units.filter((h) => h.team === 'hero' && !h.dead && h.stealthTime <= 0).map((h) => h.pos));
    }
    return this.flow.nextPoint(p);
  }

  /** 流場距離（格；測試與除錯用） */
  flowDistanceAt(p: Vec): number {
    this.flowNext(p);
    return this.flow!.distanceAt(p);
  }

  /** 朝某點直線走一個節拍（雜兵用，不尋路）；控制區、不可走格、脫離攻擊照常處理 */
  stepToward(u: Unit, goal: Vec, stopDist = 0): MoveResult {
    if (u.rooted) return 'rooted';
    const d = dist(u.pos, goal);
    if (d <= stopDist + 1e-6) return 'arrived';
    const speed = u.def.moveSpeed * this.config.moveSpeedMult * this.moveMultFor(u);
    const step = Math.min(speed * DT, d - stopDist);
    const dx = (goal.x - u.pos.x) / d;
    const dy = (goal.y - u.pos.y) / d;
    const grid = this.navFor(u);
    // 直走不通時嘗試偏轉 45°、90°（貼牆、繞角）；先試上次成功的那一側，避免在牆角左右來回
    let to: Vec | null = null;
    for (const base of STEER_TURNS) {
      const turn = base * u.steerSign;
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      const p = { x: u.pos.x + (dx * c - dy * sn) * step, y: u.pos.y + (dx * sn + dy * c) * step };
      if (grid.isWalkable(p)) {
        to = p;
        if (turn !== 0) u.steerSign = turn > 0 ? 1 : -1;
        break;
      }
    }
    if (!to) return 'nopath';
    const ignoreZoc = u.def.ignoresZoc || u.stealthTime > 0;
    if (!ignoreZoc) {
      if (pinBlocker(this, u, u.pos, to)) return 'pinned';
      for (const e of disengagedFrom(this, u, u.pos, to)) freeAttack(this, e, u);
      if (u.dead) return 'moving';
    }
    u.facing = Math.atan2(to.y - u.pos.y, to.x - u.pos.x);
    u.pos = to;
    u.movedThisTick = true;
    return dist(u.pos, goal) <= stopDist + 1e-6 ? 'arrived' : 'moving';
  }

  /** 存活的敵人（不含巢穴） */
  private liveEnemyCount(): number {
    let n = 0;
    for (const u of this.units) if (u.team === 'enemy' && !u.dead && u.def.ai !== 'nest') n++;
    return n;
  }

  private waveFired(id: string): boolean {
    return this.waveState.some((s) => s.def.id === id && s.fired);
  }

  private updateWaves(): void {
    if (!this.horde) return;
    for (const st of this.waveState) {
      if (!st.fired) {
        if (!this.waveTriggered(st.def)) continue;
        st.fired = true;
        st.repeatsLeft = st.def.repeat?.times ?? 0;
        st.nextAt = this.time + (st.def.repeat?.interval ?? 0);
        this.spawnWave(st.def);
      } else if (st.repeatsLeft !== 0 && this.time >= st.nextAt - 1e-9) {
        if (st.repeatsLeft > 0) st.repeatsLeft--;
        st.nextAt += st.def.repeat!.interval;
        this.spawnWave(st.def);
      }
    }
  }

  private waveTriggered(w: WaveDef): boolean {
    return this.triggerMet(w.trigger);
  }

  /** 觸發條件是否成立（波次與自動出怪的階段共用） */
  triggerMet(t: WaveTrigger): boolean {
    switch (t.type) {
      case 'start':
        return true;
      case 'time':
        return this.time >= t.t - 1e-9;
      case 'area':
        return this.units.some((h) => h.team === 'hero' && !h.dead && h.pos.x >= t.rect.x && h.pos.x <= t.rect.x + t.rect.w && h.pos.y >= t.rect.y && h.pos.y <= t.rect.y + t.rect.h);
      case 'remaining':
        return (!t.after || this.waveFired(t.after)) && this.liveEnemyCount() <= t.count;
      case 'interact':
        return (this.interactables.get(t.id)?.uses ?? 0) > 0;
    }
  }

  private spawnWave(w: WaveDef): void {
    let any = false;
    for (const sp of w.spawns) {
      const s = this.spawners.get(sp.spawner);
      if (!s) continue;
      // 巢穴被摧毀：這個生成點不再生成
      const nestId = this.nestBySpawner.get(s.id);
      if (nestId !== undefined && this.getUnit(nestId)?.dead) continue;
      const def = this.enemyDefFor(sp.enemy, sp.captain);
      for (let k = 0; k < sp.count; k++) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = Math.sqrt(this.rng.next()) * s.radius;
        const u = this.spawnUnit(def, { x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r }, undefined, w.id);
        u.waveId = w.id;
        u.aiTimer = this.rng.range(0, HORDE.retargetInterval);
        any = true;
      }
    }
    if (!any) return;
    this.emit({ type: 'waveStart', waveId: w.id });
    this.triggerAggro();
  }

  // ───────────── 投射物 ─────────────

  /** from：發射位置（穿透的箭從上一個目標身上繼續飛）；省略為攻擊者位置 */
  spawnProjectile(src: Unit, kind: ProjectileKind, speed: number, payload: ProjectilePayload, target: { unit?: Unit; point?: Vec }, from?: Vec): void {
    const arc = payload.type === 'strike' && !!payload.arc;
    const collides = !!target.unit && !arc && payload.type !== 'aoe' && payload.type !== 'aoeHeal';
    const at = from ?? src.pos;
    const atR = from ? 0 : src.radius;
    // 直射：從看得見的取樣點發射、瞄準對應的取樣點（與視線判定一致，不會一出手就撞牆）
    const line = collides ? clearLine(this.sight, at, atR, target.unit!.pos, target.unit!.radius) : null;
    const start = line ? line.from : { x: at.x, y: at.y };
    this.projectiles.push({
      id: this.nextProjectileId++,
      sourceId: src.id,
      origin: { x: at.x, y: at.y },
      aim: line?.aim,
      collides,
      targetId: target.unit?.id,
      point: target.point ? { ...target.point } : undefined,
      pos: { ...start },
      prevPos: { ...start },
      speed,
      kind,
      payload,
    });
  }

  private updateProjectiles(): void {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      const tu = p.targetId !== undefined ? this.getUnit(p.targetId) : undefined;
      if (p.targetId !== undefined && (!tu || tu.dead)) continue;
      const dest = tu ? (p.aim ? { x: tu.pos.x + p.aim.x, y: tu.pos.y + p.aim.y } : tu.pos) : p.point!;
      const d = dist(p.pos, dest);
      const step = p.speed * DT;
      const arrive = d <= step + (tu ? tu.radius * 0.5 : 0);
      const dir = norm(sub(dest, p.pos));
      const next = arrive ? { x: dest.x, y: dest.y } : { x: p.pos.x + dir.x * step, y: p.pos.y + dir.y * step };
      // 直射投射物撞到遮擋視線的障礙物：落空（目標躲到岩石後面）
      if (p.collides && !segmentClear(this.sight, p.pos, next)) {
        const pl = p.payload;
        this.emit({ type: 'miss', sourceId: p.sourceId, targetId: p.targetId!, skillId: 'skillId' in pl ? pl.skillId : undefined, blocked: true, point: { ...p.pos } });
        continue;
      }
      p.pos = next;
      if (arrive) {
        resolveProjectilePayload(this, this.getUnit(p.sourceId)!, p, tu);
        continue;
      }
      keep.push(p);
    }
    // resolveProjectile 期間不會新增投射物，可直接替換
    this.projectiles = keep;
  }

  // ───────────── 結束判定 ─────────────

  /** 出口是否打開（SPEC_SLICE6 §2）：精英關卡要打倒所有隊長、頭目關卡要打倒頭目 */
  exitsOpen(): boolean {
    const lock = this.map.exitLock;
    if (!lock) return true;
    return !this.units.some((u) => u.team === 'enemy' && !u.dead && enemyRank(u.def) === (lock === 'boss' ? 'boss' : 'elite'));
  }

  /** 出口制：存活英雄全部在同一個出口裡就離開；有人在出口但沒到齊時提示 */
  private checkExits(heroes: Unit[]): void {
    const exits = this.map.exits!;
    // 身體碰到出口區就算在裡面（貼牆、貼地圖邊緣的出口，角色中心進不到最邊邊）
    const inside = (u: Unit, e: { x: number; y: number; w: number; h: number }) => {
      const m = u.radius + 0.1;
      return u.pos.x >= e.x - m && u.pos.x <= e.x + e.w + m && u.pos.y >= e.y - m && u.pos.y <= e.y + e.h + m;
    };
    const open = this.exitsOpen();
    for (const e of exits) {
      const n = heroes.filter((u) => inside(u, e)).length;
      if (n === 0) continue;
      if (open && n === heroes.length) {
        this.result = 'hero';
        this.exitId = e.id;
        return;
      }
      const key = `${e.id}:${n}:${open}`;
      if (key !== this.exitNotice.key || this.time - this.exitNotice.time >= EXIT_NOTICE_INTERVAL) {
        this.exitNotice = { time: this.time, key };
        this.emit({ type: 'exitWaiting', exitId: e.id, inside: n, total: heroes.length, locked: !open });
      }
    }
  }

  private checkEnd(): void {
    if (this.result) return;
    const heroAlive = this.units.some((u) => u.isHero && !u.dead);
    if (!this.horde && (this.map.exits?.length || this.map.exitLock)) {
      // 出口制（SPEC_SLICE6 §2）：不以全滅判定勝利
      if (!heroAlive) this.result = 'enemy';
      else if (this.map.exits?.length) this.checkExits(this.units.filter((u) => u.isHero && !u.dead));
      else if (this.exitsOpen()) this.result = 'hero';
      if (this.result) this.emit({ type: 'battleEnd', winner: this.result, exitId: this.exitId ?? undefined });
      return;
    }
    if (this.horde) {
      if (!heroAlive) this.result = 'enemy';
      else if (this.objectiveMet()) this.result = 'hero';
    } else {
      const enemyAlive = this.units.some((u) => u.team === 'enemy' && !u.dead);
      if (!enemyAlive) this.result = 'hero';
      else if (!heroAlive) this.result = 'enemy';
    }
    if (this.result) this.emit({ type: 'battleEnd', winner: this.result });
  }

  /** 怪群模式的勝利目標（SPEC_SLICE4 §2） */
  private objectiveMet(): boolean {
    const obj = this.horde!.objective;
    switch (obj.type) {
      case 'clear':
        // 沒有存活敵人（巢穴也要摧毀），而且所有波次都已出現完畢
        return !this.units.some((u) => u.team === 'enemy' && !u.dead) && this.waveState.every((s) => s.fired && s.repeatsLeft === 0) && (!this.director || this.director.exhausted);
      case 'nests':
        return [...this.nestBySpawner.values()].every((id) => this.getUnit(id)?.dead);
      case 'kill':
        return this.waveFired(obj.wave) && !this.units.some((u) => u.waveId === obj.wave && !u.dead);
      case 'exit': {
        const r = obj.rect;
        return this.units.every((h) => !h.isHero || h.dead || (h.pos.x >= r.x && h.pos.x <= r.x + r.w && h.pos.y >= r.y && h.pos.y <= r.y + r.h));
      }
    }
  }

  /** 決定論測試用：完整狀態字串 */
  snapshot(): string {
    return JSON.stringify({
      tick: this.tick,
      rng: this.rng.state,
      units: this.units.map((u) => [u.id, u.pos.x, u.pos.y, u.hp, u.state, u.order, u.action, u.stunTime, u.stagger, u.cooldowns, u.charges]),
      projectiles: this.projectiles.map((p) => [p.id, p.pos.x, p.pos.y]),
      doors: this.interactables.list.map((d) => [d.def.id, d.open, d.uses]),
      result: this.result,
    });
  }
}

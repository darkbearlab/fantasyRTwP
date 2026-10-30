import { passiveAtRank } from './data/passives';
import type { Order } from './commands';
import type { Personality, ShrineKind, Team, UnitDef, ProjectileKind } from './data/types';
import type { ShrineDef } from './data/shrines';
import { SHRINES } from './data/shrines';
import type { Vec } from './math';
import type { Attribute } from './data/damageTypes';
import type { PassiveDef, PassiveMods } from './data/passives';
import type { ActiveCycle } from './data/cycles';
import { ITEMS } from './data/items';
import { poiseOf } from './data/stagger';

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
  /** 直線衝鋒：起點、已經撞過的單位 */
  dashFrom?: Vec;
  hitIds?: number[];
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
  /** 失衡值（SPEC_STAGGER）：累積到 poise 就暈眩、歸零 */
  stagger = 0;
  /** 暈眩恢復後還剩幾秒「累積減半」（暈眩中不倒數） */
  staggerHalf = 0;
  /** 失衡上限 */
  get poise(): number {
    return poiseOf(this.def, this.maxHp);
  }
  /** 被丟出去的飛行中（戰爭領主的擲人）：起點、落點、已飛時間、總時間、丟的人、技能 */
  thrown: { from: { x: number; y: number }; to: { x: number; y: number }; t: number; dur: number; srcId: number; skillId: string } | null = null;
  /** 畫面用：被丟出去時離地的高度（公尺） */
  get airZ(): number {
    const th = this.thrown;
    if (!th) return 0;
    const s = Math.min(1, th.t / th.dur);
    return 4 * 2 * s * (1 - s);
  }
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
  /** 潛行（刺客）：完全偵測不到，貼身也看不到（煙霧彈是 false：貼近會被看到） */
  stealthFull = false;
  /** 從潛行出手的這一下：命中加成（strike 用掉後歸零） */
  ambushAccuracy = 0;
  /** 這次潛行的偷襲命中加成 */
  stealthAmbush = 0;
  /** 反制（守護者）：剩餘秒數與減傷比例 */
  counterWardTime = 0;
  counterWardPct = 0;
  /** 齊射（大遊俠）：剩餘秒數與普攻速度加成 */
  hasteTime = 0;
  hastePct = 0;
  /** 血印（邪教徒）：剩餘秒數、留下的人、回復比例 */
  bloodMarkTime = 0;
  bloodMarkBy = -1;
  bloodMarkHeal = 0;
  /** 詛咒是誰下的（死靈法師：被自己詛咒的敵人死亡時站起來） */
  curseBy = -1;
  /** 死靈法師喚起的亡者：戰鬥結束就消失，不記回遠征 */
  undead = false;
  /** 寒氣（法師的光環）：移動與行動速度降低 chillSlow 比例 */
  chillTime = 0;
  chillSlow = 0;
  /** 凋零光環：受到的傷害增加比例（和寒氣同一個計時） */
  chillVuln = 0;
  /** 破甲（命中附帶減益，SPEC_CLASSES §2）：層數、每層降低的物理與特殊護甲、剩餘秒數 */
  sunderStacks = 0;
  sunderArmor = 0;
  sunderTime = 0;
  /** 吸血光環（異教徒，SPEC_CLASSES §2）：在光環裡時，打中敵人傷害上升並吸血，光環主人扣血 */
  drainAuraTime = 0;
  drainAuraOwner = -1;
  drainAuraDamagePct = 0;
  drainAuraLifesteal = 0;
  drainAuraOwnerCost = 0;
  /** 分擔（守護者的光環）：受到的傷害有 coverPct 比例改由 coverBy 承受 */
  coverTime = 0;
  coverBy = -1;
  coverPct = 0;
  /** 打斷敵人後下一次攻擊必定爆擊（角鬥士） */
  critPending = false;
  /** 通用觸發（Alan 2026-10-24）：標記（受到傷害 +markVuln）、疊增益（造成傷害每層 +empowerPct）、每個觸發的次數與冷卻 */
  markTime = 0;
  markVuln = 0;
  empowerStacks = 0;
  empowerPct = 0;
  empowerTime = 0;
  triggerCounts: Record<string, number> = {};
  triggerReadyAt: Record<string, number> = {};
  /** 集中（引導，SPEC_CLASSES §2）：開始的時間（< 0 表示沒有在集中）、開始的位置、每秒加成與上限 */
  focusStart = -1;
  focusPos: Vec = { x: 0, y: 0 };
  focusSkill = '';
  focusPerSec = 0;
  focusMaxSec = 0;
  /** 這場戰鬥已不能再用的技能（一次性、被打斷就失去） */
  spentSkills: string[] = [];
  /** 暫時的傷害增益（頭目戰吼等） */
  damageBuffMult = 1;
  /** 附魔帶的屬性（元素法師）與剩餘秒數 */
  enchantAttrs: Attribute[] = [];
  enchantAttrTime = 0;
  /** 光環給的傷害加成（狂信者），和祝福同一個計時 */
  blessDamage = 0;
  /** 疊加型光環給的傷害加成（戰鬥圖騰；每個節拍重算） */
  stackDamage = 0;
  damageBuffTime = 0;
  /** 祭壇增益（Alan 2026-10-22）：種類與剩餘秒數 */
  shrine: ShrineKind | null = null;
  shrineTime = 0;
  /** 復甦祭壇累積的小數回復 */
  shrineRegen = 0;

  path: Vec[] | null = null;
  /** 移動卡住判定：目前最接近目標的距離、沒有進展的秒數 */
  stallBest = Infinity;
  stallTime = 0;
  /** 由哪一波生成（怪群模式；頭目關卡的勝利判定用） */
  waveId?: string;
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
  /** 打倒的敵人（def.id，依順序；戰鬥結算演出用） */
  killList: string[] = [];

  /** 被動（SPEC_SLICE5 §14）：職業、裝備道具、技能效果 */
  passives: PassiveDef[] = [];
  /** 所有被動的數值修正加總 */
  mods: Required<PassiveMods> = { accuracy: 0, defense: 0, armor: 0, damagePct: 0, attackSpeedPct: 0, moveSpeedPct: 0, range: 0 };
  /** 普攻命中次數（被動的「每第 N 擊」用） */
  basicHits = 0;

  /** 沉穩節奏的敵人（SPEC_SLICE5 §15）：所屬小隊（一起警覺）、是否已警覺、最近受到的傷害（仇恨） */
  squad?: string;
  /** 隨從（Alan 2026-10-23）：跟著英雄的小兵；不算英雄（不能選、不算出口與全滅、不吃補血） */
  follower = false;
  /** 隨從的主人（英雄的 unit id；-1＝沒有） */
  masterId = -1;
  /** 被困的英雄（SPEC_SLICE7 §4）：還沒被找到前不動、敵人也不打；captiveSquad＝看守的小隊 */
  captive = false;
  captiveSquad?: string;
  /** 這名單位是來解救的英雄（找到以後也一直是 true；戰後決定要不要加入） */
  rescue = false;
  /** 是不是玩家的英雄本人（我方而且不是隨從） */
  get isHero(): boolean {
    return this.team === 'hero' && !this.follower;
  }
  alerted = false;
  /** 小衝突導演叫來的敵人：附近沒有看得到的英雄時沿著流場（水流法）往隊伍走 */
  hunting = false;
  threatLog: { id: number; amount: number; t: number }[] = [];
  /** 盾兵的盾已破 */
  shieldBroken = false;

  /** 技能循環（沉穩節奏的英雄，SPEC_SLICE5 §16）：目前第幾招、蓄力層數 */
  cycle?: ActiveCycle;
  cycleStep = 0;
  cycleCharge = 0;

  addPassive(p: PassiveDef): void {
    if (this.passives.some((q) => q.id === p.id)) return;
    this.passives.push(p);
    for (const [k, v] of Object.entries(p.mods ?? {})) this.mods[k as keyof PassiveMods] += v ?? 0;
  }

  removePassive(id: string): void {
    const i = this.passives.findIndex((q) => q.id === id);
    if (i < 0) return;
    const [p] = this.passives.splice(i, 1);
    for (const [k, v] of Object.entries(p.mods ?? {})) this.mods[k as keyof PassiveMods] -= v ?? 0;
  }

  /** 身上的裝備道具（id）；換裝備時拿掉舊道具的被動、加上新的 */
  items: string[] = [];

  /** 職業被動的基本等級（一路向前；不含道具，等級 0 也記著，道具可以把它拉到 1） */
  classRanks: { id: string; rank: number }[] = [];

  setItems(ids: string[]): void {
    for (const id of this.items) if (ITEMS[id] && !ids.includes(id)) this.removePassive(ITEMS[id].passive.id);
    this.items = ids.filter((id) => ITEMS[id]);
    for (const id of this.items) this.addPassive(ITEMS[id].passive);
    // 職業被動：基本等級＋道具加的等級（Alan 2026-10-29）
    for (const c of this.classRanks) {
      const plus = this.items.reduce((s, id) => s + (ITEMS[id].passiveRank?.passive === c.id ? ITEMS[id].passiveRank!.plus : 0), 0);
      this.removePassive(c.id);
      if (c.rank + plus > 0) this.addPassive(passiveAtRank(c.id, c.rank + plus));
    }
  }

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

  /** 普攻投射物的外觀（被動可以改，例：法師的小火球） */
  get basicProjectile(): ProjectileKind {
    return this.passives.find((p) => p.attackProjectile)?.attackProjectile ?? this.def.projectileKind ?? 'arrow';
  }
  get maxHp(): number {
    return this.def.maxHp;
  }
  /** 盾兵：盾還在 */
  get shieldUp(): boolean {
    return !!this.def.shield && !this.shieldBroken;
  }
  /** 目前生效的祭壇增益 */
  get shrineDef(): ShrineDef | null {
    return this.shrine && this.shrineTime > 0 ? SHRINES[this.shrine] : null;
  }
  get armor(): number {
    return this.def.armor + this.mods.armor + (this.shieldUp ? this.def.shield!.armor : 0) - this.sunderAmount + (this.shrineDef?.armor ?? 0);
  }
  /** 破甲降低的護甲（物理與特殊都扣） */
  get sunderAmount(): number {
    return this.sunderTime > 0 ? this.sunderStacks * this.sunderArmor : 0;
  }
  get accuracy(): number {
    return this.def.accuracy + this.mods.accuracy + (this.blessTime > 0 ? this.blessAccuracy : 0) + (this.shrineDef?.accuracy ?? 0);
  }
  get defense(): number {
    // 英雄拿著盾（Alan 2026-10-25）：好幾個來源只取最高的
    const held = this.passives.reduce((m, p) => Math.max(m, p.shieldDefense ?? 0), 0);
    return this.def.defense + this.mods.defense + held + (this.blessTime > 0 ? this.blessDefense : 0) + (this.shieldUp ? this.def.shield!.defense : 0) + (this.shrineDef?.defense ?? 0);
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
    return (this.def.damageMult ?? 1) * (1 + this.mods.damagePct) * (this.damageBuffTime > 0 ? this.damageBuffMult : 1) * (this.blessTime > 0 ? 1 + this.blessDamage : 1) * (1 + this.stackDamage) * (1 + (this.shrineDef?.damagePct ?? 0)) * (this.empowerTime > 0 ? 1 + this.empowerStacks * this.empowerPct : 1);
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

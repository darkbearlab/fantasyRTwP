import type { Command, Order } from './commands';
import { sameOrder } from './commands';
import { DT, NAV_CELL, RANGE_TOLERANCE } from './constants';
import { ENEMIES } from './data/enemies';
import { HEROES } from './data/heroes';
import { SKILLS } from './data/skills';
import type { DamageType, MapDef, ProjectileKind, SkillDef, Team, UnitDef } from './data/types';
import type { SimEvent } from './events';
import { canSeeCircle, canSeePoint } from './los';
import type { Vec } from './math';
import { dist, norm, sub } from './math';
import { findPath } from './nav/astar';
import { separateUnits } from './nav/avoidance';
import { NavGrid } from './nav/grid';
import { lineWalkable, smoothPath } from './nav/smooth';
import { SlotManager } from './nav/slots';
import { Rng } from './rng';
import type { SimConfig } from './simConfig';
import { DEFAULT_SIM_CONFIG } from './simConfig';
import { Unit } from './unit';
import type { ZocContext } from './zoc';
import { disengagedFrom, edgeDistance, pinBlocker, zoneDistance } from './zoc';
import { finishWindup, freeAttack, resolveProjectilePayload, startAction, tickDash } from './actions';
import type { IdleBehavior } from './ai/idleBehavior';
import { IDLE_BEHAVIORS, leashedApproachPoint, returnToGuard, withinLeash } from './ai/idleBehavior';
import { enemyThink } from './ai/enemyAI';

export interface UnitSpawn {
  defId: string;
  pos: Vec;
  /** 未指定時依英雄出現順序自動編號 */
  heroSlot?: number;
}

export interface WorldOptions {
  seed: number;
  map: MapDef;
  spawns: UnitSpawn[];
  config?: Partial<SimConfig>;
  defs?: Record<string, UnitDef>;
  idleBehavior?: IdleBehavior;
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
      skillId?: string;
    }
  | { type: 'aoe'; skillId: string }
  | { type: 'root'; duration: number; skillId: string };

export interface Projectile {
  id: number;
  sourceId: number;
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

/**
 * 戰鬥模擬世界。純 TypeScript，以固定節拍推進；只吃 Command、只吐 SimEvent。
 */
export class World implements ZocContext {
  readonly map: MapDef;
  readonly config: SimConfig;
  readonly rng: Rng;
  readonly seed: number;
  readonly sight: NavGrid;
  readonly slots = new SlotManager();
  readonly units: Unit[] = [];
  projectiles: Projectile[] = [];
  tick = 0;
  result: Team | null = null;
  enemyAggro = false;
  /** 指定時所有英雄都用這個閒置行為（測試用）；否則依各英雄的性格 */
  idleBehavior: IdleBehavior | null;

  private navGrids = new Map<number, NavGrid>();
  private queue: Command[] = [];
  private events: SimEvent[] = [];
  private nextProjectileId = 1;
  private unitById = new Map<number, Unit>();

  constructor(opts: WorldOptions) {
    this.seed = opts.seed;
    this.map = opts.map;
    this.config = { ...DEFAULT_SIM_CONFIG, ...(opts.config ?? {}) };
    this.rng = new Rng(opts.seed);
    this.sight = NavGrid.fromMap(opts.map, NAV_CELL, 0);
    this.idleBehavior = opts.idleBehavior ?? null;
    const defs = opts.defs ?? { ...HEROES, ...ENEMIES };
    let id = 1;
    let heroSlot = 0;
    for (const s of opts.spawns) {
      const def = defs[s.defId];
      if (!def) throw new Error(`未知的單位定義：${s.defId}`);
      const slot = def.team === 'hero' ? (s.heroSlot ?? heroSlot++) : -1;
      const u = new Unit(id++, def, s.pos, slot);
      // 錯開敵人 AI 評估時間
      u.aiTimer = this.rng.range(0, 0.4);
      this.units.push(u);
      this.unitById.set(u.id, u);
    }
  }

  // ───────────── 公開查詢 ─────────────

  get time(): number {
    return this.tick * DT;
  }

  getUnit(id: number): Unit | undefined {
    return this.unitById.get(id);
  }

  heroes(): Unit[] {
    return this.units.filter((u) => u.team === 'hero');
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
      g = NavGrid.fromMap(this.map, NAV_CELL, key);
      this.navGrids.set(key, g);
    }
    return g;
  }

  navFor(u: Unit): NavGrid {
    return this.navGrid(u.radius);
  }

  canSee(a: Unit, b: Unit): boolean {
    return canSeeCircle(this.sight, a.pos, a.radius, b.pos, b.radius);
  }

  canSeePoint(a: Unit, p: Vec): boolean {
    return canSeePoint(this.sight, a.pos, a.radius, p);
  }

  emit(ev: SimEvent): void {
    this.events.push(ev);
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

    this.updateAggro();
    for (const u of this.units) this.tickTimers(u);
    for (const u of this.units) this.updateUnit(u);
    this.updateProjectiles();
    separateUnits(this.units, (u) => this.navFor(u));
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
          if (u.team !== t.team) {
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
    }
  }

  private liveUnits(ids: number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const u = this.getUnit(id);
      if (u && !u.dead && !out.includes(u)) out.push(u);
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
      if (u.order?.type === 'attack') u.resumeOrder = u.order;
    } else {
      u.resumeOrder = null;
    }
    this.slots.release(u.id);
    u.order = order;
    u.path = null;
    u.pathGoal = null;
    u.pinnedNotified = false;
  }

  // ───────────── 每節拍更新 ─────────────

  private updateAggro(): void {
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

  triggerAggro(): void {
    if (this.enemyAggro) return;
    this.enemyAggro = true;
    this.emit({ type: 'aggro' });
  }

  private tickTimers(u: Unit): void {
    if (u.dead) return;
    if (u.rootTime > 0) u.rootTime = Math.max(0, u.rootTime - DT);
    if (u.blessTime > 0) u.blessTime = Math.max(0, u.blessTime - DT);
    if (u.guardTime > 0) {
      u.guardTime = Math.max(0, u.guardTime - DT);
      if (u.guardTime === 0) u.guardedBy = -1;
    }
    if (u.aiTimer > 0) u.aiTimer -= DT;
    if (u.retreatCooldown > 0) u.retreatCooldown = Math.max(0, u.retreatCooldown - DT);
    for (const k in u.cooldowns) {
      if (u.cooldowns[k] > 0) u.cooldowns[k] = Math.max(0, u.cooldowns[k] - DT);
    }
  }

  private updateUnit(u: Unit): void {
    if (u.dead) return;
    if (u.stunTime > 0) {
      u.stunTime = Math.max(0, u.stunTime - DT);
      return;
    }
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

    if (u.team === 'enemy') enemyThink(this, u);
    else if (!u.order) {
      const o = (this.idleBehavior ?? IDLE_BEHAVIORS[u.personality]).decide(this, u);
      if (o?.type === 'move' && !this.idleBehavior && u.personality === 'cowardly') this.emit({ type: 'notice', unitId: u.id, text: '逃跑！' });
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
        if (!t || t.dead || t.team === u.team) {
          this.setOrder(u, null);
          break;
        }
        const inRange = edgeDistance(u, t) <= u.def.range + RANGE_TOLERANCE && (u.isMelee || this.canSee(u, t));
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
    }
  }

  private executeSkillOrder(u: Unit, o: Extract<Order, { type: 'skill' }>): void {
    const def = SKILLS[o.skillId];
    if (!def) {
      this.setOrder(u, null);
      return;
    }
    if ((u.cooldowns[def.id] ?? 0) > 0) {
      this.emit({ type: 'notice', unitId: u.id, text: '冷卻中' });
      this.setOrder(u, u.resumeOrder ?? null);
      return;
    }
    const dashSkill = def.effect.kind === 'charge' || def.effect.kind === 'tumble';
    if (dashSkill && u.rooted) {
      this.emit({ type: 'notice', unitId: u.id, text: '被定身' });
      this.setOrder(u, u.resumeOrder ?? null);
      return;
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
      if (dist(u.pos, p) <= def.range + RANGE_TOLERANCE && (!def.requiresLos || this.canSeePoint(u, p))) {
        startAction(this, u, { kind: 'skill', skillId: def.id, point: { ...p } });
        return;
      }
      const r = this.moveAlong(u, p, { stopDist: 0.05 });
      if (r === 'pinned') this.stopPinned(u);
      else if (r === 'nopath' || r === 'arrived') {
        // 走到點上仍不符合（例如沒有視線）：放棄
        if (r === 'nopath' || !(dist(u.pos, p) <= def.range)) this.setOrder(u, null);
      }
      return;
    }
    const t = o.targetId !== undefined ? this.getUnit(o.targetId) : undefined;
    if (!t || t.dead || !this.validSkillTarget(u, def, t)) {
      this.setOrder(u, u.resumeOrder ?? null);
      return;
    }
    const melee = def.effect.kind === 'strike' && def.effect.melee;
    if (edgeDistance(u, t) <= def.range + RANGE_TOLERANCE && (!def.requiresLos || this.canSee(u, t))) {
      startAction(this, u, { kind: 'skill', skillId: def.id, targetId: t.id });
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
      return this.moveAlong(u, slot.pos, { stopDist: 0.05, avoidZoc: u.def.ai === 'skirmisher' });
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

    const speed = opts.speed ?? u.def.moveSpeed;
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
      if (!opts.ignoreZoc) {
        const blocker = pinBlocker(this, u, u.pos, to);
        if (blocker) return moved ? 'moving' : 'pinned';
      }
      if (!grid.isWalkable(to)) {
        u.path = null;
        break;
      }
      if (!opts.ignoreZoc) {
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

  // ───────────── 投射物 ─────────────

  spawnProjectile(src: Unit, kind: ProjectileKind, speed: number, payload: ProjectilePayload, target: { unit?: Unit; point?: Vec }): void {
    this.projectiles.push({
      id: this.nextProjectileId++,
      sourceId: src.id,
      targetId: target.unit?.id,
      point: target.point ? { ...target.point } : undefined,
      pos: { x: src.pos.x, y: src.pos.y },
      prevPos: { x: src.pos.x, y: src.pos.y },
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
      const dest = tu ? tu.pos : p.point!;
      const d = dist(p.pos, dest);
      const step = p.speed * DT;
      if (d <= step + (tu ? tu.radius * 0.5 : 0)) {
        p.pos = { x: dest.x, y: dest.y };
        resolveProjectilePayload(this, this.getUnit(p.sourceId)!, p, tu);
        continue;
      }
      const dir = norm(sub(dest, p.pos));
      p.pos = { x: p.pos.x + dir.x * step, y: p.pos.y + dir.y * step };
      keep.push(p);
    }
    // resolveProjectile 期間不會新增投射物，可直接替換
    this.projectiles = keep;
  }

  // ───────────── 結束判定 ─────────────

  private checkEnd(): void {
    if (this.result) return;
    const heroAlive = this.units.some((u) => u.team === 'hero' && !u.dead);
    const enemyAlive = this.units.some((u) => u.team === 'enemy' && !u.dead);
    if (!enemyAlive) this.result = 'hero';
    else if (!heroAlive) this.result = 'enemy';
    if (this.result) this.emit({ type: 'battleEnd', winner: this.result });
  }

  /** 決定論測試用：完整狀態字串 */
  snapshot(): string {
    return JSON.stringify({
      tick: this.tick,
      rng: this.rng.state,
      units: this.units.map((u) => [u.id, u.pos.x, u.pos.y, u.hp, u.state, u.order, u.action, u.stunTime, u.cooldowns]),
      projectiles: this.projectiles.map((p) => [p.id, p.pos.x, p.pos.y]),
      result: this.result,
    });
  }
}

/**
 * 自動出怪（Alan 回饋：敵人要小群、密集、從四面八方湧上來）。
 * 讓隊伍附近一直維持一定數量的雜兵：不夠就在隊伍周圍、視野外補一小群，而且盡量選和前幾群不同的方向。
 * 目標數量依壓力循環起伏（累積 → 高峰 → 喘息）。只用種子亂數，維持決定論。
 */
import { DT } from './constants';
import { HORDE, HORDE_VISION } from './data/horde';
import type { DirectorDef } from './data/types';
import type { Vec } from './math';
import { dist } from './math';
import type { World } from './world';

export class Director {
  /** 目前生效的階段（-1 = 還沒開始） */
  stage = -1;
  /** 進入目前壓力循環的時間 */
  private cycleStart = 0;
  private cooldown = 0;
  private timer = 0;
  /** 已經出了幾隻（全部／目前階段） */
  spawned = 0;
  private spawnedInStage = 0;
  /** 最近幾群的方向（弧度），新的一群盡量避開 */
  private recentAngles: number[] = [];

  constructor(readonly def: DirectorDef) {}

  /** 預算用完（目標 clear 的判定用） */
  get exhausted(): boolean {
    return this.def.budget !== undefined && this.spawned >= this.def.budget;
  }

  /** 目前附近敵人的目標數量 */
  target(time: number): number {
    if (this.stage < 0) return 0;
    const st = this.def.stages[this.stage];
    const { buildUp, peak, relax } = this.def.cycle;
    const total = buildUp + peak + relax;
    const t = (time - this.cycleStart) % total;
    // 喘息期不補怪，讓隊伍有空檔探索
    if (t >= buildUp + peak) return 0;
    const k = t < buildUp ? t / buildUp : 1;
    return Math.round(st.low + (st.high - st.low) * k);
  }

  update(world: World): void {
    // 階段：後面觸發的階段覆蓋前面的
    for (let i = this.def.stages.length - 1; i > this.stage; i--) {
      if (world.triggerMet(this.def.stages[i].trigger)) {
        // 進入新階段：壓力循環從頭開始
        this.cycleStart = world.time;
        this.stage = i;
        this.spawnedInStage = 0;
        break;
      }
    }
    if (this.stage < 0 || this.exhausted) return;
    const stageBudget = this.def.stages[this.stage].budget;
    if (stageBudget !== undefined && this.spawnedInStage >= stageBudget) return;
    this.cooldown -= DT;
    this.timer -= DT;
    if (this.timer > 0) return;
    this.timer = HORDE.directorInterval;
    if (this.cooldown > 0) return;
    const heroes = world.units.filter((u) => u.team === 'hero' && !u.dead);
    if (heroes.length === 0) return;
    const center = { x: heroes.reduce((a, h) => a + h.pos.x, 0) / heroes.length, y: heroes.reduce((a, h) => a + h.pos.y, 0) / heroes.length };
    let alive = 0;
    let nearby = 0;
    for (const u of world.units) {
      if (u.team !== 'enemy' || u.dead || u.def.tier !== 'fodder') continue;
      alive++;
      if (dist(u.pos, center) <= this.def.nearbyRadius) nearby++;
    }
    if (nearby >= this.target(world.time) || alive >= this.def.maxAlive) return;
    const spot = this.pickSpot(world, heroes.map((h) => h.pos), center);
    if (!spot) return;
    this.spawnPack(world, spot.pos);
    this.recentAngles.push(spot.angle);
    if (this.recentAngles.length > 3) this.recentAngles.shift();
    this.cooldown = this.def.cooldown;
  }

  /** 候選方向中挑一個：可走、視野外、路徑不會繞太遠，並且和最近幾群的方向差最多 */
  private pickSpot(world: World, heroes: Vec[], center: Vec): { pos: Vec; angle: number } | null {
    const n = HORDE.directorDirections;
    const offset = world.rng.range(0, Math.PI * 2);
    const grid = world.navGrid(HORDE.flowRadius);
    const [dMin, dMax] = this.def.spawnDistance;
    let best: { pos: Vec; angle: number } | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * Math.PI * 2;
      const d = world.rng.range(dMin, dMax);
      const p = { x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d };
      if (p.x < 1 || p.y < 1 || p.x > world.map.width - 1 || p.y > world.map.height - 1) continue;
      if (!grid.isWalkable(p)) continue;
      const nearest = Math.min(...heroes.map((h) => dist(h, p)));
      if (nearest < dMin) continue;
      // 視野外：有迷霧時看迷霧；沒有迷霧時至少在英雄視野半徑外
      if (world.fogActive ? world.vision!.isVisible(p) : nearest < HORDE_VISION.heroSightRange) continue;
      const path = world.flowDistanceAt(p) * HORDE.flowCell;
      if (!Number.isFinite(path) || path > nearest * HORDE.directorMaxPathFactor + 2) continue;
      // 和最近幾群方向的最小夾角越大越好
      let minDiff = Math.PI;
      for (const r of this.recentAngles) {
        let da = Math.abs(a - r) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        minDiff = Math.min(minDiff, da);
      }
      if (minDiff > bestScore) {
        bestScore = minDiff;
        best = { pos: p, angle: a };
      }
    }
    return best;
  }

  private spawnPack(world: World, at: Vec): void {
    const [lo, hi] = this.def.packSize;
    let count = world.rng.int(lo, hi);
    if (this.def.budget !== undefined) count = Math.min(count, this.def.budget - this.spawned);
    const sb = this.def.stages[this.stage].budget;
    if (sb !== undefined) count = Math.min(count, sb - this.spawnedInStage);
    const total = this.def.enemies.reduce((a, e) => a + e.weight, 0);
    for (let k = 0; k < count; k++) {
      let r = world.rng.range(0, total);
      let pick = this.def.enemies[0].enemy;
      for (const e of this.def.enemies) {
        r -= e.weight;
        if (r <= 0) {
          pick = e.enemy;
          break;
        }
      }
      const a = world.rng.range(0, Math.PI * 2);
      const rr = Math.sqrt(world.rng.next()) * 1.2;
      const u = world.spawnUnit(world.enemyDefFor(pick), { x: at.x + Math.cos(a) * rr, y: at.y + Math.sin(a) * rr }, undefined, 'director');
      u.aiTimer = world.rng.range(0, HORDE.retargetInterval);
      this.spawned++;
      this.spawnedInStage++;
    }
    world.triggerAggro();
  }
}

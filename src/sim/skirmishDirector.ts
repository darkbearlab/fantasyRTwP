/**
 * 小衝突導演（沉穩節奏；資料與說明在 data/skirmish.ts）。
 * 沒在交戰的時間累積到間隔，就在隊伍周圍、視野外、而且和前幾波不同的方向叫出 2～3 名敵人，直接進入戰鬥朝隊伍過來。
 * 一波的組成用「估計處理秒數」湊到上限以內；導演叫來的敵人還活著太多時先等。只用種子亂數，維持決定論。
 * 出現位置的路徑檢查用流場（水流法，world.flowDistanceAt）：一次算完全圖到最近英雄的距離。
 * 敵人出現後照一般的沉穩節奏 AI 選目標（撲後排、被戰士架住就打戰士），移動用各自的尋路；
 * 同時在場的波次敵人不多（maxAlive），之後要大量湧現時再改成跟著流場走。
 * 怪群模式的 Director（director.ts）不受影響。
 */
import { DT } from './constants';
import type { SkirmishDef } from './data/skirmish';
import type { Vec } from './math';
import { dist } from './math';
import { HORDE } from './data/horde';
import type { World } from './world';

/** 尋找出現位置用的格子半徑（和角色差不多大） */
const SPAWN_RADIUS = 0.5;

export class SkirmishDirector {
  /** 到下一波的秒數 */
  private timer: number;
  /** 已經叫出的波數 */
  waves = 0;
  /** 這個導演叫出的敵人編號 */
  private readonly mine = new Set<number>();
  private recentAngles: number[] = [];
  /** 最近一次檢查時是否在交戰 */
  private fighting = false;

  constructor(
    readonly def: SkirmishDef,
    private readonly layer: number,
    world: World,
  ) {
    this.timer = world.rng.range(def.firstDelay[0], def.firstDelay[1]);
  }

  /** 導演叫來、還活著的敵人數 */
  alive(world: World): number {
    let n = 0;
    for (const id of this.mine) {
      const u = world.getUnit(id);
      if (u && !u.dead) n++;
      else this.mine.delete(id);
    }
    return n;
  }

  /** 交戰中：有已警覺、還活著的敵人在英雄 combatRange 內（據點的敵人也算） */
  inCombat(world: World): boolean {
    const heroes = world.units.filter((u) => u.team === 'hero' && !u.dead);
    const R = this.def.combatRange;
    return world.units.some((e) => e.team === 'enemy' && !e.dead && e.alerted && heroes.some((h) => dist(e.pos, h.pos) <= R));
  }

  update(world: World): void {
    if (world.result) return;
    // 交戰中計時暫停；打完至少喘 calmAfterCombat 秒
    if (world.tick % 5 === 0) this.fighting = this.inCombat(world);
    if (this.fighting) {
      this.timer = Math.max(this.timer, this.def.calmAfterCombat);
      return;
    }
    this.timer -= DT;
    if (this.timer > 0) return;
    // 太多還沒處理掉：晚一點再檢查
    if (this.alive(world) >= this.def.maxAlive) {
      this.timer = 2;
      return;
    }
    const heroes = world.units.filter((u) => u.team === 'hero' && !u.dead);
    if (heroes.length === 0) return;
    const roster = this.roll(world);
    const spot = roster.length ? this.pickSpot(world, heroes.map((h) => h.pos)) : null;
    if (!spot) {
      // 找不到合適的位置（例如地圖邊角）：稍後再試
      this.timer = 2;
      return;
    }
    this.spawn(world, spot.pos, roster);
    this.recentAngles.push(spot.angle);
    if (this.recentAngles.length > this.def.recentWaves) this.recentAngles.shift();
    this.timer = world.rng.range(this.def.interval[0], this.def.interval[1]);
  }

  /** 這一波的組成：人數照 packSize，處理秒數加起來不超過 secondsBudget */
  private roll(world: World): string[] {
    const pool = this.def.pool.filter((e) => e.minLayer <= this.layer);
    const n = world.rng.int(this.def.packSize[0], this.def.packSize[1]);
    const out: string[] = [];
    let left = this.def.secondsBudget;
    for (let i = 0; i < n; i++) {
      const can = pool.filter((e) => e.seconds <= left);
      if (can.length === 0) break;
      const total = can.reduce((a, e) => a + e.weight, 0);
      let r = world.rng.range(0, total);
      let pick = can[0];
      for (const e of can) {
        r -= e.weight;
        if (r <= 0) {
          pick = e;
          break;
        }
      }
      out.push(pick.enemy);
      left -= pick.seconds;
    }
    return out;
  }

  /** 候選方向中挑一個：可走、在視野外、路徑不會繞太遠，並且和最近幾波的方向差最多 */
  private pickSpot(world: World, heroes: Vec[]): { pos: Vec; angle: number } | null {
    const center = { x: heroes.reduce((a, h) => a + h.x, 0) / heroes.length, y: heroes.reduce((a, h) => a + h.y, 0) / heroes.length };
    const grid = world.navGrid(SPAWN_RADIUS);
    // 角色走得到隊伍的格（流場的格子比角色粗，窄縫算得過去但角色走不過；這裡用角色的導航格再確認一次）
    const reach = new Uint8Array(grid.cols * grid.rows);
    {
      const stack: number[] = [];
      for (const h of heroes) {
        const c = grid.cellOf(h);
        const n = grid.nearestWalkableCell(c.cx, c.cy, 3);
        if (n && !reach[n.cy * grid.cols + n.cx]) {
          reach[n.cy * grid.cols + n.cx] = 1;
          stack.push(n.cy * grid.cols + n.cx);
        }
      }
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % grid.cols;
        const y = (i - x) / grid.cols;
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (grid.isBlockedCell(nx, ny)) continue;
          const j = ny * grid.cols + nx;
          if (!reach[j]) (reach[j] = 1, stack.push(j));
        }
      }
    }
    const [dMin, dMax] = this.def.spawnDistance;
    const offset = world.rng.range(0, Math.PI * 2);
    let best: { pos: Vec; angle: number } | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < this.def.directions; i++) {
      const a = offset + (i / this.def.directions) * Math.PI * 2;
      const d = world.rng.range(dMin, dMax);
      const p = { x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d };
      if (p.x < 1 || p.y < 1 || p.x > world.map.width - 1 || p.y > world.map.height - 1) continue;
      if (!grid.isWalkable(p)) continue;
      const pc = grid.cellOf(p);
      if (!reach[pc.cy * grid.cols + pc.cx]) continue;
      const nearest = Math.min(...heroes.map((h) => dist(h, p)));
      if (nearest < dMin) continue;
      if (world.vision ? world.vision.isVisible(p) : false) continue;
      // 水流法（流場，怪群模式就有）：一次算出地圖上每一格走到最近英雄的步數，不用每個候選點各跑一次 A*
      const path = world.flowDistanceAt(p) * HORDE.flowCell;
      if (!Number.isFinite(path)) continue;
      if (path > nearest * this.def.maxPathFactor + 2) continue;
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

  private spawn(world: World, at: Vec, roster: string[]): void {
    const squad = `wave${++this.waves}`;
    roster.forEach((id, k) => {
      const a = (k / roster.length) * Math.PI * 2;
      const u = world.spawnUnit(world.enemyDefFor(id), { x: at.x + Math.cos(a) * 0.8, y: at.y + Math.sin(a) * 0.8 }, undefined, squad);
      u.squad = squad;
      this.mine.add(u.id);
      u.hunting = true;
      // 一出現就進入戰鬥，朝隊伍過來
      world.alertUnit(u);
    });
  }
}

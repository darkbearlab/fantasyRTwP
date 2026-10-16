import { GAME_CONFIG } from '../config';
import type { AutoPauseConfig } from '../config';
import { createBattle } from '../sim/battle';
import type { Command } from '../sim/commands';
import type { Unit } from '../sim/unit';
import type { World } from '../sim/world';

export interface DebugFlags {
  panel: boolean;
  navGrid: boolean;
  paths: boolean;
  allZoc: boolean;
  los: boolean;
  slots: boolean;
}

export interface Targeting {
  unitId: number;
  skillId: string;
}

export interface LogEntry {
  text: string;
  cls: string;
  time: number;
}

/** 偏好設定跨重來保留 */
const persisted = {
  timeScale: GAME_CONFIG.defaultTimeScale,
  debug: { panel: false, navGrid: false, paths: false, allZoc: false, los: false, slots: false } as DebugFlags,
  autoPause: { ...GAME_CONFIG.autoPause } as AutoPauseConfig,
  sim: { ...GAME_CONFIG.sim },
  logOpen: true,
};

/**
 * 一場戰鬥的畫面層狀態：sim 世界、暫停、選取、瞄準、除錯開關、戰鬥紀錄。
 * 畫面層只讀 world；任何改變都透過 enqueue(Command)。
 */
export class BattleSession {
  readonly world: World;
  readonly seed: number;
  paused = false;
  pauseReason = '';
  /** 累積但尚未推進的時間（秒） */
  acc = 0;
  selection: number[] = [];
  targeting: Targeting | null = null;
  hoverUnitId: number | null = null;
  log: LogEntry[] = [];
  toast: { text: string; until: number } | null = null;
  /** 已觸發過低血自動暫停的英雄 */
  lowHpWarned = new Set<number>();
  private labels = new Map<number, string>();

  constructor(seed: number) {
    this.seed = seed;
    this.world = createBattle(seed, persisted.sim);
    const counts = new Map<string, number>();
    const totals = new Map<string, number>();
    for (const u of this.world.units) totals.set(u.def.id, (totals.get(u.def.id) ?? 0) + 1);
    for (const u of this.world.units) {
      const n = (counts.get(u.def.id) ?? 0) + 1;
      counts.set(u.def.id, n);
      this.labels.set(u.id, (totals.get(u.def.id) ?? 0) > 1 ? `${u.def.name}${n}` : u.def.name);
    }
  }

  get timeScale(): number {
    return persisted.timeScale;
  }
  set timeScale(v: number) {
    persisted.timeScale = v;
  }
  get debug(): DebugFlags {
    return persisted.debug;
  }
  get autoPause(): AutoPauseConfig {
    return persisted.autoPause;
  }
  get logOpen(): boolean {
    return persisted.logOpen;
  }
  set logOpen(v: boolean) {
    persisted.logOpen = v;
  }

  /** 透過指令修改 sim 設定，並記住偏好 */
  setSimConfig(patch: Partial<typeof persisted.sim>): void {
    Object.assign(persisted.sim, patch);
    this.enqueue({ type: 'setConfig', patch });
  }

  /** 顯示用：目前生效＋已排隊的 sim 設定 */
  get simConfig() {
    return persisted.sim;
  }

  enqueue(cmd: Command): void {
    this.world.enqueue(cmd);
  }

  label(id: number): string {
    return this.labels.get(id) ?? '?';
  }

  heroBySlot(slot: number): Unit | undefined {
    return this.world.units.find((u) => u.heroSlot === slot);
  }

  selectedUnits(): Unit[] {
    return this.selection.map((id) => this.world.getUnit(id)!).filter((u) => u && !u.dead);
  }

  setPaused(p: boolean, reason = ''): void {
    this.paused = p;
    this.pauseReason = p ? reason : '';
  }

  addLog(text: string, cls = ''): void {
    this.log.push({ text, cls, time: this.world.time });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  showToast(text: string, now: number, ms = 1600): void {
    this.toast = { text, until: now + ms };
  }
}

import { GAME_CONFIG } from '../config';
import type { AutoPauseConfig } from '../config';
import { createBattle } from '../sim/battle';
import type { Command } from '../sim/commands';
import type { Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { BattleHooks } from './hooks';

/** 英雄欄位資訊（遠征模式：陣亡或空欄位也要在英雄列上佔位） */
export type PartySlotInfo = { classId: string; dead: boolean; name?: string } | null;

export interface SessionOptions {
  /** 由遠征建立的戰鬥；省略時建立切片 1 的單場隘口戰 */
  world?: World;
  mode?: 'quick' | 'run';
  partySlots?: PartySlotInfo[];
}

export interface DebugFlags {
  panel: boolean;
  navGrid: boolean;
  paths: boolean;
  allZoc: boolean;
  los: boolean;
  slots: boolean;
  /** 方向對照：地上畫出實際面向箭頭與 Flare 方向編號 */
  facing: boolean;
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

const AUTO_PAUSE_KEY = 'fantasyRTwP.autoPause';

/** 自動暫停設定：存在瀏覽器（重開也保留）；讀不到就用預設值 */
function loadAutoPause(): AutoPauseConfig {
  const base = { ...GAME_CONFIG.autoPause };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTO_PAUSE_KEY) : null;
    if (raw) Object.assign(base, JSON.parse(raw));
  } catch {
    // 私密瀏覽、被封鎖的儲存空間：用預設值
  }
  return base;
}

const CONTROL_KEY = 'fantasyRTwP.controls';

/** 操作偏好（存在瀏覽器）：deselectOnPause＝暫停時取消選取所有英雄（Alan 2026-10-22：暫停＝狀況發生，英雄要重新選） */
export interface ControlPrefs {
  deselectOnPause: boolean;
  /** 顯示戰鬥紀錄（Alan 2026-10-22：畫面夠直覺後就不太看了，可以關掉） */
  showLog: boolean;
}

function loadControls(): ControlPrefs {
  const base: ControlPrefs = { deselectOnPause: false, showLog: true };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CONTROL_KEY) : null;
    if (raw) Object.assign(base, JSON.parse(raw));
  } catch {
    // 讀不到就用預設值
  }
  return base;
}

/** 偏好設定跨重來保留 */
const persisted = {
  controls: loadControls(),
  timeScale: GAME_CONFIG.defaultTimeScale,
  debug: { panel: false, navGrid: false, paths: false, allZoc: false, los: false, slots: false, facing: false } as DebugFlags,
  autoPause: loadAutoPause(),
  sim: { ...GAME_CONFIG.sim },
  logOpen: false,
};

/** 玩家目前的 sim 設定偏好（遠征建立戰鬥時帶入） */
export function currentSimConfig() {
  return { ...persisted.sim };
}

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
  /** 正在選消耗品的目標（點英雄卡；Alan 2026-10-21） */
  itemTargeting: string | null = null;
  /** 迷你路線圖打開了嗎；剛點到的出口（迷你路線圖上對應的節點閃一下） */
  routeOpen = false;
  /** 和地圖上的商人交易：畫面層打開商店（SPEC_SLICE7 §2） */
  merchantOpen = false;
  exitPing: { id: string; at: number } | null = null;
  /** 數字鍵二段式：剛用數字鍵選了哪名英雄、到什麼時候前再按數字就是放技能（畫面時間，毫秒） */
  chord: { slot: number; until: number } | null = null;
  hoverUnitId: number | null = null;
  /** 滑鼠移上的互動物件（門、拉桿） */
  hoverObjectId: string | null = null;
  log: LogEntry[] = [];
  toast: { text: string; until: number } | null = null;
  /** 已觸發過低血自動暫停的英雄 */
  lowHpWarned = new Set<number>();
  /** 畫面層鉤子（自動暫停等掛在這裡，見 hooks.ts） */
  readonly hooks = new BattleHooks();
  private labels = new Map<number, string>();

  readonly mode: 'quick' | 'run';
  readonly partySlots: PartySlotInfo[] | null;

  constructor(seed: number, opts: SessionOptions = {}) {
    this.seed = seed;
    this.world = opts.world ?? createBattle(seed, persisted.sim);
    this.mode = opts.mode ?? 'quick';
    this.partySlots = opts.partySlots ?? null;
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
  /** 修改自動暫停設定並存到瀏覽器 */
  get controls(): ControlPrefs {
    return persisted.controls;
  }
  setControls(patch: Partial<ControlPrefs>): void {
    Object.assign(persisted.controls, patch);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(CONTROL_KEY, JSON.stringify(persisted.controls));
    } catch {
      // 存不了就只在這次遊戲中有效
    }
  }
  setAutoPause(patch: Partial<AutoPauseConfig>): void {
    Object.assign(persisted.autoPause, patch);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(AUTO_PAUSE_KEY, JSON.stringify(persisted.autoPause));
    } catch {
      // 存不了就只在這次遊戲中有效
    }
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
    if (cmd.type === 'skill') this.hooks.emit('skillCommand', { unitId: cmd.unitId, skillId: cmd.skillId, point: cmd.point, targetId: cmd.targetId });
  }

  /** 戰鬥中生成的單位也要有名字 */
  registerUnit(u: Unit, prefix = ''): void {
    if (!this.labels.has(u.id)) this.labels.set(u.id, `${prefix}${u.def.name}`);
  }

  label(id: number): string {
    return this.labels.get(id) ?? '?';
  }

  heroBySlot(slot: number): Unit | undefined {
    return this.world.units.find((u) => u.heroSlot === slot);
  }

  /** 主要選取：單選時就是那名英雄；多選時是最後一個被加入選取的英雄（Q E R 作用對象） */
  primary(): Unit | undefined {
    for (let i = this.selection.length - 1; i >= 0; i--) {
      const u = this.world.getUnit(this.selection[i]);
      if (u && !u.dead) return u;
    }
    return undefined;
  }

  selectedUnits(): Unit[] {
    return this.selection.map((id) => this.world.getUnit(id)!).filter((u) => u && !u.dead);
  }

  setPaused(p: boolean, reason = ''): void {
    const changed = this.paused !== p;
    this.paused = p;
    // 設定：暫停時取消選取所有英雄
    if (changed && p && persisted.controls.deselectOnPause) this.selection = [];
    this.pauseReason = p ? reason : '';
    if (changed) this.hooks.emit('pauseChanged', { paused: p, reason: this.pauseReason });
  }

  addLog(text: string, cls = ''): void {
    this.log.push({ text, cls, time: this.world.time });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  showToast(text: string, now: number, ms = 1600): void {
    this.toast = { text, until: now + ms };
  }
}

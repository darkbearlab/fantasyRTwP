/**
 * 遠征狀態 RunState（SPEC_SLICE2 §3.1）：純資料、可序列化成 JSON（之後做存檔用）。
 * 所有規則函式都是「舊狀態 → 新狀態」，不修改傳入的物件。
 */
import { defaultLoadout } from '../sim/data/classes';
import { HERO_ORDER, HEROES } from '../sim/data/heroes';
import type { Personality } from '../sim/data/types';
import { ECONOMY } from './data/economy';
import type { NodeType, RunMap } from './mapGen';
import { generateMap } from './mapGen';
import { LEVELS } from './data/levels';
import type { RunStyle } from './data/levels';

export interface OwnedUpgrade {
  id: string;
  /** 需要指定技能的強化（熟練、二連） */
  skillId?: string;
}

export interface HeroRecord {
  classId: string;
  /** 目前裝備的 3 個技能：[專用, 共用, 共用]（SPEC_SLICE3 §1.1） */
  skills: string[];
  hp: number;
  personality: Personality;
  upgrades: OwnedUpgrade[];
  /** 裝備的道具（SPEC_SLICE5 §17；舊紀錄沒有） */
  items?: string[];
  dead: boolean;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  battles: number;
}

/** 下一場戰鬥的全隊暫時加成（事件給的） */
export interface BattleBuff {
  accuracy?: number;
  defense?: number;
}

/** 目前所在的畫面／步驟 */
export type RunPhase =
  | { kind: 'map' }
  | { kind: 'battle'; nodeId: number; encounterId: string; fromEvent: boolean }
  /** item：這場掉落的道具（已放進背包） */
  | {
      kind: 'reward';
      nodeId: number;
      /** 三選一的強化；沉穩節奏沒有升級時是空的（只顯示戰果） */
      options: string[];
      elite: boolean;
      gold: number;
      item?: string;
      /** 經驗值（沉穩節奏）：這場獲得多少；正在選第幾級的升級（沒有升級時省略） */
      xpGained?: number;
      levelUpTo?: number;
    }
  /** 商人（SPEC_SLICE5 §17）：貨架與已售出的道具 */
  | { kind: 'shop'; nodeId: number; stock: string[]; sold: string[] }
  | { kind: 'event'; nodeId: number; eventId: string; resultText?: string; resolved: boolean }
  | {
      kind: 'rest';
      nodeId: number;
      /** 三選一已經用掉 */
      used: boolean;
      /** 營火對話已經看過（看完才打開休息選單） */
      talked?: boolean;
      /** 本次休息已經招募過 */
      recruited: boolean;
      recruitCandidates: string[];
      trainOptions: string[];
      resultText?: string;
    }
  | { kind: 'ended'; result: 'won' | 'lost' };

export interface RunStats {
  battles: number;
  battleTime: number;
  /** 各節點類型的戰鬥場數與總時間 */
  battleTimeByType: Partial<Record<NodeType | 'eventBattle', { count: number; time: number }>>;
  heroesLost: number;
  goldEarned: number;
  /** 全滅時所在的層數 */
  lostAtLayer?: number;
}

export interface RunState {
  version: 1;
  seed: number;
  map: RunMap;
  /** 目前所在節點（尚未出發為 null） */
  currentNodeId: number | null;
  path: number[];
  gold: number;
  /** 固定 4 格；null 為空欄位 */
  party: (HeroRecord | null)[];
  phase: RunPhase;
  nextBattleBuff: BattleBuff | null;
  /** 出口制（SPEC_SLICE6 §2）：從戰鬥的哪個出口離開＝下一個節點；回到路線圖時只能前往這個節點 */
  exitTo?: number | null;
  /** 隊伍等級與經驗值（SPEC_SLICE6 §3，沉穩節奏） */
  level?: number;
  xp?: number;
  /** 還沒選的升級三選一次數 */
  pendingLevelUps?: number;
  /** 已出現過的事件（避免重複） */
  seenEvents: string[];
  stats: RunStats;
  /** 遠征紀錄（給結算畫面） */
  journal: string[];
  /** 戰鬥形式：deliberate＝沉穩節奏、horde＝大型關卡、tactical＝戰術戰鬥（舊紀錄沒有，視為 tactical） */
  style?: RunStyle;
  /** 背包：還沒裝備的道具 */
  inventory?: string[];
}

export function newHero(classId: string, personality?: Personality): HeroRecord {
  const def = HEROES[classId];
  return {
    classId,
    skills: defaultLoadout(classId),
    hp: def.maxHp,
    personality: personality ?? def.personality ?? 'steadfast',
    upgrades: [],
    items: [],
    dead: false,
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    battles: 0,
  };
}

/**
 * 建立遠征。opts.party：隊伍職業（組隊畫面用 rollParty 產生）；省略時為四個 Archetype。
 */
export function createRun(seed: number, opts: { layers?: number; party?: string[]; style?: RunStyle } = {}): RunState {
  const party: (HeroRecord | null)[] = (opts.party ?? HERO_ORDER).slice(0, ECONOMY.partySize).map((id) => newHero(id));
  while (party.length < ECONOMY.partySize) party.push(null);
  const style = opts.style ?? LEVELS.expeditionStyle;
  return {
    version: 1,
    seed: seed >>> 0,
    map: generateMap(seed, opts.layers ?? ECONOMY.mapLayers, { shops: style === 'deliberate' }),
    currentNodeId: null,
    path: [],
    gold: ECONOMY.startGold,
    party,
    phase: { kind: 'map' },
    nextBattleBuff: null,
    seenEvents: [],
    stats: { battles: 0, battleTime: 0, battleTimeByType: {}, heroesLost: 0, goldEarned: 0 },
    journal: [],
    style,
    level: 1,
    xp: 0,
    pendingLevelUps: 0,
    inventory: [],
  };
}

export function cloneRun(r: RunState): RunState {
  return JSON.parse(JSON.stringify(r)) as RunState;
}

export function serializeRun(r: RunState): string {
  return JSON.stringify(r);
}

export function deserializeRun(s: string): RunState {
  const r = JSON.parse(s) as RunState;
  if (r.version !== 1) throw new Error(`不支援的存檔版本：${r.version}`);
  // 切片 2 的紀錄沒有技能欄
  for (const h of r.party) if (h && !h.skills) h.skills = defaultLoadout(h.classId);
  return r;
}

export const livingHeroes = (r: RunState): { slot: number; hero: HeroRecord }[] =>
  r.party.flatMap((h, slot) => (h && !h.dead ? [{ slot, hero: h }] : []));

/** 第一個空欄位（沒有人，或英雄已陣亡）；沒有回傳 -1 */
export function firstEmptySlot(r: RunState): number {
  return r.party.findIndex((h) => !h || h.dead);
}

export function currentLayer(r: RunState): number {
  return r.currentNodeId === null ? 0 : r.map.nodes[r.currentNodeId].layer;
}

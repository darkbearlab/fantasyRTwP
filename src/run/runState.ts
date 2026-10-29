/**
 * 遠征狀態 RunState（SPEC_SLICE2 §3.1）：純資料、可序列化成 JSON（之後做存檔用）。
 * 所有規則函式都是「舊狀態 → 新狀態」，不修改傳入的物件。
 */
import { BAG } from '../sim/data/consumables';
import { defaultLoadout } from '../sim/data/classes';
import { HERO_ORDER, HEROES } from '../sim/data/heroes';
import { ITEMS } from '../sim/data/items';
import type { Personality } from '../sim/data/types';
import { ECONOMY } from './data/economy';
import type { NodeType, RunMap } from './mapGen';
import { generateMap } from './mapGen';
import { generateRouteMap } from './routeMap';
import { CHAPTERS } from './data/chapters';
import { initOverworld } from './overworld';
import { JOURNEY } from './data/journey';
import { foldStops } from './journey';
import type { Overworld } from './overworld';
import { LEVELS } from './data/levels';
import type { RunStyle } from './data/levels';

export interface OwnedUpgrade {
  id: string;
  /** 需要指定技能的強化（熟練、二連） */
  skillId?: string;
}

export interface HeroRecord {
  /** 目前的職業（昇變後是進階職業） */
  classId: string;
  /** 昇變前的基本職業（SPEC_CLASSES；還沒昇變時沒有） */
  baseClass?: string;
  /** 隊伍等級（每級的基本成長用；舊存檔沒有＝1） */
  level?: number;
  /** 目前裝備的 3 個技能：[專用, 共用, 共用]（SPEC_SLICE3 §1.1） */
  skills: string[];
  hp: number;
  personality: Personality;
  upgrades: OwnedUpgrade[];
  /** 裝備的道具（SPEC_SLICE5 §17；舊紀錄沒有） */
  items?: string[];
  /** 隨從（Alan 2026-10-23）：兵種與目前生命；戰鬥中死了就拿掉，不會補充、不會補血 */
  followers?: { kind: string; hp: number }[];
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
  | {
      kind: 'battle';
      nodeId: number;
      encounterId: string;
      fromEvent: boolean;
      /** FTL 式路線圖：第幾次造訪（重新生成地圖用）、被主力佔領的強化戰鬥、冠軍戰 */
      visit?: number;
      /** champion：冠軍會加入這張地圖；championOnly：本來沒有戰鬥的節點（地圖上只有冠軍）；smoke：被營火的煙引來（馬上到） */
      mods?: { force?: boolean; champion?: boolean; championOnly?: boolean; smoke?: boolean };
      /** 一路向前（SPEC_SLICE7 §1）：商人節點變成地圖上的商人，貨架與已售出的道具 */
      shop?: { stock: string[]; sold: string[] };
      /** 這張圖有被困的英雄（SPEC_SLICE7 §4）：加入前已經配好的樣子 */
      rescue?: HeroRecord;
    }
  /** 解救的英雄跟著離開了這張圖：決定要不要讓他加入（SPEC_SLICE7 §4） */
  | { kind: 'rescue'; hero: HeroRecord }
  /** item：這場掉落的道具（已放進背包） */
  | {
      kind: 'reward';
      nodeId: number;
      /** 三選一的強化；沉穩節奏沒有升級時是空的（只顯示戰果） */
      options: string[];
      elite: boolean;
      gold: number;
      item?: string;
      /** 撿到的消耗品 */
      consumable?: string;
      /** 經驗值（沉穩節奏）：這場獲得多少；正在選第幾級的升級（沒有升級時省略） */
      xpGained?: number;
      levelUpTo?: number;
      /** 和 options 對齊：專屬升級固定給哪一名英雄（欄位）；通用升級是 null（SPEC_CLASSES §1） */
      optionSlots?: (number | null)[];
      /** 一路向前（SPEC_SLICE7 §3.1）：這一次是哪一名英雄自己的三選一 */
      pickSlot?: number;
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
      /** 沉穩節奏的訓練＝一次完整的升級三選一：和 trainOptions 對齊，專屬升級給哪一名英雄（通用是 null） */
      trainSlots?: (number | null)[];
      resultText?: string;
    }
  /** 章節之間的過場（SPEC_CAMPAIGN）：chapter＝即將開始的章節（從 0 開始） */
  | { kind: 'interlude'; chapter: number }
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
  /** 一路向前（SPEC_SLICE7 §1）：沒有路線圖畫面、不能回頭；從出口離開直接進下一張圖 */
  forward?: boolean;
  /** 這一段路上已經停過的途中停靠（節點 id；前往下一張圖時清空） */
  stopsDone?: number[];
  /** 剛救出來、還沒決定要不要加入的英雄 */
  pendingRescue?: HeroRecord;
  /** 隊伍等級與經驗值（SPEC_SLICE6 §3，沉穩節奏） */
  level?: number;
  xp?: number;
  /** 還沒選的升級三選一次數 */
  pendingLevelUps?: number;
  /** 一路向前（SPEC_SLICE7 §3.1）：還沒選的升級（每升一級，每名活著的英雄各一次） */
  heroPicks?: { slot: number; level: number }[];
  /** 戰役（SPEC_CAMPAIGN）：目前第幾章（從 0 開始；舊存檔沒有＝第 0 章）；打倒本章頭目、還沒進過場時為 true */
  chapter?: number;
  chapterCleared?: boolean;
  /** 剛昇變、畫面還沒演出的英雄（SPEC_CLASSES §5；畫面演完就清掉） */
  evolutionShow?: { slot: number; from: string; to: string; line: string }[];
  /** FTL 式路線圖（SPEC_SLICE6 §4，沉穩節奏）：回合、造訪次數、主力、冠軍 */
  overworld?: Overworld;
  /** 已出現過的事件（避免重複） */
  seenEvents: string[];
  stats: RunStats;
  /** 遠征紀錄（給結算畫面） */
  journal: string[];
  /** 戰鬥形式：deliberate＝沉穩節奏、horde＝大型關卡、tactical＝戰術戰鬥（舊紀錄沒有，視為 tactical） */
  style?: RunStyle;
  /** 背包：還沒裝備的道具 */
  inventory?: string[];
  /** 包包：消耗品（隊伍共用，不分配給英雄；Alan 2026-10-21） */
  bag?: string[];
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
export function createRun(seed: number, opts: { layers?: number; party?: string[]; style?: RunStyle; intro?: boolean; forward?: boolean } = {}): RunState {
  const party: (HeroRecord | null)[] = (opts.party ?? HERO_ORDER).slice(0, ECONOMY.partySize).map((id) => newHero(id));
  while (party.length < ECONOMY.partySize) party.push(null);
  const style = opts.style ?? LEVELS.expeditionStyle;
  const run: RunState = {
    version: 1,
    seed: seed >>> 0,
    // 沉穩節奏用 FTL 式路線圖（SPEC_SLICE6 §4）；封存模式維持單向分層路線圖
    map: style === 'deliberate' && opts.layers === undefined ? generateRouteMap(seed, CHAPTERS[0].layers) : generateMap(seed, opts.layers ?? ECONOMY.mapLayers, { shops: style === 'deliberate' }),
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
    bag: style === 'deliberate' ? [...BAG.start] : [],
  };
  if (style === 'deliberate' && opts.layers === undefined) {
    // 一路向前（SPEC_SLICE7 §1）：只走往下一層的連線，沒有主力與冠軍
    if (opts.forward ?? JOURNEY.forward) {
      run.forward = true;
      foldStops(run.map);
    }
    else run.overworld = initOverworld(run);
    run.chapter = 0;
    // 組隊後先看第一章的開場過場
    if (opts.intro) run.phase = { kind: 'interlude', chapter: 0 };
  }
  return run;
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
  // 道具欄分部位以前的存檔（Alan 2026-10-29）：同一部位只留第一件，其他放回背包；已經不存在的道具丟掉
  for (const h of r.party) {
    if (!h?.items) continue;
    const seen = new Set<string>();
    const keep: string[] = [];
    for (const id of h.items) {
      const slot = ITEMS[id]?.slot;
      if (!slot) continue;
      if (seen.has(slot)) (r.inventory ??= []).push(id);
      else {
        seen.add(slot);
        keep.push(id);
      }
    }
    h.items = keep;
  }
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

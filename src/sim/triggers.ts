/**
 * 通用觸發框架（Alan 2026-10-24）：被動（職業、道具、升級）可以掛「在某件事發生時、符合條件就觸發效果」。
 * 用來讓普攻有 build 的空間：第幾下、爆擊、擊殺、被打、放技能時觸發；看目標身上的狀態；
 * 效果可以打在目標身上（暈眩、標記…），也可以回饋自己（減冷卻、疊增益、回血）。
 *
 * 事件（on）：
 * - hit／crit／kill：自己打中、爆擊、打倒目標（source 預設只算普攻，'any' 連技能也算）
 * - miss：自己沒打中；dodge：對方沒打中自己
 * - hitTaken：自己被打（「目標」是打自己的那個人，例如反擊、荊棘）
 * - skillCast：自己放出技能（「目標」是技能的目標，可能沒有）
 * 條件：every（每第 N 次）、chance（機率）、targetHas（目標身上有某狀態）、cooldown（觸發後幾秒內不再觸發）。
 * 舊的 onHit（每第 N 下普攻、機率）也由這裡處理，行為不變。
 */
import { tr } from '../i18n/lang';
import type { OnHitEffect, PassiveDef } from './data/passives';
import { DT } from './constants';
import type { Unit } from './unit';
import { applyOnHitEffect, isBehind, restoreHp, triggerDamage } from './actions';
import { enemyRank } from './data/enemies';
import { dist } from './math';
import type { World } from './world';

export type TriggerEvent = 'hit' | 'crit' | 'kill' | 'miss' | 'dodge' | 'hitTaken' | 'skillCast';

/** 目標身上的狀態（targetHas 用） */
export type StatusTag = 'stunned' | 'rooted' | 'burning' | 'cursed' | 'chilled' | 'sundered' | 'marked' | 'lowHp';

/** 觸發後的效果：前面五種沿用舊的普攻命中效果（打在目標身上），後面是新的 */
export type TriggerEffect =
  | OnHitEffect
  /** 標記：目標受到的傷害 +vuln，持續 duration 秒（讓其他英雄接著打；跨英雄連鎖用） */
  | { kind: 'mark'; vuln: number; duration: number }
  /** 自己所有技能的冷卻減少 seconds 秒 */
  | { kind: 'cooldown'; seconds: number }
  /** 自己所有技能的冷卻立刻轉好 */
  | { kind: 'resetCooldown' }
  /** 自己回復最大生命的 pct */
  | { kind: 'heal'; pct: number }
  /** 自己疊增益：造成傷害每層 +damagePct，最多 maxStacks 層，持續 duration 秒（再觸發會刷新時間） */
  | { kind: 'empower'; damagePct: number; duration: number; maxStacks: number }
  /** 引爆：對目標追加 mult × 自己基本傷害的傷害；consume：同時移除 targetHas 指定的狀態 */
  | { kind: 'detonate'; mult: number; consume?: boolean }
  /** 連鎖：從目標彈到附近 radius 內另外 count 名敵人，各受 mult × 自己基本傷害 */
  | { kind: 'chain'; mult: number; count: number; radius: number }
  /** 治療隊友：自己身邊 radius 內的英雄（含自己）回復最大生命的 pct（隨從不吃） */
  | { kind: 'healAllies'; pct: number; radius: number };

export interface TriggerDef {
  on: TriggerEvent;
  /** hit／crit／kill 算哪些攻擊：basic＝只有普攻（預設）、any＝技能也算 */
  source?: 'basic' | 'any';
  every?: number;
  chance?: number;
  targetHas?: StatusTag;
  /** 目標的階級：一般、精英隊長、頭目 */
  targetRank?: 'normal' | 'elite' | 'boss';
  /** 自己的生命低於這個比例才觸發（0.5＝半血以下） */
  selfHpBelow?: number;
  /** 從目標背後打（近戰、遠程都算；看目標的面向） */
  behind?: boolean;
  /** 只算這些技能（skillCast，或 source: any 的 hit／crit／kill） */
  skillIds?: string[];
  /** 觸發後幾秒內不再觸發 */
  cooldown?: number;
  effects: TriggerEffect[];
}

export interface TriggerContext {
  /** 事件的另一方（打中的目標、打自己的人、技能目標） */
  target?: Unit;
  /** 這次是普攻嗎（hit／crit／kill／miss 用） */
  basic?: boolean;
  /** 技能的 id（技能造成的命中、放出技能） */
  skillId?: string;
}

/** 目標身上有沒有這個狀態 */
export function hasStatus(u: Unit, tag: StatusTag): boolean {
  switch (tag) {
    case 'stunned':
      return u.stunTime > 0;
    case 'rooted':
      return u.rootTime > 0;
    case 'burning':
      return u.burnTime > 0;
    case 'cursed':
      return u.curseTime > 0;
    case 'chilled':
      return u.chillTime > 0;
    case 'sundered':
      return u.sunderTime > 0;
    case 'marked':
      return u.markTime > 0;
    case 'lowHp':
      return u.hp / u.maxHp < 0.3;
  }
}

/** 移除狀態（引爆用） */
function clearStatus(u: Unit, tag: StatusTag): void {
  if (tag === 'stunned') u.stunTime = 0;
  else if (tag === 'rooted') u.rootTime = 0;
  else if (tag === 'burning') u.burnTime = 0;
  else if (tag === 'cursed') u.curseTime = 0;
  else if (tag === 'chilled') u.chillTime = 0;
  else if (tag === 'sundered') u.sunderTime = 0;
  else if (tag === 'marked') u.markTime = 0;
}

/** 舊的 onHit 寫法換成觸發：每第 N 下普攻（用普攻命中總數算）、機率 */
function legacyTriggers(p: PassiveDef): TriggerDef[] {
  return (p.onHit ?? []).map((e) => ({ on: 'hit' as const, every: e.every, chance: e.chance, effects: [e], legacy: true }));
}

/**
 * 事件發生：檢查 owner 身上所有被動的觸發，符合條件就執行效果。
 * 由戰鬥結算（actions.ts）在對應的時機呼叫。
 */
let depth = 0;

export function fireTriggers(world: World, owner: Unit, on: TriggerEvent, ctx: TriggerContext = {}): void {
  if (owner.dead && on !== 'kill') return;
  // 觸發的效果又引發觸發（例：兩邊都有反擊）：最多連鎖兩層
  if (depth >= 2) return;
  depth++;
  try {
    fireTriggersInner(world, owner, on, ctx);
  } finally {
    depth--;
  }
}

function fireTriggersInner(world: World, owner: Unit, on: TriggerEvent, ctx: TriggerContext): void {
  if (on === 'hit' && ctx.basic) owner.basicHits++;
  for (const p of owner.passives) {
    const list: (TriggerDef & { legacy?: boolean })[] = [...legacyTriggers(p), ...(p.triggers ?? [])];
    list.forEach((tr0, i) => {
      if (tr0.on !== on) return;
      if ((on === 'hit' || on === 'crit' || on === 'kill' || on === 'miss') && (tr0.source ?? 'basic') === 'basic' && !ctx.basic) return;
      const t = ctx.target;
      if (tr0.targetHas && (!t || !hasStatus(t, tr0.targetHas))) return;
      if (tr0.targetRank && (!t || enemyRank(t.def) !== tr0.targetRank)) return;
      if (tr0.selfHpBelow !== undefined && owner.hp / owner.maxHp >= tr0.selfHpBelow) return;
      if (tr0.behind && (!t || !isBehind(owner, t))) return;
      if (tr0.skillIds && (!ctx.skillId || !tr0.skillIds.includes(ctx.skillId))) return;
      const key = `${p.id}#${i}`;
      if (tr0.cooldown && (owner.triggerReadyAt[key] ?? 0) > world.time) return;
      // 每第 N 次：舊的 onHit 用普攻命中總數；新的觸發各自計數
      if (tr0.every) {
        const n = tr0.legacy ? owner.basicHits : (owner.triggerCounts[key] = (owner.triggerCounts[key] ?? 0) + 1);
        if (n % tr0.every !== 0) return;
      }
      if (tr0.chance !== undefined && !world.rng.chance(tr0.chance)) return;
      if (tr0.cooldown) owner.triggerReadyAt[key] = world.time + tr0.cooldown;
      for (const e of tr0.effects) applyTriggerEffect(world, owner, t, e, tr0.targetHas, p);
      world.emit({ type: 'notice', unitId: owner.id, text: p.name });
    });
  }
}

function applyTriggerEffect(world: World, owner: Unit, t: Unit | undefined, e: TriggerEffect, targetHas: StatusTag | undefined, p: PassiveDef): void {
  switch (e.kind) {
    case 'cooldown':
    case 'resetCooldown':
      for (const k of Object.keys(owner.cooldowns)) {
        if (owner.cooldowns[k] <= 0) continue;
        // 留一拍給每節拍的冷卻流程完成（補回使用次數）
        owner.cooldowns[k] = e.kind === 'resetCooldown' ? DT : Math.max(DT, owner.cooldowns[k] - e.seconds);
      }
      return;
    case 'heal':
      restoreHp(world, owner, owner, owner.maxHp * e.pct);
      return;
    case 'empower':
      owner.empowerStacks = Math.min(e.maxStacks, (owner.empowerTime > 0 ? owner.empowerStacks : 0) + 1);
      owner.empowerPct = e.damagePct;
      owner.empowerTime = e.duration;
      return;
    case 'healAllies':
      for (const a of world.units) if (a.isHero && !a.dead && dist(a.pos, owner.pos) <= e.radius) restoreHp(world, owner, a, a.maxHp * e.pct);
      return;
    default:
      break;
  }
  if (!t || t.dead) return;
  switch (e.kind) {
    case 'mark':
      t.markVuln = Math.max(t.markTime > 0 ? t.markVuln : 0, e.vuln);
      t.markTime = Math.max(t.markTime, e.duration);
      world.emit({ type: 'status', unitId: t.id, text: tr("標記") });
      return;
    case 'detonate':
      if (e.consume && targetHas) clearStatus(t, targetHas);
      triggerDamage(world, owner, t, e.mult, p.id);
      return;
    case 'chain': {
      // 由近到遠彈到其他敵人（不含原本的目標）
      const next = world.units
        .filter((o) => !o.dead && o !== t && o.team === t.team && dist(o.pos, t.pos) <= e.radius)
        .sort((a, b) => dist(a.pos, t.pos) - dist(b.pos, t.pos))
        .slice(0, e.count);
      for (const o of next) triggerDamage(world, owner, o, e.mult, p.id);
      if (next.length) world.emit({ type: 'status', unitId: t.id, text: tr("連鎖") });
      return;
    }
    default:
      applyOnHitEffect(world, owner, t, e, p.id);
  }
}

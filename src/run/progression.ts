/**
 * 遠征流程（SPEC_SLICE2 §3–§5、§8、§9）：選節點、戰鬥結算、獎勵、休息、復活、招募。
 * 每個函式都回傳新的 RunState，不修改傳入的物件。
 */
import { CONSUMABLES } from '../sim/data/consumables';
import { addToBag, rollConsumableDrop } from './consumables';
import { HEROES } from '../sim/data/heroes';
import { ECONOMY } from './data/economy';
import { ENCOUNTERS } from './data/encounters';
import { EVENTS } from './data/events';
import { UPGRADES } from './data/upgrades';
import type { BattleOutcome } from './battle';
import { deliberateLevelId, encounterFor, levelEncounterId, runStyle } from './battle';
import type { MapNode } from './mapGen';
import type { HeroRecord, RunState } from './runState';
import { cloneRun, firstEmptySlot, livingHeroes } from './runState';
import { pickN, rngFor } from './seed';
import { generalUpgradeIds, grantUpgrade, levelUpOffer, maxHpOf, recruitInto, rollUpgrades } from './upgrades';
import { recruitPool } from './classes';
import { rollItemDrop, rollShopStock } from './items';
import { ITEMS } from '../sim/data/items';
import { gainXp, nextLevelUpTo, xpForKills } from './xp';
import { neighbors } from './routeMap';
import { advanceTurn, campfireSmoke, caught, championDefeated, isOccupied } from './overworld';

/** 下一步可以前往的節點 */
export function availableNodes(run: RunState): MapNode[] {
  if (run.phase.kind !== 'map') return [];
  if (run.currentNodeId === null) return run.map.layers[0].map((id) => run.map.nodes[id]);
  // FTL 式路線圖：相鄰節點都能去（往回走、同層橫向）
  const next = run.overworld ? neighbors(run.map, run.currentNodeId) : run.map.nodes[run.currentNodeId].next;
  // 從戰鬥出口離開：下一個節點已經決定
  if (run.exitTo != null && next.includes(run.exitTo)) return [run.map.nodes[run.exitTo]];
  return next.map((id) => run.map.nodes[id]);
}

/** 依節點類型與層數抽遭遇 */
export function pickEncounter(run: RunState, node: MapNode): string {
  const tier = node.type === 'elite' ? 'elite' : node.type === 'boss' ? 'boss' : 'battle';
  // 大型關卡：每個節點各自生成（編號只記節點類型）
  if (runStyle(run) === 'horde') return levelEncounterId(tier);
  // 沉穩節奏：48 × 48 的生成關卡（SPEC_SLICE5 §15.3）
  if (runStyle(run) === 'deliberate') return deliberateLevelId(tier);
  const pool = Object.values(ENCOUNTERS).filter((e) => e.tier === tier && node.layer >= e.minLayer && node.layer <= e.maxLayer);
  if (pool.length === 0) throw new Error(`第 ${node.layer} 層沒有可用的${tier}遭遇`);
  const rng = rngFor(run.seed, 'encounter', node.id);
  return pool[rng.int(0, pool.length - 1)].id;
}

export function chooseNode(run: RunState, nodeId: number): RunState {
  if (!availableNodes(run).some((n) => n.id === nodeId)) throw new Error('不能前往這個節點');
  const r = cloneRun(run);
  const node = r.map.nodes[nodeId];
  r.currentNodeId = nodeId;
  r.exitTo = null;
  r.path.push(nodeId);
  if (r.overworld) {
    // FTL 式路線圖（SPEC_SLICE6 §4）：一回合——主力擴散、冠軍行動
    const { revisit } = advanceTurn(r, nodeId);
    const visit = r.overworld.visits[nodeId];
    if (caught(r)) {
      r.journal.push(`第 ${node.layer} 層：魔王的冠軍追上來了！`);
      r.phase = { kind: 'battle', nodeId, encounterId: deliberateLevelId('elite'), fromEvent: false, visit, mods: { champion: true } };
      return r;
    }
    if (isOccupied(r, nodeId) && node.type !== 'boss') {
      r.journal.push(`第 ${node.layer} 層：這裡已經被魔王的主力佔領。`);
      r.phase = { kind: 'battle', nodeId, encounterId: deliberateLevelId(node.type === 'elite' ? 'elite' : 'battle'), fromEvent: false, visit, mods: { force: true } };
      return r;
    }
    if (node.type === 'event') {
      if (revisit && r.overworld.clearedEvents.includes(nodeId)) {
        r.journal.push(`第 ${node.layer} 層：這裡已經沒有事了。`);
        r.phase = { kind: 'map' };
        return r;
      }
      r.overworld.clearedEvents.push(nodeId);
    }
    if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') {
      r.phase = { kind: 'battle', nodeId, encounterId: pickEncounter(r, node), fromEvent: false, visit };
      return r;
    }
  }
  switch (node.type) {
    case 'battle':
    case 'elite':
    case 'boss':
      r.phase = { kind: 'battle', nodeId, encounterId: pickEncounter(r, node), fromEvent: false };
      break;
    case 'event': {
      const rng = rngFor(r.seed, 'eventPick', nodeId);
      const all = Object.keys(EVENTS);
      const fresh = all.filter((id) => !r.seenEvents.includes(id));
      const pool = fresh.length ? fresh : all;
      const eventId = pool[rng.int(0, pool.length - 1)];
      r.seenEvents.push(eventId);
      r.phase = { kind: 'event', nodeId, eventId, resolved: false };
      break;
    }
    case 'shop':
      r.phase = { kind: 'shop', nodeId, stock: rollShopStock(rngFor(r.seed, 'shop', nodeId)), sold: [] };
      break;
    case 'rest': {
      const rng = rngFor(r.seed, 'rest', nodeId);
      r.phase = {
        kind: 'rest',
        nodeId,
        used: false,
        recruited: false,
        recruitCandidates: pickN(rng, recruitPool(r), ECONOMY.recruitCandidates),
        trainOptions: rollHeroUpgrades(r, nodeId),
      };
      break;
    }
  }
  return r;
}

/** 訓練只抽「給一名英雄」的強化 */
function rollHeroUpgrades(r: RunState, nodeId: number): string[] {
  const rng = rngFor(r.seed, 'train', nodeId);
  return pickN(rng, generalUpgradeIds(r.style).filter((id) => UPGRADES[id].scope === 'hero'), ECONOMY.trainChoices);
}

/** 戰鬥結算：寫回生命、陣亡、擊殺；勝利給金幣並抽獎勵，頭目勝利結束遠征 */
export function applyBattleResult(run: RunState, outcome: BattleOutcome): RunState {
  if (run.phase.kind !== 'battle') throw new Error('目前不在戰鬥階段');
  const r = cloneRun(run);
  const { nodeId, fromEvent } = run.phase;
  const node = r.map.nodes[nodeId];
  let recovered = 0;
  // 沉穩節奏：戰後整補是牧師的被動（戰地救護），牧師要活著
  const fieldCare =
    runStyle(r) !== 'deliberate' ||
    outcome.heroes.some((o) => !o.dead && ECONOMY.fieldCareClasses.includes(r.party[o.slot]?.baseClass ?? r.party[o.slot]?.classId ?? ''));
  for (const o of outcome.heroes) {
    const h = r.party[o.slot];
    if (!h) continue;
    if (!h.dead && o.dead) r.stats.heroesLost++;
    const startHp = h.hp;
    h.hp = o.dead ? 0 : Math.max(1, Math.min(maxHpOf(h), Math.round(o.hp)));
    // 戰後整補（參考永恆之柱）：勝利後存活者回復本場損失生命的一部分，其餘是長期傷勢
    if (outcome.won && fieldCare && !o.dead && startHp > h.hp) {
      const heal = Math.round((startHp - h.hp) * ECONOMY.postBattleRecoveryRatio);
      h.hp = Math.min(maxHpOf(h), h.hp + heal);
      recovered += heal;
    }
    h.dead = o.dead;
    h.kills += o.kills;
    h.damageDealt += o.damageDealt;
    h.damageTaken += o.damageTaken;
    h.battles++;
    if (o.personality) h.personality = o.personality;
  }
  // 包包：戰鬥中用掉的消耗品拿掉
  if (runStyle(r) === 'deliberate' && outcome.bag) r.bag = [...outcome.bag];
  r.nextBattleBuff = null;
  r.stats.battles++;
  r.stats.battleTime += outcome.time;
  const key = fromEvent ? 'eventBattle' : node.type;
  const bt = (r.stats.battleTimeByType[key] ??= { count: 0, time: 0 });
  bt.count++;
  bt.time += outcome.time;

  if (!outcome.won || livingHeroes(r).length === 0) {
    r.stats.lostAtLayer = node.layer;
    r.journal.push(`第 ${node.layer} 層：全軍覆沒。`);
    r.phase = { kind: 'ended', result: 'lost' };
    return r;
  }
  if (node.type === 'boss' && !fromEvent) {
    r.journal.push(`第 ${node.layer} 層：擊敗了頭目！`);
    r.phase = { kind: 'ended', result: 'won' };
    return r;
  }
  if (recovered > 0) r.journal.push(runStyle(r) === 'deliberate' ? `戰地救護：牧師為全隊回復 ${recovered} 生命。` : `戰後整補：全隊回復 ${recovered} 生命。`);
  if (run.phase.mods?.champion) {
    championDefeated(r);
    r.journal.push(`第 ${node.layer} 層：擊退了魔王的冠軍！`);
  }
  // 出口制：走哪個出口，下一個節點就是哪個
  r.exitTo = outcome.exitNodeId ?? null;
  const elite = node.type === 'elite' && !fromEvent;
  const gold = elite ? ECONOMY.goldPerElite : ECONOMY.goldPerBattle;
  r.gold += gold;
  r.stats.goldEarned += gold;
  const deliberate = runStyle(r) === 'deliberate';
  let options: string[];
  let optionSlots: (number | null)[] | undefined;
  let xpGained: number | undefined;
  if (deliberate) {
    // SPEC_SLICE6 §3：不再每場三選一；經驗值只來自擊殺，升級了才三選一（升幾級選幾次）
    xpGained = xpForKills(outcome.killed ?? []);
    const ups = gainXp(r, xpGained);
    if (ups > 0) r.journal.push(`隊伍升到第 ${r.level} 級！`);
    const offer = (r.pendingLevelUps ?? 0) > 0 ? levelUpOptions(r) : { options: [], optionSlots: [] };
    options = offer.options;
    optionSlots = offer.optionSlots;
  } else {
    const rng = rngFor(r.seed, 'reward', nodeId, fromEvent ? 'event' : 'node');
    options = rollUpgrades(rng, elite ? ECONOMY.eliteRewardChoices : ECONOMY.rewardChoices, elite);
  }
  r.journal.push(`第 ${node.layer} 層：${encounterFor(run, nodeId, run.phase.encounterId).name}勝利（${outcome.time.toFixed(0)} 秒），獲得 ${gold} 金幣。`);
  // 沉穩節奏：打贏節點時機率掉落道具（精英必掉；SPEC_SLICE5 §17）
  let item: string | undefined;
  if (runStyle(r) === 'deliberate') {
    item = rollItemDrop(rngFor(r.seed, 'itemDrop', nodeId, fromEvent ? 'event' : 'node'), elite ? 'elite' : fromEvent ? 'event' : 'battle') ?? undefined;
    if (item) {
      (r.inventory ??= []).push(item);
      r.journal.push(`撿到了「${ITEMS[item].name}」。`);
    }
  }
  // 消耗品掉落（精英必掉；包包滿了就撿不了）
  let consumable: string | undefined;
  if (deliberate) {
    const c = rollConsumableDrop(rngFor(r.seed, 'consumableDrop', nodeId, fromEvent ? 'event' : 'node'), elite ? 'elite' : fromEvent ? 'event' : 'battle');
    if (c && addToBag(r, c)) {
      consumable = c;
      r.journal.push(`撿到了「${CONSUMABLES[c].name}」。`);
    }
  }
  r.phase = { kind: 'reward', nodeId, options, elite: elite && !deliberate, gold, item, consumable, xpGained, levelUpTo: options.length ? nextLevelUpTo(r) : undefined, optionSlots };
  return r;
}

/** 升級三選一的選項（依要升到的等級決定，同一趟遠征每次一樣）：兩個專屬＋一個通用（SPEC_CLASSES §1） */
function levelUpOptions(r: RunState): { options: string[]; optionSlots: (number | null)[] } {
  return levelUpOffer(r, rngFor(r.seed, 'levelup', nextLevelUpTo(r)), ECONOMY.rewardChoices);
}

/** 戰果畫面沒有升級時：繼續回到路線圖 */
export function continueFromReward(run: RunState): RunState {
  if (run.phase.kind !== 'reward') throw new Error('目前不在獎勵階段');
  if (run.phase.options.length > 0) throw new Error('還有升級沒有選');
  return toMap(cloneRun(run));
}

export type RewardChoice = { upgradeId: string; slot?: number; skillId?: string } | 'skip';

/** 戰後三選一（精英四選一）；跳過改拿金幣 */
export function chooseReward(run: RunState, choice: RewardChoice): RunState {
  if (run.phase.kind !== 'reward') throw new Error('目前不在獎勵階段');
  const r = cloneRun(run);
  if (choice === 'skip') {
    r.gold += ECONOMY.skipRewardGold;
    r.stats.goldEarned += ECONOMY.skipRewardGold;
  } else {
    if (!run.phase.options.includes(choice.upgradeId)) throw new Error('不是可選的強化');
    // 專屬升級固定給抽到的那名英雄（同職業的兩名英雄可能抽到同一個，所以逐格比對）
    const slots = run.phase.optionSlots;
    const ok = run.phase.options.some((id, i) => id === choice.upgradeId && (slots?.[i] ?? null) === null) || run.phase.options.some((id, i) => id === choice.upgradeId && slots?.[i] === choice.slot);
    if (!ok) throw new Error('專屬升級只能給抽到的英雄');
    r.journal.push(grantUpgrade(r, choice.upgradeId, choice.slot, choice.skillId));
  }
  // 升級三選一：升了好幾級就再選一次
  if (runStyle(r) === 'deliberate' && (r.pendingLevelUps ?? 0) > 0) {
    r.pendingLevelUps! -= 1;
    if (r.pendingLevelUps! > 0) {
      const offer = levelUpOptions(r);
      r.phase = { kind: 'reward', nodeId: run.phase.nodeId, ...offer, elite: false, gold: 0, levelUpTo: nextLevelUpTo(r) };
      return r;
    }
  }
  return toMap(r);
}

function toMap(r: RunState): RunState {
  r.phase = { kind: 'map' };
  return r;
}

/** 離開事件／休息，回到路線圖 */
export function leaveNode(run: RunState): RunState {
  if (run.phase.kind === 'event' && !run.phase.resolved) throw new Error('事件還沒有選擇');
  if (run.phase.kind !== 'event' && run.phase.kind !== 'rest' && run.phase.kind !== 'shop') throw new Error('目前不能離開');
  return toMap(cloneRun(run));
}

// ───────────── 休息節點 ─────────────

export function canRevive(run: RunState, slot?: number): boolean {
  if (run.phase.kind !== 'rest' || run.phase.used || run.gold < ECONOMY.reviveCost) return false;
  if (slot === undefined) return run.party.some((h) => h?.dead);
  return !!run.party[slot]?.dead;
}

export function canRecruit(run: RunState): boolean {
  return run.phase.kind === 'rest' && !run.phase.recruited && run.gold >= ECONOMY.recruitCost && firstEmptySlot(run) >= 0;
}

function restPhase(run: RunState) {
  if (run.phase.kind !== 'rest') throw new Error('目前不在休息節點');
  return run.phase;
}

/** 紮營：全體存活英雄恢復最大生命的 40% */
/** 營火對話看完（或略過）：之後再進這個休息節點直接打開選單 */
export function finishCampfire(run: RunState): RunState {
  const r = cloneRun(run);
  restPhase(r).talked = true;
  return r;
}

export function restCamp(run: RunState): RunState {
  if (restPhase(run).used) throw new Error('本次休息已經做過選擇');
  const r = cloneRun(run);
  for (const { hero } of livingHeroes(r)) {
    const max = maxHpOf(hero);
    hero.hp = Math.min(max, hero.hp + Math.round(max * ECONOMY.campHealRatio));
  }
  const p = restPhase(r);
  p.used = true;
  p.resultText = `全隊在營火旁休息，恢復了 ${Math.round(ECONOMY.campHealRatio * 100)}% 生命。`;
  // Alan：冠軍看到營火的煙，立刻往這裡多走一格；追到了就直接開打
  if (r.overworld) {
    campfireSmoke(r);
    if (caught(r)) {
      const node = r.map.nodes[p.nodeId];
      r.journal.push(`第 ${node.layer} 層：營火的煙引來了魔王的冠軍！`);
      r.phase = { kind: 'battle', nodeId: p.nodeId, encounterId: deliberateLevelId('elite'), fromEvent: false, visit: r.overworld.visits[p.nodeId], mods: { champion: true } };
    }
  }
  return r;
}

/** 救人：花金幣復活一名陣亡英雄，以 50% 生命回歸 */
export function restRevive(run: RunState, slot: number): RunState {
  if (!canRevive(run, slot)) throw new Error('無法復活（已選擇過、金幣不足或該英雄沒有陣亡）');
  const r = cloneRun(run);
  const h = r.party[slot]!;
  h.dead = false;
  h.hp = Math.max(1, Math.round(maxHpOf(h) * ECONOMY.reviveHpRatio));
  r.gold -= ECONOMY.reviveCost;
  const p = restPhase(r);
  p.used = true;
  p.resultText = `${HEROES[h.classId].name}被救了回來。`;
  r.journal.push(`復活了${HEROES[h.classId].name}。`);
  return r;
}

/** 訓練：一名英雄從 3 個強化中選 1 */
export function restTrain(run: RunState, slot: number, upgradeId: string, skillId?: string): RunState {
  const p0 = restPhase(run);
  if (p0.used) throw new Error('本次休息已經做過選擇');
  if (!p0.trainOptions.includes(upgradeId)) throw new Error('不是可選的強化');
  const r = cloneRun(run);
  const text = grantUpgrade(r, upgradeId, slot, skillId);
  const p = restPhase(r);
  p.used = true;
  p.resultText = text;
  r.journal.push(text);
  return r;
}

/** 招募（不佔三選一）：填入第一個空欄位 */
export function restRecruit(run: RunState, classId: string): RunState {
  if (!canRecruit(run)) throw new Error('無法招募（金幣不足、沒有空欄位或已招募過）');
  if (!restPhase(run).recruitCandidates.includes(classId)) throw new Error('不是候選英雄');
  const r = cloneRun(run);
  const slot = firstEmptySlot(r);
  const bonus = recruitInto(r, slot, classId, rngFor(r.seed, 'recruitBonus', restPhase(r).nodeId));
  r.gold -= ECONOMY.recruitCost;
  restPhase(r).recruited = true;
  r.journal.push(`招募了${HEROES[classId].name}（欄位 ${slot + 1}）${bonus.length ? `，帶著「${bonus.join('、')}」` : ''}。`);
  return r;
}

export function isRunOver(run: RunState): boolean {
  return run.phase.kind === 'ended';
}

/** 在路線圖上切換英雄的閒置性格（跨戰鬥保留） */
export function setHeroPersonality(run: RunState, slot: number, personality: HeroRecord['personality']): RunState {
  const r = cloneRun(run);
  const h = r.party[slot];
  if (h) h.personality = personality;
  return r;
}

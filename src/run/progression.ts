/**
 * 遠征流程（SPEC_SLICE2 §3–§5、§8、§9）：選節點、戰鬥結算、獎勵、休息、復活、招募。
 * 每個函式都回傳新的 RunState，不修改傳入的物件。
 */
import { listSep, tr } from '../i18n/lang';
import { CONSUMABLES } from '../sim/data/consumables';
import { addToBag, rollConsumableDrop } from './consumables';
import { HEROES } from '../sim/data/heroes';
import { ECONOMY } from './data/economy';
import { ENCOUNTERS } from './data/encounters';
import { EVENTS } from './data/events';
import { UPGRADES } from './data/upgrades';
import type { BattleOutcome } from './battle';
import { deliberateLevelId, encounterFor, levelBonus, levelEncounterId, runStyle } from './battle';
import type { MapNode } from './mapGen';
import type { HeroRecord, RunState } from './runState';
import { cloneRun, firstEmptySlot, livingHeroes } from './runState';
import { pickN, rngFor } from './seed';
import { depthOffset, enterInterlude, isFinalChapter } from './campaign';
import { ROUTE_MAP } from './data/routeMap';
import { generalUpgradeIds, grantUpgrade, heroLevelUpOffer, levelUpOffer, maxHpOf, recruitInto, rollUpgrades } from './upgrades';
import { recruitPool } from './classes';
import { rollItemDrop, rollShopStock } from './items';
import { ITEMS } from '../sim/data/items';
import type { LootDef } from '../sim/data/types';
import { enemyStrength, gainXp, nextLevelUpTo, xpForKills } from './xp';
import { neighbors } from './routeMap';
import { advanceTurn, campfireSmoke, caught, championDefeated, isOccupied } from './overworld';
import { journeyStrength, rescueAt, rescueHero, stopsOn } from './journey';
import { JOURNEY } from './data/journey';

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
  r.stopsDone = [];
  r.path.push(nodeId);
  if (r.overworld) {
    // FTL 式路線圖（SPEC_SLICE6 §4）：一回合——主力擴散、冠軍行動
    const { revisit } = advanceTurn(r, nodeId);
    const visit = r.overworld.visits[nodeId];
    // 頭目節點一定打頭目（冠軍不會進頭目節點，這裡再保險一次）
    // Alan 2026-10-22：被冠軍追上時，照常進這個節點的地圖，冠軍以已經知道玩家位置的敵人加入
    // （戰鬥、精英節點照常有敵人；其他節點生成一張空的野外地圖，冠軍很快就到）
    const hunted = caught(r) && node.type !== 'boss';
    if (hunted) r.journal.push(tr("第 {0} 層：魔王的冠軍追上來了！", { 0: node.layer }));
    const occupied = isOccupied(r, nodeId) && node.type !== 'boss';
    if (occupied) r.journal.push(tr("第 {0} 層：這裡已經被魔王的主力佔領。", { 0: node.layer }));
    const fights = node.type === 'battle' || node.type === 'elite';
    if (hunted && !fights) {
      r.phase = { kind: 'battle', nodeId, encounterId: deliberateLevelId('battle'), fromEvent: false, visit, mods: { champion: true, championOnly: true, force: occupied || undefined } };
      return r;
    }
    if (occupied) {
      r.phase = { kind: 'battle', nodeId, encounterId: deliberateLevelId(node.type === 'elite' ? 'elite' : 'battle'), fromEvent: false, visit, mods: { force: true, champion: hunted || undefined } };
      return r;
    }
    if (hunted) {
      r.phase = { kind: 'battle', nodeId, encounterId: pickEncounter(r, node), fromEvent: false, visit, mods: { champion: true } };
      return r;
    }
    if (node.type === 'event') {
      if (revisit && r.overworld.clearedEvents.includes(nodeId)) {
        r.journal.push(tr("第 {0} 層：這裡已經沒有事了。", { 0: node.layer }));
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
      // 被困的英雄（SPEC_SLICE7 §4）
      if (rescueAt(r, nodeId)) r.phase.rescue = rescueHero(r, nodeId);
      break;
    case 'event':
    case 'shop':
    case 'rest':
      enterStop(r, nodeId);
      break;
  }
  return r;
}

/** 休息、商人、事件的畫面（一路向前時是途中停靠，原地修改；不改目前所在的圖） */
function enterStop(r: RunState, nodeId: number): void {
  const node = r.map.nodes[nodeId];
  switch (node.stop ?? node.type) {
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
        trainOptions: [],
      };
      // Alan 2026-10-22：沉穩節奏的訓練＝一次完整的升級三選一（兩個專屬＋一個通用），但不提升隊伍等級
      if (runStyle(r) === 'deliberate') {
        const offer = levelUpOffer(r, rngFor(r.seed, 'train', nodeId), ECONOMY.rewardChoices);
        r.phase.trainOptions = offer.options;
        r.phase.trainSlots = offer.optionSlots;
      } else r.phase.trainOptions = rollHeroUpgrades(r, nodeId);
      break;
    }
  }
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
    if (!h.dead && o.dead) {
      r.stats.heroesLost++;
      // 陣亡就是沒了（SPEC_SLICE7 §5）：身上的裝備掉回背包
      if (r.forward && h.items?.length) {
        (r.inventory ??= []).push(...h.items);
        h.items = [];
      }
    }
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
  // 救出來的英雄：戰後決定要不要讓他加入
  if (outcome.won && outcome.rescued && run.phase.kind === 'battle' && run.phase.rescue) r.pendingRescue = { ...run.phase.rescue, hp: Math.max(1, Math.round(outcome.rescued.hp)) };
  // 包包：戰鬥中用掉的消耗品拿掉
  if (runStyle(r) === 'deliberate' && outcome.bag) r.bag = [...outcome.bag];
  // 隨從（Alan 2026-10-23）：只留下活著的，生命照戰後的樣子（不補血）；主人陣亡就散了
  if (outcome.followers) {
    for (const o of outcome.heroes) {
      const h = r.party[o.slot];
      if (!h) continue;
      const left = outcome.followers.filter((f) => f.slot === o.slot).map((f) => ({ kind: f.kind, hp: Math.round(f.hp) }));
      if (h.dead || left.length === 0) delete h.followers;
      else h.followers = left;
    }
  }
  r.nextBattleBuff = null;
  r.stats.battles++;
  r.stats.battleTime += outcome.time;
  const key = fromEvent ? 'eventBattle' : node.type;
  const bt = (r.stats.battleTimeByType[key] ??= { count: 0, time: 0 });
  bt.count++;
  bt.time += outcome.time;

  if (!outcome.won || livingHeroes(r).length === 0) {
    r.stats.lostAtLayer = node.layer;
    r.journal.push(tr("第 {0} 層：全軍覆沒。", { 0: node.layer }));
    r.phase = { kind: 'ended', result: 'lost' };
    return r;
  }
  if (node.type === 'boss' && !fromEvent && !run.phase.mods?.champion) {
    r.journal.push(tr("第 {0} 層：擊敗了頭目！", { 0: node.layer }));
    // 戰役（SPEC_CAMPAIGN）：不是最後一章就照常拿戰果與升級，回路線圖之前進章節過場
    if (runStyle(r) !== 'deliberate' || isFinalChapter(r)) {
      r.phase = { kind: 'ended', result: 'won' };
      return r;
    }
    r.chapterCleared = true;
  }
  if (recovered > 0) r.journal.push(runStyle(r) === 'deliberate' ? tr("戰地救護：牧師為全隊回復 {0} 生命。", { 0: recovered }) : tr("戰後整補：全隊回復 {0} 生命。", { 0: recovered }));
  if (run.phase.mods?.champion) {
    // 打倒了：這一章不再出現；沒打倒就離開：冠軍傷勢恢復，繼續在大地圖上追
    if ((outcome.killed ?? []).some((k) => k.enemy === ROUTE_MAP.champion.enemy)) {
      championDefeated(r);
      r.journal.push(tr("第 {0} 層：打倒了魔王的冠軍！這一章他不會再出現。", { 0: node.layer }));
    } else r.journal.push(tr("第 {0} 層：甩開了魔王的冠軍。", { 0: node.layer }));
  }
  // 寶箱、地上撿到的（Alan 2026-10-22）：裝備放進背包、金幣入帳；經驗值併進下面的經驗值
  for (const l of outcome.loot ?? []) {
    if (l.kind === 'item' && ITEMS[l.id]) {
      (r.inventory ??= []).push(l.id);
      r.journal.push(tr("從寶箱拿到「{0}」。", { 0: ITEMS[l.id].name }));
    } else if (l.kind === 'gold') {
      r.gold += l.amount;
      r.stats.goldEarned += l.amount;
    }
  }
  // 出口制：走哪個出口，下一個節點就是哪個
  r.exitTo = outcome.exitNodeId ?? null;
  // 一路向前：途中的事件打起來的話，那一場就算這張圖（出口通往這張圖的下一張）
  if (r.forward && run.phase.fromEvent && r.map.nodes[nodeId].stop) {
    r.currentNodeId = nodeId;
    r.path.push(nodeId);
  }
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
    // 經驗值跟著這場敵人的強度（和 encounterFor 的層數相同）
    const battleLayer = node.layer + levelBonus(run.phase.mods ?? {}) + depthOffset(r);
    // 一路向前：經驗值跟著全程深度的強度（SPEC_SLICE7 §3.3）
    const xpMult = r.forward ? journeyStrength(r, node) * JOURNEY.curve.xpMult : enemyStrength(battleLayer);
    xpGained = Math.round(xpForKills(outcome.killed ?? [], xpMult) + lootXp(outcome.loot) * (r.forward ? JOURNEY.curve.xpMult : 1));
    const ups = gainXp(r, xpGained);
    if (ups > 0) r.journal.push(tr("隊伍升到第 {0} 級！", { 0: r.level }));
    // 一路向前（SPEC_SLICE7 §3.1）：每升一級，每名活著的英雄各自三選一
    if (r.forward && ups > 0) {
      r.pendingLevelUps = 0;
      for (let lv = r.level! - ups + 1; lv <= r.level!; lv++) for (const { slot } of livingHeroes(r)) (r.heroPicks ??= []).push({ slot, level: lv });
    }
    const offer = r.forward ? heroPickOffer(r) : (r.pendingLevelUps ?? 0) > 0 ? levelUpOptions(r) : { options: [], optionSlots: [] };
    options = offer.options;
    optionSlots = offer.optionSlots;
  } else {
    const rng = rngFor(r.seed, 'reward', nodeId, fromEvent ? 'event' : 'node');
    options = rollUpgrades(rng, elite ? ECONOMY.eliteRewardChoices : ECONOMY.rewardChoices, elite);
  }
  r.journal.push(tr("第 {0} 層：{1}勝利（{2} 秒），獲得 {3} 金幣。", { 0: node.layer, 1: encounterFor(run, nodeId, run.phase.encounterId).name, 2: outcome.time.toFixed(0), 3: gold }));
  // 沉穩節奏：打贏節點時機率掉落道具（精英必掉；SPEC_SLICE5 §17）
  let item: string | undefined;
  if (runStyle(r) === 'deliberate') {
    item = rollItemDrop(rngFor(r.seed, 'itemDrop', nodeId, fromEvent ? 'event' : 'node'), elite ? 'elite' : fromEvent ? 'event' : 'battle') ?? undefined;
    if (item) {
      (r.inventory ??= []).push(item);
      r.journal.push(tr("撿到了「{0}」。", { 0: ITEMS[item].name }));
    }
  }
  // 消耗品掉落（精英必掉；包包滿了就撿不了）
  let consumable: string | undefined;
  if (deliberate) {
    const c = rollConsumableDrop(rngFor(r.seed, 'consumableDrop', nodeId, fromEvent ? 'event' : 'node'), elite ? 'elite' : fromEvent ? 'event' : 'battle', r.forward ? JOURNEY.removedConsumables : []);
    if (c && addToBag(r, c)) {
      consumable = c;
      r.journal.push(tr("撿到了「{0}」。", { 0: CONSUMABLES[c].name }));
    }
  }
  r.phase = { kind: 'reward', nodeId, options, elite: elite && !deliberate, gold, item, consumable, xpGained, levelUpTo: options.length ? nextLevelUpTo(r) : undefined, optionSlots };
  // 一路向前：第一名英雄的三選一
  if (r.forward && r.heroPicks?.[0] && options.length) {
    r.phase.pickSlot = r.heroPicks[0].slot;
    r.phase.levelUpTo = r.heroPicks[0].level;
  }
  return r;
}

/** 寶箱給的經驗值 */
function lootXp(loot: LootDef[] | undefined): number {
  return (loot ?? []).reduce((a, l) => a + (l.kind === 'xp' ? l.amount : 0), 0);
}

/** 升級三選一的選項（依要升到的等級決定，同一趟遠征每次一樣）：兩個專屬＋一個通用（SPEC_CLASSES §1） */
/** 下一名英雄自己的三選一（沒有要選的時候是空的） */
function heroPickOffer(r: RunState): { options: string[]; optionSlots: (number | null)[]; pickSlot?: number; levelUpTo?: number } {
  r.heroPicks = (r.heroPicks ?? []).filter((p) => r.party[p.slot] && !r.party[p.slot]!.dead);
  const next = r.heroPicks[0];
  if (!next) return { options: [], optionSlots: [] };
  const options = heroLevelUpOffer(r, next.slot, rngFor(r.seed, 'levelup', next.level, next.slot), ECONOMY.rewardChoices);
  return { options, optionSlots: options.map(() => next.slot), pickSlot: next.slot, levelUpTo: next.level };
}

function levelUpOptions(r: RunState): { options: string[]; optionSlots: (number | null)[] } {
  return levelUpOffer(r, rngFor(r.seed, 'levelup', nextLevelUpTo(r)), ECONOMY.rewardChoices);
}

/**
 * MVP 的額外獎勵（Alan 2026-10-22：先留鉤子，還沒決定要不要給）。
 * slot：MVP 的隊伍欄位；回傳要顯示的文字（undefined＝沒有獎勵）。原地修改 run。
 */
export function mvpReward(_run: RunState, _slot: number): string | undefined {
  return undefined;
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
  // 一路向前：輪到下一名英雄
  if (r.forward && r.heroPicks?.length) {
    r.heroPicks.shift();
    const offer = heroPickOffer(r);
    if (offer.options.length) {
      r.phase = { kind: 'reward', nodeId: run.phase.nodeId, elite: false, gold: 0, ...offer };
      return r;
    }
    return toMap(r);
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
  if (r.pendingRescue) {
    r.phase = { kind: 'rescue', hero: r.pendingRescue };
    return r;
  }
  if (r.chapterCleared) enterInterlude(r);
  else {
    r.phase = { kind: 'map' };
    // 一路向前（SPEC_SLICE7 §1）：從出口離開，先停路上的休息、商人、事件，再直接進那張圖，不回路線圖
    if (r.forward && r.exitTo != null) {
      const stop = stopsOn(r.map, r.currentNodeId, r.exitTo).find((id) => !(r.stopsDone ?? []).includes(id));
      if (stop !== undefined) {
        (r.stopsDone ??= []).push(stop);
        enterStop(r, stop);
        return r;
      }
      return chooseNode(r, r.exitTo);
    }
  }
  return r;
}

/** 離開事件／休息，回到路線圖 */
export function leaveNode(run: RunState): RunState {
  if (run.phase.kind === 'event' && !run.phase.resolved) throw new Error('事件還沒有選擇');
  if (run.phase.kind !== 'event' && run.phase.kind !== 'rest' && run.phase.kind !== 'shop') throw new Error('目前不能離開');
  return toMap(cloneRun(run));
}

// ───────────── 解救的英雄（SPEC_SLICE7 §4） ─────────────

/** 隊伍還有空位（陣亡的欄位也算）才能加入 */
export function canAcceptRescue(run: RunState): boolean {
  return run.phase.kind === 'rescue' && firstEmptySlot(run) >= 0;
}

/** 讓他加入（填進第一個空欄位），或讓他離開；之後照常往下走 */
export function resolveRescue(run: RunState, accept: boolean): RunState {
  if (run.phase.kind !== 'rescue') throw new Error('目前沒有要決定的英雄');
  if (accept && !canAcceptRescue(run)) throw new Error('隊伍已滿');
  const r = cloneRun(run);
  const hero = r.pendingRescue!;
  r.pendingRescue = undefined;
  if (accept) {
    const slot = firstEmptySlot(r);
    r.party[slot] = hero;
    r.journal.push(tr("{0}加入了隊伍。", { 0: HEROES[hero.classId].name }));
  } else r.journal.push(tr("{0}道謝後離開了。", { 0: HEROES[hero.classId].name }));
  return toMap(r);
}

// ───────────── 休息節點 ─────────────

export function canRevive(run: RunState, slot?: number): boolean {
  // 陣亡就是沒了（SPEC_SLICE7 §5）
  if (run.forward) return false;
  if (run.phase.kind !== 'rest' || run.phase.used || run.gold < ECONOMY.reviveCost) return false;
  if (slot === undefined) return run.party.some((h) => h?.dead);
  return !!run.party[slot]?.dead;
}

export function canRecruit(run: RunState): boolean {
  // 一路向前：隊友靠路上解救（SPEC_SLICE7 §4），休息點不招募
  if (run.forward) return false;
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
  p.resultText = tr("全隊在營火旁休息，恢復了 {0}% 生命。", { 0: Math.round(ECONOMY.campHealRatio * 100) });
  smokeDrawsChampion(r);
  return r;
}

/**
 * Alan：在營火停留（紮營、訓練、救人）時，冠軍看到營火的煙，立刻往這裡多走一格；追到了就直接開打。
 * 「繼續趕路」（不休息直接離開）不會引來冠軍。
 */
function smokeDrawsChampion(r: RunState): void {
  if (!r.overworld || r.phase.kind !== 'rest') return;
  const p = r.phase;
  campfireSmoke(r);
  if (caught(r)) {
    const node = r.map.nodes[p.nodeId];
    r.journal.push(tr("第 {0} 層：營火的煙引來了魔王的冠軍！", { 0: node.layer }));
    r.phase = { kind: 'battle', nodeId: p.nodeId, encounterId: deliberateLevelId('battle'), fromEvent: false, visit: r.overworld.visits[p.nodeId], mods: { champion: true, championOnly: true, smoke: true } };
  }
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
  p.resultText = tr("{0}被救了回來。", { 0: HEROES[h.classId].name });
  r.journal.push(tr("復活了{0}。", { 0: HEROES[h.classId].name }));
  smokeDrawsChampion(r);
  return r;
}

/** 訓練：從三選一中選 1（沉穩節奏＝完整的升級三選一，專屬升級固定給抽到的英雄；不提升隊伍等級） */
export function restTrain(run: RunState, slot: number | undefined, upgradeId: string, skillId?: string): RunState {
  const p0 = restPhase(run);
  if (p0.used) throw new Error('本次休息已經做過選擇');
  if (!p0.trainOptions.includes(upgradeId)) throw new Error('不是可選的強化');
  const slots = p0.trainSlots;
  const ok = p0.trainOptions.some((id, i) => id === upgradeId && (slots?.[i] ?? null) === null) || p0.trainOptions.some((id, i) => id === upgradeId && slots?.[i] === slot);
  if (!ok) throw new Error('專屬升級只能給抽到的英雄');
  const r = cloneRun(run);
  const text = grantUpgrade(r, upgradeId, slot, skillId);
  const p = restPhase(r);
  p.used = true;
  p.resultText = text;
  r.journal.push(text);
  smokeDrawsChampion(r);
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
  r.journal.push(tr("招募了{0}（欄位 {1}）{2}。", { 0: HEROES[classId].name, 1: slot + 1, 2: bonus.length ? tr("，帶著「{0}」", { 0: bonus.join(listSep()) }) : '' }));
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

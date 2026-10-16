/**
 * 遠征流程（SPEC_SLICE2 §3–§5、§8、§9）：選節點、戰鬥結算、獎勵、休息、復活、招募。
 * 每個函式都回傳新的 RunState，不修改傳入的物件。
 */
import { HEROES } from '../sim/data/heroes';
import { ECONOMY } from './data/economy';
import { ENCOUNTERS } from './data/encounters';
import { EVENTS } from './data/events';
import { UPGRADES } from './data/upgrades';
import type { BattleOutcome } from './battle';
import type { MapNode } from './mapGen';
import type { HeroRecord, RunState } from './runState';
import { cloneRun, firstEmptySlot, livingHeroes } from './runState';
import { pickN, rngFor } from './seed';
import { grantUpgrade, maxHpOf, recruitInto, rollUpgrades } from './upgrades';
import { recruitPool } from './classes';

/** 下一步可以前往的節點 */
export function availableNodes(run: RunState): MapNode[] {
  if (run.phase.kind !== 'map') return [];
  if (run.currentNodeId === null) return run.map.layers[0].map((id) => run.map.nodes[id]);
  return run.map.nodes[run.currentNodeId].next.map((id) => run.map.nodes[id]);
}

/** 依節點類型與層數抽遭遇 */
export function pickEncounter(run: RunState, node: MapNode): string {
  const tier = node.type === 'elite' ? 'elite' : node.type === 'boss' ? 'boss' : 'battle';
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
  r.path.push(nodeId);
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
  return pickN(rng, Object.keys(UPGRADES).filter((id) => UPGRADES[id].scope === 'hero'), ECONOMY.trainChoices);
}

/** 戰鬥結算：寫回生命、陣亡、擊殺；勝利給金幣並抽獎勵，頭目勝利結束遠征 */
export function applyBattleResult(run: RunState, outcome: BattleOutcome): RunState {
  if (run.phase.kind !== 'battle') throw new Error('目前不在戰鬥階段');
  const r = cloneRun(run);
  const { nodeId, fromEvent } = run.phase;
  const node = r.map.nodes[nodeId];
  let recovered = 0;
  for (const o of outcome.heroes) {
    const h = r.party[o.slot];
    if (!h) continue;
    if (!h.dead && o.dead) r.stats.heroesLost++;
    const startHp = h.hp;
    h.hp = o.dead ? 0 : Math.max(1, Math.min(maxHpOf(h), Math.round(o.hp)));
    // 戰後整補（參考永恆之柱）：勝利後存活者回復本場損失生命的一部分，其餘是長期傷勢
    if (outcome.won && !o.dead && startHp > h.hp) {
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
  if (recovered > 0) r.journal.push(`戰後整補：全隊回復 ${recovered} 生命。`);
  const elite = node.type === 'elite' && !fromEvent;
  const gold = elite ? ECONOMY.goldPerElite : ECONOMY.goldPerBattle;
  r.gold += gold;
  r.stats.goldEarned += gold;
  const rng = rngFor(r.seed, 'reward', nodeId, fromEvent ? 'event' : 'node');
  const options = rollUpgrades(rng, elite ? ECONOMY.eliteRewardChoices : ECONOMY.rewardChoices, elite);
  r.journal.push(`第 ${node.layer} 層：${ENCOUNTERS[run.phase.encounterId].name}勝利（${outcome.time.toFixed(0)} 秒），獲得 ${gold} 金幣。`);
  r.phase = { kind: 'reward', nodeId, options, elite, gold };
  return r;
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
    r.journal.push(grantUpgrade(r, choice.upgradeId, choice.slot, choice.skillId));
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
  if (run.phase.kind !== 'event' && run.phase.kind !== 'rest') throw new Error('目前不能離開');
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

/**
 * 無畫面整趟遠征（SPEC_SLICE2 §12）：戰鬥用腳本英雄 AI，選路／事件／休息／獎勵用簡單規則。
 */
import { TICK_RATE } from '../src/sim/constants';
import { UPGRADES } from '../src/run/data/upgrades';
import { battleOutcomeFromWorld, createBattleFromRun } from '../src/run/battle';
import { chooseEventOption, eventOptions } from '../src/run/events';
import {
  applyBattleResult,
  availableNodes,
  canRecruit,
  canRevive,
  chooseNode,
  chooseReward,
  leaveNode,
  restCamp,
  restRecruit,
  restRevive,
  restTrain,
  continueFromReward,
  canAcceptRescue,
  resolveRescue,
} from '../src/run/progression';
import type { RunState } from '../src/run/runState';
import { createRun, livingHeroes } from '../src/run/runState';
import { rollParty } from '../src/run/classes';
import { maxHpOf } from '../src/run/upgrades';
import { HeroScript } from './heroScript';
import { buyItem, canBuy, canEquip, equipItem } from '../src/run/items';
import { ITEMS } from '../src/sim/data/items';
import { DeliberateScript } from './deliberateScript';
import type { RunStyle } from '../src/run/data/levels';
import { battleSkillsOf } from '../src/run/loadout';
import { startChapter } from '../src/run/campaign';

const MAX_BATTLE_SECONDS = 300;

function avgHpRatio(r: RunState): number {
  const alive = livingHeroes(r);
  if (alive.length === 0) return 0;
  return alive.reduce((s, { hero }) => s + hero.hp / maxHpOf(hero), 0) / alive.length;
}

/** 推進一步（一個決策或一場戰鬥） */
export function stepRun(r: RunState, scripted = true): RunState {
  const p = r.phase;
  switch (p.kind) {
    case 'map': {
      const nodes = availableNodes(r);
      const dead = r.party.filter((h) => h?.dead).length;
      const hp = avgHpRatio(r);
      const score = (t: string) => {
        if (t === 'rest') return (dead > 0 && r.gold >= 80) || hp < 0.6 ? 3 : 1;
        if (t === 'elite') return hp > 0.75 ? 2 : -1;
        if (t === 'event') return 1.5;
        return 1;
      };
      // FTL 式路線圖：往前走（層數高）優先，避開主力與冠軍
      const ow = r.overworld;
      const value = (n: (typeof nodes)[number]) => score(n.type) + n.layer * 10 - (ow?.force.includes(n.id) ? 6 : 0) - (ow?.champion.node === n.id ? 20 : 0);
      const best = nodes.reduce((a, b) => (value(b) > value(a) ? b : a));
      return chooseNode(r, best.id);
    }
    case 'battle': {
      const world = createBattleFromRun(r);
      const script = !scripted ? null : world.config.battleStyle === 'deliberate' ? new DeliberateScript(world) : new HeroScript(world);
      const maxTicks = MAX_BATTLE_SECONDS * TICK_RATE;
      while (!world.result && world.tick < maxTicks) {
        script?.update();
        world.step();
      }
      return applyBattleResult(r, battleOutcomeFromWorld(world));
    }
    case 'reward': {
      r = autoEquip(r);
      // 經驗值制：沒有升級時只是看戰果
      if (p.options.length === 0) return continueFromReward(r);
      const id = p.options[0];
      const up = UPGRADES[id];
      if (up.scope === 'party') return chooseReward(r, { upgradeId: id });
      // 專屬升級（SPEC_CLASSES）固定給抽到的英雄
      const own = p.optionSlots?.[0];
      if (own !== undefined && own !== null) return chooseReward(r, { upgradeId: id, slot: own });
      const target = livingHeroes(r).reduce((a, b) => (a.hero.upgrades.length <= b.hero.upgrades.length ? a : b));
      return chooseReward(r, { upgradeId: id, slot: target.slot, skillId: up.needsSkill ? battleSkillsOf(r, target.hero)[0] : undefined });
    }
    // 解救的英雄：有空位就讓他加入
    case 'rescue':
      return resolveRescue(r, canAcceptRescue(r));
    case 'interlude':
      return startChapter(r);
    case 'rest': {
      if (!p.used) {
        const deadSlot = r.party.findIndex((h) => h?.dead);
        if (deadSlot >= 0 && canRevive(r, deadSlot)) return restRevive(r, deadSlot);
        if (avgHpRatio(r) < 0.85) return restCamp(r);
        const id = p.trainOptions[0];
        const own = p.trainSlots?.[0];
        if (own !== undefined && own !== null) return restTrain(r, own, id);
        if (UPGRADES[id].scope === 'party') return restTrain(r, undefined, id);
        const { slot, hero } = livingHeroes(r)[0];
        return restTrain(r, slot, id, UPGRADES[id].needsSkill ? hero.skills[0] : undefined);
      }
      if (canRecruit(r)) return restRecruit(r, p.recruitCandidates[0]);
      return leaveNode(r);
    }
    case 'event': {
      if (p.resolved) return leaveNode(r);
      const i = eventOptions(r).findIndex((o) => o.available);
      return chooseEventOption(r, i);
    }
    case 'shop': {
      // 買得起就買最貴的一件，裝給道具最少的存活英雄
      const can = p.stock.filter((id) => canBuy(r, id)).sort((a, b) => ITEMS[b].price - ITEMS[a].price);
      if (can.length) return autoEquip(buyItem(r, can[0]));
      return leaveNode(r);
    }
    case 'ended':
      return r;
  }
}

/** 背包裡的道具裝給道具最少的存活英雄（裝不下就留在背包） */
function autoEquip(r: RunState): RunState {
  for (const id of [...(r.inventory ?? [])]) {
    const t = livingHeroes(r)
      .filter(({ slot }) => canEquip(r, slot, id))
      .sort((a, b) => (a.hero.items?.length ?? 0) - (b.hero.items?.length ?? 0))[0];
    if (t) r = equipItem(r, t.slot, id);
  }
  return r;
}

/** 自動遠征的隊伍：random＝4 名都隨機（SPEC_SLICE3 §8，預設）；fixed＝四個 Archetype */
export function autoParty(seed: number, mode: 'random' | 'fixed' = 'random'): string[] | undefined {
  return mode === 'random' ? rollParty(seed, []) : undefined;
}

export function playRun(seed: number, opts: { layers?: number; scripted?: boolean; party?: 'random' | 'fixed'; style?: RunStyle } = {}): RunState {
  let r = createRun(seed, { layers: opts.layers, party: autoParty(seed, opts.party), style: opts.style ?? 'tactical' });
  for (let guard = 0; guard < 500 && r.phase.kind !== 'ended'; guard++) r = stepRun(r, opts.scripted ?? true);
  return r;
}

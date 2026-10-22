/**
 * 事件解析與結果套用（SPEC_SLICE2 §6）。事件內容在 data/events.ts。
 */
import { listSep, tr } from '../i18n/lang';
import { HEROES } from '../sim/data/heroes';
import type { Rng } from '../sim/rng';
import type { EventCondition, EventEffect, EventOption, HeroTarget } from './data/events';
import { EVENTS } from './data/events';
import { UPGRADES } from './data/upgrades';
import type { RunState } from './runState';
import { cloneRun, firstEmptySlot, livingHeroes } from './runState';
import { generalUpgradeIds, grantUpgrade, maxHpOf, recruitInto } from './upgrades';
import { recruitPool } from './classes';
import { rngFor } from './seed';
import { deliberateLevelId, levelEncounterId, runStyle } from './battle';
import { battleSkillsOf } from './loadout';

export function conditionMet(run: RunState, c: EventCondition | undefined): boolean {
  if (!c) return true;
  if (c.minGold !== undefined && run.gold < c.minGold) return false;
  if (c.hasClass && !livingHeroes(run).some(({ hero }) => hero.classId === c.hasClass || hero.baseClass === c.hasClass)) return false;
  if (c.hasEmptySlot && firstEmptySlot(run) < 0) return false;
  return true;
}

/** 條件說明（顯示在不可選的選項旁） */
export function conditionText(c: EventCondition | undefined): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.minGold !== undefined) parts.push(tr("需要 {0} 金幣", { 0: c.minGold }));
  if (c.hasClass) parts.push(tr("隊伍中需要{0}", { 0: HEROES[c.hasClass]?.name ?? c.hasClass }));
  if (c.hasEmptySlot) parts.push(tr("需要空欄位"));
  return parts.join(tr("、"));
}

export function eventOptions(run: RunState): { option: EventOption; available: boolean }[] {
  if (run.phase.kind !== 'event') return [];
  return EVENTS[run.phase.eventId].options.map((option) => ({ option, available: conditionMet(run, option.condition) }));
}

/** 選擇事件選項：抽結果、套用效果。結果含戰鬥時會進入戰鬥階段 */
export function chooseEventOption(run: RunState, index: number): RunState {
  if (run.phase.kind !== 'event' || run.phase.resolved) throw new Error('目前不在事件中');
  const ev = EVENTS[run.phase.eventId];
  const opt = ev.options[index];
  if (!opt) throw new Error('沒有這個選項');
  if (!conditionMet(run, opt.condition)) throw new Error('條件不符，無法選擇');
  const r = cloneRun(run);
  const nodeId = run.phase.nodeId;
  const rng = rngFor(r.seed, 'event', nodeId, index);
  let roll = rng.next();
  let outcome = opt.outcomes[opt.outcomes.length - 1];
  for (const o of opt.outcomes) {
    if (roll < o.chance) {
      outcome = o;
      break;
    }
    roll -= o.chance;
  }
  const notes: string[] = [];
  let battle: string | null = null;
  for (const e of outcome.effects) {
    const note = applyEffect(r, e, rng);
    if (note) notes.push(note);
    if (e.kind === 'battle') battle = e.encounter;
  }
  const text = [outcome.text, ...notes].join('\n');
  r.journal.push(tr("【{0}】{1}：{2}", { 0: ev.title, 1: opt.label, 2: outcome.text }));
  // 大型關卡的遠征：事件戰鬥也改成生成的（較小的）關卡
  if (battle) r.phase = { kind: 'battle', nodeId, encounterId: runStyle(r) === 'horde' ? levelEncounterId('event') : runStyle(r) === 'deliberate' ? deliberateLevelId('event') : battle, fromEvent: true };
  else r.phase = { kind: 'event', nodeId, eventId: ev.id, resolved: true, resultText: text };
  return r;
}

function targets(r: RunState, t: HeroTarget, rng: Rng) {
  const alive = livingHeroes(r);
  if (alive.length === 0) return [];
  if (t === 'all') return alive;
  if (t === 'lowest') return [alive.reduce((a, b) => (a.hero.hp / maxHpOf(a.hero) <= b.hero.hp / maxHpOf(b.hero) ? a : b))];
  return [alive[rng.int(0, alive.length - 1)]];
}

/** 套用一個效果（原地修改 r），回傳要顯示的說明 */
export function applyEffect(r: RunState, e: EventEffect, rng: Rng): string {
  switch (e.kind) {
    case 'gold': {
      const before = r.gold;
      r.gold = Math.max(0, r.gold + e.amount);
      if (e.amount > 0) r.stats.goldEarned += e.amount;
      const d = r.gold - before;
      return d >= 0 ? tr("獲得 {0} 金幣", { 0: d }) : tr("失去 {0} 金幣", { 0: -d });
    }
    case 'heal':
      return targets(r, e.target, rng)
        .map(({ hero }) => {
          const max = maxHpOf(hero);
          const amt = Math.min(max - hero.hp, Math.round(max * e.pct));
          hero.hp += amt;
          return tr("{0}回復 {1} 生命", { 0: HEROES[hero.classId].name, 1: amt });
        })
        .join(tr("、"));
    case 'damage':
      return targets(r, e.target, rng)
        .map(({ hero }) => {
          const amt = Math.min(hero.hp - 1, Math.round(maxHpOf(hero) * e.pct));
          hero.hp -= amt;
          return tr("{0}失去 {1} 生命", { 0: HEROES[hero.classId].name, 1: amt });
        })
        .join(tr("、"));
    case 'upgrade': {
      const alive = livingHeroes(r);
      if (alive.length === 0) return '';
      const { slot, hero } = alive[rng.int(0, alive.length - 1)];
      const pool = generalUpgradeIds(r.style).map((id) => UPGRADES[id]).filter((u) => u.scope === 'hero' && (!e.rare || u.rare));
      const up = pool[rng.int(0, pool.length - 1)];
      const skills = battleSkillsOf(r, hero);
      return grantUpgrade(r, up.id, slot, up.needsSkill ? skills[rng.int(0, skills.length - 1)] : undefined);
    }
    case 'recruit': {
      const slot = firstEmptySlot(r);
      if (slot < 0) {
        r.gold += 20;
        return tr("隊伍已滿，他留下 20 金幣離開了");
      }
      const pool = recruitPool(r);
      const classId = e.classId ?? pool[rng.int(0, pool.length - 1)];
      const bonus = recruitInto(r, slot, classId, rng);
      return tr("{0}加入了隊伍（欄位 {1}）{2}", { 0: HEROES[classId].name, 1: slot + 1, 2: bonus.length ? tr("，帶著「{0}」", { 0: bonus.join(listSep()) }) : '' });
    }
    case 'nextBattleBuff': {
      const b = (r.nextBattleBuff ??= {});
      if (e.accuracy) b.accuracy = (b.accuracy ?? 0) + e.accuracy;
      if (e.defense) b.defense = (b.defense ?? 0) + e.defense;
      const parts: string[] = [];
      if (e.accuracy) parts.push(tr("命中 {0}{1}", { 0: e.accuracy > 0 ? '+' : '', 1: e.accuracy }));
      if (e.defense) parts.push(tr("防禦 {0}{1}", { 0: e.defense > 0 ? '+' : '', 1: e.defense }));
      return tr("下一場戰鬥全隊{0}", { 0: parts.join(tr("、")) });
    }
    case 'battle':
      return '';
  }
}

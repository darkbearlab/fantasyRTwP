/**
 * 事件解析與結果套用（SPEC_SLICE2 §6）。事件內容在 data/events.ts。
 */
import { HEROES } from '../sim/data/heroes';
import type { Rng } from '../sim/rng';
import type { EventCondition, EventEffect, EventOption, HeroTarget } from './data/events';
import { EVENTS } from './data/events';
import { UPGRADES } from './data/upgrades';
import type { RunState } from './runState';
import { cloneRun, firstEmptySlot, livingHeroes } from './runState';
import { grantUpgrade, maxHpOf, recruitInto } from './upgrades';
import { recruitPool } from './classes';
import { rngFor } from './seed';

export function conditionMet(run: RunState, c: EventCondition | undefined): boolean {
  if (!c) return true;
  if (c.minGold !== undefined && run.gold < c.minGold) return false;
  if (c.hasClass && !livingHeroes(run).some(({ hero }) => hero.classId === c.hasClass)) return false;
  if (c.hasEmptySlot && firstEmptySlot(run) < 0) return false;
  return true;
}

/** 條件說明（顯示在不可選的選項旁） */
export function conditionText(c: EventCondition | undefined): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.minGold !== undefined) parts.push(`需要 ${c.minGold} 金幣`);
  if (c.hasClass) parts.push(`隊伍中需要${HEROES[c.hasClass]?.name ?? c.hasClass}`);
  if (c.hasEmptySlot) parts.push('需要空欄位');
  return parts.join('、');
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
  r.journal.push(`【${ev.title}】${opt.label}：${outcome.text}`);
  if (battle) r.phase = { kind: 'battle', nodeId, encounterId: battle, fromEvent: true };
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
      return d >= 0 ? `獲得 ${d} 金幣` : `失去 ${-d} 金幣`;
    }
    case 'heal':
      return targets(r, e.target, rng)
        .map(({ hero }) => {
          const max = maxHpOf(hero);
          const amt = Math.min(max - hero.hp, Math.round(max * e.pct));
          hero.hp += amt;
          return `${HEROES[hero.classId].name}回復 ${amt} 生命`;
        })
        .join('、');
    case 'damage':
      return targets(r, e.target, rng)
        .map(({ hero }) => {
          const amt = Math.min(hero.hp - 1, Math.round(maxHpOf(hero) * e.pct));
          hero.hp -= amt;
          return `${HEROES[hero.classId].name}失去 ${amt} 生命`;
        })
        .join('、');
    case 'upgrade': {
      const alive = livingHeroes(r);
      if (alive.length === 0) return '';
      const { slot, hero } = alive[rng.int(0, alive.length - 1)];
      const pool = Object.values(UPGRADES).filter((u) => u.scope === 'hero' && (!e.rare || u.rare));
      const up = pool[rng.int(0, pool.length - 1)];
      const skills = hero.skills;
      return grantUpgrade(r, up.id, slot, up.needsSkill ? skills[rng.int(0, skills.length - 1)] : undefined);
    }
    case 'recruit': {
      const slot = firstEmptySlot(r);
      if (slot < 0) {
        r.gold += 20;
        return '隊伍已滿，他留下 20 金幣離開了';
      }
      const pool = recruitPool(r);
      const classId = e.classId ?? pool[rng.int(0, pool.length - 1)];
      const bonus = recruitInto(r, slot, classId, rng);
      return `${HEROES[classId].name}加入了隊伍（欄位 ${slot + 1}）${bonus.length ? `，帶著「${bonus.join('、')}」` : ''}`;
    }
    case 'nextBattleBuff': {
      const b = (r.nextBattleBuff ??= {});
      if (e.accuracy) b.accuracy = (b.accuracy ?? 0) + e.accuracy;
      if (e.defense) b.defense = (b.defense ?? 0) + e.defense;
      const parts: string[] = [];
      if (e.accuracy) parts.push(`命中 ${e.accuracy > 0 ? '+' : ''}${e.accuracy}`);
      if (e.defense) parts.push(`防禦 ${e.defense > 0 ? '+' : ''}${e.defense}`);
      return `下一場戰鬥全隊${parts.join('、')}`;
    }
    case 'battle':
      return '';
  }
}

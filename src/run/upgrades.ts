/**
 * 強化修飾器（SPEC_SLICE2 §9）：把英雄擁有的強化套在基礎數值上，產生戰鬥用的 UnitDef。
 * 不修改 HEROES 資料表。
 */
import { HEROES } from '../sim/data/heroes';
import { CLASSES } from '../sim/data/classes';
import type { UnitDef } from '../sim/data/types';
import type { Rng } from '../sim/rng';
import type { UpgradeDef, UpgradeMods } from './data/upgrades';
import { ECONOMY } from './data/economy';
import { UPGRADES } from './data/upgrades';
import type { BattleBuff, HeroRecord, OwnedUpgrade, RunState } from './runState';
import { currentLayer, livingHeroes, newHero } from './runState';
import { pickN } from './seed';

function modsOf(o: OwnedUpgrade): UpgradeMods | undefined {
  const def = UPGRADES[o.id];
  return def?.mods ?? def?.partyMods;
}

/** 依強化產生英雄的戰鬥定義（新物件；基礎資料表不變） */
export function heroDef(h: HeroRecord, buff?: BattleBuff | null): UnitDef {
  const base = HEROES[h.classId];
  let maxHpPct = 0;
  let accuracy = 0;
  let defense = 0;
  let armor = 0;
  let atkPct = 0;
  let dmgPct = 0;
  let movePct = 0;
  let stunImmune = base.interruptStunImmune ?? false;
  const skillMods: Record<string, { cooldownMult?: number; charges?: number }> = {};
  for (const o of h.upgrades) {
    const m = modsOf(o);
    if (!m) continue;
    maxHpPct += m.maxHpPct ?? 0;
    accuracy += m.accuracy ?? 0;
    defense += m.defense ?? 0;
    armor += m.armor ?? 0;
    atkPct += m.attackSpeedPct ?? 0;
    dmgPct += m.damagePct ?? 0;
    movePct += m.moveSpeedPct ?? 0;
    if (m.interruptStunImmune) stunImmune = true;
    if (o.skillId) {
      const sm = (skillMods[o.skillId] ??= {});
      if (m.skillCooldownMult) sm.cooldownMult = (sm.cooldownMult ?? 1) * m.skillCooldownMult;
      if (m.skillCharges) sm.charges = Math.max(sm.charges ?? 1, m.skillCharges);
    }
  }
  if (buff) {
    accuracy += buff.accuracy ?? 0;
    defense += buff.defense ?? 0;
  }
  return {
    ...base,
    damage: [...base.damage] as [number, number],
    skills: [...(h.skills ?? base.skills)],
    maxHp: Math.round(base.maxHp * (1 + maxHpPct)),
    accuracy: base.accuracy + accuracy,
    defense: base.defense + defense,
    armor: base.armor + armor,
    attackSpeed: base.attackSpeed * (1 + atkPct),
    damageMult: (base.damageMult ?? 1) * (1 + dmgPct),
    moveSpeed: base.moveSpeed * (1 + movePct),
    interruptStunImmune: stunImmune,
    skillMods: Object.keys(skillMods).length ? skillMods : undefined,
  };
}

export function maxHpOf(h: HeroRecord): number {
  return heroDef(h).maxHp;
}

/** 從強化池抽 n 個（不重複）；requireRare 時保證至少一個稀有 */
export function rollUpgrades(rng: Rng, n: number, requireRare = false): string[] {
  const all = Object.keys(UPGRADES);
  const picks = pickN(rng, all, n);
  if (requireRare && !picks.some((id) => UPGRADES[id].rare)) {
    const rares = all.filter((id) => UPGRADES[id].rare);
    picks[rng.int(0, picks.length - 1)] = rares[rng.int(0, rares.length - 1)];
  }
  return picks;
}

/** 套用一個強化（原地修改 run，呼叫端負責先 clone） */
export function grantUpgrade(run: RunState, upgradeId: string, slot?: number, skillId?: string): string {
  const def: UpgradeDef | undefined = UPGRADES[upgradeId];
  if (!def) throw new Error(`未知的強化：${upgradeId}`);
  if (def.scope === 'party') {
    for (const { hero } of livingHeroes(run)) {
      if (def.partyMods) hero.upgrades.push({ id: def.id });
      if (def.healPct) hero.hp = Math.min(maxHpOf(hero), hero.hp + Math.round(maxHpOf(hero) * def.healPct));
    }
    return `全隊獲得「${def.name}」`;
  }
  const h = slot !== undefined ? run.party[slot] : null;
  if (!h || h.dead) throw new Error('強化需要指定一名存活英雄');
  if (def.needsSkill && (!skillId || !h.skills.includes(skillId))) throw new Error(`「${def.name}」需要指定該英雄的技能`);
  const before = maxHpOf(h);
  h.upgrades.push(def.needsSkill ? { id: def.id, skillId } : { id: def.id });
  if (def.healPct) h.hp = Math.min(maxHpOf(h), h.hp + Math.round(maxHpOf(h) - before));
  return `${HEROES[h.classId].name}獲得「${def.name}」`;
}

/** 招募時的隨機強化數量（越晚加入越強，SPEC_SLICE3 §1.3） */
export function lateJoinUpgradeCount(layer: number): number {
  return Math.floor(layer / ECONOMY.lateJoinLayersPerUpgrade);
}

/**
 * 把新英雄放進欄位，並依目前層數給隨機強化（原地修改 run）。
 * 回傳獲得的強化名稱。
 */
export function recruitInto(run: RunState, slot: number, classId: string, rng: Rng): string[] {
  if (!CLASSES[classId]) throw new Error(`未知的職業：${classId}`);
  const h = newHero(classId);
  run.party[slot] = h;
  const pool = Object.values(UPGRADES).filter((u) => u.scope === 'hero');
  const names: string[] = [];
  for (let i = lateJoinUpgradeCount(currentLayer(run)); i > 0; i--) {
    const up = pool[rng.int(0, pool.length - 1)];
    grantUpgrade(run, up.id, slot, up.needsSkill ? h.skills[rng.int(0, h.skills.length - 1)] : undefined);
    names.push(up.name);
  }
  return names;
}

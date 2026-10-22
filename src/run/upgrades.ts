/**
 * 強化修飾器（SPEC_SLICE2 §9）：把英雄擁有的強化套在基礎數值上，產生戰鬥用的 UnitDef。
 * 不修改 HEROES 資料表。
 */
import { tr } from '../i18n/lang';
import { HEROES } from '../sim/data/heroes';
import { CLASSES } from '../sim/data/classes';
import type { UnitDef } from '../sim/data/types';
import type { Rng } from '../sim/rng';
import type { UpgradeDef, UpgradeMods } from './data/upgrades';
import { ECONOMY } from './data/economy';
import { UPGRADES } from './data/upgrades';
import type { BattleBuff, HeroRecord, OwnedUpgrade, RunState } from './runState';
import type { RunStyle } from './data/levels';
import { BRANCH_RULES, BRANCHES, branchDef } from './data/branches';
import { currentLayer, livingHeroes, newHero } from './runState';
import { pickN } from './seed';
import { battleSkillsOf } from './loadout';
import { levelGrowth } from './xp';

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
  let range = 0;
  let specDefense = 0;
  let specArmor = 0;
  let stunImmune = base.interruptStunImmune ?? false;
  // 職業本身的技能修飾（例：角鬥士的盾擊可存 2 次）先放進來，升級再疊上去
  const skillMods: Record<string, { cooldownMult?: number; charges?: number }> = JSON.parse(JSON.stringify(base.skillMods ?? {}));
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
    range += m.range ?? 0;
    specDefense += m.specDefense ?? 0;
    specArmor += m.specArmor ?? 0;
    if (m.interruptStunImmune) stunImmune = true;
    // 技能修飾：選了技能的，或升級本身固定作用在某個技能上
    const skillId = o.skillId ?? UPGRADES[o.id]?.skill;
    if (skillId) {
      const sm = (skillMods[skillId] ??= {});
      if (m.skillCooldownMult) sm.cooldownMult = (sm.cooldownMult ?? 1) * m.skillCooldownMult;
      if (m.skillCharges) sm.charges = Math.max(sm.charges ?? 1, m.skillCharges);
    }
  }
  if (buff) {
    accuracy += buff.accuracy ?? 0;
    defense += buff.defense ?? 0;
  }
  // 隊伍等級的基本成長（Alan 2026-10-22）
  const growth = levelGrowth(h.level);
  return {
    ...base,
    damage: [...base.damage] as [number, number],
    skills: [...(h.skills ?? base.skills)],
    maxHp: Math.round(base.maxHp * (1 + maxHpPct) * growth),
    accuracy: base.accuracy + accuracy,
    defense: base.defense + defense,
    armor: base.armor + armor,
    attackSpeed: base.attackSpeed * (1 + atkPct),
    damageMult: (base.damageMult ?? 1) * (1 + dmgPct) * growth,
    moveSpeed: base.moveSpeed * (1 + movePct),
    // 射程：遠程最短 1.5 m（刺客分支一路縮短，昇變後才變成近戰）
    range: range && base.range >= 1 ? Math.max(1.5, base.range + range) : base.range,
    specDefenseBonus: specDefense || undefined,
    specArmorBonus: specArmor || undefined,
    interruptStunImmune: stunImmune,
    skillMods: Object.keys(skillMods).length ? skillMods : undefined,
  };
}

export function maxHpOf(h: HeroRecord): number {
  return heroDef(h).maxHp;
}

/** 升級帶進戰鬥的被動（專屬升級給的） */
export function heroPassives(h: HeroRecord): string[] {
  return h.upgrades.map((o) => UPGRADES[o.id]?.passive).filter((p): p is string => !!p);
}

/**
 * 通用池：專屬升級不在裡面；沒有 style 的兩種節奏都有，標了 style 的只在那種節奏
 * （沒傳 style ＝舊模式，順序和以前一樣，抽到的結果不變）
 */
export function generalUpgradeIds(style?: RunStyle): string[] {
  const deliberate = style === 'deliberate';
  return Object.keys(UPGRADES).filter((id) => {
    const u = UPGRADES[id];
    return !u.branch && (!u.style || u.style === (deliberate ? 'deliberate' : 'tactical'));
  });
}

/** 從強化池抽 n 個（不重複）；requireRare 時保證至少一個稀有 */
export function rollUpgrades(rng: Rng, n: number, requireRare = false, style?: RunStyle): string[] {
  const all = generalUpgradeIds(style);
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
    return tr("全隊獲得「{0}」", { 0: def.name });
  }
  const h = slot !== undefined ? run.party[slot] : null;
  if (!h || h.dead) throw new Error('強化需要指定一名存活英雄');
  if (def.needsSkill && (!skillId || !battleSkillsOf(run, h).includes(skillId))) throw new Error(`「${def.name}」需要指定該英雄的技能`);
  if (def.branch && !canTakeExclusive(h, def.id)) throw new Error(`「${def.name}」不是這名英雄能選的專屬升級`);
  const before = maxHpOf(h);
  const name = HEROES[h.classId].name;
  h.upgrades.push(def.needsSkill ? { id: def.id, skillId } : { id: def.id });
  if (def.healPct) h.hp = Math.min(maxHpOf(h), h.hp + Math.round(maxHpOf(h) - before));
  let text = tr("{0}獲得「{1}」", { 0: name, 1: def.name });
  // 同一個分支選滿就昇變（SPEC_CLASSES §1）
  if (def.branch && branchProgress(h)[def.branch.id] >= BRANCH_RULES.threshold) {
    const b = branchDef(def.branch.classId, def.branch.id)!;
    const ratio = h.hp / maxHpOf(h);
    h.baseClass = h.classId;
    h.classId = b.evolvesTo;
    h.hp = Math.max(1, Math.round(maxHpOf(h) * ratio));
    (run.evolutionShow ??= []).push({ slot: slot!, from: h.baseClass, to: h.classId, line: b.line });
    text += tr("，昇變成{0}！", { 0: HEROES[h.classId].name });
  }
  return text;
}

// ───────────── 昇變分支（SPEC_CLASSES §1） ─────────────

/** 這名英雄在各分支選了幾個專屬升級（依基本職業） */
export function branchProgress(h: HeroRecord): Record<string, number> {
  const base = h.baseClass ?? h.classId;
  const out: Record<string, number> = {};
  for (const b of BRANCHES[base] ?? []) out[b.id] = 0;
  for (const o of h.upgrades) {
    const br = UPGRADES[o.id]?.branch;
    if (br && br.classId === base) out[br.id] = (out[br.id] ?? 0) + 1;
  }
  return out;
}

/** 還沒昇變、還有分支可走的英雄才拿得到專屬升級 */
export function canEvolve(h: HeroRecord | null): h is HeroRecord {
  return !!h && !h.dead && !h.baseClass && !!BRANCHES[h.classId];
}

/** 這個專屬升級現在能不能給這名英雄 */
export function canTakeExclusive(h: HeroRecord, upgradeId: string): boolean {
  const br = UPGRADES[upgradeId]?.branch;
  return !!br && canEvolve(h) && br.classId === h.classId && !h.upgrades.some((o) => o.id === upgradeId);
}

/** 某分支還沒選過的專屬升級 */
function remainingInBranch(h: HeroRecord, branchId: string): string[] {
  return Object.keys(UPGRADES).filter((id) => UPGRADES[id].branch?.id === branchId && canTakeExclusive(h, id));
}

/** 替一名英雄抽一個專屬升級：已經在走某個分支的話，leadBias 的機率從選最多的分支抽 */
export function rollExclusive(rng: Rng, h: HeroRecord): string | null {
  if (!canEvolve(h)) return null;
  const prog = branchProgress(h);
  const open = (BRANCHES[h.classId] ?? []).map((b) => b.id).filter((id) => remainingInBranch(h, id).length > 0);
  if (open.length === 0) return null;
  const most = Math.max(...open.map((id) => prog[id] ?? 0));
  let branch: string;
  if (most > 0 && rng.chance(BRANCH_RULES.leadBias)) branch = open.find((id) => prog[id] === most)!;
  else branch = open[rng.int(0, open.length - 1)];
  const pool = remainingInBranch(h, branch);
  return pool[rng.int(0, pool.length - 1)];
}

/**
 * 沉穩節奏的升級三選一（SPEC_CLASSES §1）：前兩格是隨機兩名不同英雄的專屬升級，第三格通用；
 * 能拿專屬升級的英雄不到兩名時，空格改出通用升級。
 */
export function levelUpOffer(run: RunState, rng: Rng, n: number): { options: string[]; optionSlots: (number | null)[] } {
  const slots = run.party.map((h, i) => (canEvolve(h) && rollableHero(h) ? i : -1)).filter((i) => i >= 0);
  const chosen = pickN(rng, slots, Math.min(BRANCH_RULES.exclusiveSlots, slots.length, n));
  const options: string[] = [];
  const optionSlots: (number | null)[] = [];
  for (const slot of chosen) {
    const id = rollExclusive(rng, run.party[slot]!);
    if (!id) continue;
    options.push(id);
    optionSlots.push(slot);
  }
  const general = pickN(rng, generalUpgradeIds(run.style), n - options.length);
  for (const id of general) {
    options.push(id);
    optionSlots.push(null);
  }
  return { options, optionSlots };
}

function rollableHero(h: HeroRecord): boolean {
  return (BRANCHES[h.classId] ?? []).some((b) => remainingInBranch(h, b.id).length > 0);
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
  // 新加入的英雄也有隊伍等級的基本成長
  h.level = run.level;
  h.hp = maxHpOf(h);
  run.party[slot] = h;
  const pool = generalUpgradeIds(run.style).map((id) => UPGRADES[id]).filter((u) => u.scope === 'hero');
  const names: string[] = [];
  for (let i = lateJoinUpgradeCount(currentLayer(run)); i > 0; i--) {
    const up = pool[rng.int(0, pool.length - 1)];
    const skills = battleSkillsOf(run, h);
    grantUpgrade(run, up.id, slot, up.needsSkill ? skills[rng.int(0, skills.length - 1)] : undefined);
    names.push(up.name);
  }
  return names;
}

/**
 * 強化修飾器（SPEC_SLICE2 §9）：把英雄擁有的強化套在基礎數值上，產生戰鬥用的 UnitDef。
 * 不修改 HEROES 資料表。
 */
import { CHARACTERS } from './data/characters';
import { heroName, heroShortName } from './characters';
import { tr } from '../i18n/lang';
import { CLASS_PASSIVES, CLASS_PASSIVE_RANKS, passiveStartRank } from '../sim/data/passives';
import { HEROES } from '../sim/data/heroes';
import { CLASSES } from '../sim/data/classes';
import type { UnitDef } from '../sim/data/types';
import type { Rng } from '../sim/rng';
import type { UpgradeDef, UpgradeMods } from './data/upgrades';
import { ECONOMY } from './data/economy';
import { UPGRADES } from './data/upgrades';
import type { BattleBuff, HeroRecord, OwnedUpgrade, RunState } from './runState';
import type { RunStyle } from './data/levels';
import { RECIPE_RULES, RECIPES, UPGRADE_MAX_RANK, evolveUpgradeId } from './data/recipes';
import type { RecipeDef } from './data/recipes';
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
    return !u.branch && !u.evolve && !u.innate && (!u.style || u.style === (deliberate ? 'deliberate' : 'tactical'));
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
  // 配方昇變（SPEC_SLICE7 §3.2）
  if (def.evolve) {
    const rc = RECIPES.find((x) => x.id === def.evolve)!;
    if (!recipeDone(h, rc)) throw new Error(`「${def.name}」的配方還沒湊齊`);
    return evolveHero(run, slot!, rc);
  }
  if (run.forward && (def.branch || def.innate) && rankOf(h, def.id) >= maxRankOf(def.id)) throw new Error(`「${def.name}」已經升滿了`);
  if (def.innate && (def.innate.classId !== (h.baseClass ?? h.classId) || !(CLASS_PASSIVES[h.classId] ?? []).includes(def.innate.passive))) throw new Error(`「${def.name}」不是這名英雄的被動`);
  if (def.needsSkill && (!skillId || !battleSkillsOf(run, h).includes(skillId))) throw new Error(`「${def.name}」需要指定該英雄的技能`);
  if (run.forward && def.branch && (h.baseClass || def.branch.classId !== h.classId)) throw new Error(`「${def.name}」不是這名英雄的職業升級`);
  if (def.branch && !run.forward && !canTakeExclusive(h, def.id)) throw new Error(`「${def.name}」不是這名英雄能選的專屬升級`);
  const before = maxHpOf(h);
  const name = heroName(h);
  h.upgrades.push(def.needsSkill ? { id: def.id, skillId } : { id: def.id });
  if (def.healPct) h.hp = Math.min(maxHpOf(h), h.hp + Math.round(maxHpOf(h) - before));
  let text = tr("{0}獲得「{1}」", { 0: name, 1: def.name });
  // 一路向前：配方昇變（湊到配方時，自動模式直接昇變；選擇模式下次升級多一張昇變卡）
  if (run.forward) {
    if (RECIPE_RULES.mode === 'auto') {
      const rc = readyRecipes(h)[0];
      if (rc) text += tr("，") + evolveHero(run, slot!, rc);
    }
    return text;
  }
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

// ───────────── 配方昇變（SPEC_SLICE7 §3.2） ─────────────

/** 職業升級最多拿幾次（通用升級不限）；職業被動升級＝最高等級 − 起始等級 */
export function maxRankOf(upgradeId: string): number {
  const u = UPGRADES[upgradeId];
  if (u?.innate) return Math.max(0, (CLASS_PASSIVE_RANKS[u.innate.passive]?.max ?? 1) - passiveStartRank(u.innate.passive));
  return u?.branch ? (UPGRADE_MAX_RANK[upgradeId] ?? 1) : Infinity;
}

/** 職業被動目前的等級（起始等級＋升了幾次） */
export function classPassiveRank(h: HeroRecord, passive: string): number {
  return passiveStartRank(passive) + rankOf(h, `cp_${passive}`);
}

/** 戰鬥時帶的職業被動與等級（一路向前；等級 0 的不帶，withZero＝也帶，道具可以把它拉到 1） */
export function classPassivesOf(h: HeroRecord, withZero = false): { id: string; rank: number }[] {
  return (CLASS_PASSIVES[h.classId] ?? [])
    .map((id) => ({ id, rank: CLASS_PASSIVE_RANKS[id] ? classPassiveRank(h, id) : 1 }))
    .filter((p) => withZero || p.rank > 0);
}

/** 這名英雄拿了幾次這個升級 */
export function rankOf(h: HeroRecord, upgradeId: string): number {
  return h.upgrades.filter((o) => o.id === upgradeId).length;
}

/** 這名英雄的職業有哪些配方（還沒昇變時） */
export function recipesOf(h: HeroRecord): RecipeDef[] {
  if (h.baseClass) return [];
  // 具名角色（SPEC_CHARACTERS）：只走自己的救贖、墮落兩條線
  const c = h.characterId ? CHARACTERS[h.characterId] : undefined;
  return RECIPES.filter((rc) => rc.base === h.classId && (!c || rc.evolvesTo === c.redeem || rc.evolvesTo === c.fall));
}

export function recipeDone(h: HeroRecord, rc: RecipeDef): boolean {
  return !h.baseClass && rc.base === h.classId && rc.requires.every((id) => rankOf(h, id) > 0) && rankOf(h, rc.maxed) >= maxRankOf(rc.maxed);
}

/** 已經湊齊、可以昇變的配方 */
export function readyRecipes(h: HeroRecord): RecipeDef[] {
  return recipesOf(h).filter((rc) => recipeDone(h, rc));
}

/** 配方還缺幾次選擇（每個沒拿的 1 次，升滿的那個缺幾級算幾次） */
export function recipeMissing(h: HeroRecord, rc: RecipeDef): number {
  const need = (id: string) => (id === rc.maxed ? maxRankOf(id) : 1);
  return rc.requires.reduce((n, id) => n + Math.max(0, need(id) - rankOf(h, id)), 0);
}

/** 昇變（原地修改 run）：生命照比例、記錄原本的職業、播昇變演出 */
export function evolveHero(run: RunState, slot: number, rc: RecipeDef): string {
  const h = run.party[slot]!;
  const ratio = h.hp / maxHpOf(h);
  h.baseClass = h.classId;
  h.classId = rc.evolvesTo;
  h.hp = Math.max(1, Math.round(maxHpOf(h) * ratio));
  const line = BRANCHES[rc.base]?.find((b) => b.evolvesTo === rc.evolvesTo)?.line ?? '';
  (run.evolutionShow ??= []).push({ slot, from: h.baseClass, to: h.classId, line });
  return tr("{0}昇變成{1}！", { 0: h.characterId ? heroShortName(h) : HEROES[h.baseClass].name, 1: HEROES[h.classId].name });
}

/** 還能拿的職業升級（沒升滿）：昇變配方的升級（昇變後就沒有了）＋職業被動升級（新職業還有那個被動就能繼續升） */
export function classUpgradesFor(h: HeroRecord): string[] {
  const base = h.baseClass ?? h.classId;
  return Object.keys(UPGRADES).filter((id) => {
    const u = UPGRADES[id];
    if (rankOf(h, id) >= maxRankOf(id)) return false;
    if (u.innate) return u.innate.classId === base && (CLASS_PASSIVES[h.classId] ?? []).includes(u.innate.passive);
    if (h.baseClass || u.branch?.classId !== h.classId) return false;
    // 具名角色：只出自己兩條線的配方用得到的升級
    return !h.characterId || recipesOf(h).some((rc) => rc.requires.includes(id));
  });
}

/**
 * 一名英雄自己的升級三選一（SPEC_SLICE7 §3.1）：湊到配方時另外多一張昇變卡（放在第一張），
 * 其餘 classSlots 張職業升級（已經在湊某份配方時，leadBias 的機率優先出它還缺的）、剩下的是通用升級（不出全隊的）。
 */
export function heroLevelUpOffer(run: RunState, slot: number, rng: Rng, n: number): string[] {
  const h = run.party[slot]!;
  const out: string[] = [];
  // 昇變卡是額外的一張（不佔三選一的格子）
  if (RECIPE_RULES.mode === 'choice') for (const rc of readyRecipes(h)) out.push(evolveUpgradeId(rc.id));
  n += out.length;
  const pool = classUpgradesFor(h);
  const pity = RECIPE_RULES.pityFromLevel > 0 && (run.level ?? 1) >= RECIPE_RULES.pityFromLevel;
  // 正在湊的配方：缺最少的那一份
  const lead = recipesOf(h)
    .filter((rc) => !recipeDone(h, rc) && rc.requires.some((id) => rankOf(h, id) > 0))
    .sort((a, b) => recipeMissing(h, a) - recipeMissing(h, b))[0];
  const wanted = lead ? pool.filter((id) => lead.requires.includes(id) && (rankOf(h, id) === 0 || id === lead.maxed)) : [];
  for (let k = 0; k < RECIPE_RULES.classSlots && out.length < n; k++) {
    const left = pool.filter((id) => !out.includes(id));
    if (!left.length) break;
    const want = wanted.filter((id) => !out.includes(id));
    const from = want.length && (pity || rng.chance(BRANCH_RULES.leadBias)) ? want : left;
    out.push(from[rng.int(0, from.length - 1)]);
  }
  const general = generalUpgradeIds(run.style).filter((id) => UPGRADES[id].scope === 'hero');
  for (const id of pickN(rng, general, n - out.length)) out.push(id);
  return out;
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

import { HEROES } from '../../sim/data/heroes';
import { CLASS_PASSIVES, CLASS_PASSIVE_RANKS, PASSIVES } from '../../sim/data/passives';
import { RECIPES, evolveUpgradeId } from './recipes';
/** 強化池（SPEC_SLICE2 §9）。強化以修飾器套在基礎數值上，RunState 只記錄擁有哪些強化。 */
export interface UpgradeMods {
  maxHpPct?: number;
  accuracy?: number;
  defense?: number;
  armor?: number;
  attackSpeedPct?: number;
  damagePct?: number;
  moveSpeedPct?: number;
  interruptStunImmune?: boolean;
  /** 需要指定技能：冷卻倍率（可疊乘） */
  skillCooldownMult?: number;
  /** 需要指定技能：可儲存次數 */
  skillCharges?: number;
  /** 普攻射程 +公尺（可以是負的；最短 ECONOMY 沒管，heroDef 保底 1.5 m） */
  range?: number;
  /** 特殊防禦、特殊護甲（沉穩節奏的物理／特殊公式） */
  specDefense?: number;
  specArmor?: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  rare?: boolean;
  /** hero：給一名英雄；party：全隊立即生效（不需選人） */
  scope: 'hero' | 'party';
  /** 需要再選一個技能 */
  needsSkill?: boolean;
  mods?: UpgradeMods;
  /** 取得當下：回復最大生命的比例（hero 對該英雄、party 對全隊存活者） */
  healPct?: number;
  /** party 範圍：全隊永久修飾（套到目前所有英雄） */
  partyMods?: UpgradeMods;
  /** 專屬升級（SPEC_CLASSES）：屬於哪個基本職業的哪個分支（data/branches.ts） */
  branch?: { classId: string; id: string };
  /** 取得後在戰鬥中帶著這個被動（PASSIVES 的 id） */
  passive?: string;
  /** 不需要選技能、固定作用在這個技能上（冷卻、次數） */
  skill?: string;
  /** 只出現在某種節奏的通用池（例：同袍只留給舊的戰術模式） */
  style?: 'deliberate' | 'tactical';
  /** 配方昇變（SPEC_SLICE7 §3.2）：選了就照這份配方昇變（data/recipes.ts） */
  evolve?: string;
  /** 職業被動升一級（Alan 2026-10-25）：哪個基本職業的哪個被動；不算昇變配方，昇變後只要新職業還有這個被動就能繼續升 */
  innate?: { classId: string; passive: string };
}

export const UPGRADES: Record<string, UpgradeDef> = {
  vigor: { id: 'vigor', name: '強健', description: '最大生命 +15%，並立刻回復同等數值', scope: 'hero', mods: { maxHpPct: 0.15 }, healPct: 0.15 },
  precise: { id: 'precise', name: '精準', description: '命中 +8', scope: 'hero', mods: { accuracy: 8 } },
  ironWall: { id: 'ironWall', name: '鐵壁', description: '護甲 +2', scope: 'hero', mods: { armor: 2 } },
  swift: { id: 'swift', name: '迅捷', description: '攻擊速度 +10%', scope: 'hero', mods: { attackSpeedPct: 0.1 } },
  practiced: { id: 'practiced', name: '熟練', description: '一個技能的冷卻 −20%', scope: 'hero', needsSkill: true, mods: { skillCooldownMult: 0.8 } },
  sharp: { id: 'sharp', name: '鋒利', description: '造成的傷害 +12%', scope: 'hero', mods: { damagePct: 0.12 } },
  evasive: { id: 'evasive', name: '閃避', description: '防禦 +8', scope: 'hero', mods: { defense: 8 } },
  fleet: { id: 'fleet', name: '疾行', description: '移動速度 +12%', scope: 'hero', mods: { moveSpeedPct: 0.12 } },
  fieldMedic: { id: 'fieldMedic', name: '戰地醫療', description: '全隊回復 20% 生命', scope: 'party', healPct: 0.2 },
  // Alan 2026-10-21：沉穩節奏拿掉同袍（舊模式照舊）
  unity: { id: 'unity', name: '同袍', description: '全隊命中 +4、防禦 +4', scope: 'party', partyMods: { accuracy: 4, defense: 4 }, style: 'tactical' },
  steadfast: { id: 'steadfast', name: '堅定', description: '被打斷時不會暈眩', rare: true, scope: 'hero', mods: { interruptStunImmune: true } },
  doubleCast: { id: 'doubleCast', name: '二連', description: '一個技能可以儲存 2 次', rare: true, scope: 'hero', needsSkill: true, mods: { skillCharges: 2 } },
  titan: { id: 'titan', name: '不屈', description: '最大生命 +30%，並立刻回復同等數值', rare: true, scope: 'hero', mods: { maxHpPct: 0.3 }, healPct: 0.3 },
  // ── 沉穩節奏的通用池補充：特殊防禦（SPEC_CLASSES §1） ──
  mindWard: { id: 'mindWard', name: '心防', description: '特殊防禦 +10（法術比較難打進去）', scope: 'hero', mods: { specDefense: 10 }, style: 'deliberate' },
  spellGuard: { id: 'spellGuard', name: '法抗', description: '特殊護甲 +2（法術傷害降低）', scope: 'hero', mods: { specArmor: 2 }, style: 'deliberate' },
  ...exclusiveUpgrades(),
};

/** 專屬升級（SPEC_CLASSES §3）：每個分支 3 個，數值佔位 */
function exclusiveUpgrades(): Record<string, UpgradeDef> {
  type X = Omit<UpgradeDef, 'scope' | 'branch'>;
  const list: [string, string, X[]][] = [
    ['warrior', 'guardian', [
      { id: 'gdTaunt', name: '挑釁', description: '嘲諷光環擴大到 7 m', passive: 'tauntWide' },
      { id: 'gdAura', name: '鐵衛', description: '4 m 內的隊友防禦 +8', passive: 'guardAura' },
      { id: 'gdShell', name: '厚盾', description: '護甲 +3、最大生命 +10%', mods: { armor: 3, maxHpPct: 0.1 }, healPct: 0.1 },
    ]],
    ['warrior', 'gladiator', [
      { id: 'glBash', name: '盾擊熟練', description: '盾擊冷卻 −25%', skill: 'shieldBash', mods: { skillCooldownMult: 0.75 } },
      { id: 'glFocus', name: '鬥技', description: '命中 +10', mods: { accuracy: 10 } },
      { id: 'glEdge', name: '角鬥', description: '傷害 +10%、攻擊速度 +8%', mods: { damagePct: 0.1, attackSpeedPct: 0.08 } },
    ]],
    ['warrior', 'berserker', [
      { id: 'bkFury', name: '怒火', description: '傷害 +12%', mods: { damagePct: 0.12 } },
      { id: 'bkFrenzy', name: '狂熱', description: '攻擊速度 +12%', mods: { attackSpeedPct: 0.12 } },
      { id: 'bkThirst', name: '嗜血', description: '對敵人造成的傷害 12% 轉成自己的生命', passive: 'bloodthirst' },
    ]],
    ['ranger', 'cutthroat', [
      { id: 'ctClose1', name: '貼近 I', description: '命中 +12，但射程 −2.5 m', mods: { accuracy: 12, range: -2.5 } },
      { id: 'ctClose2', name: '貼近 II', description: '命中 +12，但射程 −2.5 m', mods: { accuracy: 12, range: -2.5 } },
      { id: 'ctClose3', name: '貼近 III', description: '命中 +12，但射程 −2.5 m', mods: { accuracy: 12, range: -2.5 } },
    ]],
    ['ranger', 'sniper', [
      { id: 'snPower', name: '強弓', description: '傷害 +12%', mods: { damagePct: 0.12 } },
      { id: 'snReach', name: '遠望', description: '射程 +2 m', mods: { range: 2 } },
      { id: 'snSteady', name: '穩手', description: '命中 +10', mods: { accuracy: 10 } },
    ]],
    ['ranger', 'arbalest', [
      { id: 'abRapid1', name: '連射 I', description: '攻擊速度 +18%，但傷害 −6%', mods: { attackSpeedPct: 0.18, damagePct: -0.06 } },
      { id: 'abRapid2', name: '連射 II', description: '攻擊速度 +18%，但傷害 −6%', mods: { attackSpeedPct: 0.18, damagePct: -0.06 } },
      { id: 'abReload', name: '速填', description: '攻擊速度 +15%', mods: { attackSpeedPct: 0.15 } },
    ]],
    ['mage', 'elementalist', [
      { id: 'elEnchant', name: '附魔精通', description: '附魔冷卻 −20%', skill: 'enchant', mods: { skillCooldownMult: 0.8 } },
      { id: 'elFlame', name: '烈焰', description: '傷害 +12%', mods: { damagePct: 0.12 } },
      { id: 'elFrost', name: '霜寒', description: '命中 +8', mods: { accuracy: 8 } },
    ]],
    ['mage', 'deathMage', [
      { id: 'dmWide', name: '寒域', description: '寒氣光環擴大到 4.5 m', passive: 'chillWide' },
      { id: 'dmDeep', name: '刺骨', description: '3 m 內的敵人減速提高到 −40%', passive: 'chillDeep' },
      { id: 'dmFrail', name: '凋零', description: '3 m 內的敵人受到的傷害 +10%', passive: 'frailAura' },
    ]],
    ['mage', 'battlemage', [
      { id: 'bmVigor', name: '鍛體', description: '最大生命 +20%', mods: { maxHpPct: 0.2 }, healPct: 0.2 },
      { id: 'bmPlate', name: '披甲', description: '護甲 +3', mods: { armor: 3 } },
      { id: 'bmGrit', name: '近身', description: '防禦 +8', mods: { defense: 8 } },
    ]],
    ['cleric', 'paladin', [
      { id: 'plVigor', name: '聖體', description: '最大生命 +15%', mods: { maxHpPct: 0.15 }, healPct: 0.15 },
      { id: 'plHammer', name: '重錘', description: '傷害 +15%', mods: { damagePct: 0.15 } },
      { id: 'plWard', name: '聖域精通', description: '聖域冷卻 −20%', skill: 'sanctuary', mods: { skillCooldownMult: 0.8 } },
    ]],
    ['cleric', 'zealot', [
      { id: 'zeFervor', name: '熱忱', description: '祝福光環加強：命中 +15、防禦 +8', passive: 'blessStrong' },
      { id: 'zeReach', name: '佈道', description: '祝福光環擴大到 7 m', passive: 'blessWide' },
      { id: 'zeZeal', name: '虔誠', description: '命中 +8、傷害 +8%', mods: { accuracy: 8, damagePct: 0.08 } },
    ]],
    ['cleric', 'heretic', [
      { id: 'htDark', name: '暗之契', description: '4 m 內的隊友打中敵人時傷害 +5%、吸血 8%；自己扣一點血', passive: 'darkPact' },
      { id: 'htBlood', name: '血契', description: '最大生命 +15%', mods: { maxHpPct: 0.15 }, healPct: 0.15 },
      { id: 'htHunger', name: '飢渴', description: '對敵人造成的傷害 10% 轉成自己的生命', passive: 'hunger' },
    ]],
  ];
  const out: Record<string, UpgradeDef> = {};
  for (const [classId, id, ups] of list) for (const u of ups) out[u.id] = { ...u, scope: 'hero', branch: { classId, id } };
  return out;
}

// 配方昇變（SPEC_SLICE7 §3.2）：湊到配方時，升級三選一多一張「昇變」卡
for (const rc of RECIPES) {
  const name = HEROES[rc.evolvesTo]?.name ?? rc.evolvesTo;
  const id = evolveUpgradeId(rc.id);
  UPGRADES[id] = { id, name: `昇變：${name}`, description: `配方湊齊了：昇變成${name}`, scope: 'hero', evolve: rc.id };
}

// 職業被動升級（Alan 2026-10-25）：英雄本來就有的被動，升級三選一裡可以一級一級強化
for (const [classId, ids] of Object.entries(CLASS_PASSIVES)) {
  if (!['warrior', 'ranger', 'mage', 'cleric'].includes(classId)) continue;
  for (const pid of ids) {
    const R = CLASS_PASSIVE_RANKS[pid];
    if (!R) continue;
    const id = `cp_${pid}`;
    UPGRADES[id] = { id, name: `${PASSIVES[pid].name}・升級`, description: `每升一級：${R.growText}`, scope: 'hero', innate: { classId, passive: pid } };
  }
}

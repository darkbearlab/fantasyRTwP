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
  unity: { id: 'unity', name: '同袍', description: '全隊命中 +4、防禦 +4', scope: 'party', partyMods: { accuracy: 4, defense: 4 } },
  steadfast: { id: 'steadfast', name: '堅定', description: '被打斷時不會暈眩', rare: true, scope: 'hero', mods: { interruptStunImmune: true } },
  doubleCast: { id: 'doubleCast', name: '二連', description: '一個技能可以儲存 2 次', rare: true, scope: 'hero', needsSkill: true, mods: { skillCharges: 2 } },
  titan: { id: 'titan', name: '不屈', description: '最大生命 +30%，並立刻回復同等數值', rare: true, scope: 'hero', mods: { maxHpPct: 0.3 }, healPct: 0.3 },
};

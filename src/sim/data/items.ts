import { HERO_SHIELD } from './passives';
/**
 * 裝備道具（SPEC_SLICE5 §17）：每件道具提供一個被動（與職業被動同一套，src/sim/data/passives.ts）。
 * 舊的共用技能回收成道具效果（v0.4）。只在沉穩節奏生效。全部數值、價格是佔位。
 */
import type { PassiveDef } from './passives';

export type ItemRarity = 'common' | 'rare';

/** 道具欄（Alan 2026-10-29）：每名英雄武器、防具、飾品各一格 */
export type ItemSlot = 'weapon' | 'armor' | 'trinket';
export const ITEM_SLOTS: ItemSlot[] = ['weapon', 'armor', 'trinket'];

export interface ItemDef {
  id: string;
  name: string;
  rarity: ItemRarity;
  slot: ItemSlot;
  /** 職業被動 +plus 級（可以超過上限）；英雄沒有這個被動就沒有效果（Alan 2026-10-29） */
  passiveRank?: { passive: string; plus: number };
  /** 商人售價（金幣） */
  price: number;
  passive: PassiveDef;
}

const item = (id: string, name: string, rarity: ItemRarity, slot: ItemSlot, price: number, description: string, p: Omit<PassiveDef, 'id' | 'name' | 'description' | 'source'>): ItemDef => ({
  id,
  name,
  rarity,
  slot,
  price,
  passive: { id: `item:${id}`, name, description, source: 'item', ...p },
});

export const ITEMS: Record<string, ItemDef> = {
  // ── 一般 ──
  ironShield: item('ironShield', '鐵盾', 'common', 'armor', 60, '拿著盾：防禦 +25（盾不疊加）；每第 3 次普攻命中累積目標的失衡', { shieldDefense: HERO_SHIELD.defense, onHit: [{ kind: 'stun', duration: 0.5, every: 3 }] }),
  swiftBoots: item('swiftBoots', '疾行靴', 'common', 'armor', 50, '移動速度 +15%（舊：衝鋒）', { mods: { moveSpeedPct: 0.15 } }),
  hawkEye: item('hawkEye', '鷹眼', 'common', 'trinket', 60, '普攻射程 +1 m；對生命低於 30% 的目標傷害 +25%（舊：瞄準射擊）', { mods: { range: 1 }, execute: { below: 0.3, pct: 0.25 } }),
  frostRing: item('frostRing', '寒霜指環', 'common', 'trinket', 60, '普攻 20% 機率定身目標 1 秒（舊：冰縛）', { onHit: [{ kind: 'root', duration: 1, chance: 0.2 }] }),
  swampMoss: item('swampMoss', '沼澤苔', 'common', 'trinket', 55, '普攻每第 2 次命中在目標腳下留下小沼澤（敵人移動 ×0.6，4 秒；舊：沼澤）', {
    onHit: [{ kind: 'zone', every: 2, radius: 1.2, lingering: { duration: 4, affects: 'enemy', effects: [{ kind: 'slow', moveMult: 0.6 }], style: 'swamp' } }],
  }),
  holySigil: item('holySigil', '聖徽', 'common', 'trinket', 45, '命中 +8（舊：祝福）', { mods: { accuracy: 8 } }),
  warHammer: item('warHammer', '戰錘', 'common', 'weapon', 55, '造成傷害 +10%', { mods: { damagePct: 0.1 } }),
  leatherArmor: item('leatherArmor', '皮甲', 'common', 'armor', 50, '護甲 +2、防禦 +5', { mods: { armor: 2, defense: 5 } }),
  swiftGloves: item('swiftGloves', '迅捷手套', 'common', 'armor', 55, '普攻速度 +15%', { mods: { attackSpeedPct: 0.15 } }),
  // ── 稀有：兩個效果或較強的掛鉤 ──
  flameBlade: item('flameBlade', '火焰之刃', 'rare', 'weapon', 110, '普攻 30% 機率點燃目標；造成傷害 +5%（舊：火焰瓶）', { onHit: [{ kind: 'burn', chance: 0.3 }], mods: { damagePct: 0.05 } }),
  towerShield: item('towerShield', '塔盾', 'rare', 'armor', 120, '拿著盾：防禦 +25（盾不疊加）；護甲 +3；每第 3 次普攻命中累積目標大量失衡', { shieldDefense: HERO_SHIELD.defense, mods: { armor: 3 }, onHit: [{ kind: 'stun', duration: 0.8, every: 3 }] }),
  stormBoots: item('stormBoots', '風暴之靴', 'rare', 'armor', 110, '移動速度 +20%、普攻速度 +10%', { mods: { moveSpeedPct: 0.2, attackSpeedPct: 0.1 } }),
  glacierHeart: item('glacierHeart', '冰川之心', 'rare', 'trinket', 120, '普攻 30% 機率定身目標 1.5 秒；防禦 +5', { onHit: [{ kind: 'root', duration: 1.5, chance: 0.3 }], mods: { defense: 5 } }),

  // ── 觸發框架的試作道具（Alan 2026-10-24；說明見 docs/TRIGGERS.md，數值全部佔位） ──
  // 一般
  huntersMark: item('huntersMark', '獵人印記', 'common', 'trinket', 60, '普攻命中時標記目標 4 秒：受到的傷害 +15%（每 3 秒最多一次）', {
    triggers: [{ on: 'hit', cooldown: 3, effects: [{ kind: 'mark', vuln: 0.15, duration: 4 }] }],
  }),
  metronome: item('metronome', '節拍器', 'common', 'trinket', 60, '每第 4 次普攻命中，技能冷卻 −1.5 秒', {
    triggers: [{ on: 'hit', every: 4, effects: [{ kind: 'cooldown', seconds: 1.5 }] }],
  }),
  warTrophy: item('warTrophy', '戰利品項鍊', 'common', 'trinket', 55, '普攻打倒敵人時回復 6% 最大生命', {
    triggers: [{ on: 'kill', effects: [{ kind: 'heal', pct: 0.06 }] }],
  }),
  dancerSash: item('dancerSash', '舞者腰帶', 'common', 'armor', 55, '閃過攻擊時，造成傷害 +8%（最多 3 層，5 秒）', {
    triggers: [{ on: 'dodge', effects: [{ kind: 'empower', damagePct: 0.08, duration: 5, maxStacks: 3 }] }],
  }),
  backstabber: item('backstabber', '背刺匕首', 'common', 'weapon', 65, '從背後普攻命中時，追加 0.4 倍傷害', {
    triggers: [{ on: 'hit', behind: true, effects: [{ kind: 'detonate', mult: 0.4 }] }],
  }),
  // 稀有
  executionerAxe: item('executionerAxe', '處刑者之斧', 'rare', 'weapon', 120, '普攻打中被標記的目標時引爆標記：追加 1 倍傷害並消耗標記', {
    triggers: [{ on: 'hit', targetHas: 'marked', effects: [{ kind: 'detonate', mult: 1, consume: true }] }],
  }),
  reaperSigil: item('reaperSigil', '收割者徽記', 'rare', 'trinket', 125, '普攻打倒敵人時，技能冷卻立刻轉好（每 10 秒最多一次）', {
    triggers: [{ on: 'kill', cooldown: 10, effects: [{ kind: 'resetCooldown' }] }],
  }),
  fervorCharm: item('fervorCharm', '戰意護符', 'rare', 'trinket', 115, '爆擊時造成傷害 +10%（最多 3 層，6 秒）', {
    triggers: [{ on: 'crit', effects: [{ kind: 'empower', damagePct: 0.1, duration: 6, maxStacks: 3 }] }],
  }),
  thornMail: item('thornMail', '荊棘甲', 'rare', 'armor', 110, '被打時反擊攻擊者 0.3 倍傷害（每 1 秒最多一次）；護甲 +1', {
    mods: { armor: 1 },
    triggers: [{ on: 'hitTaken', cooldown: 1, effects: [{ kind: 'detonate', mult: 0.3 }] }],
  }),
  stormRing: item('stormRing', '雷鳴指環', 'rare', 'trinket', 125, '爆擊時閃電彈到附近 3 m 內另外 2 名敵人，各受 0.5 倍傷害', {
    triggers: [{ on: 'crit', effects: [{ kind: 'chain', mult: 0.5, count: 2, radius: 3 }] }],
  }),
  prayerBeads: item('prayerBeads', '禱念珠', 'rare', 'trinket', 115, '放出技能時，6 m 內的英雄（含自己）回復 6% 最大生命', {
    triggers: [{ on: 'skillCast', effects: [{ kind: 'healAllies', pct: 0.06, radius: 6 }] }],
  }),
  lastStand: item('lastStand', '背水一戰', 'rare', 'trinket', 110, '生命低於 40% 時，普攻命中使造成傷害 +12%（最多 3 層，4 秒）', {
    triggers: [{ on: 'hit', selfHpBelow: 0.4, effects: [{ kind: 'empower', damagePct: 0.12, duration: 4, maxStacks: 3 }] }],
  }),

  // ── 武器（Alan 2026-10-29：分部位後補的純數值武器，數值佔位） ──
  steelSword: item('steelSword', '精鋼長劍', 'common', 'weapon', 55, '造成傷害 +6%、命中 +4', { mods: { damagePct: 0.06, accuracy: 4 } }),
  quickBlade: item('quickBlade', '迅刃', 'common', 'weapon', 55, '普攻速度 +8%、造成傷害 +4%', { mods: { attackSpeedPct: 0.08, damagePct: 0.04 } }),
  greatBlade: item('greatBlade', '巨劍', 'rare', 'weapon', 115, '造成傷害 +18%、普攻速度 −5%', { mods: { damagePct: 0.18, attackSpeedPct: -0.05 } }),

  // ── 職業被動 +1 級的飾品（Alan 2026-10-29：沒有這個被動的英雄拿了沒效果；數值、價格佔位） ──
  cleaveManual: rankItem('cleaveManual', '橫掃戰典', 'cleave', '橫掃', '戰士系'),
  tauntBanner: rankItem('tauntBanner', '挑釁戰旗', 'tauntAura', '嘲諷光環', '戰士系'),
  piercingQuiver: rankItem('piercingQuiver', '穿甲箭袋', 'pierce', '穿透箭', '遊俠系'),
  falconFeather: rankItem('falconFeather', '隼羽', 'eagleEye', '鷹眼', '遊俠系'),
  emberCore: rankItem('emberCore', '餘燼核心', 'emberBolt', '火彈', '法師系'),
  frostShard: rankItem('frostShard', '霜晶', 'chillAura', '寒氣', '法師系'),
  smiteRelic: rankItem('smiteRelic', '聖鎚聖物', 'smite', '聖鎚', '牧師系'),
  blessedCenser: rankItem('blessedCenser', '祝福香爐', 'blessAura', '祝福光環', '牧師系'),
};

/** 職業被動 +1 級的飾品 */
function rankItem(id: string, name: string, passive: string, passiveName: string, line: string): ItemDef {
  return { ...item(id, name, 'common', 'trinket', 70, `${line}：「${passiveName}」+1 級（可以超過上限；沒有這個被動的英雄沒效果）`, {}), passiveRank: { passive, plus: 1 } };
}

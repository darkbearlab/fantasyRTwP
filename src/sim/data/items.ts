/**
 * 裝備道具（SPEC_SLICE5 §17）：每件道具提供一個被動（與職業被動同一套，src/sim/data/passives.ts）。
 * 舊的共用技能回收成道具效果（v0.4）。只在沉穩節奏生效。全部數值、價格是佔位。
 */
import type { PassiveDef } from './passives';

export type ItemRarity = 'common' | 'rare';

export interface ItemDef {
  id: string;
  name: string;
  rarity: ItemRarity;
  /** 商人售價（金幣） */
  price: number;
  passive: PassiveDef;
}

const item = (id: string, name: string, rarity: ItemRarity, price: number, description: string, p: Omit<PassiveDef, 'id' | 'name' | 'description' | 'source'>): ItemDef => ({
  id,
  name,
  rarity,
  price,
  passive: { id: `item:${id}`, name, description, source: 'item', ...p },
});

export const ITEMS: Record<string, ItemDef> = {
  // ── 一般 ──
  ironShield: item('ironShield', '鐵盾', 'common', 60, '每第 3 次普攻命中使目標暈眩 0.5 秒（舊：盾擊）', { onHit: [{ kind: 'stun', duration: 0.5, every: 3 }] }),
  swiftBoots: item('swiftBoots', '疾行靴', 'common', 50, '移動速度 +15%（舊：衝鋒）', { mods: { moveSpeedPct: 0.15 } }),
  hawkEye: item('hawkEye', '鷹眼', 'common', 60, '普攻射程 +1 m；對生命低於 30% 的目標傷害 +25%（舊：瞄準射擊）', { mods: { range: 1 }, execute: { below: 0.3, pct: 0.25 } }),
  frostRing: item('frostRing', '寒霜指環', 'common', 60, '普攻 20% 機率定身目標 1 秒（舊：冰縛）', { onHit: [{ kind: 'root', duration: 1, chance: 0.2 }] }),
  swampMoss: item('swampMoss', '沼澤苔', 'common', 55, '普攻每第 2 次命中在目標腳下留下小沼澤（敵人移動 ×0.6，4 秒；舊：沼澤）', {
    onHit: [{ kind: 'zone', every: 2, radius: 1.2, lingering: { duration: 4, affects: 'enemy', effects: [{ kind: 'slow', moveMult: 0.6 }], style: 'swamp' } }],
  }),
  holySigil: item('holySigil', '聖徽', 'common', 45, '命中 +8（舊：祝福）', { mods: { accuracy: 8 } }),
  warHammer: item('warHammer', '戰錘', 'common', 55, '造成傷害 +10%', { mods: { damagePct: 0.1 } }),
  leatherArmor: item('leatherArmor', '皮甲', 'common', 50, '護甲 +2、防禦 +5', { mods: { armor: 2, defense: 5 } }),
  swiftGloves: item('swiftGloves', '迅捷手套', 'common', 55, '普攻速度 +15%', { mods: { attackSpeedPct: 0.15 } }),
  // ── 稀有：兩個效果或較強的掛鉤 ──
  flameBlade: item('flameBlade', '火焰之刃', 'rare', 110, '普攻 30% 機率點燃目標；造成傷害 +5%（舊：火焰瓶）', { onHit: [{ kind: 'burn', chance: 0.3 }], mods: { damagePct: 0.05 } }),
  towerShield: item('towerShield', '塔盾', 'rare', 120, '護甲 +3；每第 3 次普攻命中使目標暈眩 0.8 秒', { mods: { armor: 3 }, onHit: [{ kind: 'stun', duration: 0.8, every: 3 }] }),
  stormBoots: item('stormBoots', '風暴之靴', 'rare', 110, '移動速度 +20%、普攻速度 +10%', { mods: { moveSpeedPct: 0.2, attackSpeedPct: 0.1 } }),
  glacierHeart: item('glacierHeart', '冰川之心', 'rare', 120, '普攻 30% 機率定身目標 1.5 秒；防禦 +5', { onHit: [{ kind: 'root', duration: 1.5, chance: 0.3 }], mods: { defense: 5 } }),
};

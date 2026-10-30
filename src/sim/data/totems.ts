/**
 * 圖騰（杜爾根，SPEC_CHARACTERS §4.1、§4.3）：參考 POE 的圖騰——有生命、會被打爛、有數量上限、多種類。
 * 種類（誘餌、戰鼓、縛地）在整備時選，進戰鬥固定；圖騰師、大圖騰師、背負者都沿用同一個種類設定。
 * 全部數值是佔位。
 */
import { tr } from '../../i18n/lang';
import type { PassiveDef } from './passives';

export type TotemVariant = 'decoy' | 'drum' | 'bind';
export const TOTEM_VARIANTS: TotemVariant[] = ['decoy', 'drum', 'bind'];

/** 圖騰種類的名稱（整備面板、圖騰的名字） */
export function totemVariantName(v: TotemVariant): string {
  return v === 'decoy' ? tr("誘餌") : v === 'drum' ? tr("戰鼓") : tr("縛地");
}

/** 圖騰種類的說明（整備面板） */
export function totemVariantDesc(v: TotemVariant): string {
  return v === 'decoy'
    ? tr("嘲諷周圍的敵人，生命較高：讓精英、大招打在圖騰上")
    : v === 'drum'
      ? tr("周圍的隊友普攻速度提高：打王、集中火力")
      : tr("範圍內的敵人變慢、受到的失衡增加：守點、成群的敵人");
}

/** 每種圖騰的光環（tier：small＝圖騰師、grand＝大圖騰師；背負者沿用 grand 套在自己身上） */
export function totemAura(variant: TotemVariant, tier: 'small' | 'grand'): Omit<PassiveDef, 'id' | 'name' | 'description' | 'source'> {
  const g = tier === 'grand';
  switch (variant) {
    case 'decoy':
      return { taunt: g ? 6 : 4.5 };
    case 'drum':
      return { aura: { radius: g ? 5 : 4, allies: { accuracy: 0, defense: 0, attackSpeedPct: g ? 0.3 : 0.2 } } };
    case 'bind':
      return { aura: { radius: g ? 4 : 3, enemies: { slow: g ? 0.35 : 0.25, staggerVuln: g ? 0.5 : 0.3 } } };
  }
}

export const TOTEM_RULES = {
  /** 圖騰的生命（誘餌另外乘 decoyHpMult） */
  hp: { small: 60, grand: 110 },
  decoyHpMult: 1.6,
  armor: 4,
  defense: 20,
  /** 同時最多幾個（超過就把最舊的拆掉） */
  max: { small: 1, grand: 2 },
  /** 大圖騰：會自己揮砍（射程、傷害），拉出來時一記重擊（半徑、擊退、失衡） */
  grandAttack: { range: 1.2, damage: [8, 12] as [number, number] },
  grandSlam: { radius: 2, knockback: 1.5, stagger: 20 },
  /** 背負（背負者）：持續秒數、毀滅光環的半徑、每秒傷害、每秒失衡 */
  bear: { duration: 8, radius: 2.5, dps: 6, staggerPerSec: 6 },
};

/** 用圖騰的職業 → 技能 id 前綴（圖騰師 totem*、大圖騰師 grand*、背負者 bear*） */
export const TOTEM_CLASSES: Record<string, 'totem' | 'grand' | 'bear'> = { totemist: 'totem', totemElder: 'grand', totemBearer: 'bear' };

const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** 這個職業放這種圖騰的技能 id */
export function totemSkillFor(classId: string, variant: TotemVariant): string {
  return `${TOTEM_CLASSES[classId]}${cap(variant)}`;
}

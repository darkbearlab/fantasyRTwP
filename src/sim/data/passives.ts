/**
 * 被動框架（SPEC_SLICE5 §14）：職業、裝備道具、技能效果三種來源用同一套描述。
 * 目前實作：普攻方式（attack）、嘲諷光環（taunt）、數值修正（mods）、普攻命中時的效果（onHit）。
 * 全部數值是佔位。只在沉穩節奏（deliberate）生效；怪群模式仍用 horde.ts 的 HORDE_ATTACKS。
 */
import type { BasicAttackStyle } from './horde';

/** 數值修正（同一名單位身上的被動相加） */
export interface PassiveMods {
  accuracy?: number;
  defense?: number;
  armor?: number;
  /** 造成傷害 +%（0.1 = +10%） */
  damagePct?: number;
  /** 普攻速度 +% */
  attackSpeedPct?: number;
  /** 移動速度 +% */
  moveSpeedPct?: number;
  /** 普攻射程 +公尺 */
  range?: number;
}

/** 普攻命中時的效果；every：每第 N 次普攻命中才觸發；chance：觸發機率 */
export interface OnHitEffect {
  kind: 'stun' | 'root';
  duration: number;
  chance?: number;
  every?: number;
}

export interface PassiveDef {
  id: string;
  name: string;
  description: string;
  source: 'class' | 'item' | 'status';
  /** 普攻方式（一名單位最多一個；職業被動提供） */
  attack?: BasicAttackStyle;
  /** 嘲諷光環半徑（公尺）：範圍內的敵人優先打這名英雄 */
  taunt?: number;
  mods?: PassiveMods;
  onHit?: OnHitEffect[];
}

export const PASSIVES: Record<string, PassiveDef> = {
  // ── 職業被動（§14.2，沉穩版；數值佔位）──
  cleave: {
    id: 'cleave', name: '橫掃', source: 'class',
    description: '普攻打前方扇形內的所有敵人；每第 3 擊是重擊（傷害 ×1.4、擊退）',
    attack: { kind: 'cleave', angle: 110, heavyEvery: 3, heavyMult: 1.4, heavyKnockback: 1 },
  },
  tauntAura: {
    id: 'tauntAura', name: '嘲諷光環', source: 'class',
    description: '3 m 內的敵人優先攻擊戰士',
    taunt: 3,
  },
  bloodRage: {
    id: 'bloodRage', name: '橫掃・血怒', source: 'class',
    description: '普攻打前方扇形；生命越低攻速越快（最多 +50%）',
    attack: { kind: 'cleave', angle: 110, heavyEvery: 3, heavyMult: 1.4, heavyKnockback: 1, lowHpSpeed: 0.5 },
  },
  pierce: {
    id: 'pierce', name: '穿透箭', source: 'class',
    description: '普攻穿透 2 名敵人，每穿一名傷害 ×0.7',
    attack: { kind: 'pierce', maxTargets: 3, falloff: 0.7, reach: 5, killRefire: false },
  },
  assassin: {
    id: 'assassin', name: '刺殺', source: 'class',
    description: '從背後普攻 ×1.5；擊殺後下一擊立即準備完成',
    attack: { kind: 'reset' },
  },
  shock: {
    id: 'shock', name: '震擊', source: 'class',
    description: '普攻命中點小範圍濺射（不傷友軍）',
    attack: { kind: 'blast', radius: 1.2, splashMult: 0.6, push: 0 },
  },
  hexBolt: {
    id: 'hexBolt', name: '咒彈', source: 'class',
    description: '普攻附加小詛咒（受傷 +10%、行動減慢）；目標死亡時擴散給附近 1 名敵人',
    attack: { kind: 'hex', duration: 5, actionSlow: 0.15, damageTakenPct: 0.1, spreadRadius: 3 },
  },
  smite: {
    id: 'smite', name: '聖鎚', source: 'class',
    description: '普攻擊退目標，命中時為附近生命最低的隊友回復生命',
    attack: { kind: 'smite', knockback: 0.8, heal: 4, healRadius: 6 },
  },
  grenade: {
    id: 'grenade', name: '手榴彈', source: 'class',
    description: '拋物線普攻，命中點小範圍爆炸（不傷友軍、無視掩體）',
    attack: { kind: 'blast', radius: 1.2, splashMult: 0.6, push: 0 },
  },
};

/** 各職業的職業被動 */
export const CLASS_PASSIVES: Record<string, string[]> = {
  warrior: ['cleave', 'tauntAura'],
  berserker: ['bloodRage'],
  ranger: ['pierce'],
  rogue: ['assassin'],
  mage: ['shock'],
  hexer: ['hexBolt'],
  cleric: ['smite'],
  alchemist: ['grenade'],
};

/**
 * 沉穩節奏下每名英雄唯一的主動技能（SPEC_SLICE5 §2）：預設是職業的專用技能，這裡列出例外。
 * Alan v0.4：牧師的治療改成相當於煉金術士的治療藥瓶。
 */
export const ACTIVE_SKILL_OVERRIDE: Record<string, string> = {
  cleric: 'healFlask',
  // Alan v0.4：火焰瓶要真的在地上留下持續效果
  alchemist: 'fireFlask',
};

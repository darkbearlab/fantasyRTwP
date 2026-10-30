/**
 * 被動框架（SPEC_SLICE5 §14）：職業、裝備道具、技能效果三種來源用同一套描述。
 * 目前實作：普攻方式（attack）、嘲諷光環（taunt）、數值修正（mods）、普攻命中時的效果（onHit）。
 * 全部數值是佔位。只在沉穩節奏（deliberate）生效；怪群模式仍用 horde.ts 的 HORDE_ATTACKS。
 */
import type { BasicAttackStyle } from './horde';
import type { LingeringDef, ProjectileKind } from './types';
import type { TriggerDef } from '../triggers';

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

/**
 * 普攻命中時的效果；every：每第 N 次普攻命中才觸發；chance：觸發機率。
 * stun／root：暈眩、定身 duration 秒；burn：點燃目標；zone：在目標腳下留下持續區域（radius、lingering）
 * stagger：累積目標的失衡 stagger 點（SPEC_STAGGER）。沉穩節奏裡 stun 也改成累積失衡：
 * 有 stagger 就用它，沒有就用 duration × STAGGER.perStunSec。
 */
export interface OnHitEffect {
  /** sunder：破甲，目標的物理與特殊護甲每層降低 armor、最多 maxStacks 層，持續 duration 秒（再打中會刷新） */
  kind: 'stun' | 'root' | 'burn' | 'zone' | 'sunder' | 'stagger';
  stagger?: number;
  armor?: number;
  maxStacks?: number;
  duration?: number;
  chance?: number;
  every?: number;
  radius?: number;
  lingering?: LingeringDef;
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
  /** 通用觸發（Alan 2026-10-24）：在命中、爆擊、擊殺、被打、放技能…時觸發效果（見 sim/triggers.ts） */
  triggers?: TriggerDef[];
  /** 斬殺：對生命低於 below 比例的目標傷害 +pct */
  execute?: { below: number; pct: number };
  /**
   * 光環（每節拍套用，離開範圍後很快消失）：allies＝範圍內隊友（含自己）命中、防禦加成；
   * enemies＝範圍內敵人移動速度與行動速度降低 slow 比例
   */
  aura?: {
    radius: number;
    /** damagePct：造成傷害 +%（狂信者） */
    allies?: { accuracy: number; defense: number; damagePct?: number; attackSpeedPct?: number };
    /** slow：移動與行動速度降低比例；vuln：受到的傷害增加比例；staggerVuln：受到的失衡增加比例（縛地圖騰） */
    enemies?: { slow?: number; vuln?: number; staggerVuln?: number };
    /** 吸血光環：範圍內的隊友打中敵人時傷害 +damagePct、依造成的傷害吸血 lifesteal 比例；光環主人扣傷害 × ownerCost 的血（不會扣到死） */
    drain?: { damagePct: number; lifesteal: number; ownerCost: number };
    /** 疊加：範圍內的同伴（不含自己）每一個來源都讓造成的傷害再 +stackDamagePct（戰鬥圖騰） */
    stackDamagePct?: number;
    /** 分擔：範圍內的隊友（不含自己）受到的傷害，這個比例改由光環主人承受（守護者） */
    cover?: number;
  };
  /** 吸血：對敵人造成的傷害有這個比例轉成自己的生命 */
  lifesteal?: number;
  /** 打斷敵人後，下一次攻擊必定爆擊（角鬥士） */
  critAfterInterrupt?: boolean;
  /**
   * 死靈法師（SPEC_CHARACTERS §4.1）：被自己詛咒的敵人死亡時站起來成為隨從（同時最多 max 個，生命、傷害照比例）；
   * 隨從優先打被詛咒的目標
   */
  raiseDead?: { max: number; hpMult: number; damageMult: number };
  /** 解放者（SPEC_CHARACTERS §4.1）：打斷敵人時，這個半徑內的隊友（含自己）解除負面狀態（暈眩、定身、詛咒、燃燒、標記） */
  cleanseOnInterrupt?: number;
  /** 看穿草叢：這個距離內、看得到的草叢裡的敵人對全隊現形（視野分享） */
  seesBrush?: number;
  /** 普攻的投射物外觀（例：法師的小火球） */
  attackProjectile?: ProjectileKind;
  /** 拿著盾（Alan 2026-10-25）：防禦加這麼多；好幾個來源時只取最高的（盾不疊加） */
  shieldDefense?: number;
}

/** 英雄的盾（Alan 2026-10-25）：基礎命中 95% 時，+25 防禦約讓敵人命中從九成降到六成多、生存 +50% 左右，又還不到硬坦（+40 起） */
export const HERO_SHIELD = { defense: 25 };

export const PASSIVES: Record<string, PassiveDef> = {
  // ── 職業被動（§14.2，沉穩版；數值佔位）──
  cleave: {
    id: 'cleave', name: '橫掃', source: 'class',
    description: '普攻打前方扇形內的所有敵人；每第 3 擊是重擊（傷害 ×1.4、擊退）',
    attack: { kind: 'cleave', angle: 110, heavyEvery: 3, heavyMult: 1.4, heavyKnockback: 1 },
  },
  shieldBearer: {
    id: 'shieldBearer', name: '持盾', source: 'class',
    description: `拿著盾：防禦 +${HERO_SHIELD.defense}（和盾牌道具不疊加）`,
    shieldDefense: HERO_SHIELD.defense,
  },
  tauntAura: {
    id: 'tauntAura', name: '嘲諷光環', source: 'class',
    // Alan 2026-10-20：主動換成盾擊後，嘲諷光環加大、防禦提高，彌補保護能力
    description: '5 m 內的敵人，在戰士和其他英雄差不多近時優先攻擊戰士；防禦 +10',
    taunt: 5,
    mods: { defense: 10 },
  },
  eagleEye: {
    id: 'eagleEye', name: '鷹眼', source: 'class',
    description: '看得見 10 m 內草叢裡的敵人，並分享給全隊',
    seesBrush: 10,
  },
  blessAura: {
    id: 'blessAura', name: '祝福光環', source: 'class',
    description: '5 m 內的隊友（含自己）命中 +10、防禦 +5',
    aura: { radius: 5, allies: { accuracy: 10, defense: 5 } },
  },
  /** 戰地救護（Alan 2026-10-21）：只是說明；效果在遠征層（打贏時有牧師活著，戰後整補從 1/4 提高到一半；ECONOMY.fieldCareClasses） */
  fieldCare: {
    id: 'fieldCare', name: '戰地救護', source: 'class',
    description: '打贏戰鬥時只要牧師還活著，全隊回復本場損失生命的一半（沒有牧師時只回 1/4）',
  },
  emberBolt: {
    id: 'emberBolt', name: '火彈', source: 'class',
    description: '普攻是小火球：命中點小範圍爆炸（不傷友軍）；攻擊間隔較長、每一發傷害較高',
    attack: { kind: 'blast', radius: 1.5, splashMult: 0.8, push: 0 },
    mods: { damagePct: 0.6, attackSpeedPct: -0.4 },
    attackProjectile: 'fireball',
  },
  chillAura: {
    id: 'chillAura', name: '寒氣', source: 'class',
    description: '3 m 內的敵人移動與行動速度 -25%',
    aura: { radius: 3, enemies: { slow: 0.25 } },
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
    description: '普攻打斷並擊退目標，命中時為附近生命最低的隊友回復生命',
    // Alan 2026-10-21：聖鎚自帶打斷，擊退不變
    attack: { kind: 'smite', knockback: 0.8, heal: 4, healRadius: 6, interrupts: true },
  },
  // ── 專屬升級給的被動（SPEC_CLASSES §3，數值佔位）──
  tauntWide: { id: 'tauntWide', name: '挑釁', source: 'class', description: '7 m 內的敵人，在這名英雄和其他英雄差不多近時優先攻擊這名英雄', taunt: 7 },
  guardAura: { id: 'guardAura', name: '鐵衛', source: 'class', description: '4 m 內的隊友防禦 +8', aura: { radius: 4, allies: { accuracy: 0, defense: 8 } } },
  bloodthirst: { id: 'bloodthirst', name: '嗜血', source: 'class', description: '對敵人造成的傷害 12% 轉成自己的生命', lifesteal: 0.12 },
  chillWide: { id: 'chillWide', name: '寒域', source: 'class', description: '4.5 m 內的敵人移動與行動速度 -25%', aura: { radius: 4.5, enemies: { slow: 0.25 } } },
  chillDeep: { id: 'chillDeep', name: '刺骨', source: 'class', description: '3 m 內的敵人移動與行動速度 -40%', aura: { radius: 3, enemies: { slow: 0.4 } } },
  frailAura: { id: 'frailAura', name: '凋零', source: 'class', description: '3 m 內的敵人受到的傷害 +10%', aura: { radius: 3, enemies: { vuln: 0.1 } } },
  blessStrong: { id: 'blessStrong', name: '熱忱', source: 'class', description: '5 m 內的隊友命中 +15、防禦 +8', aura: { radius: 5, allies: { accuracy: 15, defense: 8 } } },
  blessWide: { id: 'blessWide', name: '佈道', source: 'class', description: '7 m 內的隊友命中 +10、防禦 +5', aura: { radius: 7, allies: { accuracy: 10, defense: 5 } } },
  darkPact: {
    id: 'darkPact', name: '暗之契', source: 'class',
    description: '4 m 內的隊友打中敵人時傷害 +5%、吸血 8%；自己扣傷害 5% 的血',
    aura: { radius: 4, drain: { damagePct: 0.05, lifesteal: 0.08, ownerCost: 0.05 } },
  },
  hunger: { id: 'hunger', name: '飢渴', source: 'class', description: '對敵人造成的傷害 10% 轉成自己的生命', lifesteal: 0.1 },
  // ── 昇變被動（SPEC_CLASSES §3：戰士、遊俠）──
  bulwark: {
    id: 'bulwark', name: '守護', source: 'class',
    description: '4 m 內的隊友受到的傷害，30% 改由守護者承受',
    aura: { radius: 4, cover: 0.3 },
  },
  duelist: {
    id: 'duelist', name: '決鬥', source: 'class',
    description: '打斷敵人後，下一次攻擊必定爆擊；盾擊可以存 2 次',
    critAfterInterrupt: true,
  },
  // ── 昇變被動（SPEC_CLASSES §3：法師、牧師）──
  stoneSkin: {
    id: 'stoneSkin', name: '石膚', source: 'class',
    description: '護甲 +2',
    mods: { armor: 2 },
  },
  liberation: {
    id: 'liberation', name: '解放', source: 'class',
    description: '打斷敵人時，4 m 內的隊友（含自己）解除暈眩、定身、詛咒、燃燒、標記',
    cleanseOnInterrupt: 4,
  },
  necroMastery: {
    id: 'necroMastery', name: '亡者不息', source: 'class',
    description: '被自己詛咒的敵人死亡時站起來成為隨從（同時最多 3 個，戰鬥結束就消失）；隨從優先攻擊被詛咒的目標',
    raiseDead: { max: 3, hpMult: 0.6, damageMult: 1.2 },
  },
  deathAura: {
    id: 'deathAura', name: '死亡氣息', source: 'class',
    description: '3 m 內的敵人受到的傷害 +15%',
    aura: { radius: 3, enemies: { vuln: 0.15 } },
  },
  sunderStrike: {
    id: 'sunderStrike', name: '破甲', source: 'class',
    description: '普攻打中時目標的物理與特殊護甲 −2（最多 3 層，4 秒）',
    onHit: [{ kind: 'sunder', armor: 2, maxStacks: 3, duration: 4 }],
  },
  zealAura: {
    id: 'zealAura', name: '狂信光環', source: 'class',
    description: '5 m 內的隊友（含自己）命中 +12、防禦 +6、造成傷害 +15%',
    aura: { radius: 5, allies: { accuracy: 12, defense: 6, damagePct: 0.15 } },
  },
  bloodAura: {
    id: 'bloodAura', name: '血之光環', source: 'class',
    description: '5 m 內的隊友打中敵人時傷害 +15%、吸血 20%；異教徒自己扣傷害 8% 的血',
    aura: { radius: 5, drain: { damagePct: 0.15, lifesteal: 0.2, ownerCost: 0.08 } },
  },
  warTotemAura: {
    id: 'warTotemAura', name: '戰鬥圖騰', source: 'class',
    description: '7 m 內的同伴造成的傷害 +15%（每根圖騰疊加）',
    aura: { radius: 7, stackDamagePct: 0.15 },
  },
  grenade: {
    id: 'grenade', name: '手榴彈', source: 'class',
    description: '拋物線普攻，命中點小範圍爆炸（不傷友軍、無視掩體）',
    attack: { kind: 'blast', radius: 1.2, splashMult: 0.6, push: 0 },
  },
};

/** 各職業的職業被動 */
export const CLASS_PASSIVES: Record<string, string[]> = {
  warrior: ['cleave', 'tauntAura', 'shieldBearer'],
  berserker: ['bloodRage'],
  ranger: ['pierce', 'eagleEye'],
  rogue: ['assassin'],
  // Alan 2026-10-20：法師普攻改成小火球，身邊有寒氣光環；震擊（shock）保留給其他用途
  mage: ['emberBolt', 'chillAura'],
  hexer: ['hexBolt'],
  cleric: ['smite', 'blessAura', 'fieldCare'],
  alchemist: ['grenade'],
  // ── 進階職業（SPEC_CLASSES §3）：先帶基本職業的被動，昇變被動在各階段補上 ──
  guardian: ['cleave', 'tauntAura', 'bulwark', 'shieldBearer'],
  gladiator: ['cleave', 'tauntAura', 'duelist', 'shieldBearer'],
  cutthroat: ['assassin'],
  sniper: ['pierce', 'eagleEye'],
  arbalest: ['pierce', 'eagleEye'],
  elementalist: ['emberBolt', 'chillAura'],
  deathMage: ['hexBolt', 'chillAura', 'deathAura'],
  battlemage: ['chillAura', 'sunderStrike'],
  // 杜爾根（SPEC_CHARACTERS §4.1）：圖騰師的被動先放「石膚」
  totemist: ['stoneSkin'],
  totemElder: ['stoneSkin'],
  totemBearer: ['stoneSkin'],
  // 阿許卡（SPEC_CHARACTERS §4.1）：決鬥者沒有職業被動（高命中、高迴避寫在英雄數值）
  fencer: [],
  liberator: ['duelist', 'liberation'],
  // 奧爾德斯與芬恩（SPEC_CHARACTERS §4.1）
  adept: ['emberBolt'],
  archmage: ['emberBolt', 'chillAura'],
  necromancer: ['emberBolt', 'chillAura', 'necroMastery'],
  // 聖騎士改成戰士底（SPEC_CHARACTERS §2-3）：帶戰士的全部職業被動
  paladin: ['cleave', 'tauntAura', 'shieldBearer'],
  highPriest: ['smite', 'blessAura', 'fieldCare'],
  zealot: ['smite', 'zealAura', 'fieldCare'],
  heretic: ['bloodAura', 'fieldCare'],
};

/**
 * 沉穩節奏下每名英雄唯一的主動技能（SPEC_SLICE5 §2）：預設是職業的專用技能，這裡列出例外。
 * Alan v0.4：牧師的治療改成相當於煉金術士的治療藥瓶。
 */
export const ACTIVE_SKILL_OVERRIDE: Record<string, string> = {
  // Alan：遊俠的主動技能是瞄準射擊（點地圖時打點擊位置最近的敵人）
  ranger: 'sureShot',
  // Alan 2026-10-21：牧師的主動換成聖域（減傷區域）；回血改成戰後被動「戰地救護」與消耗品
  cleric: 'sanctuary',
  // Alan v0.4：火焰瓶要真的在地上留下持續效果
  alchemist: 'fireFlask',
  // Alan 2026-10-20（第二版）：法師的主動是附魔（全隊加攻擊力）；火球改成普攻的小火球
  mage: 'enchant',
  // Alan 2026-10-20：戰士的主動換成盾擊（打斷＋暈眩）；遊俠的瞄準射擊加上打斷、命中大幅提高
  warrior: 'shieldBash',
  // 進階職業（SPEC_CLASSES §3）
  guardian: 'shieldCounter',
  gladiator: 'shieldBash',
  arbalest: 'volley',
  elementalist: 'elementalEnchant',
  battlemage: 'selfEnchant',
  paladin: 'holyGround',
  fencer: 'thrust',
  totemist: 'totemDecoy',
  totemElder: 'grandDecoy',
  totemBearer: 'bearDecoy',
  liberator: 'thrust',
  highPriest: 'grandSanctuary',
  archmage: 'grandEnchant',
  heretic: 'bloodDrain',
  zealot: 'sanctuary',
};

/**
 * 職業被動的等級（Alan 2026-10-25）：英雄本來就有的被動改成可以升級（不算昇變配方），一級一級變強。
 * grow：每升一級，這些數值各加多少（路徑 → 每級增加量）；growText：給升級卡看的說明。全部是佔位。
 * start：這個被動自己的起始等級（省略＝CLASS_PASSIVE_RULES.startRank）；0＝一開始沒有，要從升級拿到第 1 級。
 * 牧師的戰地救護沒有可以變強的數字，維持天生、不分等級。
 */
export const CLASS_PASSIVE_RANKS: Record<string, { max: number; grow: Record<string, number>; growText: string; start?: number }> = {
  cleave: { max: 3, grow: { 'attack.angle': 20, 'attack.heavyMult': 0.2 }, growText: '扇形 +20°、重擊傷害 +0.2 倍' },
  tauntAura: { max: 3, grow: { taunt: 1.5, 'mods.defense': 4 }, growText: '嘲諷範圍 +1.5 m、防禦 +4' },
  // Alan 2026-10-25：遊俠的穿透、牧師的聖鎚（擊退）從等級 0 開始
  pierce: { start: 0, max: 3, grow: { 'attack.maxTargets': 1, 'attack.falloff': 0.05 }, growText: '多穿透 1 名、每穿一名的傷害少掉得少一點' },
  eagleEye: { max: 3, grow: { seesBrush: 3 }, growText: '看穿草叢的距離 +3 m' },
  emberBolt: { max: 3, grow: { 'attack.radius': 0.3, 'attack.splashMult': 0.1 }, growText: '爆炸範圍 +0.3 m、濺射傷害 +0.1 倍' },
  chillAura: { max: 3, grow: { 'aura.radius': 0.5, 'aura.enemies.slow': 0.05 }, growText: '光環範圍 +0.5 m、減速再 5%' },
  smite: { start: 0, max: 3, grow: { 'attack.heal': 3, 'attack.knockback': 0.2 }, growText: '回復 +3、擊退 +0.2 m' },
  blessAura: { max: 3, grow: { 'aura.radius': 1, 'aura.allies.accuracy': 3, 'aura.allies.defense': 2 }, growText: '光環範圍 +1 m、命中 +3、防禦 +2' },
};

/** startRank：英雄一開始的等級（1＝天生就有、升級讓它變強；0＝一開始沒有，要從升級拿）；個別被動可以用 start 另外指定 */
export const CLASS_PASSIVE_RULES = { startRank: 1 };

/** 這個職業被動的起始等級 */
export function passiveStartRank(id: string): number {
  return CLASS_PASSIVE_RANKS[id]?.start ?? CLASS_PASSIVE_RULES.startRank;
}

const ranked = new Map<string, PassiveDef>();

/** 某個職業被動在第 rank 級的樣子（第 1 級就是原本的；id 不變，戰鬥裡照常辨認） */
export function passiveAtRank(id: string, rank: number): PassiveDef {
  const base = PASSIVES[id];
  const R = CLASS_PASSIVE_RANKS[id];
  if (!R || rank <= 1) return base;
  const key = `${id}@${rank}`;
  let p = ranked.get(key);
  if (!p) {
    const c = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    for (const [path, per] of Object.entries(R.grow)) {
      const keys = path.split('.');
      let o = c as Record<string, unknown>;
      for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
      const last = keys[keys.length - 1];
      o[last] = Math.round(((Number(o[last] ?? 0) + per * (rank - 1)) as number) * 100) / 100;
    }
    p = { ...(c as unknown as PassiveDef), description: `${base.description} Lv${rank}` };
    ranked.set(key, p);
  }
  return p;
}

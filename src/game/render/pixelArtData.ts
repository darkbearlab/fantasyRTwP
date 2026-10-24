/**
 * 2D 像素美術（2026-10-20 起的美術方向）的資料與純計算（不 import Phaser，可以直接測試）。
 *
 * 單位素材兩種：
 * - mw：Matt Walkden〈Fantasy Battle Pack〉sprite sheet（授權素材，不在 repo 內；在 public/assets/licensed/，見 ASSET_LICENSES.md）
 *   256×448、32×32 一格、8 欄（只用前 4 欄）。列＝方向區塊 × 5 ＋ 動作；方向區塊 0 側面（朝右）、1 正面（朝下）、2 背面（朝上）；
 *   動作 0 待機、1 移動、2 攻擊、3 倒地，各 4 格。朝左＝側面水平鏡像。
 * - m72：0x72〈16x16 DungeonTileset II〉逐格 PNG（CC0，public/assets/0x72/frames/）。只有待機與移動（朝右），沒有攻擊與倒地。
 *
 * 對照表（Alan 2026-10-20：先照交接文件的建議表，全部當佔位）。
 */

import { HEROES } from '../../sim/data/heroes';

export type PixelUnitArt =
  /** recolor：把藍隊的兩個隊伍色換成這兩個顏色（英雄用職業色，見 heroTeamColors） */
  /** scale：在 PIXEL.unitScale 之外再放大的倍率（大型單位；素材 session 的佔位對照表 2026-10-22） */
  /** footY／bodyPx：腳底在格子裡的位置（比例）、身體高幾個像素；省略用 Matt Walkden 的值（MiniFolks 的腳在格子最下面、身體比較矮） */
  | { kind: 'mw'; path: string; recolor?: { dark: number; light: number }; scale?: number; footY?: number; bodyPx?: number }
  | { kind: 'm72'; idle: string; run: string; frames: number; scale?: number };

const mw = (path: string, scale?: number): PixelUnitArt => (scale ? { kind: 'mw', path, scale } : { kind: 'mw', path });
/** MiniFolks 隨從（轉成 Matt Walkden 版面）：英雄倍率的 0.75；腳在第 31 列、身體約 16 像素高 */
const mf = (path: string): PixelUnitArt => ({ kind: 'mw', path, scale: 0.75, footY: 31 / 32, bodyPx: 16 });

/** mw 藍隊的兩個隊伍色（原包固定值；recolor.py 也用這兩個） */
export const MW_TEAM_DARK = 0x0000c0;
export const MW_TEAM_LIGHT = 0x7d7dea;

/**
 * 職業色 → 換色用的隊伍色（Alan：職業顏色要和 sprite 顏色一致）。
 * 亮色＝職業色，暗色＝職業色壓暗（和原包藍隊的明暗差差不多）。
 */
export function heroTeamColors(color: number): { dark: number; light: number } {
  const k = 0.5;
  const r = Math.round(((color >> 16) & 0xff) * k);
  const g = Math.round(((color >> 8) & 0xff) * k);
  const b = Math.round((color & 0xff) * k);
  return { dark: (r << 16) | (g << 8) | b, light: color };
}

/** 英雄：藍隊 sheet 換成職業色 */
const hero = (id: string, path: string): PixelUnitArt => ({ kind: 'mw', path, recolor: heroTeamColors(HEROES[id].color) });
const m72 = (name: string, single = false): PixelUnitArt =>
  single ? { kind: 'm72', idle: `${name}_anim`, run: `${name}_anim`, frames: 4 } : { kind: 'm72', idle: `${name}_idle_anim`, run: `${name}_run_anim`, frames: 4 };

/** 單位 def.id → 素材（路徑相對於 public/assets/licensed/） */
export const PIXEL_UNITS: Record<string, PixelUnitArt> = {
  // ── 英雄：藍隊 sheet，隊伍色換成職業色（咒術師、牧師原本建議用 Cult／Holy 換色版，改成職業色以便和介面一致） ──
  warrior: hero('warrior', 'mw/sheets/SwordFighter/SwordFighter_ShortHair_Blue1.png'),
  ranger: hero('ranger', 'mw/sheets/Archer/Archer_Blue1.png'),
  mage: hero('mage', 'mw/sheets/Wizard/Wizard_Blue1.png'),
  berserker: hero('berserker', 'mw/sheets/AxeFighter/AxeFighter_LongHair_Blue1.png'),
  rogue: hero('rogue', 'mw/sheets/Thief/Thief_Blue1.png'),
  hexer: hero('hexer', 'mw/sheets/Wizard/Wizard_Blue2.png'),
  // 進階職業（SPEC_CLASSES §3 的外觀對照）
  guardian: hero('guardian', 'mw/sheets/LanceKnight/LanceKnight_Blue.png'),
  gladiator: hero('gladiator', 'mw/sheets/SwordFighter/SwordFighter_LongHair_Blue1.png'),
  cutthroat: hero('cutthroat', 'mw/sheets/Thief/Thief_Blue1.png'),
  sniper: hero('sniper', 'mw/sheets/Archer/Archer_Blue2.png'),
  arbalest: hero('arbalest', 'mw/sheets/Archer/Archer_Blue3.png'),
  elementalist: hero('elementalist', 'mw/sheets/Wizard/Wizard_Blue2.png'),
  deathMage: hero('deathMage', 'mw/sheets/Wizard/Wizard_Blue3.png'),
  battlemage: hero('battlemage', 'mw/sheets/AxeKnight/AxeKnight_Blue.png'),
  paladin: hero('paladin', 'mw/sheets/SwordCavalier/SwordCavalier_ShortHair_Blue1.png'),
  zealot: hero('zealot', 'mw/sheets/SpearFighter/SpearFighter_ShortHair_Blue1.png'),
  heretic: hero('heretic', 'mw/sheets/Wizard/Wizard_Blue1.png'),
  // Alan 2026-10-21：牧師改用戰士的 sprite（職業色換成黃色）
  cleric: hero('cleric', 'mw/sheets/SwordFighter/SwordFighter_ShortHair_Blue1.png'),
  // 建議表沒有煉金術士：先用法師
  alchemist: hero('alchemist', 'mw/sheets/Wizard/Wizard_Blue1.png'),
  // ── 人類敵人（換色陣營） ──
  brute: mw('mw/recolor/Bandit/AxeFighter/AxeFighter_ShortHair_Bandit1.png'),
  skirmisher: mw('mw/recolor/Bandit/Thief/Thief_Bandit1.png'),
  assassin: mw('mw/recolor/Cult/Thief/Thief_Cult1.png'),
  archer: mw('mw/recolor/Bandit/Archer/Archer_Bandit1.png'),
  slinger: mw('mw/recolor/Bandit/Archer/Archer_Bandit2.png'),
  caster: mw('mw/recolor/Cult/Wizard/Wizard_Cult2.png'),
  priest: mw('mw/recolor/Cult/Wizard/Wizard_Cult3.png'),
  shieldbearer: mw('mw/recolor/Imperial/LanceKnight/LanceKnight_Imperial.png'),
  charger: mw('mw/recolor/Imperial/LanceCavalier/LanceCavalier_ShortHair_Imperial1.png'),
  // 魔王的冠軍（素材 session 2026-10-22 佔位定案：Champion 陣營＝黑甲＋暗紅；魔王第一階段的受肉也用這個樣子）
  champion: mw('mw/recolor/Champion/LanceCavalier/LanceCavalier_ShortHair_Champion1.png', 1.5),
  hooker: mw('mw/recolor/Bandit/SpearFighter/SpearFighter_ShortHair_Bandit1.png'),
  // 小波次的雜魚（Alan：用劍兵、斧兵的 sprite）：帝國軍
  raider: mw('mw/recolor/Imperial/SwordFighter/SwordFighter_ShortHair_Imperial1.png'),
  axeman: mw('mw/recolor/Imperial/AxeFighter/AxeFighter_LongHair_Imperial1.png'),
  // 隨從（Alan 2026-10-23）：MiniFolks 轉成 Matt Walkden 版面；比英雄小一號（約英雄的 2/3 高）
  fSword: mf('minifolks/MF_SwordMan.png'),
  fShield: mf('minifolks/MF_ShieldMan.png'),
  fSpear: mf('minifolks/MF_SpearMan.png'),
  fArcher: mf('minifolks/MF_Archer.png'),
  // ── 非人類（0x72） ──
  thrall: m72('skelet'),
  minion: m72('skelet'),
  skitter: m72('tiny_zombie'),
  summoner: m72('necromancer', true),
  warlord: m72('big_demon'),
  lurker: m72('masked_orc'),
  // 建議表沒有的：先挑外形接近的
  siege: m72('ogre'),
  bomber: m72('goblin'),
  exploder: m72('muddy', true),
  nest: m72('swampy', true),
  // 第 2 章：獸人部落（素材 session 2026-10-22 的佔位對照：Matt Walkden 換色；圖騰仍用 0x72 的石柱）
  goblin: mw('mw/recolor/Goblin/Thief/Thief_Goblin1.png'),
  goblinSlinger: mw('mw/recolor/Goblin/Archer/Archer_Goblin1.png'),
  orcWarrior: mw('mw/recolor/Orc/AxeFighter/AxeFighter_ShortHair_Orc1.png'),
  orcShaman: mw('mw/recolor/OrcShaman/Wizard/Wizard_OrcShaman1.png'),
  ogre: mw('mw/recolor/Orc/AxeFighter/AxeFighter_LongHair_Orc2.png', 1.75),
  warTotem: m72('totem', true),
  // 第 3～5 章（素材 session 2026-10-22 的佔位對照）
  templeKnight: mw('mw/recolor/Temple/SwordFighter/SwordFighter_ShortHair_Temple1.png'),
  hollowArmor: mw('mw/recolor/Hollow/LanceKnight/LanceKnight_Hollow.png'),
  golem: mw('mw/recolor/Stone/AxeKnight/AxeKnight_Stone.png', 1.25),
  crystalGuardian: mw('mw/recolor/Holy/LanceKnight/LanceKnight_Holy.png', 1.75),
  swarmling: m72('tiny_slug', true),
  bugNest: m72('swampy', true),
  caveBeast: { kind: 'm72', idle: 'ogre_idle_anim', run: 'ogre_run_anim', frames: 4, scale: 2 },
  demonElite: mw('mw/recolor/Demon/AxeFighter/AxeFighter_ShortHair_Demon1.png'),
  demonGuard: mw('mw/recolor/Demon/LanceKnight/LanceKnight_Demon.png'),
  orcChief: mw('mw/recolor/Orc/AxeKnight/AxeKnight_Orc.png', 1.5),
};

/** 像素畫面的設定（只影響畫面） */
export const PIXEL = {
  /** sprite 放大倍率（整數，像素才不會糊） */
  unitScale: 3,
  /** mw sheet 一格的大小與欄數 */
  cell: 32,
  cols: 8,
  /** mw 角色本體大約多高（px，算頭頂位置用） */
  mwBodyPx: 19,
  /** 腳底在格子裡的位置（由上往下的比例）：實測各職業的腳（含影子）都在第 23 列 */
  mwFootY: 23 / 32,
  /** 動作速度（格／秒） */
  idleFps: 4,
  moveFps: 8,
  /** 倒地動作播放時間（秒），播完停在最後一格 */
  deathSec: 0.5,
  /** 0x72 怪物的攻擊替代：往前衝的距離（px，放大前）與閃白時間（佔恢復期的比例） */
  lungePx: 5,
  lungePart: 0.45,
  flashPart: 0.18,
  /** 被打中閃白（秒） */
  hitFlashSec: 0.1,
};

/** mw 的方向區塊 */
export const MW_SIDE = 0;
export const MW_FRONT = 1;
export const MW_BACK = 2;
/** mw 的動作列 */
export const MW_IDLE = 0;
export const MW_MOVE = 1;
export const MW_ATTACK = 2;
export const MW_DEATH = 3;

/** mw sheet 的格子編號（Phaser spritesheet 由左到右、由上到下編號） */
export function mwFrame(block: number, action: number, i: number): number {
  return (block * 5 + action) * PIXEL.cols + (i % 4);
}

/**
 * 面向（畫面上的方向向量）→ 方向區塊與是否鏡像。
 * 左右分量比較大 → 側面（朝左鏡像）；否則往下＝正面、往上＝背面。
 */
/**
 * 英雄只用側面 sprite（Alan 2026-10-24：試看看只有左右移動的美術風格）：往上下走、攻擊時也用側面，只左右翻轉。
 * 存在瀏覽器；設定選單可以切換。
 */
const SIDE_ONLY_KEY = 'fantasyRTwP.sideOnlyHeroes';
export function sideOnlyHeroes(): boolean {
  try {
    return localStorage.getItem(SIDE_ONLY_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setSideOnlyHeroes(on: boolean): void {
  try {
    localStorage.setItem(SIDE_ONLY_KEY, on ? 'on' : 'off');
  } catch {
    // 存不了就只在這次有效
  }
}

/** 只用側面：左右看畫面上的水平方向；幾乎正上正下時維持原本的左右（prevFlip） */
export function sideBlock(sx: number, sy: number, prevFlip: boolean): { block: number; flip: boolean } {
  const len = Math.hypot(sx, sy);
  if (len === 0 || Math.abs(sx) < len * 0.15) return { block: MW_SIDE, flip: prevFlip };
  return { block: MW_SIDE, flip: sx < 0 };
}

export function facingBlock(sx: number, sy: number): { block: number; flip: boolean } {
  if (Math.abs(sx) >= Math.abs(sy)) return { block: MW_SIDE, flip: sx < 0 };
  return { block: sy > 0 ? MW_FRONT : MW_BACK, flip: false };
}

export interface PixelAnimInput {
  /** 畫面時間（秒） */
  time: number;
  dead: boolean;
  /** 倒下的時間（秒）；還活著時忽略 */
  deathStart: number;
  moving: boolean;
  /** 正在做的動作：準備（windup）或恢復（recovery）與進度 0–1 */
  action?: { phase: string; progress: number };
}

/** 依狀態決定 mw 的動作列與格數 */
export function mwAnim(s: PixelAnimInput): { action: number; frame: number } {
  if (s.dead) return { action: MW_DEATH, frame: Math.min(3, Math.floor(((s.time - s.deathStart) / PIXEL.deathSec) * 4)) };
  const a = s.action;
  if (a && (a.phase === 'windup' || a.phase === 'recovery')) {
    // 準備期間播前 3 格（舉起），生效後的恢復期停在最後一格（揮下／射出）
    return { action: MW_ATTACK, frame: a.phase === 'windup' ? Math.min(2, Math.floor(a.progress * 3)) : 3 };
  }
  if (s.moving) return { action: MW_MOVE, frame: Math.floor(s.time * PIXEL.moveFps) % 4 };
  return { action: MW_IDLE, frame: Math.floor(s.time * PIXEL.idleFps) % 4 };
}

/** 0x72 怪物沒有攻擊動作：恢復期剛開始往前衝一下（回傳 0–1 的位移比例）並閃白 */
export function m72Lunge(action?: { phase: string; progress: number }): { push: number; flash: boolean } {
  if (!action || action.phase !== 'recovery' || action.progress >= PIXEL.lungePart) return { push: 0, flash: false };
  return { push: 1 - action.progress / PIXEL.lungePart, flash: action.progress < PIXEL.flashPart };
}

/** 用到的所有 mw sheet 路徑（不重複） */
export function mwPaths(): string[] {
  return [...new Set(Object.values(PIXEL_UNITS).flatMap((a) => (a.kind === 'mw' ? [a.path] : [])))];
}

/** 用到的所有 0x72 逐格檔名（不含副檔名，不重複） */
export function m72Frames(): string[] {
  const out = new Set<string>();
  for (const a of Object.values(PIXEL_UNITS)) {
    if (a.kind !== 'm72') continue;
    for (let i = 0; i < a.frames; i++) {
      out.add(`${a.idle}_f${i}`);
      out.add(`${a.run}_f${i}`);
    }
  }
  return [...out];
}

/** 地城地板（0x72 floor_1～8），依格子座標雜湊挑一張；大部分用乾淨的 floor_1 */
export const FLOOR_TILES = ['floor_1', 'floor_2', 'floor_3', 'floor_4', 'floor_5', 'floor_6', 'floor_7', 'floor_8'];

/** 花紋地板出現的比例（其餘用乾淨的 floor_1） */
export const FLOOR_VARIANT_RATE = 0.12;

export function floorTileFor(cx: number, cy: number, salt: number): string {
  const h = ((cx * 73856093) ^ (cy * 19349663) ^ (salt * 83492791)) >>> 0;
  if ((h % 1000) / 1000 >= FLOOR_VARIANT_RATE) return 'floor_1';
  return FLOOR_TILES[1 + ((h >>> 10) % (FLOOR_TILES.length - 1))];
}

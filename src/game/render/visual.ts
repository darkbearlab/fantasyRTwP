/**
 * 純畫面的視覺設定（等角模式）：角色身高、障礙物高度。不放進 sim 資料。
 */
import type { MapDef, Rect, UnitDef } from '../../sim/data/types';

/** 角色身高（公尺），依 def.id；沒列出的用預設 */
const UNIT_HEIGHT: Record<string, number> = {
  // 人形英雄 1.8 m
  warrior: 1.8,
  ranger: 1.8,
  mage: 1.8,
  cleric: 1.8,
  berserker: 1.8,
  rogue: 1.8,
  hexer: 1.8,
  alchemist: 1.8,
  guardian: 1.9,
  gladiator: 1.8,
  cutthroat: 1.8,
  sniper: 1.8,
  arbalest: 1.8,
  elementalist: 1.8,
  deathMage: 1.8,
  battlemage: 1.9,
  paladin: 2.2,
  zealot: 1.8,
  heretic: 1.8,
  // 敵人
  skirmisher: 1.7,
  brute: 2.0,
  archer: 1.8,
  caster: 1.8,
  siege: 2.2,
  bomber: 1.7,
  lurker: 1.6,
  warlord: 3.0,
  champion: 2.4,
  templeKnight: 1.8,
  hollowArmor: 2.0,
  golem: 2.3,
  crystalGuardian: 3.0,
  swarmling: 0.8,
  bugNest: 1.6,
  caveBeast: 3.2,
  demonElite: 1.9,
  demonGuard: 2.0,
  goblin: 1.3,
  goblinSlinger: 1.3,
  orcWarrior: 1.9,
  orcShaman: 1.8,
  ogre: 2.6,
  warTotem: 2.4,
  orcChief: 3.0,
  // 隨從（Alan 2026-10-23）：比英雄小一號（sprite 是英雄倍率的 0.75）
  fSword: 1.3,
  fShield: 1.3,
  fSpear: 1.3,
  fArcher: 1.3,
  // 沉穩節奏的新敵人（借用現有素材）
  shieldbearer: 2.1,
  charger: 2.2,
  assassin: 1.7,
  hooker: 1.8,
  priest: 1.8,
  summoner: 1.9,
  exploder: 1.5,
  minion: 1.4,
};

export const VISUAL = {
  /**
   * 血跡（Alan 2026-10-25）：受傷噴小血滴，陣亡依最後一下的攻擊類別換效果；全部是 artPx 大小的方塊、對齊背景的像素格。
   * artPx：背景一個像素在畫面上多大（ortho.pxPerM ÷ 地圖拼塊 16 px）。count／speed（m/s）／spread（度）／size（像素數）／up（往上的初速 m/s）。
   */
  blood: {
    artPx: 3,
    colors: [0x8a0f14, 0xa8141b, 0x5e0b10],
    gravity: 9.8,
    /** 落地後留多久（毫秒）、淡出多久 */
    linger: 5000,
    fade: 1500,
    /** 從身上的哪個高度噴出（公尺） */
    z: 0.7,
    hit: { count: [3, 5], speed: [1, 2.2], spread: 60, size: [1, 1], up: [0.8, 1.8] },
    death: {
      /** 近戰：大片噴濺＋地上一灘 */
      melee: { count: [34, 46], speed: [1.2, 3.8], spread: 150, size: [1, 2], up: [1, 2.6], pool: 10, mist: 0 },
      /** 遠程：往射來的反方向噴一道 */
      projectile: { count: [24, 32], speed: [2.5, 5.5], spread: 45, size: [1, 2], up: [0.6, 1.6], pool: 6, mist: 0 },
      /** 法術：血霧 */
      spell: { count: [12, 16], speed: [0.6, 1.6], spread: 360, size: [1, 2], up: [0.5, 1.2], pool: 4, mist: 16 },
      /** 範圍：四面八方炸開＋血霧 */
      area: { count: [40, 54], speed: [1.5, 4.8], spread: 360, size: [1, 2], up: [1.2, 3], pool: 8, mist: 10 },
    },
    /** 血霧：一團一團往外擴散、變淡（毫秒、半徑公尺、每團大小像素數） */
    mist: { dur: 1100, radius: 0.9, size: [2, 4], alpha: 0.45 },
  },
  /** 角色外觀的整體縮放（Alan：sprite 縮小約 0.8 看效果；只影響畫面，碰撞半徑等規則不變） */
  unitScale: 0.8,
  /**
   * 畫面外敵人指示器（Alan）：畫面邊緣朝敵人方向的紅色光暈，敵人越強（最大生命越高）光暈越大。
   * 半徑 = base + perSqrtHp × √最大生命，限制在 [min, max]（px）；只顯示我方看得到的敵人（迷霧、草叢裡的不顯示）。
   */
  offscreen: { color: 0xff2a2a, base: 14, perSqrtHp: 2.4, min: 22, max: 84, alpha: 0.55, layers: 7 },
  defaultUnitHeight: 1.8,
  /** 精英隊長的身高 */
  captainHeight: 2.3,
  /** 頭頂標示（生命條、飄字）位於身高之上多少公尺 */
  headClearance: 0.2,
  /** 身體寬度 = 半徑 × TILE_W × 此值 */
  bodyWidthFactor: 0.8,
  /** 障礙物高度（公尺） */
  obstacle: { wall: 2.5, pillar: 3.0, rock: 1.0, cliff: 0.6 },
  /** 長邊至少這麼長就當作牆 */
  wallMinLength: 3,
  /** 這些地圖的小型方塊是柱子（較高） */
  pillarMaps: ['boss01'],
  /** 被高障礙物擋住的角色：最上層輪廓的透明度 */
  occludedAlpha: 0.35,
  /**
   * 像素單位的陣營色外框（Alan 2026-10-21）：sprite 輪廓外 1 px。另外疊一層在樹冠、牆、房子之上（迷霧之下），
   * 被擋住時也看得到；overlayAlpha＝那一層的透明度、overlayDepth＝深度。
   */
  teamOutline: { hero: 0x50aaff, enemy: 0xff5050, overlayAlpha: 0.7, overlayDepth: 875 },
  /** 被選取的英雄頭上往下的箭頭（Alan 2026-10-24 試作）：半寬、高、離生命條多高、上下跳的幅度與頻率（畫面 px） */
  selectArrow: { half: 8, height: 11, gap: 6, bob: 2, bobHz: 1.2 },
  /**
   * 英雄的指令線（移動路線、攻擊、技能；Alan 2026-10-21：常駐，指令更新一段時間後變淡變細）：
   * 下指令後 hold 秒維持原樣，接著 fade 秒內淡到 minAlpha、細到 minWidth（倍率）。用戰鬥時間算，暫停時不會變淡。
   */
  routeLine: { hold: 1.0, fade: 2.5, minAlpha: 0.25, minWidth: 0.5 },
  /** 戰爭迷霧：未探索／已探索但不在視野內的遮罩透明度 */
  /** 柔和迷霧（正角俯視）：每格一個像素的小貼圖放大時用平滑取樣，邊緣變成漸層；狀態改變時淡入淡出的秒數 */
  fogFadeSec: 0.25,
  fogUnexploredAlpha: 0.94,
  fogExploredAlpha: 0.5,
  /** 迷霧往地圖外多蓋幾格（樹冠、屋頂伸出地圖邊緣的部分），沿用最近的邊緣格 */
  fogMargin: 8,
};

/** 角色在畫面上的身高（公尺，已乘 VISUAL.unitScale）：決定 sprite 大小、頭頂生命條與飄字的位置 */
export function unitHeight(def: UnitDef): number {
  const h = def.team === 'enemy' && def.rank === 'elite' ? VISUAL.captainHeight : UNIT_HEIGHT[def.id] ?? VISUAL.defaultUnitHeight;
  return h * VISUAL.unitScale;
}

export type ObstacleKind = 'wall' | 'pillar' | 'rock' | 'cliff' | 'water';

/** 依形狀判斷障礙物種類（畫面用） */
export function obstacleKind(map: MapDef, r: Rect): ObstacleKind {
  if (r.style === 'cliff') return 'cliff';
  if (r.blocksSight === false) return 'water';
  if (Math.max(r.w, r.h) >= VISUAL.wallMinLength) return 'wall';
  if (VISUAL.pillarMaps.includes(map.id)) return 'pillar';
  return 'rock';
}

export function obstacleHeight(kind: ObstacleKind): number {
  return kind === 'water' ? 0 : VISUAL.obstacle[kind];
}

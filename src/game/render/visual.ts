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
  // 敵人
  skirmisher: 1.7,
  brute: 2.0,
  archer: 1.8,
  caster: 1.8,
  siege: 2.2,
  bomber: 1.7,
  lurker: 1.6,
  warlord: 3.0,
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
  /** 戰爭迷霧：未探索／已探索但不在視野內的遮罩透明度 */
  fogUnexploredAlpha: 0.94,
  fogExploredAlpha: 0.5,
};

/** 角色在畫面上的身高（公尺，已乘 VISUAL.unitScale）：決定 sprite 大小、頭頂生命條與飄字的位置 */
export function unitHeight(def: UnitDef): number {
  const h = def.team === 'enemy' && def.name.startsWith('隊長') ? VISUAL.captainHeight : UNIT_HEIGHT[def.id] ?? VISUAL.defaultUnitHeight;
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

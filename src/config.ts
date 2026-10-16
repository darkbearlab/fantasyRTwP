/**
 * 遊戲設定：時間倍率、ZOC 模式、自動暫停、快捷鍵等（SPEC §3.1、§7、§11.4）。
 * sim 相關的預設值來自 sim/simConfig.ts，執行中只能透過 setConfig 指令修改。
 */
import { DEFAULT_SIM_CONFIG } from './sim/simConfig';
import type { SimConfig } from './sim/simConfig';

export interface AutoPauseConfig {
  battleStart: boolean;
  heroLowHp: boolean;
  heroLowHpThreshold: number;
  enemyAoeWindup: boolean;
  heroDeath: boolean;
}

export const GAME_CONFIG = {
  sim: { ...DEFAULT_SIM_CONFIG } as SimConfig,
  /** 可選的時間倍率 */
  timeScales: [0.5, 1, 2],
  defaultTimeScale: 1,
  autoPause: {
    battleStart: true,
    heroLowHp: true,
    heroLowHpThreshold: 0.3,
    enemyAoeWindup: false,
    heroDeath: true,
  } as AutoPauseConfig,
  /** 英雄欄位 → 技能快捷鍵（KeyboardEvent.code）；SPEC §11.2 */
  hotkeys: [
    ['Digit1', 'Digit2', 'Digit3'],
    ['KeyQ', 'KeyW', 'KeyE'],
    ['KeyA', 'KeyS', 'KeyD'],
    ['KeyZ', 'KeyX', 'KeyC'],
  ],
  hotkeyLabels: [
    ['1', '2', '3'],
    ['Q', 'W', 'E'],
    ['A', 'S', 'D'],
    ['Z', 'X', 'C'],
  ],
  /** 占位渲染比例：1 m = 32 px */
  pxPerMeter: 32,
  /** 每幀最多推進幾個節拍（避免切回分頁時暴衝） */
  maxStepsPerFrame: 8,
  edgeScrollMargin: 12,
  cameraScrollSpeed: 700,
  /** 畫面下方英雄列高度（px），鏡頭邊界需要預留 */
  hudBottomHeight: 132,
};

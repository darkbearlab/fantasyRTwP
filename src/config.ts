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
  /** 按鍵配置（KeyboardEvent.code）；SPEC_SLICE2 §1。之後可做改鍵 */
  keys: {
    cameraUp: ['KeyW', 'ArrowUp'],
    cameraDown: ['KeyS', 'ArrowDown'],
    cameraLeft: ['KeyA', 'ArrowLeft'],
    cameraRight: ['KeyD', 'ArrowRight'],
    /** 選取英雄欄位 1–4；連按兩下鏡頭移過去；Shift＋數字加選 */
    selectSlot: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
    /** 主要選取英雄的技能 1–3 */
    skills: ['KeyQ', 'KeyE', 'KeyR'],
    cycleHero: ['Tab'],
    pause: ['Space'],
    stop: ['KeyH'],
    cancel: ['Escape'],
    debug: ['Backquote'],
    /** 攻擊移動：按下後下一次點擊地面（左鍵或右鍵）就是攻擊移動；也可以 Ctrl＋右鍵（A 已經是鏡頭鍵） */
    attackMove: ['KeyF'],
  },
  /** 技能鍵在 UI 上顯示的字 */
  skillKeyLabels: ['Q', 'E', 'R'],
  /** 數字鍵連按兩下的判定時間（毫秒） */
  doubleTapMs: 350,
  /** 正俯視（topdown）模式的渲染比例：1 m = 32 px */
  pxPerMeter: 32,
  /** 畫面投影：iso＝2:1 等角（預設）；topdown＝原本的正俯視（除錯與比較用，除錯面板可即時切換） */
  projection: 'iso' as 'iso' | 'topdown',
  /** 等角投影：1 公尺見方的地面 = TILE_W × TILE_H 的菱形；高度 1 m = HEIGHT_PX_PER_M px */
  iso: { tileW: 64, tileH: 32, heightPxPerM: 32 },
  /** 等角畫面的旋轉（逆時針，0 或 90 度）：90 = 世界 +x 朝螢幕右上，玩家（地圖左側）往右上進攻 */
  isoRotation: 90 as 0 | 90,
  /**
   * 角色與地板的美術（只在等角投影下生效，除錯面板可即時切換）：
   * blocks＝色塊；flare＝Flare 等角素材試裝；heroes3d＝自製 3D 預渲染英雄（沒有素材的英雄、敵人與地板沿用 Flare）
   */
  art: 'heroes3d' as 'blocks' | 'flare' | 'heroes3d',
  /** heroes3d 的縮放（素材約 53.3 px／公尺；32/53.3 ≈ 0.6，但素材是半蹲姿勢且有俯角縮短，對齊身高方塊約 0.75） */
  heroes3dScale: 0.75,
  /** 每幀最多推進幾個節拍（避免切回分頁時暴衝） */
  maxStepsPerFrame: 8,
  edgeScrollMargin: 12,
  cameraScrollSpeed: 700,
  /** 畫面下方英雄列高度（px），鏡頭邊界需要預留 */
  hudBottomHeight: 132,
};

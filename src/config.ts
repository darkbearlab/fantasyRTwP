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
    /**
     * 數字鍵二段式（Alan 試作）：第一下 1–4 選英雄，heroChordMs 內的第二下 1–n 放那名英雄的第 n 個技能；
     * Shift＋數字加選（不進入二段式）
     */
    selectSlot: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
    /** 二段式第二下可以用的數字鍵（技能 1–9） */
    skillDigits: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'],
    /** 主要選取英雄的技能 1–3（Alan：先關掉，改用數字鍵二段式；要恢復就填回 ['KeyQ', 'KeyE', 'KeyR']） */
    skills: [] as string[],
    cycleHero: ['Tab'],
    pause: ['Space'],
    stop: ['KeyH'],
    cancel: ['Escape'],
    debug: ['Backquote'],
    /** 攻擊移動：按下後下一次點擊地面（左鍵或右鍵）就是攻擊移動；也可以 Ctrl＋右鍵（A 已經是鏡頭鍵） */
    attackMove: ['KeyF'],
    /** 循環切換已選英雄的閒置性格（堅守 → 好戰 → 游擊）；也可以點英雄卡上的性格標籤 */
    cyclePersonality: ['KeyG'],
  },
  /** 技能鍵在 UI 上顯示的字（和 keys.skills 對應；空的時候技能鈕顯示二段式的數字） */
  skillKeyLabels: [] as string[],
  /** 數字鍵二段式：選英雄後，這段時間內再按數字就是放技能（毫秒） */
  heroChordMs: 2000,
  /** 正俯視（topdown）模式的渲染比例：1 m = 32 px */
  pxPerMeter: 32,
  /** 畫面投影：ortho＝正角俯視、保留俯角（預設）；iso＝2:1 等角（舊畫面）；topdown＝純平面（除錯用）。除錯面板可即時切換 */
  projection: 'ortho' as 'ortho' | 'iso' | 'topdown',
  /**
   * 正角俯視（ortho）：地面 1 m = pxPerM px（橫向）；縱向再乘 squash 表現俯角（1 = 正上方往下看）；高度 1 m = heightPxPerM px。
   * rotation 90：世界 +x 朝畫面上方（直拿手機時玩家往上推進）。全部是可調旋鈕，不開放玩家設定。
   */
  ortho: { pxPerM: 44, squash: 0.7, heightPxPerM: 32, rotation: 90 as 0 | 90 },
  /**
   * 行動版卡片上方的控制鈕（Alan：之後要做成可以調整，先把排列抽出來）：
   * align＝整排靠左／置中／靠右（對齊卡片列）；order＝由左到右的順序。
   */
  mobileControls: { align: 'left' as 'left' | 'center' | 'right', order: ['pause', 'selectAll'] as ('pause' | 'selectAll')[] },
  /** 行動版：點地圖下完攻擊移動指令後是否自動取消選取（Alan 2026-10-20：先關掉） */
  deselectAfterOrder: false,
  /** 戰鬥鏡頭的固定縮放（Alan：遠近固定，玩家不能縮放；只留這個旋鈕） */
  battleZoom: 1,
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
  /** 行動版直拿時下方 HUD（四張卡片＋沙漏）的高度（px） */
  hudBottomHeightPortrait: 314,
};

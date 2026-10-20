import Phaser from 'phaser';
import './style.css';
import { BattleScene } from './game/scenes/BattleScene';
import { BootScene } from './game/scenes/BootScene';
import { ResultScene } from './game/scenes/ResultScene';
import { UIScene } from './game/scenes/UIScene';
import { TitleScene } from './game/scenes/TitleScene';
import { PartySelectScene } from './game/scenes/PartySelectScene';
import { MapScene } from './game/scenes/MapScene';
import { EventScene } from './game/scenes/EventScene';
import { RestScene } from './game/scenes/RestScene';
import { RewardScene } from './game/scenes/RewardScene';
import { ShopScene } from './game/scenes/ShopScene';
import { RunEndScene } from './game/scenes/RunEndScene';

const WIDTH = 1280;
const HEIGHT = 720;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#15171b',
  disableContextMenu: true,
  // 放大時保持像素化：貼圖用最近鄰取樣（不做雙線性模糊）、座標取整數
  pixelArt: true,
  scale: { mode: Phaser.Scale.NONE },
  scene: [BootScene, TitleScene, PartySelectScene, MapScene, BattleScene, UIScene, ResultScene, EventScene, RestScene, RewardScene, ShopScene, RunEndScene],
});

/** 觸控裝置（手機、平板）的介面縮放下限：太小的字在手機上看不清楚（SPEC_SLICE5 §8） */
const MIN_TOUCH_SCALE = 0.85;
/** 舞台的邏輯高度低於此值時切換成精簡版面（手機橫拿）；直拿（寬 < 高）是行動版的主要版面 */
const COMPACT_HEIGHT = 600;

/**
 * 以 1280×720 為基準等比縮放整個舞台（畫布＋HUD），但舞台會填滿視窗（邏輯尺寸＝視窗÷縮放），不留黑邊。
 * 觸控裝置的縮放至少 MIN_TOUCH_SCALE：螢幕小時看到的範圍變小、字維持可讀。
 */
function fitStage(): void {
  const stage = document.getElementById('stage')!;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let s = Math.min(vw / WIDTH, vh / HEIGHT);
  if (window.matchMedia('(pointer: coarse)').matches) s = Math.max(s, MIN_TOUCH_SCALE);
  const w = Math.round(vw / s);
  const h = Math.round(vh / s);
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  stage.style.transform = `scale(${s})`;
  stage.style.left = '0px';
  stage.style.top = '0px';
  stage.classList.toggle('compact', h < COMPACT_HEIGHT);
  stage.classList.toggle('portrait', w < h);
  if (game.scale.width !== w || game.scale.height !== h) game.scale.resize(w, h);
  else game.scale.refresh();
}
// 除錯用：在主控台可以用 __game 檢查狀態
(window as unknown as { __game: Phaser.Game }).__game = game;
window.addEventListener('resize', fitStage);
game.events.once('ready', fitStage);
fitStage();

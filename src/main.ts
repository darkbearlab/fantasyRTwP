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
  scene: [BootScene, TitleScene, PartySelectScene, MapScene, BattleScene, UIScene, ResultScene, EventScene, RestScene, RewardScene, RunEndScene],
});

/** 1280×720 基準解析度，整個舞台（畫布＋HUD）一起等比縮放 */
function fitStage(): void {
  const stage = document.getElementById('stage')!;
  const s = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${(window.innerWidth - WIDTH * s) / 2}px`;
  stage.style.top = `${(window.innerHeight - HEIGHT * s) / 2}px`;
  game.scale.refresh();
}
// 除錯用：在主控台可以用 __game 檢查狀態
(window as unknown as { __game: Phaser.Game }).__game = game;
window.addEventListener('resize', fitStage);
game.events.once('ready', fitStage);
fitStage();

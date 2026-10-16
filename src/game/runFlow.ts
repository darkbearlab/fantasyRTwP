/**
 * 遠征的場景流程（SPEC_SLICE2 §10.1）：依 RunState.phase 切換到對應場景。
 * RunState 存在 registry 的 'run'；所有改變都透過 src/run 的純函式產生新狀態。
 */
import type Phaser from 'phaser';
import type { RunState } from '../run/runState';
import { createRun } from '../run/runState';

const RUN_SCENES = ['Title', 'Map', 'Battle', 'UI', 'Result', 'Event', 'Rest', 'Reward', 'RunEnd'];

export function getRun(scene: Phaser.Scene): RunState {
  return scene.registry.get('run') as RunState;
}

export function setRun(scene: Phaser.Scene, run: RunState): void {
  scene.registry.set('run', run);
}

/** 切換到某個場景（停止其他遠征場景） */
export function switchTo(scene: Phaser.Scene, key: string, data?: object): void {
  const mgr = scene.game.scene;
  for (const k of RUN_SCENES) if (k !== key && mgr.isActive(k)) mgr.stop(k);
  if (mgr.isActive(key)) mgr.stop(key);
  mgr.start(key, data);
}

/** 依目前遠征步驟前往對應場景 */
export function gotoPhase(scene: Phaser.Scene): void {
  const run = getRun(scene);
  const target = {
    map: 'Map',
    battle: 'Battle',
    reward: 'Reward',
    event: 'Event',
    rest: 'Rest',
    ended: 'RunEnd',
  }[run.phase.kind];
  switchTo(scene, target, target === 'Battle' ? { run: true } : undefined);
}

/** 更新遠征狀態並前往下一步 */
export function advance(scene: Phaser.Scene, run: RunState): void {
  setRun(scene, run);
  gotoPhase(scene);
}

export function startNewRun(scene: Phaser.Scene, seed: number): void {
  advance(scene, createRun(seed));
}

export function randomRunSeed(): number {
  return 1 + Math.floor(Math.random() * 999999);
}

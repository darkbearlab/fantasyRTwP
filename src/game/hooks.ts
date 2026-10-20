/**
 * 戰鬥的畫面層鉤子（Alan：自動暫停等功能要能掛在這些時機上）。
 * - simEvent：sim 每吐出一個事件（戰鬥場景處理完畫面效果之後）
 * - skillAim：玩家按下技能、進入瞄準（還沒決定位置）
 * - skillCommand：玩家下達施放技能的指令（瞄準確定，或不需要目標的技能）
 * - pauseChanged：暫停／繼續
 * 只在畫面層使用；sim 仍然只吃 Command、只吐 SimEvent。
 */
import type { SimEvent } from '../sim/events';
import type { Vec } from '../sim/math';

export interface BattleHookMap {
  simEvent: SimEvent;
  skillAim: { unitId: number; skillId: string };
  skillCommand: { unitId: number; skillId: string; point?: Vec; targetId?: number };
  pauseChanged: { paused: boolean; reason: string };
}

type Listener<T> = (payload: T) => void;

export class BattleHooks {
  private listeners: { [K in keyof BattleHookMap]?: Listener<BattleHookMap[K]>[] } = {};

  /** 訂閱；回傳取消訂閱的函式 */
  on<K extends keyof BattleHookMap>(name: K, fn: Listener<BattleHookMap[K]>): () => void {
    const list = (this.listeners[name] ??= []) as Listener<BattleHookMap[K]>[];
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof BattleHookMap>(name: K, payload: BattleHookMap[K]): void {
    const list = this.listeners[name] as Listener<BattleHookMap[K]>[] | undefined;
    if (!list) return;
    for (const fn of [...list]) fn(payload);
  }
}

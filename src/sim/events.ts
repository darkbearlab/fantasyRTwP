import type { Vec } from './math';
import type { DamageType, LootDef, ShrineKind, Team } from './data/types';

/** sim → 畫面層：每個節拍產生的事件 */
export type SimEvent =
  | { type: 'actionStart'; unitId: number; skillId?: string; targetId?: number; point?: Vec }
  /** 一隊敵人第一次出現在我方視野內（同一小隊只發一次；沒有小隊的敵人各自算一隊）。unitIds＝當下看得到的成員 */
  | { type: 'squadSighted'; squad: string; unitIds: number[] }
  /** 用了消耗品 */
  | { type: 'itemUsed'; itemId: string; targetId?: number }
  /** 陣亡的單位復活 */
  | { type: 'revive'; unitId: number }
  /** 頭目第一次進入我方視線（頭目登場演出；頭目身邊的迷霧暫時解開） */
  | { type: 'bossSighted'; unitId: number }
  /** 魔王的冠軍（Alan 2026-10-22）：逼近中（seconds 秒後從 point 進場）、已經進場 */
  | { type: 'championIncoming'; seconds: number; point: Vec }
  | { type: 'championArrived'; unitId: number }
  | { type: 'hit'; sourceId: number; targetId: number; damage: number; crit: boolean; damageType: DamageType; skillId?: string; freeAttack?: boolean }
  /** blocked：投射物在飛行途中撞到障礙物（point 為撞擊位置） */
  | { type: 'miss'; sourceId: number; targetId: number; skillId?: string; freeAttack?: boolean; blocked?: boolean; point?: Vec }
  | { type: 'heal'; sourceId: number; targetId: number; amount: number }
  | { type: 'interrupt'; sourceId: number; targetId: number; skillId?: string; point?: Vec }
  | { type: 'death'; unitId: number; killerId?: number }
  | { type: 'pinned'; unitId: number; byId: number }
  | { type: 'guardRedirect'; guardId: number; protectedId: number }
  | { type: 'status'; unitId: number; text: string }
  | { type: 'aoe'; sourceId: number; point: Vec; radius: number; skillId: string }
  | { type: 'knockback'; unitId: number; from: Vec; to: Vec }
  | { type: 'notice'; unitId: number; text: string }
  | { type: 'aggro' }
  | { type: 'spawn'; unitId: number; byId?: number; waveId?: string }
  /** 怪群模式：一波敵人出現（SPEC_SLICE4 §2） */
  | { type: 'waveStart'; waveId: string }
  | { type: 'warcry'; unitId: number }
  /** 英雄和地圖物件互動（SPEC_SLICE4 §15.1） */
  | { type: 'interact'; unitId: number; objectId: string }
  /** 打開寶箱、撿起地上的道具（Alan 2026-10-22）；consumable 在包包滿時換成 gold */
  | { type: 'loot'; unitId: number; objectId: string; loot: LootDef; toGold?: boolean }
  /** 祭壇：全隊得到增益 */
  | { type: 'shrine'; unitId: number; objectId: string; shrine: ShrineKind }
  /** 門打開或關上；blocked：想關門但門口有人 */
  | { type: 'door'; objectId: string; open: boolean; blocked?: boolean }
  /** exitId：從哪個出口離開（出口制，SPEC_SLICE6 §2） */
  | { type: 'battleEnd'; winner: Team; exitId?: string }
  /** 有英雄在出口裡但還沒到齊（inside／total）；或出口還封著（locked） */
  | { type: 'exitWaiting'; exitId: string; inside: number; total: number; locked: boolean }

/**
 * FTL 式路線圖的回合（SPEC_SLICE6 §4）：主力擴散與冠軍追獵。純函式，原地修改傳入的 run（呼叫端負責先 clone）。
 * 一回合＝玩家移動一個節點。
 */
import { ROUTE_MAP } from './data/routeMap';
import { distances, neighbors, stepToward } from './routeMap';
import type { RunState } from './runState';
import { rngFor } from './seed';

export interface Overworld {
  turn: number;
  /** 每個節點造訪了幾次 */
  visits: Record<number, number>;
  /** 被魔王主力佔領的節點 */
  force: number[];
  champion: {
    /** 目前所在節點；null＝被打倒、等待重新出現 */
    node: number | null;
    /** 已經發現玩家（之後一直追） */
    hunting: boolean;
    /** 第幾回合重新出現 */
    respawnAt: number;
  };
  /** 已經處理過的事件節點（重複訪問時不再觸發） */
  clearedEvents: number[];
}

/** 建立遠征時的初始狀態 */
export function initOverworld(run: RunState): Overworld {
  const R = ROUTE_MAP;
  const rng = rngFor(run.seed, 'overworld');
  const { map } = run;
  const preBoss = map.layers[map.layerCount - 2];
  const force: number[] = [];
  for (let k = 0; k < R.force.startNodes && k < preBoss.length; k++) {
    const pool = preBoss.filter((id) => !force.includes(id));
    force.push(pool[rng.int(0, pool.length - 1)]);
  }
  const depth = Math.max(2, Math.min(map.layerCount - 1, Math.round(1 + R.champion.startDepth * (map.layerCount - 2))));
  const layer = map.layers[depth - 1];
  return {
    turn: 0,
    visits: {},
    force,
    champion: { node: R.champion.count > 0 ? layer[rng.int(0, layer.length - 1)] : null, hunting: false, respawnAt: 0 },
    clearedEvents: [],
  };
}

export function isOccupied(run: RunState, nodeId: number): boolean {
  return !!run.overworld?.force.includes(nodeId);
}

/** 主力擴散一格：佔領鄰接的未佔領節點，優先往 toward（否則往最低的層、離玩家近的方向）；頭目節點不算 */
export function spreadForce(run: RunState, toward?: number): void {
  const ow = run.overworld!;
  const { map } = run;
  const frontier = new Set<number>();
  for (const id of ow.force) for (const t of neighbors(map, id)) if (!ow.force.includes(t) && map.nodes[t].type !== 'boss') frontier.add(t);
  if (frontier.size === 0) return;
  const target = toward ?? run.currentNodeId ?? map.layers[0][0];
  const d = distances(map, target);
  const best = [...frontier].sort((a, b) => (d.get(a) ?? 99) - (d.get(b) ?? 99) || a - b)[0];
  ow.force.push(best);
}

/** 冠軍行動一次：追獵中往玩家走一格；否則有機率遊蕩；在範圍內就發現玩家 */
function championStep(run: RunState, rng: ReturnType<typeof rngFor>, force = false): void {
  const ow = run.overworld!;
  const C = ROUTE_MAP.champion;
  const c = ow.champion;
  const player = run.currentNodeId;
  if (c.node === null || player === null) return;
  const detect = () => {
    const dist = distances(run.map, c.node!).get(player) ?? Infinity;
    if (dist <= C.detectRange) c.hunting = true;
  };
  detect();
  if (c.hunting || force) c.node = stepToward(run.map, c.node, player);
  else if (rng.chance(C.wanderChance)) {
    const opts = neighbors(run.map, c.node).filter((t) => run.map.nodes[t].type !== 'boss');
    if (opts.length) c.node = opts[rng.int(0, opts.length - 1)];
  }
  detect();
}

/** 冠軍是否和玩家在同一個節點（被抓到） */
export function caught(run: RunState): boolean {
  const ow = run.overworld;
  return !!ow && ow.champion.node !== null && ow.champion.node === run.currentNodeId;
}

/**
 * 玩家移動到 nodeId 之後的一回合：造訪次數、主力擴散（定期＋重複訪問的額外蔓延）、冠軍行動與重新出現。
 * 回傳這次是不是重複訪問。
 */
export function advanceTurn(run: RunState, nodeId: number): { revisit: boolean } {
  const ow = run.overworld!;
  const R = ROUTE_MAP;
  ow.turn++;
  const revisit = (ow.visits[nodeId] ?? 0) > 0;
  ow.visits[nodeId] = (ow.visits[nodeId] ?? 0) + 1;
  const rng = rngFor(run.seed, 'turn', ow.turn);
  // Alan：節點被重複訪問時，主力往那個節點的方向額外蔓延
  if (revisit) for (let k = 0; k < R.force.revisitExtra; k++) spreadForce(run, nodeId);
  if (ow.turn % R.force.spreadEvery === 0) for (let k = 0; k < R.force.spreadPerTick; k++) spreadForce(run);
  const c = ow.champion;
  if (c.node === null && R.champion.count > 0 && ow.turn >= c.respawnAt && ow.force.length) {
    c.node = ow.force[rng.int(0, ow.force.length - 1)];
    c.hunting = false;
  }
  // 玩家直接走進冠軍所在的節點：不用冠軍再動
  if (!caught(run)) championStep(run, rng);
  return { revisit };
}

/** Alan：在休息節點休息時，冠軍看到營火的煙，立刻往玩家多走幾格 */
export function campfireSmoke(run: RunState): void {
  const ow = run.overworld;
  if (!ow) return;
  const rng = rngFor(run.seed, 'smoke', ow.turn);
  for (let k = 0; k < ROUTE_MAP.champion.restSmokeSteps && !caught(run); k++) championStep(run, rng, true);
}

/** 冠軍被打倒：一段時間後從主力佔領的節點重新出現 */
export function championDefeated(run: RunState): void {
  const ow = run.overworld;
  if (!ow) return;
  ow.champion = { node: null, hunting: false, respawnAt: ow.turn + ROUTE_MAP.champion.respawnTurns };
}

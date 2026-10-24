/**
 * 沉穩節奏的自動對戰腳本（只給 autorun 驗證用，SPEC_SLICE5）：
 * - 有看得到的敵人：全隊攻擊移動到最近的敵人；主動技能好了就放（地面技能打敵人位置、治療給最低血的隊友）
 * - 看不到敵人：全隊往最近的存活敵人位置推進（腳本作弊看位置，只是代替玩家探索迷霧）
 * - 沒有敵人可打時：先派一名英雄去拉絞盤、打開關著的門
 * - 出口制（SPEC_SLICE6 §2）：敵人清光後全隊走到出口（受傷時優先選休息節點的出口）
 * 只透過 Command 操作 sim。
 */
import { SKILLS } from '../src/sim/data/skills';
import { dist } from '../src/sim/math';
import type { Unit } from '../src/sim/unit';
import type { World } from '../src/sim/world';

const THINK_INTERVAL = 0.5;

/**
 * 腳本的打法：clear＝把地圖上的敵人全部找出來打完才走（舊做法）；
 * exit＝像玩家一樣往出口走，路上遇到、或已經交戰的敵人才打；精英／頭目圖先去打隊長／頭目；有空位就先去救被困的英雄（SPEC_SLICE7）
 */
export const SCRIPT = { mode: 'clear' as 'clear' | 'exit', engage: 10 };

export class DeliberateScript {
  private nextThink = 0;

  constructor(private world: World) {}

  update(): void {
    const w = this.world;
    if (w.time < this.nextThink) return;
    this.nextThink = w.time + THINK_INTERVAL;
    const heroes = w.units.filter((u) => u.isHero && !u.dead);
    if (heroes.length === 0) return;
    let alive = w.units.filter((u) => u.team === 'enemy' && !u.dead);
    let visible = alive.filter((u) => w.visibleToTeam(u, 'hero'));
    const exits = w.map.exits ?? [];
    if (SCRIPT.mode === 'exit') {
      // 只打附近、或已經追上來的敵人；其他的當作不存在
      const near = (e: Unit) => heroes.some((h) => dist(h.pos, e.pos) <= SCRIPT.engage) || (e.alerted && heroes.some((h) => dist(h.pos, e.pos) <= SCRIPT.engage * 1.5));
      const fight = alive.filter((e) => near(e) && (w.visibleToTeam(e, 'hero') || e.alerted));
      // 出口還封著：去打隊長／頭目
      const key = w.map.exitLock ? alive.filter((e) => e.def.rank === 'elite' || e.def.rank === 'boss' || e.def.ai === 'boss') : [];
      const captive = w.units.find((u) => u.captive && !u.dead);
      if (!fight.length && !key.length && captive) {
        w.enqueue({ type: 'move', unitIds: heroes.map((u) => u.id), point: { ...captive.pos } });
        return;
      }
      alive = fight.length ? fight : key;
      visible = alive.filter((u) => w.visibleToTeam(u, 'hero'));
    }
    if (alive.length === 0 && exits.length) {
      const hurt = heroes.reduce((a, u) => a + u.hp / u.maxHp, 0) / heroes.length < 0.6;
      // 往前（top）的出口優先：受傷時找休息、否則戰鬥
      const fwd = exits.filter((e) => (e.edge ?? 'top') === 'top');
      const pool = fwd.length ? fwd : exits;
      const exit = pool.find((e) => hurt && e.label === 'rest') ?? pool.find((e) => e.label === 'battle') ?? pool[0];
      const p = { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };
      w.enqueue({ type: 'move', unitIds: heroes.map((u) => u.id), point: p });
      return;
    }
    // 沒有敵人可打時：先拉絞盤、再打開關著的門（腳本不會判斷門後有沒有路，全部打開）
    const lever = w.interactables.list.find((d) => d.def.kind === 'lever' && d.uses === 0);
    const door = w.interactables.list.find((d) => d.def.kind === 'door' && !d.open && !d.def.locked);
    const todo = lever ?? door;
    let opener = -1;
    if (todo && visible.length === 0 && !heroes.some((h) => h.order?.type === 'interact')) {
      opener = heroes[0].id;
      w.enqueue({ type: 'interact', unitId: opener, objectId: todo.def.id });
    }
    for (const h of heroes) {
      if (h.action || h.order?.type === 'interact' || h.id === opener) continue;
      const list = visible.length ? visible : alive;
      if (list.length === 0) return;
      const t = nearest(h, list);
      const skill = h.def.skills[0];
      const def = skill ? SKILLS[skill] : undefined;
      if (def && visible.length && h.skillReady(skill)) {
        if (def.target === 'ground' && dist(h.pos, t.pos) <= def.range) {
          const ally = def.effect.kind === 'aoeHeal' ? heroes.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b)) : null;
          if (!ally || ally.hp / ally.maxHp < 0.7) {
            w.enqueue({ type: 'skill', unitId: h.id, skillId: skill, point: { ...(ally ?? t).pos } });
            continue;
          }
        } else if (def.target === 'enemy' && dist(h.pos, t.pos) <= def.range + 1) {
          w.enqueue({ type: 'skill', unitId: h.id, skillId: skill, targetId: t.id });
          continue;
        } else if (def.target === 'self' && dist(h.pos, t.pos) <= 4) {
          w.enqueue({ type: 'skill', unitId: h.id, skillId: skill });
          continue;
        } else if ((def.target === 'ally' || def.target === 'allyOrSelf') && heroes.length > 1) {
          const a = heroes.filter((x) => def.target === 'allyOrSelf' || x !== h).reduce((p, q) => (p.hp / p.maxHp <= q.hp / q.maxHp ? p : q));
          w.enqueue({ type: 'skill', unitId: h.id, skillId: skill, targetId: a.id });
          continue;
        }
      }
      if (h.order?.type === 'attackMove' && h.order.targetId !== undefined) continue;
      w.enqueue({ type: 'attackMove', unitIds: [h.id], point: { ...t.pos } });
    }
  }
}

function nearest(u: Unit, list: Unit[]): Unit {
  return list.reduce((a, b) => (dist(u.pos, a.pos) <= dist(u.pos, b.pos) ? a : b));
}

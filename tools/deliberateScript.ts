/**
 * 沉穩節奏的自動對戰腳本（只給 autorun 驗證用，SPEC_SLICE5）：
 * - 有看得到的敵人：全隊攻擊移動到最近的敵人；主動技能好了就放（地面技能打敵人位置、治療給最低血的隊友）
 * - 看不到敵人：全隊往最近的存活敵人位置推進（腳本作弊看位置，只是代替玩家探索迷霧）
 * - 沒有敵人可打時：先派一名英雄去拉絞盤、打開關著的門
 * 只透過 Command 操作 sim。
 */
import { SKILLS } from '../src/sim/data/skills';
import { dist } from '../src/sim/math';
import type { Unit } from '../src/sim/unit';
import type { World } from '../src/sim/world';

const THINK_INTERVAL = 0.5;

export class DeliberateScript {
  private nextThink = 0;

  constructor(private world: World) {}

  update(): void {
    const w = this.world;
    if (w.time < this.nextThink) return;
    this.nextThink = w.time + THINK_INTERVAL;
    const heroes = w.units.filter((u) => u.team === 'hero' && !u.dead);
    if (heroes.length === 0) return;
    const alive = w.units.filter((u) => u.team === 'enemy' && !u.dead);
    const visible = alive.filter((u) => w.visibleToTeam(u, 'hero'));
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

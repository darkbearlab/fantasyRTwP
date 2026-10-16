/**
 * 自動對戰用的英雄腳本 AI（SPEC §15）：戰士守隘口、遊俠與法師集火、牧師補最低血。
 * 只透過 Command 操作 sim。
 */
import type { Command } from '../src/sim/commands';
import { SKILLS } from '../src/sim/data/skills';
import { dist } from '../src/sim/math';
import type { Unit } from '../src/sim/unit';
import { UnitState } from '../src/sim/unit';
import type { World } from '../src/sim/world';
import { edgeDistance } from '../src/sim/zoc';

const THINK_INTERVAL = 0.3;

export class HeroScript {
  private nextThink = 0;

  constructor(private world: World) {}

  update(): void {
    const w = this.world;
    if (w.time < this.nextThink) return;
    this.nextThink = w.time + THINK_INTERVAL;
    const choke = w.map.landmarks?.choke ?? { x: 18.5, y: 12 };
    const heroes = w.units.filter((u) => u.team === 'hero' && !u.dead);
    const enemies = w.units.filter((u) => u.team === 'enemy' && !u.dead);
    if (enemies.length === 0) return;
    const send = (c: Command) => w.enqueue(c);
    const ready = (u: Unit, s: string) => (u.cooldowns[s] ?? 0) <= 0 && u.state !== UnitState.Windup && !u.dead;
    const telegraphing = enemies.find((e) => e.action?.phase === 'windup' && e.action.skillId && SKILLS[e.action.skillId].telegraph);

    for (const h of heroes) {
      if (h.action?.phase === 'windup' && h.action.kind === 'skill') continue;
      switch (h.def.id) {
        case 'warrior': {
          const adj = enemies.filter((e) => edgeDistance(h, e) <= 1.0);
          if (adj.length > 0) {
            const caster = adj.find((e) => e.action?.phase === 'windup');
            if (caster && ready(h, 'shieldBash')) send({ type: 'skill', unitId: h.id, skillId: 'shieldBash', targetId: caster.id });
            else send({ type: 'attack', unitIds: [h.id], targetId: nearest(h, adj).id });
          } else if (enemies.some((e) => dist(e.pos, choke) < 7)) {
            if (dist(h.pos, choke) > 0.8) send({ type: 'move', unitIds: [h.id], point: choke });
          } else if (w.enemyAggro && enemies.every((e) => e.def.ai !== 'brute' && e.def.ai !== 'skirmisher')) {
            // 近戰敵人清光後：主動出擊遠程敵人
            const t = nearest(h, enemies);
            if (ready(h, 'charge') && edgeDistance(h, t) <= SKILLS.charge.range && w.canSee(h, t)) send({ type: 'skill', unitId: h.id, skillId: 'charge', targetId: t.id });
            else send({ type: 'attack', unitIds: [h.id], targetId: t.id });
          } else if (dist(h.pos, choke) > 0.8) {
            send({ type: 'move', unitIds: [h.id], point: choke });
          }
          break;
        }
        case 'ranger':
        case 'mage': {
          const home = h.def.id === 'ranger' ? { x: choke.x - 4.5, y: choke.y - 1.6 } : { x: choke.x - 5, y: choke.y + 1.6 };
          const visible = enemies.filter((e) => w.canSee(h, e) && edgeDistance(h, e) <= h.def.range);
          const interrupter = h.def.id === 'ranger' ? 'stunArrow' : 'arcaneMissile';
          if (telegraphing && w.canSee(h, telegraphing) && edgeDistance(h, telegraphing) <= SKILLS[interrupter].range && ready(h, interrupter)) {
            send({ type: 'skill', unitId: h.id, skillId: interrupter, targetId: telegraphing.id });
            break;
          }
          if (h.def.id === 'mage' && ready(h, 'fireball')) {
            const p = fireballPoint(w, h, enemies, heroes);
            if (p) {
              send({ type: 'skill', unitId: h.id, skillId: 'fireball', point: p });
              break;
            }
          }
          const threat = enemies.find((e) => edgeDistance(h, e) < 1.5);
          if (threat && h.def.id === 'mage' && ready(h, 'iceBind')) {
            send({ type: 'skill', unitId: h.id, skillId: 'iceBind', targetId: threat.id });
            break;
          }
          if (visible.length > 0) {
            const t = visible.find((e) => e.def.ai === 'caster') ?? nearest(h, visible);
            if (h.def.id === 'ranger' && ready(h, 'aimedShot') && !threat) send({ type: 'skill', unitId: h.id, skillId: 'aimedShot', targetId: t.id });
            else send({ type: 'attack', unitIds: [h.id], targetId: t.id });
          } else if (w.enemyAggro && !enemies.some((e) => e.def.ai === 'brute' && dist(e.pos, choke) < 8)) {
            // 看不到目標：往前推進找視線
            send({ type: 'attack', unitIds: [h.id], targetId: nearest(h, enemies).id });
          } else if (dist(h.pos, home) > 1) {
            send({ type: 'move', unitIds: [h.id], point: home });
          }
          break;
        }
        case 'cleric': {
          const hurt = heroes.filter((a) => a.hp / a.maxHp < 0.6).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          if (hurt && ready(h, 'heal')) {
            send({ type: 'skill', unitId: h.id, skillId: 'heal', targetId: hurt.id });
            break;
          }
          const near = heroes.filter((a) => dist(a.pos, h.pos) <= 6).length;
          if (ready(h, 'bless') && near >= 3 && enemies.some((e) => dist(e.pos, choke) < 6)) {
            send({ type: 'skill', unitId: h.id, skillId: 'bless' });
            break;
          }
          const threat = enemies.find((e) => edgeDistance(h, e) < 3 && dist(e.pos, choke) > 2);
          if (threat) {
            send({ type: 'attack', unitIds: [h.id], targetId: threat.id });
            break;
          }
          const home = { x: choke.x - 3, y: choke.y };
          if (dist(h.pos, home) > 1) send({ type: 'move', unitIds: [h.id], point: home });
          break;
        }
      }
    }
  }
}

function nearest(u: Unit, list: Unit[]): Unit {
  return list.reduce((a, b) => (dist(u.pos, a.pos) <= dist(u.pos, b.pos) ? a : b));
}

function fireballPoint(w: World, mage: Unit, enemies: Unit[], heroes: Unit[]) {
  const r = 2.5;
  let best: { x: number; y: number } | null = null;
  let bestN = 1;
  for (const e of enemies) {
    if (dist(mage.pos, e.pos) > SKILLS.fireball.range || !w.canSeePoint(mage, e.pos)) continue;
    const n = enemies.filter((o) => dist(o.pos, e.pos) <= r).length;
    const friendly = heroes.some((h) => dist(h.pos, e.pos) <= r + 1);
    if (!friendly && n > bestN) {
      bestN = n;
      best = { ...e.pos };
    }
  }
  return best;
}

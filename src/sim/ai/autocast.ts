/**
 * 技能自動施放（SPEC_SLICE4 §3.4）：玩家為某個技能開啟自動施放後，條件成立時英雄自己放。
 * 條件依技能效果種類，寫在 data/autocast.ts。
 */
import type { Order } from '../commands';
import { RANGE_TOLERANCE } from '../constants';
import { AUTOCAST } from '../data/autocast';
import { SKILLS } from '../data/skills';
import type { SkillDef } from '../data/types';
import type { Vec } from '../math';
import { dist } from '../math';
import type { Unit } from '../unit';
import type { World } from '../world';
import { edgeDistance } from '../zoc';

/** 這個技能能不能開自動施放 */
export function canAutocast(skillId: string): boolean {
  const def = SKILLS[skillId];
  return !!def && !!AUTOCAST[def.effect.kind];
}

/** 依開啟的自動施放技能（依欄位順序）找第一個條件成立的，回傳技能指令 */
export function autocastOrder(world: World, u: Unit): Order | null {
  for (const id of u.def.skills) {
    if (!u.autocast.has(id) || !u.skillReady(id)) continue;
    const def = SKILLS[id];
    if (!def) continue;
    const o = evaluate(world, u, def);
    if (o) return o;
  }
  return null;
}

function enemiesOf(world: World, u: Unit): Unit[] {
  return world.units.filter((e) => !e.dead && e.team !== u.team && world.canTarget(u, e));
}

function alliesOf(world: World, u: Unit): Unit[] {
  return world.units.filter((a) => !a.dead && a.team === u.team);
}

function evaluate(world: World, u: Unit, def: SkillDef): Order | null {
  const rule = AUTOCAST[def.effect.kind];
  if (!rule) return null;
  const range = world.skillRange(u, def);
  switch (rule.rule) {
    case 'cluster': {
      const eff = def.effect;
      const radius = 'radius' in eff ? eff.radius : 2;
      const ff = 'friendlyFire' in eff && eff.friendlyFire;
      const foes = enemiesOf(world, u).filter((e) => dist(u.pos, e.pos) <= range + radius);
      let best: Vec | null = null;
      let bestN = 0;
      for (const c of foes) {
        if (dist(u.pos, c.pos) > range + RANGE_TOLERANCE) continue;
        if (def.requiresLos && !world.canSeePoint(u, c.pos)) continue;
        if (ff && alliesOf(world, u).some((a) => dist(a.pos, c.pos) <= radius + a.radius)) continue;
        let n = 0;
        for (const e of foes) if (dist(e.pos, c.pos) <= radius) n++;
        if (n > bestN) {
          bestN = n;
          best = c.pos;
        }
      }
      return best && bestN >= rule.minEnemies ? { type: 'skill', skillId: def.id, point: { x: best.x, y: best.y } } : null;
    }
    case 'around': {
      const radius = 'radius' in def.effect ? def.effect.radius : 2;
      const n = enemiesOf(world, u).filter((e) => dist(u.pos, e.pos) <= radius + e.radius).length;
      return n >= rule.minEnemies ? { type: 'skill', skillId: def.id } : null;
    }
    case 'cone': {
      const eff = def.effect;
      if (eff.kind !== 'cone') return null;
      const foes = enemiesOf(world, u);
      const near = foes.reduce<Unit | null>((b, e) => (!b || dist(u.pos, e.pos) < dist(u.pos, b.pos) ? e : b), null);
      if (!near || dist(u.pos, near.pos) > eff.radius + near.radius) return null;
      const dir = Math.atan2(near.pos.y - u.pos.y, near.pos.x - u.pos.x);
      const half = ((eff.angle / 2) * Math.PI) / 180;
      let n = 0;
      for (const e of foes) {
        if (dist(u.pos, e.pos) > eff.radius + e.radius) continue;
        let da = Math.atan2(e.pos.y - u.pos.y, e.pos.x - u.pos.x) - dir;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) <= half) n++;
      }
      return n >= rule.minEnemies ? { type: 'skill', skillId: def.id, point: { ...near.pos } } : null;
    }
    case 'healAlly': {
      const cands = alliesOf(world, u).filter((a) => a.hp / a.maxHp < rule.hpBelow && (def.target === 'allyOrSelf' || a !== u) && edgeDistance(u, a) <= range + RANGE_TOLERANCE);
      if (cands.length === 0) return null;
      const t = cands.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      return { type: 'skill', skillId: def.id, targetId: t.id };
    }
    case 'healArea': {
      const radius = 'radius' in def.effect ? def.effect.radius : 2;
      const hurt = alliesOf(world, u).filter((a) => a.hp / a.maxHp < rule.hpBelow);
      for (const c of hurt) {
        if (dist(u.pos, c.pos) > range + RANGE_TOLERANCE) continue;
        const n = hurt.filter((a) => dist(a.pos, c.pos) <= radius + a.radius * 0.5).length;
        if (n >= rule.minAllies) return { type: 'skill', skillId: def.id, point: { ...c.pos } };
      }
      return null;
    }
    case 'buffParty': {
      const radius = 'radius' in def.effect ? def.effect.radius : 6;
      if (u.blessTime > 0) return null;
      const allies = alliesOf(world, u).filter((a) => dist(a.pos, u.pos) <= radius).length;
      const threat = enemiesOf(world, u).some((e) => dist(e.pos, u.pos) <= rule.enemyNear);
      return allies >= rule.minAllies && threat ? { type: 'skill', skillId: def.id } : null;
    }
    case 'attackTarget': {
      const o = u.order;
      const tid = o?.type === 'attack' ? o.targetId : o?.type === 'attackMove' ? o.targetId : undefined;
      const t = tid !== undefined ? world.getUnit(tid) : undefined;
      if (!t || t.dead || (rule.preferElite && t.def.tier === 'fodder')) return null;
      if (edgeDistance(u, t) > range + RANGE_TOLERANCE) return null;
      return { type: 'skill', skillId: def.id, targetId: t.id };
    }
    case 'guardAlly': {
      const foes = enemiesOf(world, u);
      const t = alliesOf(world, u).find(
        (a) => a !== u && a.guardTime <= 0 && a.hp / a.maxHp < rule.hpBelow && edgeDistance(u, a) <= range + RANGE_TOLERANCE && foes.some((e) => edgeDistance(e, a) <= 0.6),
      );
      return t ? { type: 'skill', skillId: def.id, targetId: t.id } : null;
    }
  }
}

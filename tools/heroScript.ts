/**
 * 自動對戰用的英雄腳本 AI（SPEC §15、SPEC_SLICE3 §8）：依定位行動，只使用目前裝備的技能。
 * - 前排（會產生控制區的近戰）：守隘口、守護後排、盾擊打斷
 * - 近戰打手（狂戰士、盜賊）：跟著前排輸出；盜賊找背後與暈眩目標
 * - 遠程（遊俠、法師、咒術師、煉金術士）：集火、打斷、範圍技能
 * - 治療（牧師）：補最低血、祝福、震開衝進後排的敵人
 * 只透過 Command 操作 sim。
 */
import { isBehind } from '../src/sim/actions';
import type { Command } from '../src/sim/commands';
import { SKILLS } from '../src/sim/data/skills';
import { dist } from '../src/sim/math';
import type { Unit } from '../src/sim/unit';
import { UnitState } from '../src/sim/unit';
import type { World } from '../src/sim/world';
import { edgeDistance } from '../src/sim/zoc';

const THINK_INTERVAL = 0.3;
const INTERRUPTERS = ['stunArrow', 'arcaneMissile'];

type Role = 'tank' | 'striker' | 'ranged' | 'healer';

function roleOf(u: Unit): Role {
  if (u.def.id === 'cleric') return 'healer';
  if (u.isMelee) return u.def.projectsZoc ? 'tank' : 'striker';
  return 'ranged';
}

export class HeroScript {
  private nextThink = 0;

  constructor(private world: World) {}

  update(): void {
    const w = this.world;
    if (w.time < this.nextThink) return;
    this.nextThink = w.time + THINK_INTERVAL;
    const choke = w.map.landmarks?.choke ?? { x: 18.5, y: 12 };
    const heroes = w.units.filter((u) => u.team === 'hero' && !u.dead);
    const enemies = w.units.filter((u) => u.team === 'enemy' && !u.dead && w.visibleToTeam(u, 'hero'));
    if (enemies.length === 0) return;
    const send = (c: Command) => w.enqueue(c);
    const has = (u: Unit, s: string) => u.def.skills.includes(s);
    const ready = (u: Unit, s: string) => has(u, s) && u.skillReady(s) && u.state !== UnitState.Windup && !u.dead;
    const telegraphing = enemies.find((e) => e.action?.phase === 'windup' && e.action.skillId && SKILLS[e.action.skillId].telegraph);
    const tanks = heroes.filter((u) => roleOf(u) === 'tank');
    const backline = heroes.filter((u) => roleOf(u) !== 'tank');
    /** 守護對象：生命上限最低的遠程 */
    const squishy = heroes.filter((u) => roleOf(u) === 'ranged').sort((a, b) => a.maxHp - b.maxHp)[0];
    /** 正在近戰攻擊後排的敵人 */
    const divers = enemies.filter((e) => e.isMelee && e.order?.type === 'attack' && backline.some((b) => b.id === (e.order as { targetId: number }).targetId && edgeDistance(b, e) < 3));
    /** 遠程目標優先序：衝進後排的近戰 → 術士／弓手／投彈手 → 最近 */
    const pickTarget = (h: Unit, list: Unit[]): Unit => {
      const d = list.filter((e) => divers.includes(e));
      if (d.length) return nearest(h, d);
      const r = list.filter((e) => e.def.ai === 'caster' || e.def.ai === 'archer' || e.def.ai === 'bomber');
      if (r.length) return nearest(h, r);
      return nearest(h, list);
    };

    for (const h of heroes) {
      if (h.action?.phase === 'windup' && h.action.kind === 'skill') continue;
      switch (roleOf(h)) {
        case 'tank': {
          const adj = enemies.filter((e) => edgeDistance(h, e) <= 1.0);
          // 開打後替遠程套上守護
          if (w.enemyAggro && squishy && ready(h, 'guard') && dist(h.pos, squishy.pos) <= 5 && enemies.some((e) => dist(e.pos, squishy.pos) < 8)) {
            send({ type: 'skill', unitId: h.id, skillId: 'guard', targetId: squishy.id });
            break;
          }
          if (w.enemyAggro && ready(h, 'battleCry') && heroes.filter((a) => dist(a.pos, h.pos) <= 6).length >= 3 && adj.length > 0) {
            send({ type: 'skill', unitId: h.id, skillId: 'battleCry' });
            break;
          }
          // 沒人貼著前排、卻有敵人衝進後排：過去救人
          if (adj.length === 0 && divers.length > 0) {
            const t = nearest(h, divers);
            if (ready(h, 'charge') && edgeDistance(h, t) > 3 && edgeDistance(h, t) <= SKILLS.charge.range && w.canSee(h, t)) send({ type: 'skill', unitId: h.id, skillId: 'charge', targetId: t.id });
            else send({ type: 'attack', unitIds: [h.id], targetId: t.id });
            break;
          }
          if (adj.length > 0) {
            const caster = adj.find((e) => e.action?.phase === 'windup');
            if (caster && ready(h, 'shieldBash')) send({ type: 'skill', unitId: h.id, skillId: 'shieldBash', targetId: caster.id });
            else send({ type: 'attack', unitIds: [h.id], targetId: nearest(h, adj).id });
          } else if (enemies.some((e) => dist(e.pos, choke) < 7)) {
            if (dist(h.pos, choke) > 0.8) send({ type: 'move', unitIds: [h.id], point: choke });
          } else if (w.enemyAggro && enemies.every((e) => !e.isMelee)) {
            // 近戰敵人清光後：主動出擊遠程敵人
            const t = nearest(h, enemies);
            if (ready(h, 'charge') && edgeDistance(h, t) <= SKILLS.charge.range && w.canSee(h, t)) send({ type: 'skill', unitId: h.id, skillId: 'charge', targetId: t.id });
            else send({ type: 'attack', unitIds: [h.id], targetId: t.id });
          } else if (dist(h.pos, choke) > 0.8) {
            send({ type: 'move', unitIds: [h.id], point: choke });
          }
          break;
        }
        case 'striker': {
          // 開打前跟在前排身後；沒有前排就守隘口
          const anchor = tanks[0]?.pos ?? choke;
          if (!w.enemyAggro) {
            const home = { x: anchor.x - 1.5, y: anchor.y + 1.2 };
            if (dist(h.pos, home) > 1) send({ type: 'move', unitIds: [h.id], point: home });
            break;
          }
          const near = enemies.filter((e) => edgeDistance(h, e) <= 1.6);
          if (ready(h, 'whirlwind') && near.length >= 2) {
            send({ type: 'skill', unitId: h.id, skillId: 'whirlwind' });
            break;
          }
          if (ready(h, 'smokeBomb') && h.hp < h.maxHp * 0.35 && near.length > 0) {
            send({ type: 'skill', unitId: h.id, skillId: 'smokeBomb' });
            break;
          }
          // 盜賊：優先挑暈眩／定身／背對自己的目標
          const preferred = divers.length ? divers : enemies;
          const t = has(h, 'backstab')
            ? [...preferred].sort((a, b) => strikerScore(h, b) - strikerScore(h, a) || dist(h.pos, a.pos) - dist(h.pos, b.pos))[0]
            : nearest(h, preferred);
          if (ready(h, 'backstab') && edgeDistance(h, t) <= 1 && (isBehind(h, t) || t.stunTime > 0 || t.rooted)) {
            send({ type: 'skill', unitId: h.id, skillId: 'backstab', targetId: t.id });
            break;
          }
          if (ready(h, 'shieldBash') && edgeDistance(h, t) <= 1 && (t.action?.phase === 'windup' || t.rooted)) {
            send({ type: 'skill', unitId: h.id, skillId: 'shieldBash', targetId: t.id });
            break;
          }
          if (ready(h, 'charge') && edgeDistance(h, t) > 3 && edgeDistance(h, t) <= SKILLS.charge.range && w.canSee(h, t)) {
            send({ type: 'skill', unitId: h.id, skillId: 'charge', targetId: t.id });
            break;
          }
          send({ type: 'attack', unitIds: [h.id], targetId: t.id });
          break;
        }
        case 'ranged': {
          // 遊俠站隘口上方、其餘遠程站下方（多名遠程時依欄位錯開）
          const upper = h.def.id === 'ranger' || (h.def.id !== 'mage' && h.heroSlot % 2 === 0);
          const home = upper ? { x: choke.x - 4.5, y: choke.y - 1.6 } : { x: choke.x - 5, y: choke.y + 1.6 };
          const arc = !!h.def.arcAttack;
          const visible = enemies.filter((e) => (arc || w.canSee(h, e)) && edgeDistance(h, e) <= w.attackRange(h));
          const interrupter = INTERRUPTERS.find((s) => has(h, s));
          if (interrupter && telegraphing && w.canSee(h, telegraphing) && edgeDistance(h, telegraphing) <= SKILLS[interrupter].range && ready(h, interrupter)) {
            send({ type: 'skill', unitId: h.id, skillId: interrupter, targetId: telegraphing.id });
            break;
          }
          // 範圍傷害（火球、火焰瓶）
          const aoe = ['fireball', 'firebomb'].find((s) => ready(h, s));
          if (aoe) {
            const p = aoePoint(w, h, aoe, enemies, heroes);
            if (p) {
              send({ type: 'skill', unitId: h.id, skillId: aoe, point: p });
              break;
            }
          }
          // 治療藥瓶：兩人以上受傷且靠在一起
          if (ready(h, 'healFlask')) {
            const p = healPoint(h, heroes);
            if (p) {
              send({ type: 'skill', unitId: h.id, skillId: 'healFlask', point: p });
              break;
            }
          }
          // 詛咒：打在隘口最前面或最強的敵人身上
          if (ready(h, 'curse')) {
            const t = [...visible].sort((a, b) => b.maxHp - a.maxHp)[0];
            if (t && t.curseTime <= 0 && w.canSee(h, t)) {
              send({ type: 'skill', unitId: h.id, skillId: 'curse', targetId: t.id });
              break;
            }
          }
          // 沼澤：近戰敵人逼近時丟在他們腳下
          if (ready(h, 'swamp')) {
            const melee = enemies.filter((e) => e.isMelee && dist(e.pos, h.pos) < 8 && dist(e.pos, h.pos) <= SKILLS.swamp.range && w.canSeePoint(h, e.pos));
            if (melee.length >= 2) {
              send({ type: 'skill', unitId: h.id, skillId: 'swamp', point: { ...nearest(h, melee).pos } });
              break;
            }
          }
          const threat = enemies.find((e) => e.isMelee && edgeDistance(h, e) < 2.5);
          if (threat && ready(h, 'iceBind') && w.canSee(h, threat)) {
            send({ type: 'skill', unitId: h.id, skillId: 'iceBind', targetId: threat.id });
            break;
          }
          if (threat && ready(h, 'smokeBomb') && h.hp < h.maxHp * 0.5) {
            send({ type: 'skill', unitId: h.id, skillId: 'smokeBomb' });
            break;
          }
          // 血少又被近身：往後撤
          if (threat && h.hp < h.maxHp * 0.5 && h.order?.type !== 'move') {
            const away = { x: h.pos.x - (threat.pos.x - h.pos.x) * 2, y: h.pos.y - (threat.pos.y - h.pos.y) * 2 };
            send({ type: 'move', unitIds: [h.id], point: away });
            break;
          }
          if (visible.length > 0) {
            const t = pickTarget(h, visible);
            if (ready(h, 'aimedShot') && !threat && w.canSee(h, t)) send({ type: 'skill', unitId: h.id, skillId: 'aimedShot', targetId: t.id });
            else send({ type: 'attack', unitIds: [h.id], targetId: t.id });
          } else if (w.enemyAggro && !enemies.some((e) => e.def.ai === 'brute' && dist(e.pos, choke) < 8)) {
            // 看不到目標：往前推進找視線
            send({ type: 'attack', unitIds: [h.id], targetId: nearest(h, enemies).id });
          } else if (dist(h.pos, home) > 1) {
            send({ type: 'move', unitIds: [h.id], point: home });
          }
          break;
        }
        case 'healer': {
          const hurt = heroes.filter((a) => a.hp / a.maxHp < 0.6).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          if (hurt && ready(h, 'heal')) {
            send({ type: 'skill', unitId: h.id, skillId: 'heal', targetId: hurt.id });
            break;
          }
          if (ready(h, 'healFlask')) {
            const p = healPoint(h, heroes);
            if (p) {
              send({ type: 'skill', unitId: h.id, skillId: 'healFlask', point: p });
              break;
            }
          }
          const near = heroes.filter((a) => dist(a.pos, h.pos) <= 6).length;
          if (ready(h, 'bless') && near >= 3 && enemies.some((e) => dist(e.pos, choke) < 6)) {
            send({ type: 'skill', unitId: h.id, skillId: 'bless' });
            break;
          }
          // 把衝進後排的敵人震開
          const diver = divers.find((e) => edgeDistance(h, e) < 4);
          if (diver) {
            if (ready(h, 'holySmite') && edgeDistance(h, diver) < 1) send({ type: 'skill', unitId: h.id, skillId: 'holySmite', targetId: diver.id });
            else send({ type: 'attack', unitIds: [h.id], targetId: diver.id });
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

/** 盜賊選目標：暈眩、定身、背對自己的目標加分 */
function strikerScore(h: Unit, e: Unit): number {
  return (e.stunTime > 0 ? 3 : 0) + (e.rooted ? 2 : 0) + (isBehind(h, e) ? 2 : 0) - dist(h.pos, e.pos) * 0.1;
}

function aoePoint(w: World, caster: Unit, skillId: string, enemies: Unit[], heroes: Unit[]) {
  const def = SKILLS[skillId];
  if (def.effect.kind !== 'aoe') return null;
  const r = def.effect.radius;
  const ff = def.effect.friendlyFire;
  let best: { x: number; y: number } | null = null;
  let bestN = 1;
  for (const e of enemies) {
    if (dist(caster.pos, e.pos) > w.skillRange(caster, def) || (def.requiresLos && !w.canSeePoint(caster, e.pos))) continue;
    const n = enemies.filter((o) => dist(o.pos, e.pos) <= r).length;
    const friendly = ff && heroes.some((h) => dist(h.pos, e.pos) <= r + 1);
    if (!friendly && n > bestN) {
      bestN = n;
      best = { ...e.pos };
    }
  }
  return best;
}

function healPoint(h: Unit, heroes: Unit[]) {
  const def = SKILLS.healFlask;
  if (def.effect.kind !== 'aoeHeal') return null;
  const r = def.effect.radius;
  let best: { x: number; y: number } | null = null;
  let bestN = 1;
  for (const a of heroes) {
    if (a.hp / a.maxHp > 0.7 || dist(h.pos, a.pos) > def.range) continue;
    const n = heroes.filter((o) => o.hp / o.maxHp < 0.8 && dist(o.pos, a.pos) <= r).length;
    if (n > bestN) {
      bestN = n;
      best = { ...a.pos };
    }
  }
  return best;
}

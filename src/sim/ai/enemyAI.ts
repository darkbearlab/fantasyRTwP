/**
 * 敵人 AI（SPEC §10.3、§10.4）：每 1.0 ± 0.2 秒重新評估一次目標。
 */
import { SKIRMISH } from '../data/skirmish';
import { ENEMY_ALERT, ENEMY_TARGETING } from '../data/enemies';
import { SKILLS } from '../data/skills';
import type { Vec } from '../math';
import { dist } from '../math';
import { lineWalkable } from '../nav/smooth';
import { scaleRange } from '../simConfig';
import type { Unit } from '../unit';
import type { World } from '../world';
import { edgeDistance, pinnersAt } from '../zoc';

const EVAL_INTERVAL = 1.0;
const EVAL_JITTER = 0.2;
/** 弓手被近身的判定距離（邊緣距離） */
const ARCHER_THREAT_RANGE = 2.5;
const ARCHER_RETREAT_DIST = 4;
const ARCHER_RETREAT_COOLDOWN = 4;

export function enemyThink(world: World, u: Unit): void {
  if (world.config.battleStyle === 'deliberate') {
    deliberateThink(world, u);
    return;
  }
  if (!world.enemyAggro) return;
  if (u.order && u.aiTimer > 0) return;
  u.aiTimer = EVAL_INTERVAL + world.rng.range(-EVAL_JITTER, EVAL_JITTER);

  // 躲在草叢裡的英雄看不到
  const heroes = world.units.filter((h) => h.team !== u.team && !h.dead && world.canTarget(u, h));
  if (heroes.length === 0) return;

  // 嘲諷光環（沉穩節奏，SPEC_SLICE5 §14）：光環內的敵人優先打嘲諷者
  const taunter = tauntingHero(u, heroes);
  if (taunter && u.def.ai !== 'boss') {
    attack(world, u, taunter);
    return;
  }

  // 被牽制時：先處理牽制自己的英雄
  const pinners = u.def.ai === 'boss' || u.def.ignoresZoc ? [] : pinnersAt(world, u);
  if (pinners.length > 0) {
    attack(world, u, nearest(u, pinners));
    return;
  }

  switch (u.def.ai) {
    case 'skirmisher': {
      // 護甲最低的英雄；同護甲取最近
      const t = [...heroes].sort((a, b) => a.armor - b.armor || dist(u.pos, a.pos) - dist(u.pos, b.pos))[0];
      attack(world, u, t);
      return;
    }
    case 'archer': {
      const threat = heroes.find((h) => edgeDistance(u, h) < ARCHER_THREAT_RANGE);
      if (threat && u.retreatCooldown <= 0) {
        const p = retreatPoint(world, u, heroes);
        if (p) {
          u.retreatCooldown = ARCHER_RETREAT_COOLDOWN;
          world.issueOrder(u, { type: 'move', point: p });
          return;
        }
      }
      const visible = heroes.filter((h) => world.canSee(u, h) && edgeDistance(u, h) <= world.attackRange(u) + 2);
      if (visible.length > 0) {
        const t = visible.sort((a, b) => a.defense - b.defense || dist(u.pos, a.pos) - dist(u.pos, b.pos))[0];
        attack(world, u, t);
      } else attack(world, u, nearest(u, heroes));
      return;
    }
    case 'caster': {
      const spell = u.def.skills.find((s) => SKILLS[s]?.effect.kind === 'aoe');
      if (spell && u.skillReady(spell)) {
        const p = bestClusterPoint(u, heroes, SKILLS[spell]);
        if (p) {
          world.issueOrder(u, { type: 'skill', skillId: spell, point: p });
          return;
        }
      }
      const visible = heroes.filter((h) => world.canSee(u, h));
      attack(world, u, nearest(u, visible.length > 0 ? visible : heroes));
      return;
    }
    case 'boss': {
      // 生命低於一半：戰吼（一場一次，被打斷就失去）
      if (u.hp < u.maxHp * 0.5 && u.def.skills.includes('warcry') && u.skillReady('warcry')) {
        world.issueOrder(u, { type: 'skill', skillId: 'warcry' });
        return;
      }
      const t = nearest(u, heroes);
      // 橫掃：附近有英雄就朝他掃
      if (u.def.skills.includes('sweep') && u.skillReady('sweep') && dist(u.pos, t.pos) <= SKILLS.sweep.range + u.radius + 0.6) {
        world.issueOrder(u, { type: 'skill', skillId: 'sweep', point: { x: t.pos.x, y: t.pos.y } });
        return;
      }
      attack(world, u, t);
      return;
    }
    case 'siege': {
      // 撞擊：衝向有一段距離的英雄
      const t = nearest(u, heroes);
      const d = edgeDistance(u, t);
      if (u.skillReady('ram') && u.def.skills.includes('ram') && d > 2.5 && d <= scaleRange(world.config, SKILLS.ram.range) && world.canSee(u, t)) {
        world.issueOrder(u, { type: 'skill', skillId: 'ram', targetId: t.id });
        return;
      }
      attack(world, u, t);
      return;
    }
    case 'bomber': {
      // 拋物線：不需視線；被近身就後退
      const threat = heroes.find((h) => edgeDistance(u, h) < ARCHER_THREAT_RANGE);
      if (threat && u.retreatCooldown <= 0) {
        const p = retreatPoint(world, u, heroes);
        if (p) {
          u.retreatCooldown = ARCHER_RETREAT_COOLDOWN;
          world.issueOrder(u, { type: 'move', point: p });
          return;
        }
      }
      if (u.def.skills.includes('bomb') && u.skillReady('bomb')) {
        const inRange = heroes.filter((h) => dist(u.pos, h.pos) <= scaleRange(world.config, SKILLS.bomb.range));
        const p = inRange.length ? bestClusterPoint(u, inRange, SKILLS.bomb) : null;
        if (p) {
          world.issueOrder(u, { type: 'skill', skillId: 'bomb', point: p });
          return;
        }
      }
      attack(world, u, nearest(u, heroes));
      return;
    }
    case 'lurker': {
      // 優先攻擊後排：不產生控制區的英雄中生命最低者
      const back = heroes.filter((h) => !h.def.projectsZoc);
      const t = back.length ? [...back].sort((a, b) => a.hp - b.hp || dist(u.pos, a.pos) - dist(u.pos, b.pos))[0] : nearest(u, heroes);
      attack(world, u, t);
      return;
    }
    case 'brute':
    default:
      attack(world, u, nearest(u, heroes));
  }
}

function attack(world: World, u: Unit, t: Unit): void {
  world.issueOrder(u, { type: 'attack', targetId: t.id });
}

function nearest(u: Unit, list: Unit[]): Unit {
  let best = list[0];
  let bestD = Infinity;
  for (const h of list) {
    const d = dist(u.pos, h.pos);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

/** 弓手後退：8 個方向中選離英雄最遠、可直線走到的點 */
function retreatPoint(world: World, u: Unit, heroes: Unit[]): Vec | null {
  const grid = world.navFor(u);
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = { x: u.pos.x + Math.cos(a) * ARCHER_RETREAT_DIST, y: u.pos.y + Math.sin(a) * ARCHER_RETREAT_DIST };
    if (!grid.isWalkable(p) || !lineWalkable(grid, u.pos, p)) continue;
    let minD = Infinity;
    for (const h of heroes) minD = Math.min(minD, dist(p, h.pos));
    if (minD > bestScore) {
      bestScore = minD;
      best = p;
    }
  }
  return best;
}

/** 術士：找英雄最密集的位置（候選：英雄位置與兩兩中點） */
function bestClusterPoint(u: Unit, heroes: Unit[], spell: (typeof SKILLS)[string]): Vec | null {
  const eff = spell.effect;
  if (eff.kind !== 'aoe') return null;
  const cands: Vec[] = heroes.map((h) => h.pos);
  for (let i = 0; i < heroes.length; i++) {
    for (let j = i + 1; j < heroes.length; j++) {
      cands.push({ x: (heroes[i].pos.x + heroes[j].pos.x) / 2, y: (heroes[i].pos.y + heroes[j].pos.y) / 2 });
    }
  }
  let best: Vec | null = null;
  let bestScore = 0;
  for (const c of cands) {
    let n = 0;
    for (const h of heroes) if (dist(c, h.pos) <= eff.radius) n++;
    // 越密集越好，距離近的稍微優先
    const score = n - dist(u.pos, c) * 0.01;
    if (n > 0 && score > bestScore) {
      bestScore = score;
      best = { x: c.x, y: c.y };
    }
  }
  return best;
}

/** 範圍內最近的嘲諷者（被動 taunt） */
function tauntingHero(u: Unit, heroes: Unit[]): Unit | undefined {
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const h of heroes) {
    const r = h.passives.reduce((m, p) => Math.max(m, p.taunt ?? 0), 0);
    if (r <= 0) continue;
    const d = dist(u.pos, h.pos);
    if (d <= r + h.radius && d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

// ───────────── 沉穩節奏（SPEC_SLICE5 §15）：目標優先度、小隊警覺、新敵人的行為 ─────────────

/** 自爆屍：英雄進入這個距離（邊緣距離）就開始倒數 */
const EXPLODER_TRIGGER = 1.0;
/** 祭司：同伴生命低於這個比例才治療 */
const PRIEST_HEAL_BELOW = 0.7;

/** 最近 threatWindow 秒內，這名英雄對 u 造成的傷害 */
function threatFrom(world: World, u: Unit, heroId: number): number {
  const since = world.time - ENEMY_ALERT.threatWindow;
  if (u.threatLog.length > 0 && u.threatLog[0].t < since) u.threatLog = u.threatLog.filter((e) => e.t >= since);
  let sum = 0;
  for (const e of u.threatLog) if (e.id === heroId) sum += e.amount;
  return sum;
}

/** 目標評分（SPEC_SLICE5 §15.1）：距離、生命、後排、仇恨、標記、現任 */
export function targetScore(world: World, u: Unit, h: Unit, currentId: number): number {
  const w = { ...ENEMY_TARGETING, ...(u.def.targeting ?? {}) };
  const near = Math.max(0, 1 - dist(u.pos, h.pos) / ENEMY_ALERT.distanceFull);
  const low = 1 - Math.max(0, h.hp) / h.maxHp;
  const back = h.def.projectsZoc ? 0 : 1;
  const threat = Math.min(1, threatFrom(world, u, h.id) / ENEMY_ALERT.threatFull);
  const marked = h.stunTime > 0 || h.rootTime > 0 || h.burnTime > 0 || h.curseTime > 0 ? 1 : 0;
  const cur = h.id === currentId ? 1 : 0;
  return w.distance * near + w.lowHp * low + w.backline * back + w.threat * threat + w.marked * marked + w.sticky * cur;
}

function currentTargetId(u: Unit): number {
  const o = u.order;
  if (o && (o.type === 'attack' || o.type === 'skill') && o.targetId !== undefined) return o.targetId;
  return -1;
}

/** 選目標：嘲諷最優先；近戰被擋路就打擋路的；否則評分最高者 */
export function pickTarget(world: World, u: Unit, heroes: Unit[]): Unit {
  const taunter = tauntingHero(u, heroes);
  if (taunter && u.def.ai !== 'boss') return taunter;
  const cur = currentTargetId(u);
  let best = heroes[0];
  let bestS = -Infinity;
  for (const h of heroes) {
    const sc = targetScore(world, u, h, cur);
    if (sc > bestS) {
      bestS = sc;
      best = h;
    }
  }
  // 近戰：目標還遠、身邊貼著另一名英雄 → 改打擋路的（戰士卡位）
  if (u.isMelee && edgeDistance(u, best) > ENEMY_ALERT.blockedFar) {
    const blocker = heroes.find((h) => h !== best && edgeDistance(u, h) <= ENEMY_ALERT.blockedContact);
    if (blocker) return blocker;
  }
  return best;
}

function deliberateThink(world: World, u: Unit): void {
  if (!u.alerted) return;
  // 小衝突導演的波次：還沒接戰時沿流場（水流法）往最近的英雄走（長路徑不必每隻各跑 A*，也不會因為太遠找不到路而停住）
  if (u.hunting) {
    const R = SKIRMISH.engageRange;
    const engaged = world.units.some((h) => h.team !== u.team && !h.dead && dist(u.pos, h.pos) <= R && world.canSee(u, h));
    // 接戰中照一般 AI；跟丟了（附近沒有看得到的英雄）就再沿流場走
    // 流場走到盡頭（流場的格子比角色粗，窄巷、門口走不進去）時改用一般的尋路，那時已經很近了
    const next = !engaged && world.flowDistanceAt(u.pos) > 2 ? world.flowNext(u.pos) : null;
    if (next) {
      if (u.order) world.setOrder(u, null);
      world.stepToward(u, next);
      return;
    }
  }
  // 自爆屍：每個節拍檢查，貼近就開始倒數
  if (u.def.ai === 'exploder' && u.skillReady('selfDestruct')) {
    const close = world.units.some((h) => h.team !== u.team && !h.dead && edgeDistance(u, h) <= EXPLODER_TRIGGER);
    if (close) {
      world.issueOrder(u, { type: 'skill', skillId: 'selfDestruct' });
      return;
    }
  }
  if (u.order && u.aiTimer > 0) return;
  u.aiTimer = EVAL_INTERVAL + world.rng.range(-EVAL_JITTER, EVAL_JITTER);
  const heroes = world.units.filter((h) => h.team !== u.team && !h.dead && world.canTarget(u, h));
  if (heroes.length === 0) return;
  const t = pickTarget(world, u, heroes);
  const d = edgeDistance(u, t);
  const sees = world.canSee(u, t);
  const ready = (id: string) => u.def.skills.includes(id) && u.skillReady(id);

  switch (u.def.ai) {
    case 'charger':
      if (ready('rush') && d > 2.5 && d <= scaleRange(world.config, SKILLS.rush.range) && sees) {
        world.issueOrder(u, { type: 'skill', skillId: 'rush', point: { ...t.pos } });
        return;
      }
      break;
    case 'assassin':
      if (ready('leap') && d > 2.5 && d <= scaleRange(world.config, SKILLS.leap.range) && sees) {
        world.issueOrder(u, { type: 'skill', skillId: 'leap', point: { ...t.pos } });
        return;
      }
      break;
    case 'hooker': {
      // 優先鉤後排；目標是近戰時就直接打
      const back = heroes.filter((h) => !h.def.projectsZoc && edgeDistance(u, h) > 2 && edgeDistance(u, h) <= scaleRange(world.config, SKILLS.hook.range) && world.canSee(u, h));
      if (ready('hook') && back.length > 0) {
        const v = back.sort((a, b) => targetScore(world, u, b, -1) - targetScore(world, u, a, -1))[0];
        world.issueOrder(u, { type: 'skill', skillId: 'hook', targetId: v.id });
        return;
      }
      break;
    }
    case 'priest': {
      if (ready('mend')) {
        const hurt = world.units
          .filter((a) => a.team === u.team && a !== u && !a.dead && a.hp / a.maxHp < PRIEST_HEAL_BELOW && edgeDistance(u, a) <= scaleRange(world.config, SKILLS.mend.range) + 4)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        if (hurt.length > 0) {
          world.issueOrder(u, { type: 'skill', skillId: 'mend', targetId: hurt[0].id });
          return;
        }
      }
      if (keepDistance(world, u, heroes)) return;
      break;
    }
    case 'champion': {
      // 魔王的冠軍（Alan 2026-10-22）：沒有普攻；所有攻擊都有預兆、間隔短。依距離挑能用的招式，沒有就靠近目標
      const d0 = dist(u.pos, t.pos);
      const around = heroes.filter((h) => dist(u.pos, h.pos) <= 2.6 + h.radius).length;
      if (ready('sentinelStomp') && (around >= 2 || (around >= 1 && !ready('sentinelSweep')))) {
        world.issueOrder(u, { type: 'skill', skillId: 'sentinelStomp' });
        return;
      }
      if (ready('sentinelSweep') && d0 <= 3.2 + t.radius) {
        world.issueOrder(u, { type: 'skill', skillId: 'sentinelSweep', point: { ...t.pos } });
        return;
      }
      if (ready('sentinelBreath') && d0 >= 2.5 && d0 <= 6.5 && sees) {
        world.issueOrder(u, { type: 'skill', skillId: 'sentinelBreath', point: { ...t.pos } });
        return;
      }
      for (const rush of ['sentinelSweepRush', 'sentinelRush']) {
        if (ready(rush) && d0 >= 3 && d0 <= 9 && sees) {
          world.issueOrder(u, { type: 'skill', skillId: rush, point: { ...t.pos } });
          return;
        }
      }
      // 沒有能用的招式：貼近目標（不普攻）
      if (d0 > u.radius + t.radius + 0.8) world.setOrder(u, { type: 'move', point: { ...t.pos } });
      else if (u.order) world.setOrder(u, null);
      return;
    }
    case 'shaman': {
      // 獸人薩滿：先補血，再替附近的同伴狂暴，其餘時間保持距離
      if (ready('mend')) {
        const hurt = world.units
          .filter((a) => a.team === u.team && a !== u && !a.dead && a.def.ai !== 'nest' && a.hp / a.maxHp < PRIEST_HEAL_BELOW && edgeDistance(u, a) <= scaleRange(world.config, SKILLS.mend.range) + 4)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        if (hurt.length > 0) {
          world.issueOrder(u, { type: 'skill', skillId: 'mend', targetId: hurt[0].id });
          return;
        }
      }
      if (ready('frenzy')) {
        const eff = SKILLS.frenzy.effect;
        const r = eff.kind === 'enchant' ? eff.radius : 6;
        const near = world.units.filter((a) => a.team === u.team && a !== u && !a.dead && a.def.ai !== 'nest' && dist(a.pos, u.pos) <= r).length;
        if (near >= 2) {
          world.issueOrder(u, { type: 'skill', skillId: 'frenzy' });
          return;
        }
      }
      if (keepDistance(world, u, heroes)) return;
      break;
    }
    case 'ogre':
      if (ready('clubSweep') && dist(u.pos, t.pos) <= SKILLS.clubSweep.range + u.radius + 0.6) {
        world.issueOrder(u, { type: 'skill', skillId: 'clubSweep', point: { x: t.pos.x, y: t.pos.y } });
        return;
      }
      break;
    case 'summoner': {
      // 召喚技能（召喚師的屍僕、蟲巢的孵化…）
      const call = u.def.skills.find((sk) => SKILLS[sk]?.effect.kind === 'summon');
      if (call && u.skillReady(call)) {
        world.issueOrder(u, { type: 'skill', skillId: call });
        return;
      }
      // 不會動的（蟲巢）就只是待著
      if (u.def.moveSpeed <= 0) return;
      if (keepDistance(world, u, heroes)) return;
      break;
    }
    case 'archer':
    case 'bomber':
      if (keepDistance(world, u, heroes)) return;
      if (u.def.ai === 'bomber' && ready('bomb')) {
        const inRange = heroes.filter((h) => dist(u.pos, h.pos) <= scaleRange(world.config, SKILLS.bomb.range));
        const p = inRange.length ? bestClusterPoint(u, inRange, SKILLS.bomb) : null;
        if (p) {
          world.issueOrder(u, { type: 'skill', skillId: 'bomb', point: p });
          return;
        }
      }
      break;
    case 'caster': {
      const spell = u.def.skills.find((sk) => SKILLS[sk]?.effect.kind === 'aoe');
      if (spell && u.skillReady(spell)) {
        const p = bestClusterPoint(u, heroes, SKILLS[spell]);
        if (p) {
          world.issueOrder(u, { type: 'skill', skillId: spell, point: p });
          return;
        }
      }
      break;
    }
    case 'boss': {
      // 戰吼（各頭目有自己的版本，例：獸人酋長叫哥布林）
      const cry = u.def.skills.find((sk) => SKILLS[sk]?.effect.kind === 'warcry');
      if (cry && u.hp < u.maxHp * 0.5 && u.skillReady(cry)) {
        world.issueOrder(u, { type: 'skill', skillId: cry });
        return;
      }
      // 跳斬（獸人酋長）：跳到後排、離得夠遠的英雄身上
      if (ready('chiefLeap')) {
        const reach = scaleRange(world.config, SKILLS.chiefLeap.range);
        const back = heroes
          .filter((h) => dist(u.pos, h.pos) > 4 && dist(u.pos, h.pos) <= reach && world.canSee(u, h))
          .sort((a, b) => (a.def.projectsZoc ? 1 : 0) - (b.def.projectsZoc ? 1 : 0) || dist(u.pos, b.pos) - dist(u.pos, a.pos))[0];
        if (back) {
          world.issueOrder(u, { type: 'skill', skillId: 'chiefLeap', point: { ...back.pos } });
          return;
        }
      }
      // 投擲巨石：瞄準遠處英雄最密的地方
      if (ready('boulder')) {
        const far = heroes.filter((h) => dist(u.pos, h.pos) > 3.5 && dist(u.pos, h.pos) <= scaleRange(world.config, SKILLS.boulder.range));
        const p = far.length ? bestClusterPoint(u, far, SKILLS.boulder) : null;
        if (p) {
          world.issueOrder(u, { type: 'skill', skillId: 'boulder', point: p });
          return;
        }
      }
      if (ready('clubSweep') && dist(u.pos, t.pos) <= SKILLS.clubSweep.range + u.radius + 0.6) {
        world.issueOrder(u, { type: 'skill', skillId: 'clubSweep', point: { x: t.pos.x, y: t.pos.y } });
        return;
      }
      // 擲人（Alan 2026-10-21）：抓身邊的英雄，丟向遠處的英雄（後排優先、越遠越優先），落點有預兆圈
      if (ready('hurl')) {
        const H = SKILLS.hurl;
        const eff = H.effect;
        if (eff.kind === 'hurl') {
          const reach = scaleRange(world.config, H.range) + 0.5;
          const grab = heroes.filter((h) => !h.thrown && edgeDistance(u, h) <= reach).sort((a, b) => edgeDistance(u, a) - edgeDistance(u, b))[0];
          const far = grab
            ? heroes
                .filter((h) => h !== grab && dist(u.pos, h.pos) >= eff.minDist && dist(u.pos, h.pos) <= eff.maxDist)
                .sort((a, b) => (a.def.projectsZoc ? 1 : 0) - (b.def.projectsZoc ? 1 : 0) || dist(u.pos, b.pos) - dist(u.pos, a.pos))[0]
            : undefined;
          if (grab && far) {
            world.issueOrder(u, { type: 'skill', skillId: 'hurl', targetId: grab.id, point: { x: far.pos.x, y: far.pos.y } });
            return;
          }
        }
      }
      if (ready('sweep') && dist(u.pos, t.pos) <= SKILLS.sweep.range + u.radius + 0.6) {
        world.issueOrder(u, { type: 'skill', skillId: 'sweep', point: { x: t.pos.x, y: t.pos.y } });
        return;
      }
      break;
    }
    case 'siege':
      if (ready('ram') && d > 2.5 && d <= scaleRange(world.config, SKILLS.ram.range) && sees) {
        world.issueOrder(u, { type: 'skill', skillId: 'ram', targetId: t.id });
        return;
      }
      break;
    default:
  }
  attack(world, u, t);
}

/** 遠程敵人被近身時拉開距離（射手 v0.4：沒有其他特殊行為） */
function keepDistance(world: World, u: Unit, heroes: Unit[]): boolean {
  const threat = heroes.find((h) => edgeDistance(u, h) < ARCHER_THREAT_RANGE);
  if (!threat || u.retreatCooldown > 0) return false;
  const p = retreatPoint(world, u, heroes);
  if (!p) return false;
  u.retreatCooldown = ARCHER_RETREAT_COOLDOWN;
  world.issueOrder(u, { type: 'move', point: p });
  return true;
}

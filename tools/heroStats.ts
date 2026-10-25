/**
 * 英雄的預期命中率與傷害（Alan 2026-10-25）：npm run herostats [-- --seconds 120]
 * 在 sim 裡實測：每個職業的英雄對各章的代表敵人站樁普攻一段時間（不放技能、敵人不還手、生命無限），
 * 量命中率、爆擊率、平均每下傷害、每秒傷害，換算打倒真實生命的那名敵人要幾秒；反過來也量敵人打英雄。
 * 敵人數值取自真的遠征戰鬥（一路向前：全程深度強度、前期生命對齊、沉穩節奏減半都算進去）。
 * 英雄是那個深度的預期等級（只算等級成長，不算升級與裝備），職業被動照起始等級。
 */
import { createBattleFromRun, deliberateLevelId } from '../src/run/battle';
import { CHAPTERS } from '../src/run/data/chapters';
import { deliberateSkillsOf } from '../src/run/loadout';
import type { RunState } from '../src/run/runState';
import { createRun, newHero } from '../src/run/runState';
import { classPassivesOf, heroDef, heroPassives } from '../src/run/upgrades';
import { DT } from '../src/sim/constants';
import { deliberateConfig } from '../src/sim/data/deliberate';
import type { MapDef, UnitDef } from '../src/sim/data/types';
import { DEFAULT_SIM_CONFIG } from '../src/sim/simConfig';
import { World } from '../src/sim/world';
import { setHitBase } from '../src/sim/data/hit';
import type { UnitSpawn } from '../src/sim/world';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const SECONDS = Number(arg('seconds') ?? 120);
// 試算命中公式（Alan 2026-10-25）：--hitBase 95＝基礎命中 95%（現行相當於 51）
const HIT_BASE = arg('hitBase') ? Number(arg('hitBase')) : null;
if (HIT_BASE !== null) setHitBase(HIT_BASE);

const HERO_CLASSES = ['warrior', 'ranger', 'mage', 'cleric'];
const NAME: Record<string, string> = { warrior: '戰士', ranger: '遊俠', mage: '法師', cleric: '牧師' };

/** 代表的深度：章、層、這時候預期的隊伍等級（自動遠征實測的大約值） */
const POINTS = [
  { chapter: 0, layer: 1, level: 1 },
  { chapter: 1, layer: 3, level: 5 },
  { chapter: 2, layer: 4, level: 9 },
  { chapter: 4, layer: 4, level: 18 },
];

const OPEN: MapDef = { id: 'stats', name: 'stats', width: 30, height: 12, obstacles: [], heroSpawns: [], enemySpawns: [] };
const CONFIG = { ...DEFAULT_SIM_CONFIG, ...deliberateConfig(DEFAULT_SIM_CONFIG), enemyAggroRange: 0, enemyAggroTime: 1e9 };

/** 這個深度的真實敵人（每種一個），從真的遠征戰鬥裡拿數值 */
function enemiesAt(chapter: number, layer: number): UnitDef[] {
  for (let s = 1; s < 40; s++) {
    const r: RunState = createRun(s, { style: 'deliberate' });
    r.chapter = chapter;
    const node = r.map.nodes.find((n) => n.layer === layer && n.type === 'battle');
    if (!node) continue;
    r.currentNodeId = node.id;
    r.phase = { kind: 'battle', nodeId: node.id, encounterId: deliberateLevelId('battle'), fromEvent: false };
    const w = createBattleFromRun(r);
    const seen = new Map<string, UnitDef>();
    // 自爆屍一貼近就自爆，站樁量不出東西，不列
    for (const u of w.units) if (u.team === 'enemy' && !seen.has(u.def.id) && u.def.rank !== 'elite' && u.def.ai !== 'exploder') seen.set(u.def.id, u.def);
    if (seen.size) return [...seen.values()];
  }
  return [];
}

function heroSpawn(classId: string, level: number, pos: { x: number; y: number }): UnitSpawn {
  const h = newHero(classId);
  h.level = level;
  const def = { ...heroDef(h), skills: deliberateSkillsOf(classId) };
  return { defId: classId, def, pos, heroSlot: 0, passives: heroPassives(h), classPassives: classPassivesOf(h) };
}

interface Duel {
  attacks: number;
  hits: number;
  crits: number;
  damage: number;
}

/** attacker 站樁普攻 target（target 不還手、生命無限）SECONDS 秒 */
function duel(attacker: UnitSpawn, target: UnitSpawn, attackerIsHero: boolean): Duel {
  // 被打的一方：生命無限，而且不會還手（敵人被打會警覺、反擊，會打斷攻擊的一方；ai 設成 nest＝不思考）
  const big = (s: UnitSpawn): UnitSpawn => ({ ...s, def: { ...s.def!, maxHp: 1e9, ...(s.def!.team === 'enemy' ? { ai: 'nest' as const } : {}) }, hp: 1e9 });
  const spawns = attackerIsHero ? [attacker, big(target)] : [big(target), attacker];
  const w = new World({ seed: 7, map: OPEN, spawns, config: CONFIG, idleBehavior: { decide: () => null } });
  const a = w.units[attackerIsHero ? 0 : 1];
  const t = w.units[attackerIsHero ? 1 : 0];
  a.autocast.clear();
  t.autocast.clear();
  const out: Duel = { attacks: 0, hits: 0, crits: 0, damage: 0 };
  for (let i = 0; i < SECONDS / DT; i++) {
    if (!a.order) w.setOrder(a, { type: 'attack', targetId: t.id });
    if (t.order) w.setOrder(t, null);
    for (const ev of w.step()) {
      if (ev.type === 'hit' && ev.sourceId === a.id && ev.targetId === t.id && !ev.skillId) {
        out.attacks++;
        out.hits++;
        if (ev.crit) out.crits++;
        out.damage += ev.damage;
      } else if (ev.type === 'miss' && ev.sourceId === a.id && ev.targetId === t.id && !ev.skillId) out.attacks++;
    }
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const lines: string[] = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

log(`# 英雄的預期命中率與傷害（npm run herostats，每組站樁 ${SECONDS} 秒${HIT_BASE !== null ? `，基礎命中 ${HIT_BASE}%` : ''}）`);
log('');
log('- 只算普攻，不放技能；英雄只算等級成長，不算升級、裝備；職業被動照起始等級（遊俠沒有穿透、牧師沒有聖鎚）。');
log('- 敵人數值取自真的遠征戰鬥（全程深度強度、前期生命對齊、一般敵人生命減半都算進去）。');
log('- 「擊倒」＝打倒一名那種敵人（真實生命）平均要幾秒；「撐」＝那種敵人單挑英雄，英雄（滿血）撐幾秒。');
for (const P of POINTS) {
  const enemies = enemiesAt(P.chapter, P.layer);
  log('');
  log(`## 第 ${P.chapter + 1} 章「${CHAPTERS[P.chapter].name}」第 ${P.layer} 層（英雄 ${P.level} 級）`);
  log('');
  log('| 英雄 | 敵人（生命） | 英雄命中 | 爆擊 | 每下傷害 | 每秒傷害 | 擊倒 | 敵人命中 | 敵人每秒傷害 | 撐 |');
  log('|---|---|---|---|---|---|---|---|---|---|');
  const agg = { hit: 0, dps: 0, kill: 0, ehit: 0, edps: 0, hold: 0, n: 0 };
  for (const cls of HERO_CLASSES) {
    const hs = heroSpawn(cls, P.level, { x: 10, y: 6 });
    for (const e of enemies) {
      const es: UnitSpawn = { defId: e.id, def: e, pos: { x: 10.9 + e.radius, y: 6 } };
      const h = duel(hs, es, true);
      const back = duel(es, { ...hs, pos: { x: 10, y: 6 } }, false);
      const dps = h.damage / SECONDS;
      const edps = back.damage / SECONDS;
      const heroHp = hs.def!.maxHp;
      agg.n++;
      agg.hit += h.hits / Math.max(1, h.attacks);
      agg.dps += dps;
      agg.kill += dps > 0 ? e.maxHp / dps : 0;
      agg.ehit += back.hits / Math.max(1, back.attacks);
      agg.edps += edps;
      agg.hold += edps > 0 ? Math.min(600, heroHp / edps) : 600;
      log(
        `| ${NAME[cls]} | ${e.name}（${e.maxHp}） | ${pct(h.hits / Math.max(1, h.attacks))} | ${pct(h.crits / Math.max(1, h.hits))} | ${(h.damage / Math.max(1, h.hits)).toFixed(1)} | ${dps.toFixed(1)} | ${dps > 0 ? (e.maxHp / dps).toFixed(1) + ' 秒' : '—'} | ${pct(back.hits / Math.max(1, back.attacks))} | ${edps.toFixed(1)} | ${edps > 0 ? (heroHp / edps).toFixed(0) + ' 秒' : '—'} |`,
      );
    }
  }
  const n = Math.max(1, agg.n);
  log('');
  log(`平均：英雄命中 ${pct(agg.hit / n)}、英雄每秒傷害 ${(agg.dps / n).toFixed(1)}、擊倒 ${(agg.kill / n).toFixed(1)} 秒；敵人命中 ${pct(agg.ehit / n)}、敵人每秒傷害 ${(agg.edps / n).toFixed(1)}、英雄撐 ${(agg.hold / n).toFixed(0)} 秒（最多算 600）`);
  console.error(`SUMMARY ch${P.chapter + 1} hit ${pct(agg.hit / n)} dps ${(agg.dps / n).toFixed(2)} kill ${(agg.kill / n).toFixed(1)} | ehit ${pct(agg.ehit / n)} edps ${(agg.edps / n).toFixed(2)} hold ${(agg.hold / n).toFixed(0)}`);
}
if (arg('out')) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(arg('out')!, lines.join('\n') + '\n');
}

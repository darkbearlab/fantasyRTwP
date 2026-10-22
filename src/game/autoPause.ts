/**
 * 自動暫停（Alan：設定選單可以勾選哪些情況自動暫停）。規則全部掛在 BattleHooks 上。
 * 「戰鬥開始」在戰鬥場景建立時處理（那時還沒有事件）。
 */
import { tr } from '../i18n';
import type { AutoPauseConfig } from '../config';
import { enemyRank } from '../sim/data/enemies';
import { SKILLS } from '../sim/data/skills';
import type { BattleSession } from './session';

/** 設定選單的選項（順序即顯示順序） */
export const AUTO_PAUSE_OPTIONS: { key: Exclude<keyof AutoPauseConfig, 'heroLowHpThreshold'>; label: string; hint?: string }[] = [
  { key: 'battleStart', label: tr("戰鬥開始") },
  { key: 'squadSighted', label: tr("發現新的一隊敵人"), hint: tr("一隊敵人第一次出現在視野內") },
  { key: 'eliteSkill', label: tr("精英、頭目準備技能") },
  { key: 'enemyAoeWindup', label: tr("敵人準備有預兆的技能"), hint: tr("衝鋒、跳躍、鉤鎖、範圍法術等") },
  { key: 'skillAim', label: tr("按下技能準備瞄準時") },
  { key: 'heroLowHp', label: tr("英雄生命偏低") },
  { key: 'heroDeath', label: tr("英雄陣亡") },
];

/** 生命偏低的門檻選項 */
export const LOW_HP_THRESHOLDS = [0.2, 0.3, 0.4, 0.5];

/** 開場就看得到的敵人不算「發現」（戰鬥開始已經暫停過） */
const SIGHTED_GRACE_SEC = 0.5;

/** 把自動暫停規則掛到這場戰鬥的鉤子上 */
export function installAutoPause(s: BattleSession): void {
  const w = s.world;
  const pause = (reason: string) => {
    if (!w.result) s.setPaused(true, reason);
  };
  s.hooks.on('simEvent', (ev) => {
    const cfg = s.autoPause;
    switch (ev.type) {
      case 'hit': {
        const t = w.getUnit(ev.targetId);
        if (!t || t.team !== 'hero' || t.dead || !cfg.heroLowHp) break;
        if (t.hp / t.maxHp < cfg.heroLowHpThreshold && !s.lowHpWarned.has(t.id)) {
          s.lowHpWarned.add(t.id);
          pause(tr("{0}生命低於 {1}%", { 0: s.label(t.id), 1: Math.round(cfg.heroLowHpThreshold * 100) }));
        }
        break;
      }
      case 'heal': {
        const t = w.getUnit(ev.targetId);
        if (t && t.hp / t.maxHp >= cfg.heroLowHpThreshold) s.lowHpWarned.delete(t.id);
        break;
      }
      case 'death': {
        const u = w.getUnit(ev.unitId);
        if (u?.team === 'hero' && cfg.heroDeath) pause(tr("{0}陣亡", { 0: s.label(u.id) }));
        break;
      }
      case 'actionStart': {
        if (!ev.skillId) break;
        const u = w.getUnit(ev.unitId);
        if (!u || u.team !== 'enemy') break;
        const def = SKILLS[ev.skillId];
        if (cfg.eliteSkill && enemyRank(u.def) !== 'normal') pause(tr("{0}準備「{1}」", { 0: s.label(u.id), 1: def.name }));
        else if (cfg.enemyAoeWindup && def.telegraph) pause(tr("{0}準備「{1}」", { 0: s.label(u.id), 1: def.name }));
        break;
      }
      case 'squadSighted':
        if (cfg.squadSighted && w.time > SIGHTED_GRACE_SEC) pause(tr("發現敵人"));
        break;
      default:
        break;
    }
  });
  s.hooks.on('skillAim', ({ unitId, skillId }) => {
    if (s.autoPause.skillAim && !s.paused) pause(tr("{0}瞄準「{1}」", { 0: s.label(unitId), 1: SKILLS[skillId].name }));
  });
}

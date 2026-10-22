/**
 * 介面語言（Alan 2026-10-22：介面＋遊戲內容翻成英文，可以切換中文／English，預設英文；故事文字維持中文）。
 * 純 TS（不碰 Phaser），sim／run 層也能用。
 * - tr(中文, 變數)：以中文原文為鍵查英文（EN_TEXT）；變數寫成 {name}。查不到就用中文。
 * - applyDataLanguage()：開機時把資料表的名稱、說明換成目前語言（技能、職業、敵人、道具、升級…）。
 * - 語言存在瀏覽器（fantasyRTwP.lang）；切換後重新載入頁面。沒有瀏覽器時（測試）用中文，測試不受影響。
 */
import { CLASSES, LINES } from '../sim/data/classes';
import { MAPS } from '../sim/data/maps';
import { CONSUMABLES } from '../sim/data/consumables';
import { ATTRIBUTES } from '../sim/data/damageTypes';
import { ENEMIES } from '../sim/data/enemies';
import { HEROES } from '../sim/data/heroes';
import { ITEMS } from '../sim/data/items';
import { PASSIVES } from '../sim/data/passives';
import { SKILLS } from '../sim/data/skills';
import { BRANCHES } from '../run/data/branches';
import { CHAPTERS } from '../run/data/chapters';
import { ENCOUNTERS } from '../run/data/encounters';
import { FACTIONS } from '../run/data/factions';
import { UPGRADES } from '../run/data/upgrades';
import { NODE_LABEL } from '../run/mapGen';
import { getLang } from './lang';
export { getLang, listSep, setLang, tr, useLang } from './lang';
export type { Lang } from './lang';
import { EN_ATTRIBUTES, EN_BRANCHES, EN_CHAPTERS, EN_CLASS_ROLES, EN_CONSUMABLES, EN_ENCOUNTERS, EN_ENEMIES, EN_FACTIONS, EN_HEROES, EN_ITEMS, EN_LINES, EN_MAPS, EN_NODES, EN_PASSIVES, EN_SKILLS, EN_UPGRADES } from './enData';

let applied = false;

/** 開機時把資料表的名稱、說明換成目前語言（只做一次；中文就不動） */
export function applyDataLanguage(): void {
  if (applied || getLang() === 'zh') return;
  applied = true;
  const nd = (table: Record<string, { name: string; description?: string }>, en: Record<string, [string, string?]>) => {
    for (const [id, [name, desc]] of Object.entries(en)) {
      const t = table[id];
      if (!t) continue;
      t.name = name;
      if (desc !== undefined && 'description' in t) t.description = desc;
    }
  };
  nd(SKILLS as never, EN_SKILLS);
  nd(PASSIVES as never, EN_PASSIVES);
  nd(UPGRADES as never, EN_UPGRADES);
  nd(CONSUMABLES as never, EN_CONSUMABLES);
  for (const [id, [name, desc]] of Object.entries(EN_ITEMS)) {
    const it = ITEMS[id];
    if (!it) continue;
    it.name = name;
    it.passive.name = name;
    if (desc) it.passive.description = desc;
  }
  for (const [id, name] of Object.entries(EN_HEROES)) if (HEROES[id]) HEROES[id].name = name;
  for (const [id, name] of Object.entries(EN_ENEMIES)) if (ENEMIES[id]) ENEMIES[id].name = name;
  for (const [id, role] of Object.entries(EN_CLASS_ROLES)) if (CLASSES[id]) CLASSES[id].role = role;
  for (const [id, l] of Object.entries(LINES)) if (EN_LINES[id]) l.name = EN_LINES[id];
  for (const [id, e] of Object.entries(ENCOUNTERS)) if (EN_ENCOUNTERS[id]) e.name = EN_ENCOUNTERS[id];
  for (const [id, m] of Object.entries(MAPS)) if (EN_MAPS[id]) m.name = EN_MAPS[id];
  for (const list of Object.values(BRANCHES)) for (const b of list) if (EN_BRANCHES[b.id]) b.name = EN_BRANCHES[b.id];
  for (const c of CHAPTERS) if (EN_CHAPTERS[c.id]) c.name = EN_CHAPTERS[c.id];
  for (const [id, f] of Object.entries(FACTIONS)) if (EN_FACTIONS[id]) f.name = EN_FACTIONS[id];
  for (const [k, v] of Object.entries(EN_NODES)) (NODE_LABEL as Record<string, string>)[k] = v;
  for (const [k, v] of Object.entries(EN_ATTRIBUTES)) (ATTRIBUTES as Record<string, string>)[k] = v;
}

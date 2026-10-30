/**
 * 具名角色的規則（SPEC_CHARACTERS §3）：可以登場的角色、英雄的顯示名稱。純函式。
 */
import { TOTEM_CLASSES } from '../sim/data/totems';
import type { TotemVariant } from '../sim/data/totems';
import { cloneRun } from './runState';
import { getLang } from '../i18n/lang';
import { HEROES } from '../sim/data/heroes';
import type { CharacterDef } from './data/characters';
import { CHARACTER_ORDER, CHARACTERS } from './data/characters';
import type { HeroRecord, RunState } from './runState';

/** 目前可以登場的角色：骨架職業已經做好的（芬恩、阿許卡、杜爾根要等 B 階段） */
export function availableCharacters(): string[] {
  return CHARACTER_ORDER.filter((id) => !!HEROES[CHARACTERS[id].baseClass]);
}

export const characterName = (c: CharacterDef): string => (getLang() === 'en' ? c.enName : c.name);
export const characterTitle = (c: CharacterDef): string => (getLang() === 'en' ? c.enTitle : c.title);

/** 英雄的短名稱：角色名；沒有角色（舊存檔、舊模式）就是職業名 */
export function heroShortName(h: Pick<HeroRecord, 'classId' | 'characterId'>): string {
  const c = h.characterId ? CHARACTERS[h.characterId] : undefined;
  return c ? characterName(c) : HEROES[h.classId].name;
}

/** 英雄的完整名稱：「角色名・職業名」；沒有角色就是職業名 */
export function heroName(h: Pick<HeroRecord, 'classId' | 'characterId'>): string {
  const c = h.characterId ? CHARACTERS[h.characterId] : undefined;
  return c ? `${characterName(c)}・${HEROES[h.classId].name}` : HEROES[h.classId].name;
}

/** 這趟遠征還沒登場的角色（不在隊上、陣亡的也算登場過、解救時遇過的也算） */
export function unmetCharacters(run: RunState): string[] {
  const met = new Set([...run.party.flatMap((h) => (h?.characterId ? [h.characterId] : [])), ...(run.metCharacters ?? [])]);
  return availableCharacters().filter((id) => !met.has(id));
}

/** 圖騰的種類（杜爾根，SPEC_CHARACTERS §4.3）：整備時選，進戰鬥固定 */
export function setTotemVariant(run: RunState, slot: number, variant: TotemVariant): RunState {
  const h = run.party[slot];
  if (!h || h.dead || !TOTEM_CLASSES[h.classId]) throw new Error('這名英雄不用圖騰');
  const r = cloneRun(run);
  r.party[slot]!.totemVariant = variant;
  return r;
}

/** 介面英文化（Alan 2026-10-22）：每個 tr() 的鍵都有英文、資料表都換成英文 */
import { readFileSync, globSync } from 'node:fs';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { applyDataLanguage, tr, useLang } from '../src/i18n';
import { EN_TEXT } from '../src/i18n/enText';
import { EN_CONSUMABLES, EN_ENCOUNTERS, EN_LINES, EN_MAPS, EN_ENEMIES, EN_HEROES, EN_ITEMS, EN_PASSIVES, EN_SKILLS, EN_UPGRADES } from '../src/i18n/enData';
import { SKILLS } from '../src/sim/data/skills';
import { HEROES } from '../src/sim/data/heroes';
import { ENEMIES } from '../src/sim/data/enemies';
import { PASSIVES } from '../src/sim/data/passives';
import { ITEMS } from '../src/sim/data/items';
import { CONSUMABLES } from '../src/sim/data/consumables';
import { UPGRADES } from '../src/run/data/upgrades';
import { ENCOUNTERS } from '../src/run/data/encounters';
import { MAPS } from '../src/sim/data/maps';
import { LINES } from '../src/sim/data/classes';

const CJK = /[一-鿿　-〿＀-￯]/;

function sourceKeys(): string[] {
  const keys = new Set<string>();
  for (const f of globSync('src/**/*.ts')) {
    const sf = ts.createSourceFile(f, readFileSync(f, 'utf-8'), ts.ScriptTarget.Latest, true);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr') {
        const a = n.arguments[0];
        if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) keys.add(a.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return [...keys].filter((k) => CJK.test(k));
}

describe('英文化', () => {
  afterAll(() => useLang('zh'));

  it('每個 tr() 的中文鍵都有英文，變數一致、英文裡沒有中文', () => {
    const keys = sourceKeys();
    expect(keys.length).toBeGreaterThan(400);
    expect(keys.filter((k) => !(k in EN_TEXT))).toEqual([]);
    for (const k of keys) {
      const vars = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
      expect(vars(EN_TEXT[k]), k).toBe(vars(k));
      expect(/[一-鿿]/.test(EN_TEXT[k]), k).toBe(false);
    }
  });

  it('沒有被 tr() 用到的英文（避免殘留）', () => {
    const keys = new Set(sourceKeys());
    expect(Object.keys(EN_TEXT).filter((k) => !keys.has(k))).toEqual([]);
  });

  it('tr 在中文時原樣、英文時查表並填變數', () => {
    useLang('zh');
    expect(tr('第 {0} 層', { 0: 3 })).toBe('第 3 層');
    useLang('en');
    expect(tr('第 {0} 層', { 0: 3 })).toBe('Layer 3');
    expect(tr('沒有這個鍵')).toBe('沒有這個鍵');
  });

  it('資料表的 id 都存在、而且全部有英文', () => {
    const pairs: [Record<string, unknown>, Record<string, unknown>, string][] = [
      [SKILLS, EN_SKILLS, 'skills'],
      [HEROES, EN_HEROES, 'heroes'],
      [ENEMIES, EN_ENEMIES, 'enemies'],
      [PASSIVES, EN_PASSIVES, 'passives'],
      [ITEMS, EN_ITEMS, 'items'],
      [CONSUMABLES, EN_CONSUMABLES, 'consumables'],
      [UPGRADES, EN_UPGRADES, 'upgrades'],
      [ENCOUNTERS, EN_ENCOUNTERS, 'encounters'],
      [MAPS, EN_MAPS, 'maps'],
      [LINES, EN_LINES, 'lines'],
    ];
    for (const [table, en, name] of pairs) {
      expect(Object.keys(en).filter((id) => !(id in table)), name).toEqual([]);
      expect(Object.keys(table).filter((id) => !(id in en)), name).toEqual([]);
    }
  });

  it('applyDataLanguage 把名稱、說明換成英文', () => {
    useLang('en');
    applyDataLanguage();
    const zh = (s: string) => /[一-鿿]/.test(s);
    for (const t of [SKILLS, PASSIVES, UPGRADES, CONSUMABLES] as Record<string, { name: string; description?: string }>[]) {
      for (const [id, v] of Object.entries(t)) {
        expect(zh(v.name), id).toBe(false);
        if (v.description) expect(zh(v.description), id).toBe(false);
      }
    }
    for (const t of [HEROES, ENEMIES, ITEMS, ENCOUNTERS, MAPS, LINES] as Record<string, { name: string }>[]) for (const [id, v] of Object.entries(t)) expect(zh(v.name), id).toBe(false);
  });
});

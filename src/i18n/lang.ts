/**
 * 介面語言的核心（Alan 2026-10-22）：語言狀態與 tr()。不 import 任何資料模組，sim／run 層也能用（避免循環 import）。
 * - tr(中文, 變數)：以中文原文為鍵查英文（EN_TEXT）；變數寫成 {name}。查不到就用中文。
 * - 語言存在瀏覽器（fantasyRTwP.lang）；沒有瀏覽器時（測試）用中文。
 */
import { EN_TEXT } from './enText';

export type Lang = 'en' | 'zh';
const KEY = 'fantasyRTwP.lang';

function load(): Lang {
  try {
    if (typeof localStorage === 'undefined') return 'zh';
    const v = localStorage.getItem(KEY);
    return v === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

let lang: Lang = load();

export function getLang(): Lang {
  return lang;
}

/** 切換語言（存起來；畫面要重新載入才會全部換掉） */
export function setLang(l: Lang): void {
  lang = l;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, l);
  } catch {
    // 存不了就只在這次有效
  }
}

/** 測試用：直接指定語言，不存 */
export function useLang(l: Lang): void {
  lang = l;
}

function fill(s: string, vars?: Record<string, unknown>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** 翻譯：以中文原文為鍵；變數寫成 {name} */
export function tr(zh: string, vars?: Record<string, unknown>): string {
  if (lang === 'zh') return fill(zh, vars);
  return fill(EN_TEXT[zh] ?? zh, vars);
}

/** 中文和英文之間的分隔（中文：頓號；英文：逗號） */
export function listSep(): string {
  return lang === 'zh' ? '、' : ', ';
}


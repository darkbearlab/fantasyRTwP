/** 語言切換（Alan 2026-10-22）：English／中文 兩顆按鈕，切換後重新載入頁面（資料表在開機時換語言） */
import { getLang, setLang } from '../../i18n';
import type { Lang } from '../../i18n';
import { button, el } from './dom';

export function languageRow(): HTMLElement {
  const row = el('div', 'lang-row');
  const opts: [Lang, string][] = [['en', 'English'], ['zh', '中文']];
  for (const [l, label] of opts) {
    const b = button(label, 'small' + (getLang() === l ? ' primary' : ''), () => {
      if (getLang() === l) return;
      setLang(l);
      window.location.reload();
    });
    row.appendChild(b);
  }
  return row;
}

/** DOM UI 小工具（畫面層專用） */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** 不讓按鈕搶走鍵盤焦點（避免空白鍵觸發按鈕） */
export function noFocus(e: HTMLElement): void {
  e.addEventListener('mousedown', (ev) => ev.preventDefault());
}

export function button(text: string, cls: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', `btn ${cls}`.trim(), text);
  b.tabIndex = -1;
  b.disabled = disabled;
  noFocus(b);
  b.addEventListener('click', () => {
    if (!b.disabled) onClick();
  });
  return b;
}

export function uiRoot(): HTMLElement {
  return document.getElementById('ui')!;
}

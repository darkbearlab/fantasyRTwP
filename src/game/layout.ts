/**
 * 電腦版的直式中欄（Alan 2026-10-23）：橫寬螢幕時，遊戲畫面放在中間、和手機直拿一樣的比例與視野；
 * 左上常開章節路線圖、右下放戰鬥紀錄，其餘鋪底圖（像斑鳩電腦版左右的梵文底圖）。
 * 這樣手機和電腦看到的範圍一樣大，體驗幾乎一致。設定裡可以切回整個螢幕的橫式版面。
 */
const KEY = 'fantasyRTwP.layout';

export type LayoutPref = 'column' | 'wide';

export const COLUMN = {
  /** 中欄的邏輯大小：9 : 19.5（手機直拿的比例；Alan 2026-10-23） */
  width: 462,
  height: 1000,
  /** 螢幕寬高比至少這麼寬才用中欄（再窄就直接用原本的版面） */
  minAspect: 1.05,
};

export function getLayoutPref(): LayoutPref {
  try {
    return localStorage.getItem(KEY) === 'wide' ? 'wide' : 'column';
  } catch {
    return 'column';
  }
}

export function setLayoutPref(p: LayoutPref): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // 存不了就只在這次有效
  }
  window.dispatchEvent(new Event('resize'));
}

/** 目前是不是中欄版面 */
export function isColumnLayout(): boolean {
  return document.body.classList.contains('column');
}

/** 中欄版面時左右兩側的內容容器（已經縮放成和遊戲畫面一樣的倍率）；不是中欄時回傳 null */
export function sidePanel(which: 'left' | 'right'): HTMLElement | null {
  if (!isColumnLayout()) return null;
  return document.querySelector<HTMLElement>(`#side-${which} .side-inner`);
}

/** 兩側的底圖：用城堡牆面圖塊壓暗、放大鋪滿；沒有授權素材時用 CSS 的格紋 */
export function loadSidePattern(): void {
  const img = new Image();
  img.onload = () => {
    const T = 16;
    const c = document.createElement('canvas');
    c.width = T * 4;
    c.height = T * 2;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    // tileA5_castle_int：牆面（57、58、59）交錯排兩列
    const tiles = [
      [57, 58, 59, 58],
      [59, 57, 58, 57],
    ];
    const cols = img.width / T;
    tiles.forEach((row, r) => row.forEach((i, q) => ctx.drawImage(img, (i % cols) * T, Math.floor(i / cols) * T, T, T, q * T, r * T, T, T)));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, c.width, c.height);
    document.documentElement.style.setProperty('--side-pattern', `url(${c.toDataURL()})`);
  };
  img.src = 'assets/licensed/fbb/castle/tilesets/tileA5_castle_int.png';
}

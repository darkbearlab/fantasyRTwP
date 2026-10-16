/** 占位美術配色 */
export const COLORS = {
  floor: 0x2a2e35,
  floorGrid: 0x323741,
  obstacle: 0x5a606b,
  obstacleEdge: 0x7a818d,
  heroZone: 0x2e4a7a,
  enemyZone: 0x6a2a2a,
  hpHero: 0x4cd964,
  hpEnemy: 0xe74c3c,
  hpBack: 0x111111,
  windup: 0xf5d142,
  recovery: 0x9aa0a6,
  selection: 0xffffff,
  zocHero: 0x5fa8ff,
  zocEnemy: 0xff6b6b,
  ghostMove: 0x4cd964,
  ghostAttack: 0xff4d4d,
  ghostSkill: 0xc77dff,
  ghostFollow: 0x7fd1ff,
  telegraph: 0xff2a2a,
  targeting: 0xc77dff,
};

export const PROJECTILE_STYLE: Record<string, { color: number; size: number }> = {
  arrow: { color: 0xe8d5a3, size: 2.5 },
  bolt: { color: 0xd7b5ff, size: 3.5 },
  fireball: { color: 0xff8c1a, size: 7 },
  missile: { color: 0x7af0ff, size: 4 },
  frost: { color: 0xbfe9ff, size: 4.5 },
};

export const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';

/** 把 0xRRGGBB 變暗 */
export function darken(c: number, f: number): number {
  const r = Math.floor(((c >> 16) & 0xff) * f);
  const g = Math.floor(((c >> 8) & 0xff) * f);
  const b = Math.floor((c & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

/**
 * props3d 地形物件的擺放計畫（純函式，不碰 Phaser，方便測試）：
 * 依地圖資料決定哪些障礙物、矮籬、草叢要畫成哪個物件、放在哪、縮放多少。
 * 只決定「外觀」；格子、碰撞、規則仍由 sim 的地圖資料決定（SPEC_SLICE3 §2）。
 */
import type { MapDef, Rect } from '../../sim/data/types';
import index from '../../../public/assets/props3d/index.json';
import art from './props3dArt.json';

export interface PropMeta {
  w: number;
  h: number;
  origin: number[];
  size_m: number[];
}

type Pools = Record<'small' | 'medium' | 'large', string[]>;

export interface Props3dArt {
  groundScale: number;
  props: Record<string, { scale: number; fitMin?: number; fitMax?: number }>;
  obstacle: {
    maxSize: number;
    maxAspect: number;
    smallMax: number;
    mediumMax: number;
    fitMul: number;
    fitMin: number;
    fitMax: number;
    pools: Pools;
    mapPools: Record<string, Pools>;
    skipMaps: string[];
  };
  hedge: { prop: string; rows: number; rowGap: number };
  brush: { prop: string; size: number; spacing: number };
}

export const PROPS3D = art as unknown as Props3dArt;
export const PROP_META = (index as unknown as { props: Record<string, PropMeta> }).props;

export interface PropPlacement {
  prop: string;
  /** 地面原點對齊的世界座標（公尺） */
  x: number;
  y: number;
  /** 相對於素材實際尺寸的縮放（1 = 原尺寸；畫面縮放再乘 groundScale） */
  scale: number;
  /** 物件高度（公尺，遮擋判定用） */
  height: number;
  kind: 'obstacle' | 'hedge' | 'brush';
  /** 長條物件（倒木）沿著哪個世界軸 */
  axis?: 'x' | 'y';
  /** 障礙物在 map.obstacles 的索引 */
  obstacle?: number;
}

/** 決定論的雜湊（同一張地圖每次都一樣） */
function hash(a: number, b: number, c: number): number {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

function mapSeed(id: string): number {
  let s = 7;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) | 0;
  return s;
}

const propScale = (id: string) => PROPS3D.props[id]?.scale ?? 1;

/** 這個障礙物要不要換成物件（長條的牆、懸崖、深水、柱子地圖維持方塊） */
export function obstacleUsesProp(map: MapDef, r: Rect): boolean {
  const O = PROPS3D.obstacle;
  if (r.style === 'cliff' || r.blocksSight === false) return false;
  if (O.skipMaps.includes(map.id)) return false;
  const big = Math.max(r.w, r.h);
  const small = Math.min(r.w, r.h);
  return big <= O.maxSize && big / Math.max(small, 1e-6) <= O.maxAspect;
}

export function planProps(map: MapDef): PropPlacement[] {
  const out: PropPlacement[] = [];
  const seed = mapSeed(map.id);
  const O = PROPS3D.obstacle;
  const pools = O.mapPools[map.id] ?? (map.theme ? O.mapPools[map.theme] : undefined) ?? O.pools;
  map.obstacles.forEach((r, i) => {
    if (!obstacleUsesProp(map, r)) return;
    const big = Math.max(r.w, r.h);
    const pool = big <= O.smallMax ? pools.small : big <= O.mediumMax ? pools.medium : pools.large;
    const prop = pool[hash(i, seed, 1) % pool.length];
    const m = PROP_META[prop];
    // 依面積把物件縮放到大致蓋住障礙物
    const pc = PROPS3D.props[prop] ?? {};
    const fit = Math.min(pc.fitMax ?? O.fitMax, Math.max(pc.fitMin ?? O.fitMin, Math.sqrt((r.w * r.h) / (m.size_m[0] * m.size_m[1])) * O.fitMul));
    const scale = fit * propScale(prop);
    out.push({ prop, x: r.x + r.w / 2, y: r.y + r.h / 2, scale, height: m.size_m[2] * scale, kind: 'obstacle', obstacle: i });
  });
  for (const t of map.terrain ?? []) {
    if (t.kind === 'hedge') {
      // 矮籬：沿長軸排倒木，素材偏細所以疊兩排
      const H = PROPS3D.hedge;
      const m = PROP_META[H.prop];
      const axis: 'x' | 'y' = t.w >= t.h ? 'x' : 'y';
      const len = Math.max(t.w, t.h);
      const segLen = m.size_m[0] * propScale(H.prop);
      const n = Math.max(1, Math.round(len / segLen));
      const scale = len / n / m.size_m[0];
      for (let k = 0; k < n; k++) {
        for (let row = 0; row < H.rows; row++) {
          const off = (row - (H.rows - 1) / 2) * H.rowGap;
          const along = (k + 0.5) * (len / n);
          const x = axis === 'x' ? t.x + along : t.x + t.w / 2 + off;
          const y = axis === 'x' ? t.y + t.h / 2 + off : t.y + along;
          out.push({ prop: H.prop, x, y, scale, height: m.size_m[2] * scale, kind: 'hedge', axis });
        }
      }
    } else if (t.kind === 'brush') {
      // 草叢：在範圍內以固定間隔放灌木，帶一點決定論的偏移
      const B = PROPS3D.brush;
      const m = PROP_META[B.prop];
      const nx = Math.max(1, Math.round(t.w / B.spacing));
      const ny = Math.max(1, Math.round(t.h / B.spacing));
      const scale = (B.size / Math.max(m.size_m[0], m.size_m[1])) * propScale(B.prop);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const hx = hash(Math.round(t.x * 10) + i, Math.round(t.y * 10) + j, seed);
          const jx = ((hx % 1000) / 1000 - 0.5) * 0.4 * (t.w / nx);
          const jy = (((hx >>> 10) % 1000) / 1000 - 0.5) * 0.4 * (t.h / ny);
          out.push({ prop: B.prop, x: t.x + ((i + 0.5) * t.w) / nx + jx, y: t.y + ((j + 0.5) * t.h) / ny + jy, scale, height: m.size_m[2] * scale, kind: 'brush' });
        }
      }
    }
  }
  return out;
}

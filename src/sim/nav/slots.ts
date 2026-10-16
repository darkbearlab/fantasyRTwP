import type { Vec } from '../math';

export const SLOT_COUNT = 8;
/** 站位距離 = 雙方半徑和 + 此值 */
export const SLOT_GAP = 0.1;

/** 目標周圍 8 個近戰站位（固定角度） */
export function slotPositions(target: Vec, targetRadius: number, attackerRadius: number): Vec[] {
  const r = targetRadius + attackerRadius + SLOT_GAP;
  const out: Vec[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const a = (i / SLOT_COUNT) * Math.PI * 2;
    out.push({ x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r });
  }
  return out;
}

/** 近戰站位分配：每個攻擊者在一個目標上最多佔一個站位 */
export class SlotManager {
  /** targetId → 每個站位的佔用者（unitId 或 -1） */
  private claims = new Map<number, number[]>();
  /** attackerId → [targetId, slotIndex] */
  private byAttacker = new Map<number, [number, number]>();

  /**
   * 為攻擊者取得目標的站位。已有站位就沿用；否則選最近的空站位（且可走）。
   * 全滿時回傳最近的可走站位（共用）。回傳站位索引與座標。
   */
  claim(
    targetId: number,
    target: Vec,
    targetRadius: number,
    attackerId: number,
    attacker: Vec,
    attackerRadius: number,
    walkable: (p: Vec) => boolean,
  ): { index: number; pos: Vec } {
    const positions = slotPositions(target, targetRadius, attackerRadius);
    const held = this.byAttacker.get(attackerId);
    if (held && held[0] === targetId && walkable(positions[held[1]])) {
      return { index: held[1], pos: positions[held[1]] };
    }
    this.release(attackerId);
    let arr = this.claims.get(targetId);
    if (!arr) {
      arr = new Array(SLOT_COUNT).fill(-1);
      this.claims.set(targetId, arr);
    }
    let best = -1;
    let bestD = Infinity;
    let fallback = -1;
    let fallbackD = Infinity;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const p = positions[i];
      if (!walkable(p)) continue;
      const d = (p.x - attacker.x) ** 2 + (p.y - attacker.y) ** 2;
      if (arr[i] === -1 && d < bestD) {
        bestD = d;
        best = i;
      }
      if (d < fallbackD) {
        fallbackD = d;
        fallback = i;
      }
    }
    if (best >= 0) {
      arr[best] = attackerId;
      this.byAttacker.set(attackerId, [targetId, best]);
      return { index: best, pos: positions[best] };
    }
    if (fallback >= 0) return { index: fallback, pos: positions[fallback] };
    return { index: -1, pos: target };
  }

  release(attackerId: number): void {
    const held = this.byAttacker.get(attackerId);
    if (!held) return;
    const arr = this.claims.get(held[0]);
    if (arr && arr[held[1]] === attackerId) arr[held[1]] = -1;
    this.byAttacker.delete(attackerId);
  }

  /** 目標死亡：清掉該目標的所有站位 */
  releaseTarget(targetId: number): void {
    const arr = this.claims.get(targetId);
    if (!arr) return;
    for (const a of arr) if (a !== -1) this.byAttacker.delete(a);
    this.claims.delete(targetId);
  }

  slotOf(attackerId: number): [number, number] | undefined {
    return this.byAttacker.get(attackerId);
  }

  /** 除錯面板用：目前所有佔用 */
  entries(): { targetId: number; slots: readonly number[] }[] {
    return [...this.claims.entries()].map(([targetId, slots]) => ({ targetId, slots }));
  }
}

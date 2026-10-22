/** 出生點不能在出口裡（Alan 2026-10-22 回報：第 3 章一開始英雄就站在回程出口裡，馬上被送回大地圖） */
import { describe, expect, it } from 'vitest';
import { fieldEncounter, indoorEncounter, townEncounter } from '../src/run/fbbLevel';
import type { GeneratedLevel } from '../src/run/levelGen';
import { tilePrefabs } from '../src/run/tilePrefabRegistry';

function spawnInExit(enc: GeneratedLevel): boolean {
  const m = enc.mapDef;
  return m.heroSpawns.some((s) => (m.exits ?? []).some((e) => s.x >= e.x - 0.5 && s.x <= e.x + e.w + 0.5 && s.y >= e.y - 0.5 && s.y <= e.y + e.h + 0.5));
}

describe('出生點不在出口裡', () => {
  // 從下面的節點來：入口在下緣，回程出口也在下緣
  const cases = [
    [{ id: 'node:1', edge: 'top' as const }, { id: 'node:0', edge: 'bottom' as const }],
    [{ id: 'node:1', edge: 'top' as const }, { id: 'node:0', edge: 'bottom' as const }, { id: 'node:2', edge: 'bottom' as const }],
    [{ id: 'node:1', edge: 'left' as const }, { id: 'node:0', edge: 'bottom' as const }, { id: 'node:2', edge: 'right' as const }],
  ];
  const base = { tier: 'battle' as const, layer: 3, entry: 'bottom' as const };
  it('室內（第 3～5 章）', () => {
    for (const theme of ['temple', 'cave', 'castle'] as const)
      for (const exits of cases) for (let seed = 1; seed <= 6; seed++) expect(spawnInExit(indoorEncounter(seed, { ...base, exits, theme })), `${theme} ${seed}`).toBe(false);
  });
  it('野外、城內', () => {
    for (const exits of cases)
      for (let seed = 1; seed <= 4; seed++) {
        expect(spawnInExit(fieldEncounter(seed, { ...base, exits })), `field ${seed}`).toBe(false);
        expect(spawnInExit(townEncounter(seed, { ...base, exits, prefabs: tilePrefabs() })), `town ${seed}`).toBe(false);
      }
  });
});

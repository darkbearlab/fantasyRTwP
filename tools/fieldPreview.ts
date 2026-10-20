/**
 * 野外戰鬥地圖的試產（交接文件 §9）：用幾個種子生成地圖，輸出 JSON（格號已經換算好），再呼叫 tools/field_render.py 畫成 PNG。
 *
 *   npx tsx tools/fieldPreview.ts --out <資料夾> --seeds 42,7,1234 --date 2026-10-21
 *
 * 需要私有素材（npm run assets:pull）與 Python（Pillow、numpy）。輸出的圖含授權素材，不要放進公開的地方。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateField } from '../src/run/fieldGen';
import type { FieldOptions } from '../src/run/fieldGen';
import { ANIM_OBJECTS, PREFAB_TILES, ROCK_SINGLES, WALL_TILES, wallKey } from '../src/game/render/fbbTiles';
import { PIXEL_UNITS, heroTeamColors } from '../src/game/render/pixelArtData';
import { HEROES } from '../src/sim/data/heroes';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const out = resolve(arg('out', join(ROOT, 'preview', 'field')));
const seeds = arg('seeds', '42,7,1234').split(',').map(Number);
const date = arg('date', new Date().toISOString().slice(0, 10));
mkdirSync(out, { recursive: true });

const opts: FieldOptions = {
  tier: 'battle',
  layer: 3,
  exits: [
    { id: 'n1', edge: 'top', label: 'battle' },
    { id: 'n2', edge: 'top', label: 'rest' },
    { id: 'n3', edge: 'left', label: 'shop' },
  ],
};
const party = ['warrior', 'ranger', 'mage', 'cleric'];

for (const seed of seeds) {
  const lv = generateField(seed, opts);
  const has = (x: number, y: number) => lv.walls.some(([a, b]) => a === x && b === y);
  const walls = lv.walls.map(([x, y]) => ({ x, y, tile: WALL_TILES[wallKey((dx, dy) => has(x + dx, y + dy))] }));
  const props = lv.props.map((p) => ({
    ...p,
    tiles: p.prefab === 'rock1' ? [[ROCK_SINGLES[p.variant ?? 0]]] : PREFAB_TILES[p.prefab],
    anim: ANIM_OBJECTS[p.prefab],
  }));
  const unit = (id: string, team: 'hero' | 'enemy', x: number, y: number, facing?: string) => {
    const a = PIXEL_UNITS[id];
    if (a?.kind !== 'mw') return { id, team, x, y, facing, m72: a?.kind === 'm72' ? a.idle : undefined };
    return { id, team, x, y, facing, sheet: a.path, recolor: a.recolor ? [a.recolor.dark, a.recolor.light] : undefined };
  };
  const units = [...party.map((id, i) => unit(id, 'hero', lv.heroSpawns[i].x, lv.heroSpawns[i].y)), ...lv.enemies.map((e) => unit(e.enemy, 'enemy', e.x, e.y, e.facing))];
  const data = { ...lv, walls, props, units, heroColors: Object.fromEntries(party.map((id) => [id, heroTeamColors(HEROES[id].color).light])) };
  const json = join(out, `_${date}_seed${seed}.json`);
  writeFileSync(json, JSON.stringify(data));
  for (const variant of ['flat', 'tall']) {
    for (const look of ['summer', 'fallDusk']) {
      const png = join(out, `${date}_seed${seed}_${look}_牆${variant === 'flat' ? '原尺寸' : '拉高'}.png`);
      execFileSync('python', [join(ROOT, 'tools', 'field_render.py'), json, png, variant, look, join(ROOT, 'public', 'assets')], { stdio: 'inherit' });
    }
  }
  console.log(`種子 ${seed}：牆 ${lv.walls.length} 格、物件 ${lv.props.length}、密林 ${lv.forest.length} 格、據點 ${lv.sites.map((s) => s.kind + ':' + s.facing).join(' ')}、敵人 ${lv.enemies.length}（${lv.enemies.map((e) => e.enemy).join(",")}）、區塊 ${lv.chunks.join(' ')}`);
}

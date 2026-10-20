/**
 * 城內戰鬥地圖的試產（首都突圍）：用幾個種子生成，輸出 JSON（格號已換算），再呼叫 tools/town_render.py 畫成夜晚燃燒的 PNG。
 *
 *   npx tsx tools/townPreview.ts --out <資料夾> --seeds 42,7,1234 --date 2026-10-21
 *
 * 需要私有素材（npm run assets:pull）與 Python（Pillow、numpy）。輸出的圖含授權素材，不要放進公開的地方。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTown } from '../src/run/townGen';
import { parseTilePrefab } from '../src/run/tilePrefab';
import { ANIM_OBJECTS, TOWN_TILES } from '../src/game/render/fbbTiles';
import { PIXEL_UNITS } from '../src/game/render/pixelArtData';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const out = resolve(arg('out', join(ROOT, 'preview', 'town')));
const seeds = arg('seeds', '42,7,1234').split(',').map(Number);
const date = arg('date', new Date().toISOString().slice(0, 10));
mkdirSync(out, { recursive: true });

const party = ['warrior', 'ranger', 'mage', 'cleric'];
// 手工預製件：資料夾裡的 JSON 全部讀進來（Alan 新增的放進去就會用到）
const PF_DIR = join(ROOT, 'src', 'run', 'data', 'tilePrefabs');
const prefabs = readdirSync(PF_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseTilePrefab(f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(PF_DIR, f), 'utf-8'))));
const prefabDraw = Object.fromEntries(
  prefabs.map((p) => [p.id, { w: p.w, h: p.h, sheetCols: p.sheetCols, ground: p.ground.map((r) => r.map((c) => c?.tile ?? null)), objects: p.objects.map((r) => r.map((c) => c?.tile ?? null)) }]),
);
for (const seed of seeds) {
  const lv = generateTown(seed, {
    tier: 'battle',
    layer: 3,
    exits: [
      { id: 'n1', edge: 'top' },
      { id: 'n2', edge: 'top' },
      { id: 'n3', edge: 'right' },
    ],
    prefabs,
  });
  const unit = (id: string, team: 'hero' | 'enemy', x: number, y: number, facing?: string) => {
    const a = PIXEL_UNITS[id];
    if (a?.kind !== 'mw') return { id, team, x, y, facing, m72: a?.kind === 'm72' ? a.idle : undefined };
    return { id, team, x, y, facing, sheet: a.path, recolor: a.recolor ? [a.recolor.dark, a.recolor.light] : undefined };
  };
  const units = [...party.map((id, i) => unit(id, 'hero', lv.heroSpawns[i].x, lv.heroSpawns[i].y)), ...lv.enemies.map((e) => unit(e.enemy, 'enemy', e.x, e.y, e.facing))];
  const anim = (k: string) => ANIM_OBJECTS[k].index;
  const data = {
    ...lv,
    prefabs: prefabDraw,
    tiles: { ...TOWN_TILES, houseFire: anim(TOWN_TILES.houseFire), groundFire: anim(TOWN_TILES.groundFire), smoke: anim(TOWN_TILES.smoke) },
    units,
  };
  const json = join(out, `_${date}_town_seed${seed}.json`);
  writeFileSync(json, JSON.stringify(data));
  execFileSync('python', [join(ROOT, 'tools', 'town_render.py'), json, join(out, `${date}_城內_seed${seed}.png`), join(ROOT, 'public', 'assets')], { stdio: 'inherit' });
  const burning = lv.houses.filter((h) => h.burning).length;
  console.log(`種子 ${seed}：房子 ${lv.houses.length}（預製件 ${lv.houses.filter((h) => h.prefab).length}、燃燒 ${burning}）、敵人 ${lv.enemies.length}（${lv.enemies.map((e) => e.enemy).join(',')}）`);
}

/**
 * 第 3～5 章室內地圖的試產（交接文件 §9）：用幾個種子生成地圖，輸出 JSON，再呼叫 tools/indoor_render.py 畫成 PNG。
 *
 *   npx tsx tools/indoorPreview.ts --out <資料夾> --seeds 42,7,1234 --date 2026-10-22
 *
 * 需要私有素材（npm run assets:pull）與 Python（Pillow、numpy）。輸出的圖含授權素材，不要放進公開的地方。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateIndoor } from '../src/run/indoorGen';
import type { IndoorTheme } from '../src/run/indoorGen';
import { PIXEL_UNITS, heroTeamColors } from '../src/game/render/pixelArtData';
import { HEROES } from '../src/sim/data/heroes';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const out = resolve(arg('out', join(ROOT, 'preview', 'indoor')));
const seeds = arg('seeds', '42,7,1234').split(',').map(Number);
const themes = arg('themes', 'temple,cave,castle').split(',') as IndoorTheme[];
const date = arg('date', new Date().toISOString().slice(0, 10));
mkdirSync(out, { recursive: true });

const NAMES: Record<IndoorTheme, string> = { temple: '第3章試煉地城', cave: '第4章密道', castle: '第5章魔王城' };
const party = ['warrior', 'ranger', 'mage', 'cleric'];

for (const theme of themes)
  for (const seed of seeds) {
    const lv = generateIndoor(theme, seed, {
      layer: 3,
      entry: 'bottom',
      exits: [
        { id: 'n1', edge: 'top', label: 'battle' },
        { id: 'n2', edge: 'left', label: 'rest' },
        { id: 'n3', edge: 'right', label: 'event' },
      ],
    });
    const unit = (id: string, team: 'hero' | 'enemy', x: number, y: number, extra: Record<string, unknown> = {}) => {
      const a = PIXEL_UNITS[id];
      const base = { id, team, x, y, scale: a?.scale ?? 1, ...extra };
      if (a?.kind !== 'mw') return { ...base, m72: a?.kind === 'm72' ? a.idle : undefined };
      return { ...base, sheet: a.path, recolor: a.recolor ? [a.recolor.dark, a.recolor.light] : undefined };
    };
    const units = [
      ...party.map((id, i) => unit(id, 'hero', lv.heroSpawns[i].x, lv.heroSpawns[i].y)),
      ...lv.enemies.map((e) => unit(e.enemy, 'enemy', e.x, e.y, { facing: e.facing, hidden: e.hidden })),
    ];
    const data = { ...lv, units, heroColors: Object.fromEntries(party.map((id) => [id, heroTeamColors(HEROES[id].color).light])) };
    const json = join(out, `_${date}_${theme}_seed${seed}.json`);
    writeFileSync(json, JSON.stringify(data));
    const png = join(out, `${date}_${NAMES[theme]}_seed${seed}.png`);
    execFileSync('python', [join(ROOT, 'tools', 'indoor_render.py'), json, png, join(ROOT, 'public', 'assets')], { stdio: 'inherit' });
    console.log(png, `敵人 ${lv.enemies.length}`, lv.rooms.map((r) => r.role).join(','));
  }

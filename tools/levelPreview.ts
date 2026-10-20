/**
 * 關卡模板預覽（SPEC_SLICE6 §1）：把每塊模板與幾張拼好的關卡畫成 SVG，輸出 preview/levels.html（不進 git）。
 *
 *   npm run level:preview                 預設種子 1、第 3 層
 *   npm run level:preview -- --seed 7 --layer 5 --count 4
 *
 * 方向和遊戲畫面一樣：世界 +x（玩家推進的方向）朝上、+y 朝右。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES } from '../src/run/data/templates';
import { TEMPLATE_LEVELS } from '../src/run/data/levelPools';
import type { DeliberateTier } from '../src/run/data/deliberateLevels';
import { generateTemplateLevelDetailed } from '../src/run/templateLevelGen';
import { ENEMIES } from '../src/sim/data/enemies';

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const seed0 = arg('seed', 1);
const layer = arg('layer', 3);
const count = arg('count', 3);

const COLOR: Record<string, string> = {
  '.': '#3a3230',
  '#': '#8a8f99',
  o: '#a3a8b2',
  '"': '#2f6b34',
  '~': '#3a6f8f',
  '=': '#8a6a3a',
  W: '#1d3f5c',
  D: '#c07a2c',
  S: '#3a7bd5',
  E: '#e0c34a',
  B: '#b02a2a',
  R: '#7a2a2a',
};
const DIGIT = '#d94a4a';

/** 字元地圖 → SVG（遊戲方向：世界 x 朝上） */
function svgOf(grid: string[][], s: number, extras = ''): string {
  const H = grid.length;
  const W = grid[0].length;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${H * s}" height="${W * s}" viewBox="0 0 ${H * s} ${W * s}">`;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = grid[y][x];
      const fill = /[1-9]/.test(c) ? DIGIT : COLOR[c] ?? '#ff00ff';
      out += `<rect x="${y * s}" y="${(W - 1 - x) * s}" width="${s}" height="${s}" fill="${fill}"/>`;
      if (/[1-9]/.test(c) && s >= 8) out += `<text x="${y * s + s / 2}" y="${(W - 1 - x) * s + s * 0.75}" font-size="${s * 0.8}" text-anchor="middle" fill="#fff">${c}</text>`;
    }
  }
  return out + extras + '</svg>';
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

let body = '';
body += `<h2>模板（${TEMPLATES.length} 塊）</h2><div class="grid">`;
for (const t of TEMPLATES) {
  const grid = t.rows.map((r) => [...r]);
  const spawns = Object.entries(t.spawns)
    .map(([d, s]) => `${d}：${s.pool} ×${s.count[0]}–${s.count[1]}${s.ambush ? '（埋伏）' : ''}${s.captain ? '（隊長）' : ''}`)
    .join('<br>');
  body += `<figure>${svgOf(grid, t.size[0] > 1 ? 5 : 8)}<figcaption><b>${esc(t.id)}</b> ${t.size[0]}×${t.size[1]}　${esc(t.tags.join(' '))}　權重 ${t.weight}<br>${spawns || '（沒有生怪磚）'}</figcaption></figure>`;
}
body += '</div>';

const tiers: DeliberateTier[] = ['battle', 'elite', 'boss', 'event'];
const C = TEMPLATE_LEVELS.chunk;
for (const tier of tiers) {
  body += `<h2>拼好的關卡：${tier}（第 ${layer} 層）</h2><div class="grid">`;
  for (let i = 0; i < count; i++) {
    const seed = seed0 * 1000 + i;
    const { level, assembly } = generateTemplateLevelDetailed(seed, { tier, layer });
    const s = 6;
    const W = assembly.grid[0].length;
    let ex = '';
    // 區塊格線與模板名稱
    for (const p of assembly.placements) {
      const x0 = p.cy * C * s;
      const y0 = (W - (p.cx + p.sw) * C) * s;
      ex += `<rect x="${x0}" y="${y0}" width="${p.sh * C * s}" height="${p.sw * C * s}" fill="none" stroke="#fff" stroke-opacity="0.35"/>`;
      ex += `<text x="${x0 + 3}" y="${y0 + 11}" font-size="10" fill="#fff" fill-opacity="0.7">${esc(p.tpl.id)}</text>`;
    }
    // 敵人
    for (const e of level.enemies) {
      const r = e.squad === 'boss' && e.enemy === 'warlord' ? 6 : e.captain ? 5 : 3.5;
      ex += `<circle cx="${e.y * s}" cy="${(W - e.x) * s}" r="${r}" fill="${e.captain ? '#ffd23f' : '#ff4040'}" stroke="#000"/>`;
    }
    for (const h of level.mapDef.heroSpawns) ex += `<circle cx="${h.y * s}" cy="${(W - h.x) * s}" r="3.5" fill="#5ab0ff" stroke="#000"/>`;
    const names = level.enemies.map((e) => `${ENEMIES[e.enemy]?.name ?? e.enemy}${e.captain ? '（隊長）' : ''}`).join('、');
    body += `<figure>${svgOf(assembly.grid, s, ex)}<figcaption><b>${esc(level.name)}</b>　種子 ${seed}<br>敵人 ${level.enemies.length}：${esc(names)}</figcaption></figure>`;
  }
  body += '</div>';
}

const legend = Object.entries({ 地板: '.', 牆: '#', 石柱: 'o', 草叢: '"', 淺水: '~', 矮籬: '=', 深水: 'W', 門: 'D', 出生點: 'S', 出口: 'E', 頭目: 'B', 援軍點: 'R' })
  .map(([n, c]) => `<span><i style="background:${COLOR[c]}"></i>${n}</span>`)
  .join('') + `<span><i style="background:${DIGIT}"></i>生怪磚</span><span><i style="background:#ff4040;border-radius:50%"></i>敵人</span><span><i style="background:#ffd23f;border-radius:50%"></i>隊長</span><span><i style="background:#5ab0ff;border-radius:50%"></i>英雄</span>`;

const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>關卡模板預覽</title>
<style>
body{margin:0;padding:16px;background:#14161b;color:#e6e9ef;font-family:"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif}
h1{font-size:20px}h2{font-size:17px;margin-top:28px;color:#ffd76a}
.grid{display:flex;flex-wrap:wrap;gap:16px}
figure{margin:0;background:#1d2029;border-radius:8px;padding:8px;max-width:100%}
figure svg{display:block;max-width:100%;height:auto;image-rendering:pixelated}
figcaption{font-size:12px;color:#aab2c0;margin-top:6px;max-width:300px}
.legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12px}.legend i{display:inline-block;width:12px;height:12px;margin-right:4px;vertical-align:-2px}
</style></head><body>
<h1>關卡模板預覽</h1>
<p style="font-size:13px;color:#aab2c0">方向和遊戲畫面一樣：玩家從下方出發、往上推進。種子 ${seed0}、第 ${layer} 層。</p>
<div class="legend">${legend}</div>
${body}
</body></html>`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'preview', 'levels.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`輸出 ${out}`);

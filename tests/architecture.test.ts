import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('架構紅線（AGENTS.md）', () => {
  const simFiles = [...files(join(__dirname, '..', 'src', 'sim')), ...files(join(__dirname, '..', 'src', 'run'))];

  it('src/sim、src/run 不 import Phaser、不使用 DOM', () => {
    for (const f of simFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from ['"]phaser['"]/);
      expect(src, f).not.toMatch(/\b(window|document|localStorage|requestAnimationFrame)\./);
    }
  });

  it('src/sim、src/run 不使用 Math.random()', () => {
    for (const f of simFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random/);
  });

  it('src/sim、src/run 不引用畫面素材（props3d、heroes3d 圖檔與外觀設定）', () => {
    for (const f of simFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(/props3d|heroes3d|assets\//);
  });
});

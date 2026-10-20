#!/usr/bin/env node
/**
 * 本機開發：把授權素材放到 public/assets/licensed/（這個資料夾不進 git，見 .gitignore 與 ASSET_LICENSES.md）。
 *
 *   npm run assets:pull                    從私有 repo darkbearlab/fantasyRTwP-assets clone／更新（用你自己的 git 帳號權限）
 *   npm run assets:pull -- --from <資料夾>  沒有網路時，從本機的 Fantasy Battle Pack 資料夾複製
 *                                          （例：D:\_遊戲素材\像素素材\FantasyBattlePack_MattWalkden）
 *
 * 部署時由 .github/workflows/deploy.yml 用 deploy key 拉，不經過這支腳本。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, 'public', 'assets', 'licensed');
const REPO = 'https://github.com/darkbearlab/fantasyRTwP-assets.git';

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'inherit' });
}

function pullFromRepo() {
  if (existsSync(join(DEST, '.git'))) {
    console.log(`更新 ${DEST}`);
    git(['pull', '--ff-only'], DEST);
  } else {
    if (existsSync(DEST) && readdirSync(DEST).length > 0) {
      console.error(`${DEST} 已經有檔案但不是 git clone；請先刪掉這個資料夾再執行。`);
      process.exit(1);
    }
    mkdirSync(dirname(DEST), { recursive: true });
    console.log(`clone ${REPO} → ${DEST}`);
    git(['clone', '--depth', '1', REPO, DEST], ROOT);
  }
}

/** 從本機的原包資料夾複製成和私有 repo 一樣的結構 */
function copyFromLocal(src) {
  const pack = join(src, 'Fantasy Battle Pack');
  const sheets = join(pack, 'Sprite Sheets');
  if (!existsSync(sheets)) {
    console.error(`找不到 ${sheets}；--from 要指到 FantasyBattlePack_MattWalkden 資料夾。`);
    process.exit(1);
  }
  const copyDir = (from, to) => {
    if (!existsSync(from)) return;
    mkdirSync(to, { recursive: true });
    cpSync(from, to, { recursive: true, filter: (p) => statSync(p).isDirectory() || p.toLowerCase().endsWith('.png') });
    console.log(`複製 ${from} → ${to}`);
  };
  copyDir(sheets, join(DEST, 'mw', 'sheets'));
  copyDir(join(src, '_換色'), join(DEST, 'mw', 'recolor'));
  copyDir(join(pack, 'Effects'), join(DEST, 'mw', 'effects'));
}

const i = process.argv.indexOf('--from');
if (i >= 0) {
  const src = process.argv[i + 1];
  if (!src) {
    console.error('--from 後面要接資料夾路徑');
    process.exit(1);
  }
  copyFromLocal(resolve(src));
} else pullFromRepo();
console.log('完成。這個資料夾不會進 git。');

# 素材授權

本專案的**程式碼**不受以下素材授權影響。

> 2026-10-20 起美術方向改回 **2D 像素**（單位：Matt Walkden；地形與非人類怪物：0x72）。下面的 Flare、3D 預渲染素材仍在 repo 內，接上像素素材之前照常使用。

## Matt Walkden〈Fantasy Battle Pack〉（**不在本 repo 內**）

- 來源：https://mattwalkden.itch.io/fantasy-battle-pack （單位 sprite sheet、暴擊特效；含我們依原包換色遮罩產生的陣營版本）。
- 授權重點（原包 `License and Information`）：
  1. 可以**做為遊戲或其他作品的一部分**散布，可商用。
  2. **不可**單獨或以素材集形式販售、出租、授權、再授權、散布、贈送或以其他方式公開提供。
  3. 可以修改；**修改後的版本同樣適用第 2 條**（換色版也不能公開放）。
- 因為本 repo 是公開的，這些圖**不放進 repo**：
  - 原圖與換色版放在私有 repo `darkbearlab/fantasyRTwP-assets`（`mw/sheets/`、`mw/recolor/`、`mw/effects/`）。
  - 部署到 GitHub Pages 時，`.github/workflows/deploy.yml` 用唯讀 deploy key（Actions secret `ASSET_DEPLOY_KEY`）把它 checkout 到 `public/assets/licensed/`，隨遊戲一起打包發佈。沒有 secret 的環境（fork、PR 的 CI）會跳過，遊戲改用佔位圖形。
  - 本機開發：`npm run assets:pull`（clone／更新私有 repo），或 `npm run assets:pull -- --from <FantasyBattlePack_MattWalkden 資料夾>` 從本機複製。
  - `public/assets/licensed/` 已列在 `.gitignore`，**不要把它加進 git，也不要複製到任何公開的地方**。
- 署名：遊戲內標題畫面的「製作人員」列出 Matt Walkden。

## finalbossblues〈Time Elements: Hometown〉〈Four Seasons Terrain〉（**不在本 repo 內**）

- 來源：https://finalbossblues.itch.io/ （作者 Jason Perry）。2026-10-20 起戰鬥地圖的地形與物件（野外、城內）。
- 授權重點：可商用、可修改、不需署名；**不可散布素材本身**（原檔與修改版都算），只能做為遊戲的一部分發佈。
- 和 Matt Walkden 的素材一樣放在私有 repo `darkbearlab/fantasyRTwP-assets` 的 `fbb/`（內容見該資料夾的 README），部署與本機開發的做法同上。
- 主 repo 只放「格號」：
  - `src/game/render/fbbTiles.ts` 的圖塊對照。
  - `src/run/data/tilePrefabs/*.json`：Alan 用拼圖台手工拼的預製件，只有格號、沒有圖。
- 試產工具（`tools/fieldPreview.ts`、`tools/townPreview.ts`）輸出的 PNG 含授權素材，只放本機（`preview/` 已列在 `.gitignore`）。
- 署名：雖然不需要，遊戲內「製作人員」仍列出 finalbossblues。

## Alagard 英文像素字體（Hewett Tsoi；**不在本 repo 內**）

- 來源：dafont，標示「100% Free」，但沒有附正式條款。為了保險放在私有素材 repo 的 `fonts/alagard.ttf`，部署時才拉進 `public/assets/licensed/`。
- 用途：英文與數字（16 的整數倍）。找不到時退回原本的字型。
- 署名：遊戲內「製作人員」列出「Alagard font by Hewett Tsoi」。

## Kendrick ML〈All Fantasy World Explosions vfx〉（**不在本 repo 內**）

- 授權：可以修改；不可再散布或轉售（即使修改過）。放在私有素材 repo 的 `vfx/kml/`。
- 署名：不需要，遊戲內「製作人員」仍列出。

## 0x72〈16x16 DungeonTileset II〉v1.7（`public/assets/0x72/`）

- 來源：https://0x72.itch.io/dungeontileset-ii
- 授權：**CC0**（不需署名；仍在製作人員名單列出）。原檔未修改，見 `public/assets/0x72/LICENSE.txt`。

## Flare 美術素材（`public/assets/flare/`）

- 來源：[flare-game](https://github.com/flareteam/flare-game) 的 `mods/fantasycore`（主角紙娃娃圖層、敵人、地城地板磚）。
- 授權：**CC-BY-SA 3.0**（Creative Commons Attribution-ShareAlike 3.0 Unported），**不是 CC0**。全文見 `public/assets/flare/LICENSE.txt`。
- 署名：作者名單見 `public/assets/flare/CREDITS.txt`。主角與多數怪物作者為 Clint Bellanger。遊戲內標題畫面的「製作人員」列出 Flare 美術貢獻者。
- 我們的修改：`tools/importFlare.py` 把原始圖集依 `src/game/render/flareArt.json` 裁切、**縮小**、**重新打包成新的圖集**，並壓成 256 色調色盤；動畫定義轉成 Phaser 的 atlas JSON。
  這些**修改後的圖檔與 JSON 同樣以 CC-BY-SA 3.0 釋出**（相同方式分享）。
- 原始大圖不提交進本 repo；需要重新產生時，依 `tools/importFlare.py` 開頭的說明用 sparse checkout 取得 flare-game，再執行腳本。

## 自製 3D 預渲染英雄（`public/assets/heroes3d/`）

- 製作：MakeHuman（MPFB2）＋ Adobe Mixamo 動作＋ Blender 渲染，細節見 `public/assets/heroes3d/README.md`。
- 人物與衣物素材：MakeHuman 社群素材包的 **CC0** 版本（不需署名）；武器、盾、首飾等為本專案自製。
- 動作來源 Adobe Mixamo：渲染出的 sprite 可在商業遊戲中使用；Mixamo 的 FBX 原檔不散布、不放進 repo。
- 渲染後的圖檔隨本專案使用，不受 CC-BY-SA 影響（未使用任何 Flare 素材）。

## 自製 3D 預渲染地形物件（`public/assets/props3d/`）

- 原始模型：[Poly Haven](https://polyhaven.com/models) 實景掃描模型，授權 **CC0**（可商用、不需署名）。
- 以 Blender 渲染成單張圖（相機與 `heroes3d` 相同），細節見 `public/assets/props3d/README.md`。
- 原始模型檔不放進 repo。

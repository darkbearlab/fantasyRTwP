# 素材授權

本專案的**程式碼**不受以下素材授權影響。

## Flare 美術素材（`public/assets/flare/`）

- 來源：[flare-game](https://github.com/flareteam/flare-game) 的 `mods/fantasycore`（主角紙娃娃圖層、敵人、地城地板磚）。
- 授權：**CC-BY-SA 3.0**（Creative Commons Attribution-ShareAlike 3.0 Unported），**不是 CC0**。全文見 `public/assets/flare/LICENSE.txt`。
- 署名：作者名單見 `public/assets/flare/CREDITS.txt`。主角與多數怪物作者為 Clint Bellanger。遊戲內標題畫面的「製作人員」列出 Flare 美術貢獻者。
- 我們的修改：`tools/importFlare.py` 把原始圖集依 `src/game/render/flareArt.json` 裁切、**縮小**、**重新打包成新的圖集**，並壓成 256 色調色盤；動畫定義轉成 Phaser 的 atlas JSON。
  這些**修改後的圖檔與 JSON 同樣以 CC-BY-SA 3.0 釋出**（相同方式分享）。
- 原始大圖不提交進本 repo；需要重新產生時，依 `tools/importFlare.py` 開頭的說明用 sparse checkout 取得 flare-game，再執行腳本。

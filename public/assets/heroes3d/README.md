# 自製 3D 預渲染英雄 sprite（heroes3d）

用 MakeHuman（MPFB2）捏人＋穿衣 → Mixamo 動作 → Blender Cycles 正交相機渲染的 8 方向等角 sprite。
總覽圖：`docs/art/heroes3d_overview.png`。

## 角色
| 資料夾 | 角色 | 武器 | 動作 |
|---|---|---|---|
| `warrior/` | 男性戰士（鎖甲、科林斯頭盔） | 劍＋圓盾 | idle walk run slash power_slash attack_high slash_combo block_idle cast hit death death_back warcry |
| `cleric/` | 女牧師（全身鎖子甲、鎖甲頭巾） | 釘頭鎚＋圓盾 | 同戰士（cast＝右手高舉武器施法） |
| `ranger/` | 遊俠（棉甲、金髮） | 長弓＋箭袋 | idle walk run draw aim shoot hit death death_back kick dodge_back cast |
| `mage/` | 灰袍老法師 | 三叉嵌晶杖 | idle walk run cast attack sweep cast2h area attack2h block hit death death_back |
| `sorceress/` | 吉普賽風咒術師（女） | 短魔杖 | 同法師 |

⚠️ `ranger/` 已知動作中有穿模，之後會重做；先可當占位使用。

## 圖檔格式
- 每個動作一張 PNG（256 色調色盤＋透明）：**列＝方向（8 列）、欄＝影格**。
- 每格 **192×192 px**；角色腳底（地面原點）在格內 **(96, 135)**。
- 方向順序與 Flare 相同（以畫面方位計）：**0 西、1 西北、2 北、3 東北、4 東、5 東南、6 南、7 西南**。
- 比例：約 **53.3 px／公尺**（人高 ≈ 1.9 m，畫面上約 90–100 px）。要對齊遊戲的 HEIGHT_PX_PER_M＝32 時縮放約 0.6。
- 相機：正交、俯角 30°（相機旋轉 X=60°）、方位 45°；光源固定在畫面左上。
- 每個角色的 `sprites.json`：`{cell, origin, px_per_meter, dirs, anims:{動作:{frames, loop}}, files}`；`index.json` 列出全部角色與動作。
- 循環動作：idle、walk、run、block_idle／block、aim；其他為單次（播完停最後一格，例如死亡）。
- 位移：攻擊、走跑等已鎖成原地（root motion 由遊戲自行移動）；死亡保留倒地位移。

## 建議的動作對應（可自行調整）
- 普攻：戰士／牧師 `slash`、遊俠 `draw → aim → shoot`、法師系 `attack`
- 技能：戰吼 `warcry`、衝鋒 `run`、重擊 `power_slash`、施法 `cast`／`cast2h`／`area`
- 受擊 `hit`、死亡 `death`（隨機或依受擊方向選 `death_back`）

## 重新產生
`tools/heroes3d/` 是產生用腳本（Blender 5.2 的 bpy 模組＋MPFB2 擴充；路徑寫死在作者的工作環境，僅供參考）。
原始 Blender 檔、Mixamo 動作檔與未壓縮 PNG 保存在作者電腦（D:\_遊戲素材\等角素材\自製渲染\），不進 repo。

## 授權
- 人物、衣物、髮型、皮膚：MakeHuman 社群素材包 **CC0**（system assets、skins02、suits02、hats02、equipment01、shoes01、bodyparts05、gloves01、masks01、pants01、shirts01、dress01 的 CC0 版本）。
- 武器、盾、腰帶、首飾、箭袋等：本專案自製（Blender 程序建模）。
- 動作：Adobe **Mixamo**——渲染後的 sprite 可用於商業遊戲；Mixamo 的 FBX 動作原檔不得單獨散布，故不放進 repo。

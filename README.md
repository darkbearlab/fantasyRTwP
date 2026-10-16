# fantasyRTwP

奇幻版「路線圖 roguelite ＋ 即時暫停（RTwP）小隊戰鬥」。

- 規格：[SPEC.md](SPEC.md)（戰鬥系統總規格）、[SPEC_SLICE2.md](SPEC_SLICE2.md)（切片 2：路線圖循環＋操作改版）、[SPEC_SLICE3.md](SPEC_SLICE3.md)（切片 3：職業變體＋戰術地形＋新敵人）
- 實作守則：[AGENTS.md](AGENTS.md)
- 引擎：Phaser 3 + TypeScript + Vite，測試用 Vitest

目前階段：切片 1、2 已完成；**切片 3 —— 職業變體（第一批 4 個）＋戰術地形＋新敵人** 已實作，等待試玩回饋。

## 指令

```bash
npm install
npm run dev                      # 開發伺服器（標題 → 組隊 → 路線圖 → 戰鬥／事件／休息 → 結算）
npm run build                    # 型別檢查＋打包到 dist/
npm test                         # 模擬層單元測試
npm run autobattle -- --runs 200 # 無畫面單場自動對戰，輸出勝率與平均傷害
npm run autorun -- --runs 100    # 無畫面整趟自動遠征（隨機組隊）：通關率、抵達層數、陣亡、金幣、戰鬥時間、全滅層數、各職業通關率
npm run autorun -- --runs 100 --fixed  # 同上，但隊伍固定為四個 Archetype（與切片 2 比較用）
```

`autobattle` 其他參數：`--seed 1`（起始種子）、`--zoc pin|disengage|off`、`--noscript`（英雄只用閒置行為，模擬「亂按」）。
網址加上 `?seed=123` 可以指定戰鬥種子。

## 操作（桌機）

| 操作 | 效果 |
|---|---|
| 左鍵點英雄／點下方英雄卡 | 選取（Shift：加選／取消）；雙擊英雄卡：鏡頭移過去 |
| 左鍵拖曳 | 框選英雄 |
| 1 2 3 4 | 選取英雄欄位 1–4（連按兩下：鏡頭移過去；Shift＋數字：加選） |
| Tab | 主要選取切換到下一名存活英雄 |
| Q E R | **主要選取**英雄的技能 1–3（左鍵確認目標）；主要選取＝最後加入選取的英雄，英雄卡會亮黃框並標示「Q E R」 |
| 右鍵 地面／敵人／友軍 | 移動（多人排隊形）／攻擊／跟隨 |
| 空白鍵 | 暫停／繼續（暫停中可下指令，會顯示幽靈線） |
| Esc 或 右鍵 | 取消瞄準 |
| H | 已選英雄停止 |
| W A S D、方向鍵、滑鼠移到邊緣、中鍵拖曳、滾輪 | 移動鏡頭、縮放 |
| ` | 除錯面板（投影切換 等角／正俯視、導航格子、路徑、控制區、視線、站位、時間倍率、ZOC 模式、自動暫停、種子） |

小提示：每名英雄有閒置性格（英雄卡上的標籤，點一下依序切換）——**堅守**會自動普攻但不離開駐守點、**好戰**看到敵人就衝出去一路追擊、**游擊**敵人靠近就逃跑、要你下攻擊指令才接戰；預設戰士、牧師堅守，遊俠、法師游擊。英雄完成你下的移動指令後會「駐守」在那裡（地上出現小菱形），閒置自動普攻不會離開駐守點超過 1.5 m；下攻擊／跟隨／技能指令就會解除駐守。先把戰士（W）拉到中央隘口卡位，遠程留在後面；術士（S）地上出現紅圈時用遊俠的震懾箭（R）、法師的奧術飛彈（R）或戰士的盾擊（E）打斷他（技能欄第 1 欄 Q 固定是職業專用技能，休息時可替換 E、R）；刺客（K）會走下方側翼通道摸後排。

## 切片 3 新內容

- **組隊**：開始遠征時自選 2 名、另外 2 名隨機。8 個職業：戰士／狂戰士（戰士系）、遊俠／盜賊（遊俠系）、法師／咒術師（法師系）、牧師／煉金術士（牧師系）。
- **技能欄**：Q 是職業專用技能（固定），E、R 在休息節點的「技能」分頁換成同系共用技能（免費）。
- **技能連動**：冰縛定身 → 盾擊／聖光震擊／背刺／旋風斬「碎冰」+50%；盾擊暈眩 → 背刺必爆；聖光震擊把敵人推到牆上 → 暈眩；火球／火焰瓶點燃草叢 → 燃燒。
- **地形**：草叢（躲人、敵我都看不到 2 m 外的人、可點燃）、淺水（慢、防禦 −10）、矮籬（慢、遠程掩體 +15 防禦）、高地（遠程射程 +2、傷害 +15%）。
- **新敵人**：攻城兵 X（無視控制區、撞擊擊退）、投彈手 O（拋物線、不需視線）、潛行者 V（開場隱匿、專打後排）。
- 新地圖：沼澤村落、丘陵哨站（快速戰鬥可以直接選）。

### 節奏改版（試玩回饋後，參考柏德之門／永恆之柱）

- 移動速度 ×0.8（`moveSpeedMult`）；敵人開場察覺距離 10 m、20 秒後才一定進攻，有時間部陣。
- **戰後整補**：勝利後存活者回復本場損失生命的 50%（`ECONOMY.postBattleRecoveryRatio`），其餘是要靠休息處理的傷勢。
- **遠程會被擋**：直射投射物飛行中撞到岩石、牆會落空（顯示「擋下」）；路徑上有其他單位（敵我都算）時目標防禦 +10（射入混戰，與矮籬掩體取較高者）；拋物線不受影響。
- 敵方弓手射程 8 m、投彈手 7 m；各地圖補上大塊遮擋物；一般戰鬥 3–5 名、精英 4 名。

## 畫面投影

戰鬥畫面預設為 45 度等角（2:1）投影：角色是「腳下橢圓＋直立長方形」，障礙物是有高度的方塊，走到牆後會顯示半透明輪廓。
投影只在畫面層（`src/game/render/projection.ts`），sim 仍然用公尺的平面座標；除錯面板可即時切回正俯視比較。
投影參數在 `src/config.ts`（`projection`、`iso`），角色身高與障礙物高度在 `src/game/render/visual.ts`。

## 美術試裝：Flare 等角素材

`config.art = 'flare'`（預設）時，等角戰鬥中的英雄、敵人與地板改用 [Flare](https://github.com/flareteam/flare-game) 的素材；除錯面板「美術」可即時切回色塊。
素材授權為 **CC-BY-SA 3.0**（見 [ASSET_LICENSES.md](ASSET_LICENSES.md)），標題畫面「製作人員」列出美術貢獻者。
重新產生素材：依 `tools/importFlare.py` 開頭說明 sparse checkout flare-game 後執行 `python3 tools/importFlare.py <路徑>`（需要 Pillow）；對應與縮放在 `src/game/render/flareArt.json`。

## 部署到 GitHub Pages

`.github/workflows/deploy.yml` 會在 `main` 有新提交時跑測試、打包並部署。第一次使用需要到
**Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。也可以在 Actions 頁面手動執行「部署到 GitHub Pages」。

## 專案結構

```
src/sim/      純 TypeScript 模擬層（不 import Phaser／DOM，只吃 Command、只吐 SimEvent）
  world.ts      World：step()、enqueue()、移動、指令處理
  actions.ts    準備／生效／恢復狀態機、打斷、效果結算
  combat.ts zoc.ts los.ts rng.ts
  nav/          格子、A*、路徑平滑、避讓、近戰站位
  ai/           敵人 AI、英雄閒置行為（IdleBehavior 介面）
  data/         英雄、敵人、技能、地圖（arena01.json）
src/game/     Phaser 畫面層：場景、渲染、輸入（輸入 → Command）
src/config.ts 時間倍率、ZOC 模式、自動暫停、快捷鍵
src/run/      遠征模組（純 TypeScript）：RunState、路線圖生成、節點流程、強化、事件；data/ 放經濟、遭遇、強化、事件
tools/        autobattle／autorun（無畫面單場／整趟）、heroScript（腳本英雄 AI）、runPolicy（自動遠征決策）、encounterStats、trace（除錯）
tests/        Vitest（只測 sim）
```

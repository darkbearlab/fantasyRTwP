# fantasyRTwP

奇幻版「路線圖 roguelite ＋ 即時暫停（RTwP）小隊戰鬥」。

- 規格：[SPEC.md](SPEC.md)（戰鬥系統總規格）、[SPEC_SLICE2.md](SPEC_SLICE2.md)（切片 2：路線圖循環＋操作改版）
- 實作守則：[AGENTS.md](AGENTS.md)
- 引擎：Phaser 3 + TypeScript + Vite，測試用 Vitest

目前階段：切片 1（一場可玩的戰鬥，規格 v0.3）已完成；**切片 2 —— 八節點路線圖循環＋操作改版** 規格已就緒。

## 指令

```bash
npm install
npm run dev                      # 開發伺服器（標題 → 路線圖 → 戰鬥／事件／休息 → 結算）
npm run build                    # 型別檢查＋打包到 dist/
npm test                         # 模擬層單元測試
npm run autobattle -- --runs 200 # 無畫面自動對戰，輸出勝率與平均傷害
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
| ` | 除錯面板（導航格子、路徑、控制區、視線、站位、時間倍率、ZOC 模式、自動暫停、種子） |

小提示：每名英雄有閒置性格（英雄卡上的標籤，點一下依序切換）——**堅守**會自動普攻但不離開駐守點、**好戰**看到敵人就衝出去一路追擊、**游擊**敵人靠近就逃跑、要你下攻擊指令才接戰；預設戰士、牧師堅守，遊俠、法師游擊。英雄完成你下的移動指令後會「駐守」在那裡（地上出現小菱形），閒置自動普攻不會離開駐守點超過 1.5 m；下攻擊／跟隨／技能指令就會解除駐守。先把戰士（W）拉到中央隘口卡位，遠程留在後面；術士（S）地上出現紅圈時用遊俠的震懾箭（2 → E）、法師的奧術飛彈（3 → R）或戰士的盾擊（1 → Q）打斷他；刺客（K）會走下方側翼通道摸後排。

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
tools/        autobattle（無畫面自動對戰）、heroScript（腳本英雄 AI）、trace（除錯時間軸）
tests/        Vitest（只測 sim）
```

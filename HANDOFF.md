# HANDOFF.md —— 交接文件（給接手的 session）

> 最後更新：2026-10-20，main 位於 `3ab3d55`（PR #46 合併後）。
> 這份文件補齊「還沒寫進 SPEC／README 的東西」：Alan 的工作習慣與決定、目前進度、程式地圖、驗證方法、已知問題與待辦。
> 規格本身仍以 `SPEC_SLICE5.md`（最新）→ `SPEC_SLICE4.md` → … → `SPEC.md` 為準；工作守則見 `AGENTS.md`。

---

## 1. Alan 的長期工作規則（口頭交代過、要一直遵守）

| 規則 | 說明 |
|---|---|
| 語言 | 對話、文件、註解一律繁體中文；識別字英文。 |
| PR 流程 | 每個階段開一個 PR（先開 draft），**CI 綠了就直接轉 ready 並 squash merge，不用等 review**。合併後把開發分支重設到最新的 `origin/main`（`git checkout -B <branch> origin/main`，`--force-with-lease` 推上去沒關係）。 |
| 數值 | **沒被要求就不調平衡數值**。新內容先用佔位值，做成可設定，回報時列成「待確認」。 |
| 舊模式 | 怪群模式（切片 4）與戰術模式（切片 2／3）已封存：測試要照常通過，不再調數值、不再擴充。改共用程式時要確認舊模式行為不變（必要時新增 deliberate 專用的資料／分支，不要改舊的資料）。 |
| 回報 | 每個階段結束回報：做了什麼、怎麼試玩、已知問題、待確認事項。 |
| 一次做完 | Alan 說「直接做到底」時，就連續做完多個階段，最後一次總報告。 |
| 手機 | 行動版**以直拿為主**（四張英雄卡在下緣）。不要做「請橫放」之類的提示。 |
| 通用 helper | Alan 偏好把可重複的機制做成通用元件（例：持續地面效果 → `src/sim/zones.ts`）。 |

---

## 2. 目前狀態（切片 5：沉穩節奏與行動版）

遠征預設就是沉穩節奏（`LEVELS.expeditionStyle = 'deliberate'`，`src/run/data/levels.ts`）。已完成：

| 階段 | PR | 內容 |
|---|---|---|
| S5-1 | #38、#39 | 沉穩節奏設定（移動 ×0.6、行動時間 ×1.8、冷卻 ×2）、一招主動、攻擊移動只打目標點附近、性格固定堅守、取消控制區、四卡片 UI |
| S5-6 | #40 | 行動版：直拿響應式版面、觸控細節、PWA manifest |
| S5-2 | #42 | 被動框架（職業被動、數值修正、命中效果、嘲諷光環）、持續地面效果 helper |
| S5-3 | #43 | 新敵人＋預兆、權重選目標、小隊警覺、48×48 生成關卡＋迷霧 |
| S5-4 | #44 | 技能循環：法師蓄力大火球、咒術師詛咒爆裂 |
| S5-5 | #45 | 裝備道具：13 件道具、背包、商人節點、戰鬥掉落 |
| 試玩調整 | #46 | 遊俠主動＝瞄準射擊；點地圖打最近目標；火球即時爆炸；所有沉穩關卡有迷霧；英雄卡頭像佔位 |

測試：`npm test` 267 項全綠（2026-10-20）。

### Alan 的設計決定（v0.4 之後，SPEC_SLICE5 §14–§17 有寫的不重複；以下是**還沒寫進 SPEC 的**）
- **遊俠**的主動技能改成**瞄準射擊**（`ACTIVE_SKILL_OVERRIDE`，`src/sim/data/passives.ts`）。
- **點地圖放指定目標技能**：打點擊位置**最近**、看得到的目標（`nearestTargetTo`，`src/game/input/targeting.ts`）。目前套用在沉穩節奏所有指定目標的技能（敵人與友軍），不只遊俠——Alan 若只要遊俠，改這裡。
- **法師火球即時爆炸**：沉穩節奏用新技能 `flashFireball`（名稱一樣叫「火球」、數值同 `fireball`、沒有投射物）；`greatFireball` 也沒有投射物。舊模式的 `fireball` 不動。
- **戰爭迷霧**：沉穩節奏的所有戰鬥都開（`createBattleFromRun` 的 `fog: enc.fog || deliberate`）。
- **英雄卡頭像**：卡片頂端預留頭像區，未來放真的頭像——平時是**朝左的側臉**，被選取時**轉成正面**（參考 Commandos）。現在是色塊佔位（`portrait()`，`src/game/ui/mobileBar.ts`；CSS `.m-portrait`／`.m-face`）。換成圖片時保留「`.m-card.selected` 時切換正面」的結構即可。
- 敵人：盾兵＝生命高於 50% 前防禦較高；衝鋒兵不擊倒；射手沒有特殊行為（平 A＋拉開距離）；自爆屍要有範圍預兆圈；潛行者沒有第一擊爆擊。
- 牧師主動＝治療藥瓶；煉金術士普攻＝手榴彈、主動＝會留地面火的火焰瓶。
- **畫面改成正角俯視**（2026-10-20）：`projection.ts` 新增 `ortho` 模式並設為預設（地圖正方格、保留俯角、z 高度照樣畫，所以角色 sprite 與立體方塊沿用）。Flare 地板磚與 props3d 是等角素材，只在 `iso` 使用；`ortho` 的地面、牆、門用程式畫。舊的 `iso` 還在（除錯面板可切），`isIso()` 只用在等角專用素材，其他「有高度」的判斷用 `hasHeight()`。
- **鏡頭遠近固定**：移除滾輪與雙指縮放；`GAME_CONFIG.battleZoom` 是唯一旋鈕（Alan：不要做成玩家設定）。
- **畫面外敵人指示器**：`BattleScene.drawOffscreenEnemies`，紅色光暈，大小依最大生命；迷霧／草叢裡的敵人不顯示。
- **全選鈕**：有人沒選到＝全選，全選中＝全部取消（`mobileBar.ts`）。
- **控制鈕排列**：沙漏與全選鈕的位置由 `GAME_CONFIG.mobileControls`（`align` 左／中／右、`order` 順序）決定，預設靠左、沙漏在前（Alan：之後要做成玩家可調整）。
- **拖曳地圖**：改聽視窗層級的原生 pointer 事件（`InputController.onNativeMove`／`onNativeUp`），手指滑到卡片等 DOM 面板上也會繼續拖，放開才結束。
- **只顯示戰鬥中用到的技能**：`src/run/loadout.ts` 的 `battleSkillsOf(run, hero)`——沉穩節奏是主動技能（或循環的每一招），舊模式才是 `HeroRecord.skills`。獎勵的強化、事件、招募時的隨機強化、路線圖的隊伍面板都用它；沉穩節奏的休息點不顯示「技能」分頁。
- **火焰瓶**：節奏比照火球（準備 0、恢復 1.2 秒、冷卻 12 秒、有飛行時間）；燃燒地面畫成焦土＋跳動的火舌（`BattleScene.drawFireZone`），持續 5 秒。
- **按住瞄準**（觸控沒有 hover）：技能進入瞄準後，在地圖上按下就出現預覽（範圍圈／會打到的目標）；暫停中可以拖曳調整位置，放開才施放；不暫停時預覽固定在按下的位置（`InputController.aim`／`finishAim`）。暫停中再按技能重新瞄準會蓋掉前一次（原本就有）。
- **鉤子**（2026-10-20，Alan：之後很有用）：
  - sim 事件 `squadSighted`（一隊敵人第一次出現在我方視野；沒有小隊的敵人各自算一隊；`World.updateSighting`，每 3 節拍檢查）。
  - `UnitDef.rank`（`'elite'`＝精英隊長、`'boss'`）與 `enemyRank(def)`（`src/sim/data/enemies.ts`；ai 為 boss 也算頭目）。
  - 畫面層 `BattleSession.hooks`（`src/game/hooks.ts`）：`simEvent`（每個 sim 事件，戰鬥場景處理完畫面之後）、`skillAim`（按下技能進入瞄準）、`skillCommand`（下達技能指令）、`pauseChanged`。
- **自動暫停**：規則全部在 `src/game/autoPause.ts`（掛在鉤子上；`AUTO_PAUSE_OPTIONS` 是選單項目）。設定存在 localStorage（`fantasyRTwP.autoPause`），⚙ 設定選單與除錯面板都能改。新選項預設：發現敵人 開、精英／頭目技能 開、按技能瞄準 關（待確認）。
- **美術方向改回 2D 像素**（2026-10-20）：素材說明在 `D:\_遊戲素材\像素素材\交接_像素素材給開發session.md`（格式、建議對照表）。Matt Walkden 的素材在私有 repo `darkbearlab/fantasyRTwP-assets`，本機 `npm run assets:pull`、部署時 `deploy.yml` 用 secret `ASSET_DEPLOY_KEY` 拉到 `public/assets/licensed/`（不進 git；**不要碰金鑰或 secret**）；0x72（CC0）在 `public/assets/0x72/`。程式在沒有 `licensed/` 時必須退回佔位圖形，CI 不拉私有素材。
  - 已接上（2026-10-20）：`config.art = 'pixel'` 為預設。`pixelArtData.ts`（對照表 `PIXEL_UNITS`、取格公式、動作）、`pixelArt.ts`（載入；缺圖的單位用色塊 `UnitView`）、`pixelView.ts`（單位外觀）、`BattleScene.drawPixelFloor`（0x72 地板，原始像素拼好再放大）。營火畫面也用像素 sprite。
  - Alan 的決定：對照表照交接文件建議、全部當佔位；**視角維持正角俯視＋縱向壓縮**（`ortho.squash` 2/3，讓 16 px 地板正好放大 3 × 2）；方向只用 3 方向；戶外關卡暫時也用地城地板，具體 asset 下一輪再決定；0x72 怪物攻擊用往前衝＋閃白。
  - **英雄換成職業色**：藍隊 sheet 的兩個隊伍色（#0000C0、#7D7DEA）在遊戲載入後換成職業色（`heroTeamColors`、`pixelArt.ts` 的 `ensureRecolored`），不另外產生圖檔。咒術師、牧師因此改用藍隊 Wizard 換色，不用 Cult／Holy 版。
  - **英雄卡頭像**：有像素素材時用 sprite 的側面（朝左）與正面待機格，選取時換正面（CSS `.m-sprite`）；沒有素材時是原本的色塊臉。
  - 建議表沒有、我先挑的：煉金術士＝綠色 Wizard、siege＝ogre、bomber＝goblin、exploder＝muddy、nest＝swampy。
- **切片 6（SPEC_SLICE6.md）**：S6-1 模板拼接關卡已做（2026-10-20）。模板在 `src/run/data/templates.ts`（文字地圖，圖例在檔案開頭），池子與版面在 `src/run/data/levelPools.ts`，拼接在 `src/run/templateLevelGen.ts`；`LEVELS.deliberateGenerator` 可切回舊的隔牆關卡（classic）。預覽：`npm run level:preview` → `preview/levels.html`。效能：6 × 6 區塊（96 m）每節拍約 0.22 ms（桌機），可以做大型關鍵地點。下一步 S6-2 出口制。
- **營火對話**（休息節點）：先進 `CampfireScene`（英雄圍著程式畫的火堆、上下兩個對話框、頭像用 sprite），看完或略過才打開休息選單；看過的記在 `phase.talked`。台詞在 `src/run/data/campfire.ts`（通用台詞，`{0}` 換成職業名），挑選在 `src/run/campfire.ts`（依種子＋節點，同一節點每次一樣）。
- **故事大綱**：`STORY.md`（Alan 口述，尚未實作：五張路線圖、魔法水晶、FTL 式路線圖與魔王冠軍追擊）。
- **下完指令不取消選取**：`GAME_CONFIG.deselectAfterOrder`（預設 false）。
- **角色縮放**：`VISUAL.unitScale`（0.8，只影響畫面；`unitHeight()` 已乘上這個值），碰撞半徑與腳下圈不變。
- **交戰距離縮短**（2026-10-20）：沉穩節奏 `SimConfig.rangeMult` ＝ 0.6（`DELIBERATE_PACE.range`），套用在 1 m 以上的普攻射程與技能施放距離（換算一律經過 `scaleRange`）；敵人察覺距離、攻擊移動接戰距離也 ×0.6。近戰、範圍半徑、視野不變；舊模式 `rangeMult` ＝ 1。
- **法師火球改回**（2026-10-20）：拿掉充能／大火球循環；法師主動＝`flashFireball`（準備時間 0、仍有 1.2 秒恢復、飛行速度 16 m/s、冷卻 12 秒 ×2）。飛行中落點畫出爆炸範圍（`BattleScene.drawLandingZones`）。charge 循環機制與 `greatFireball` 資料保留給之後用。
- 技能循環目前只有咒術師（法師已改回單一火球）（其他職業的提案在 SPEC_SLICE5 §16，尚未實作）。
- 裝備：商人節點買、勝利機率掉落；舊共用技能回收成道具效果。
- 關卡：維持 48×48，內容重設計（小隊分佈、側翼、埋伏、門後），保留迷霧。

---

## 3. 程式地圖（切片 5 新增／重要的檔案）

### sim（純 TS，不得 import Phaser／DOM）
| 檔案 | 用途 |
|---|---|
| `src/sim/data/deliberate.ts` | 沉穩節奏的節奏倍率與 `deliberateConfig()` |
| `src/sim/data/passives.ts` | `PassiveDef`、職業被動 `CLASS_PASSIVES`、主動技能例外 `ACTIVE_SKILL_OVERRIDE` |
| `src/sim/data/items.ts` | 道具 `ITEMS`（每件是一個 `PassiveDef`，`source: 'item'`） |
| `src/sim/data/cycles.ts` ／ `src/sim/cycle.ts` | 技能循環資料／目前這一招 `currentActiveSkill`、推進邏輯 |
| `src/sim/zones.ts` | 通用持續地面效果（減速、燃燒、每秒傷害／回復） |
| `src/sim/data/enemies.ts` | 新敵人（shieldbearer、charger、assassin、hooker、priest、summoner、exploder、minion）、`ENEMY_TARGETING` 權重、`ENEMY_ALERT` |
| `src/sim/ai/enemyAI.ts` | `deliberateThink`：權重選目標 `pickTarget`／`targetScore`、各敵人行為 |
| `src/sim/actions.ts` | 新技能效果：`rush`、`leap`、`pull`、`summon`、`explode`、`curseBurst`；`passiveOnHit`（stun／root／burn／zone）；斬殺 |
| `src/sim/world.ts` | 小隊警覺 `updateAlert`／`alertUnit`（取代全場 `enemyAggro` 計時，只在 deliberate）、`WorldOptions.fog`、英雄帶被動／道具／循環 |

### run（純 TS）
| 檔案 | 用途 |
|---|---|
| `src/run/deliberateLevelGen.ts` ＋ `data/deliberateLevels.ts` | 48×48 生成關卡（遭遇編號 `dlevel:<tier>`） |
| `src/run/items.ts` | 背包、裝備、商人、掉落的純函式 |
| `src/run/battle.ts` | `createBattleFromRun`：沉穩節奏時套設定、單一主動（或循環的所有招）、道具、迷霧、小隊 |
| `src/run/mapGen.ts` | 新節點類型 `shop`（只在 `createRun` 的 style 為 deliberate 時放） |

### 畫面
| 檔案 | 用途 |
|---|---|
| `src/game/ui/mobileBar.ts` | 四張英雄卡（頭像、名字、生命、狀態圖示、水位、技能鈕、循環提示）＋沙漏 |
| `src/game/ui/bagPanel.ts`、`scenes/ShopScene.ts` | 背包／裝備面板、商人畫面 |
| `src/game/scenes/BattleScene.ts` | 預兆繪製（`drawZones` 的衝鋒預兆帶／落點圈、`drawSelfTelegraphs` 的自爆／召喚圈與鉤鎖／治療線） |
| `src/game/input/targeting.ts` | 技能瞄準、點地圖找最近目標 |
| `src/main.ts` | 響應式舞台 `fitStage`（compact／portrait class）；`window.__game` 除錯用 |

---

## 4. 開發與驗證方法

```bash
npm install
npm run dev                         # 開發伺服器
npm test                            # Vitest（267 項）
npm run typecheck                   # 兩份 tsconfig（遊戲＋sim 紅線）；CI 的 build 也會跑
npm run autorun -- --runs 20 --style deliberate   # 沉穩節奏整趟自動遠征（腳本很粗，只驗證打得完、不當機）
npm run autorun -- --runs 20                      # 封存的戰術模式（CI 也跑這個）
```

- **CI**（`.github/workflows/ci.yml`）：`npm test`、`npm run build`、`autobattle --runs 50`、`autorun --runs 20`（戰術模式）。
- **部署**：main 有新提交時 `deploy.yml` 自動部署到 GitHub Pages。
- **瀏覽器實測**：用 Playwright（手機模擬 390×844、`isMobile`、`hasTouch`）。
  - 頁面上 `window.__game` 可以拿到 Phaser Game；`__game.scene.getScene('Battle').session.world` 是 sim 世界（只用來讀狀態或測試時下指令）。
  - 快速戰鬥：標題畫面的下拉選「遠征關卡：遭遇／精英／最終決戰／突發」（值是 `dlevel:<tier>`）。
  - 網址 `?seed=123` 指定種子。
- **自動腳本**：`tools/deliberateScript.ts`（沉穩節奏）會開門、拉絞盤、往敵人推進；`tools/runPolicy.ts` 會買道具、自動裝備。腳本不會躲預兆，所以**通關率不能代表真人難度**（目前 0%，平均到第 5～6 層）。

### 踩過的坑
- `merge_pull_request` 的 `expectedHeadSha` 要完整 40 碼 SHA（用 `git rev-parse` 取）。
- 手機點擊也會觸發 `mouseenter`：滑鼠專用的 hover 要判斷 `pointerType === 'mouse'`。
- `game.scale.refresh()` 會發 `resize`：DOM 畫面只在尺寸字串真的改變時重建（`DomScene`）。
- 無頭 Chromium 不支援 CSS `color-mix()`：不要用。
- 沉穩節奏下技能的準備時間 ×1.8、冷卻 ×2 對**敵人也生效**：敵人技能資料值是換算前的（例：衝鋒預兆 0.85 → 實際約 1.5 秒）。寫測試時記得等夠久（大火球準備約 4 秒）。
- 測試的 `PASSIVE` 設定把 `enemyAggroRange` 設 0：沉穩節奏的警覺距離也用這個值，所以測試裡敵人不會自己警覺，要測 AI 時要放大。
- 改到共用程式（`actions.ts`、`world.ts`）時，用 `config.battleStyle === 'deliberate'` 分支，避免改到封存模式的行為。

---

## 5. 已知問題

- 難度完全沒調（Alan 規則）；自動腳本無法代表真人難度。
- 鉤手借刺客外觀，兩者長一樣；祭司、召喚師借術士外觀。需要換色或新素材。
- 道具簡化：疾行靴只有移動 +15%（沒有「脫戰後下一擊加傷」）；聖徽只加自己命中（沒有光環）；煙霧袋、奧術徽記未做。
- 舊的「熟練」強化若加在 `fireball` 上，對沉穩節奏的 `flashFireball` 無效（強化系統之後要改成道具）。
- 攻擊移動不會自動開門，要點門或絞盤。
- 舊的手工遭遇（事件戰鬥）沒有小隊資料，全部算同一小隊（看到一名就全體進攻）。
- 頭像只是色塊佔位。
- 桌機橫向時下方 HUD 預留高度（`hudBottomHeight` 132）比新的卡片矮，鏡頭邊界可能被卡片蓋住一點。

## 6. 待確認事項（佔位值，回報時要列）

1. 敵人選目標權重、察覺距離（`SimConfig.enemyAggroRange`，10 m）、盾兵門檻 50%（`src/sim/data/enemies.ts`）。
2. 每場敵人點數預算、各敵人點數與解鎖層數（`src/run/data/deliberateLevels.ts`）。
3. 大火球（半徑 3.5、30–40）、詛咒爆裂（有詛咒 20–28／沒有 6–9）。
4. 道具價格、掉落率（一般 30%、精英 100%）、商人數量與貨架（`src/run/data/economy.ts`）。
5. 「點地圖打最近目標」是否只限遊俠。
6. SPEC_SLICE5 §13、§18 的其他項目。

## 7. 建議的下一步（等 Alan 決定，不要自行開工）

- 其他職業的技能循環（SPEC_SLICE5 §16 提案：戰士、狂戰士、遊俠、盜賊、牧師、煉金術士）。
- 頭像素材（側臉／正面兩張圖，或 3D 預渲染）。
- 舊強化（`UPGRADES`）逐步改寫成道具（SPEC_SLICE5 §17）。
- 新敵人的專屬外觀。
- 真人試玩後的數值調整（要 Alan 指示）。

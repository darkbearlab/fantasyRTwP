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
- **全選／全不選**：兩顆按鈕（Alan：全選一定是全選）；`mobileControls.order` 裡是 `selectAll`、`deselectAll`。
- **柔和迷霧**（正角俯視）：`BattleScene.drawSoftFog`——一格一個像素的畫布貼圖，用平滑（雙線性）取樣放大成漸層，每格透明度淡入淡出（`VISUAL.fogFadeSec`）。像素模式下 `refresh()` 會把取樣改回最近鄰，所以每次更新後要重設 `LINEAR`。
- **英雄技能重整**（2026-10-20，沉穩節奏）：
  - 戰士：主動＝盾擊（打斷＋暈眩 1 秒）；嘲諷光環 5 m、防禦 +10。
  - 遊俠：主動＝`sureShot`（瞄準射擊：打斷、命中 +60）；被動鷹眼（`seesBrush` 10 m：看得見草叢裡的敵人，`World.updateBrushSight` 分享給全隊）。
  - 牧師：被動多了祝福光環（`aura.allies`：5 m 內命中 +10、防禦 +5，沿用祝福的欄位）。
  - 法師：普攻＝小火球（`emberBolt`：攻速 −40%、傷害 +60%、命中點 1.5 m 爆炸）；寒氣光環（`aura.enemies`：3 m 內敵人移動與行動 −25%）；主動＝附魔（6 m 內隊友 10 秒傷害 +30%，只加攻擊力；命中從牧師光環等其他地方取得）。
  - 光環每節拍套用，離開範圍 0.25 秒後消失（`World.updateAuras`）。封存模式不受影響（被動只在沉穩節奏生效）。
- **戰吼**：沉穩節奏叫來的是屍僕雜魚（`warcry.deliberateSummon`），因為英雄現在沒有打斷手段；舊模式還是蠻兵。
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
- **美術方向改回 2D 像素**（2026-10-20）：素材說明在 `D:\_遊戲素材\像素素材\交接_像素素材給開發session.md`（格式、建議對照表）。Matt Walkden 的素材在私有 repo `darkbearlab/fantasyRTwP-assets`，本機 `npm run assets:pull`、部署時 `deploy.yml` 用 secret `ASSET_DEPLOY_KEY` 拉到 `public/assets/licensed/`（不進 git；**不要碰金鑰或 secret**）；0x72（CC0）在 `public/assets/0x72/`。程式在沒有 `licensed/` 時必須退回佔位圖形，CI 不拉私有素材。具名角色的專屬 sheet（七位隊員都有，`mw/sheets/heroes/<角色 id>.png`，只有側面）記在 `pixelArtData.ts` 的 `CHARACTER_UNITS`，靠 `UnitDef.portrait`（角色 id）找；沒載入時退回職業的 sheet。
  - 已接上（2026-10-20）：`config.art = 'pixel'` 為預設。`pixelArtData.ts`（對照表 `PIXEL_UNITS`、取格公式、動作）、`pixelArt.ts`（載入；缺圖的單位用色塊 `UnitView`）、`pixelView.ts`（單位外觀）、`BattleScene.drawPixelFloor`（0x72 地板，原始像素拼好再放大）。營火畫面也用像素 sprite。
  - Alan 的決定：對照表照交接文件建議、全部當佔位；**視角維持正角俯視＋縱向壓縮**（`ortho.squash` 2/3，讓 16 px 地板正好放大 3 × 2）；方向只用 3 方向；戶外關卡暫時也用地城地板，具體 asset 下一輪再決定；0x72 怪物攻擊用往前衝＋閃白。
  - **英雄換成職業色**：藍隊 sheet 的兩個隊伍色（#0000C0、#7D7DEA）在遊戲載入後換成職業色（`heroTeamColors`、`pixelArt.ts` 的 `ensureRecolored`），不另外產生圖檔。咒術師、牧師因此改用藍隊 Wizard 換色，不用 Cult／Holy 版。
  - **英雄卡頭像**：有像素素材時用 sprite 的側面（朝左）與正面待機格，選取時換正面（CSS `.m-sprite`）；沒有素材時是原本的色塊臉。
  - 建議表沒有、我先挑的：煉金術士＝綠色 Wizard、siege＝ogre、bomber＝goblin、exploder＝muddy、nest＝swampy。
- **切片 7（SPEC_SLICE7.md，2026-10-24 Alan 確認）**：一路向前、地圖上整備、解救英雄、配方昇變，分 S7-1～S7-5。
  - **S7-1 戰鬥狀態機**（已做）：
    - `World.inCombat`：已警覺的敵人離我方 `COMBAT_STATE.engageRange` 以內，或敵我有人打中對方，就是戰鬥中；停止 `exitDelay` 秒後才脫離（`src/sim/data/deliberate.ts`）。進出時發 `combatState` 事件。
    - 換裝備：指令 `setItems`（戰鬥中忽略），`Unit.setItems` 拿掉舊道具的被動、加上新的。
    - 道具欄（Alan 2026-10-29）：武器、防具、飾品各一格（`ItemDef.slot`）；裝到已經有東西的部位，舊的換回背包。舊存檔同部位多的放回背包（`deserializeRun`）。
    - 職業被動 +1 級的飾品（`ItemDef.passiveRank`）：`Unit.classRanks` 記基本等級（含等級 0），`setItems` 時加上道具的等級重新掛被動，可以超過上限。
    - 畫面：頂列的「戰鬥中／非戰鬥中」標示與 🎒 整備鈕（沉穩節奏的遠征才有）。整備面板用 `equipmentPanel`（`bagPanel.ts`），打開時暫停、戰鬥中按鈕全部鎖住；改了就 `setRun` 並送 `setItems`。
  - **S7-2 一路向前**（已做）：
    - `RunState.forward`（`JOURNEY.forward`，`src/run/data/journey.ts`）：沉穩節奏的遠征預設開啟，不建立 `overworld`（沒有主力與冠軍），只走 `MapNode.next`。舊的 FTL 路線圖測試用 `createRun(seed, { forward: false })`。
    - 出口直接接下一張圖：`toMap` 有 `exitTo` 就直接 `chooseNode`。每章第一張圖自動進入（`startNodeOf`）。
    - 出口預告：`previewOf`（`src/run/journey.ts`）回傳地形、可能取得的東西、敵人以外的氣息、威脅，不說節點類型。地上的出口文字、戰鬥中左側的「前方的路」（`RouteMini` 的 `buildAhead`）、路線圖畫面（`MapScene.buildAhead`，休息與事件之後）都用它。
    - 地圖上的商人：商人節點是一般戰鬥地圖加上 `withMerchant`（互動物件 `kind: 'merchant'`，可以一直用）。戰鬥階段帶 `phase.shop` 貨架，`shopOf(run)` 兩種商人通用。互動後 `session.merchantOpen`，整備面板切成商店模式。消耗品用 `stockBag` 指令放進 sim 的包包，金幣由遠征扣。
    - 休息、事件節點暫時照舊是獨立畫面。
  - **S7-3 解救英雄、開局兩人、陣亡永久**（已做）：
    - 開局兩人（`JOURNEY.startParty`，組隊畫面可選重複職業），其他欄位是空的。
    - 被困的英雄：`rescueAt(run, nodeId)` 依種子決定（一般戰鬥、`JOURNEY.rescue.chance`），出口預告算「敵人以外的氣息」。`rescueHero` 產生加入前的樣子：隊伍等級、(等級 − 1) 個升級，先走一個昇變分支。戰鬥階段帶 `phase.rescue`。
    - sim：`UnitSpawn.captive`（看守的小隊）→ `Unit.captive`／`rescue`。被困時敵人不能把他當目標、他也不動；有英雄走到 `CAPTIVE.wakeRange` 內或看守被驚動，就變成最近那名英雄的隨從，看守開始進攻（`captiveFreed` 事件）。
    - 戰後：活著跟著離開就是 `outcome.rescued` → `RunState.pendingRescue` → 選完升級後進 `rescue` 階段（`RescueScene`），`resolveRescue` 決定加入（填第一個空欄位，陣亡的欄位也算）或離開，接著照常進下一張圖。
    - 陣亡就是沒了：一路向前時 `canRevive`、`canRecruit` 都是 false，休息畫面不顯示救人與招募；鳳凰羽毛不賣、不掉（`JOURNEY.removedConsumables`）；陣亡英雄的裝備掉回背包。
    - 第 1 章改用 `empireRaid` 陣營：劍兵、斧兵、弓手為主，盾兵權重降低，營地沒有鐵砧。
  - **S7-4 每人各自升級、配方昇變**（已做）：
    - 配方在 `src/run/data/recipes.ts`：`RECIPES`（這幾種升級都拿到＋其中 `maxed` 升滿）、`UPGRADE_MAX_RANK`（職業升級能拿幾次，沒列的只能一次；通用升級不限）、`RECIPE_RULES`（`mode` choice／auto、`classSlots`、保底 `pityFromLevel`）。目前每份配方是原本分支的三個專屬升級，佔位。
    - 每升一級，每名活著的英雄各自三選一（`RunState.heroPicks`、獎勵階段的 `pickSlot`）：兩張職業升級（正在湊的配方優先）＋一張通用（不出全隊的）。湊齊配方時多一張昇變卡（`evolve_<配方>`，`UpgradeDef.evolve`），選了才昇變（`evolveHero`）。昇變後只剩通用升級。
    - 規則在 `src/run/upgrades.ts`：`rankOf`、`maxRankOf`、`recipeDone`、`readyRecipes`、`heroLevelUpOffer`。一路向前時 `grantUpgrade` 用等級規則，不再用「同分支選滿三個」；舊模式照舊。
    - 隊伍面板每份配方一行（拿到的亮、要升滿的標等級、湊齊的金色）；升級卡顯示等級與用在哪些配方。
    - 被救的英雄照一份配方配點，湊齊就已經昇變。
  - **S7-5 強度曲線**（已做）：
    - `JOURNEY.curve`（`src/run/data/journey.ts`）：敵人生命與傷害 ×（1 ＋ perDepth ×（全程層數 − 1））× 章節倍率。全程層數是前面各章層數加總，不打折。頭目從第 1 章頭目那一層開始算。經驗值跟著強度再乘 `xpMult`。只用在一路向前；舊模式照舊用 `layerScaling`、`depthCarry`。
    - 預期等級：`ECONOMY.xp.targetPerMap`（第 N 張圖約 1 ＋ (N − 1) × 0.5 級），只拿來對照。
    - 實測工具：`npm run curve -- --runs 30 [--seed 1] [--policy exit|clear] [--perDepth …] [--chapterMult …] [--xpMult …]`（`tools/journeyCurve.ts`）。腳本 AI 新增 `SCRIPT.mode = 'exit'`：像玩家一樣往出口走，打附近或追上來的敵人；精英、頭目圖先打隊長、頭目；有空位就先去救人。
    - 2026-10-24 的起點：perDepth 0.09、章節倍率 0.55／0.75／0.95／1.1／1.25、xpMult 0.4。腳本 AI 30 趟：第 1 章每張圖 93～97%，全滅平均分散在各章（8／8／5／3／2），通關 13%，等級接近預期。
    - 順手修：被困的英雄不聽指令（`liveUnits` 排除）；自動玩家給需要技能的升級時傳對技能。
  - **途中停靠**（Alan 2026-10-24，SPEC_SLICE7 §1）：
    - `foldStops`（`src/run/journey.ts`）：一路向前時，休息、商人、事件節點變成一般戰鬥地圖，原本的類型記在 `MapNode.stop`。
    - `toMap` 走進出口時，先進停靠點的畫面（`enterStop`，`RunState.stopsDone` 記住停過了），離開後直接進那張圖。
    - 出口預告的 `PathPreview.campfire`、`wayPresence`。
    - 事件打起來時，那一場就算這張圖（`applyBattleResult` 把 `currentNodeId` 設成它）。
    - 地圖上的商人 NPC（`withMerchant`、`merchant` 互動、商店面板、`stockBag`）保留，目前沒用到。
  - **敵人級距與數量**（Alan 2026-10-24，數字佔位）：`JOURNEY.hpBaseline`：前期一般敵人的生命向下對齊到 hp，全程深度到 fullAtDepth 才回到原本的。`JOURNEY.countMult`：一般敵人多出幾名，站在同小隊旁，頭目圖不加。都在 `createBattleFromRun`（小波次也吃 hpBaseline）。
  - **職業被動的等級**（Alan 2026-10-25）：
    - 四個基本職業可以變強的被動（橫掃、嘲諷光環、穿透箭、鷹眼、火彈、寒氣、聖鎚、祝福光環）分等級，最高 3 級。
    - 每級加多少在 `CLASS_PASSIVE_RANKS`（`src/sim/data/passives.ts`，`passiveAtRank` 產生各級的樣子，id 不變）。
    - 起始等級 `CLASS_PASSIVE_RULES.startRank`：1＝天生就有，0＝要從升級拿。個別被動可以用 `start` 指定（遊俠的穿透箭、牧師的聖鎚是 0，Alan 2026-10-25）。
    - 升級是 `cp_<被動>`（`UpgradeDef.innate`），出現在每人三選一的職業格。不算昇變配方；昇變後只要新職業還有這個被動，就能繼續升。
    - 戰鬥時由 `classPassivesOf` 透過 `UnitSpawn.classPassives` 帶進 sim；舊模式照舊用 `CLASS_PASSIVES`。
    - 戰地救護沒有可以變強的數字，維持天生。
  - **命中公式與英雄的盾**（Alan 2026-10-25）：
    - 沉穩節奏的命中率 ＝ 95% ＋ 命中 − 防禦，超過 100% 的部分變爆擊。`SimConfig.hitRule`（`src/sim/data/hit.ts`），`DELIBERATE_PACE.hitBase`。舊模式照舊 50／100。
    - 英雄的盾：被動 `shieldDefense`，取最高、不疊加，`HERO_SHIELD.defense` = 25。戰士、守護者、角鬥士天生有（`shieldBearer`），鐵盾、塔盾道具也有。
    - 敵人的盾照舊是 +20 防禦、+4 護甲，生命一半以下破。
    - 統計：`npm run herostats`（`--legacyHit`、`--hitBase`、`--heroDef`、`--enemyDef`），報告在 `docs/HERO_STATS.md`。
  - **失衡值**（`SPEC_STAGGER.md`，ST-1 已做 2026-10-25，只用在沉穩節奏）：
    - 數值在 `src/sim/data/stagger.ts`（`STAGGER`、`poiseOf`、`staggerStunOf`；`UnitDef.poise`／`staggerStun` 可個別指定）。
    - 累積在 `applyDamage`（敵方命中、非持續傷害）：傷害 × 倍率 ＋ 定額；技能的 `SkillDef.stagger`、爆擊等級的 `CritTier.stagger`、衝擊屬性 `bluntMult`。到上限由 `addStagger` 暈眩、歸零。
    - 交戰中不消退（`World.engaged`）；暈眩中不累積；暈眩後 `Unit.staggerHalf` 秒內減半。
    - 打斷不再附帶暈眩；道具與觸發的 `stun` 換算成失衡（`perStunSec`）；擊退撞牆、擲人落地改成定額；「堅定」改成受到的失衡 −30%。封存模式全部照舊。
    - 畫面（ST-2）：精英、頭目頭上生命條上方的橘色細條（BattleScene），頭目大血條下一條（bossShow），英雄卡生命條下一條（mobileBar、UIScene）；打破時橘色圈＋衝擊特效。
    - 量測（ST-3）：`npm run herostats` 多了「打破」「被打破」欄。
  - **刺客的潛行**（Alan 2026-10-25）：刺客的主動技能從背刺換成潛行（`stealth`，效果 `kind: 'stealth'`）。最多 8 秒完全偵測不到（`Unit.stealthFull`，貼身也看不到），出手就解除；從潛行打出的第一擊命中 +50（`Unit.ambushAccuracy`，在 `strike` 用掉）。施放時正在瞄準他的敵人失去目標；4 m 內有敵人不能用；冷卻 15 秒（沉穩節奏 ×2）。戰鬥外也能用。
- **切片 6（SPEC_SLICE6.md）**：S6-1 模板拼接關卡已做（2026-10-20）。模板在 `src/run/data/templates.ts`（文字地圖，圖例在檔案開頭），池子與版面在 `src/run/data/levelPools.ts`，拼接在 `src/run/templateLevelGen.ts`；`LEVELS.deliberateGenerator` 可切回舊的隔牆關卡（classic）。預覽：`npm run level:preview` → `preview/levels.html`。效能：6 × 6 區塊（96 m）每節拍約 0.22 ms（桌機），可以做大型關鍵地點。S6-2 出口制也已做：`MapDef.exits`／`exitLock`，`World.checkExits`（全員在同一個出口才勝利，`exitWaiting` 事件提示「You must gather your party before venturing forth.」），生成時一個下一層節點一個出口（`carveExits`，依路線圖由左到右排在地圖遠端），`RunState.exitTo` 讓路線圖只能前往那個節點。精英關卡要打倒隊長、頭目關卡要打倒頭目才開門；最後的頭目戰沒有出口，打倒頭目就勝利。S6-3 經驗值也已做：經驗值只來自擊殺（`src/run/xp.ts`，數值在 `ECONOMY.xp`），隊伍共用等級；沉穩節奏不再每場三選一，升級才三選一（`RunState.pendingLevelUps`，升幾級選幾次，`levelUpTo` 是正在選第幾級），沒升級時戰果畫面只有「繼續」（`continueFromReward`）。封存模式照舊每場三選一。S6-4 FTL 式路線圖也已做：沉穩節奏的遠征用 `generateRouteMap`（`src/run/routeMap.ts`，旋鈕在 `src/run/data/routeMap.ts`；每層 4～5 個節點、同層橫向連線、所有連線雙向 `MapNode.links`），回合與壓力在 `src/run/overworld.ts`（`RunState.overworld`：回合、造訪次數、主力、冠軍）。`chooseNode` 每次移動推進一回合；被主力佔領的節點是強化戰鬥（`phase.mods.force`），冠軍追到是冠軍戰（`mods.champion`），重複訪問重新生成（`phase.visit`）。關卡的出口在相鄰節點的方向（上＝下一層、下＝前一層、左右＝同層），出生點在來的那一側（`templateLevelGen` 的 `entry`、`orient`）。休息時 `campfireSmoke` 讓冠軍多走一格。`createRun(seed, { layers })` 或封存模式仍用舊的單向路線圖。難度完全沒調：自動遠征目前通關率很低。
- **營火對話**（休息節點）：先進 `CampfireScene`（英雄圍著程式畫的火堆、上下兩個對話框、頭像用 sprite），看完或略過才打開休息選單；看過的記在 `phase.talked`。台詞在 `src/run/data/campfire.ts`（通用台詞，`{0}` 換成職業名），挑選在 `src/run/campfire.ts`（依種子＋節點，同一節點每次一樣）。
- **故事大綱**：`STORY.md`（Alan 口述，尚未實作：五張路線圖、魔法水晶、FTL 式路線圖與魔王冠軍追擊）。
- **戰鬥地圖改用 finalbossblues 地形＋程序生成**（2026-10-21，交接文件 `D:\_遊戲素材\像素素材\交接_finalbossblues地圖素材給開發session.md`）：
  - `LEVELS.deliberateGenerator = 'fbb'`：前 `FBB_LEVELS.townUntilLayer` 層是城內（`townGen`，燃燒的王都），之後是野外（`fieldGen`），頭目關卡仍用模板拼接（`src/run/data/fbbLevels.ts`）。
  - 轉成戰鬥地圖在 `src/run/fbbLevel.ts`（格子 → 世界座標、擋路／擋視線、出口、敵人面向）；生成結果放在 `MapDef.art`，畫面層 `src/game/render/fbbMapView.ts` 照它拼圖塊。
  - 這種地圖**不做縱向壓縮**（`setOrthoSquash(1)`，BattleScene 載入時設定、離開時還原）。
  - 入口可以在四邊（`edgeLayout.ts`），出口也可以在入口那一邊（排在離入口遠的那一半）。
  - 手工預製件（交接文件 §10）：`src/run/data/tilePrefabs/*.json`，`BootScene` 用 `import.meta.glob` 登記（`tilePrefabRegistry.ts`）；城內沒有預製件的房子是佔位矩形（首都一系列的圖之後重做）。
  - 像素單位有陣營色外框（`VISUAL.teamOutline`），另外疊一層在樹冠、牆之上，被遮住也看得到。
  - 石牆用拉高版（`FBB_VIEW.tallWalls`，Alan 還沒在兩版之間定案）；調色只做乘色，飽和度還沒做。
  - **小衝突導演**（Alan：類似 L4D 的 AI 導演，探索永遠有威脅感）：`src/sim/skirmishDirector.ts`、資料 `src/sim/data/skirmish.ts`。
    - 沒在交戰的時間累積 12～18 秒（Alan：交戰中計時要停；打完至少喘 5 秒），就在視野外、和前幾波不同的方向叫出 2～3 名敵人，一波的「估計處理秒數」不超過 10 秒，沒有總數上限。
    - 導演叫來的還活著 5 名以上就先等。
    - 波次的敵人沒接戰時沿流場（水流法，`world.flowNext`）往隊伍走，接近後照一般 AI；流場走不到的窄處改用 A*。
    - 只在沉穩節奏的 fbb 地圖、非頭目關卡（`createBattleFromRun`）。量測：`npx tsx tools/skirmishMeasure.ts`。
  - **雜魚**：劍兵 `raider`、斧兵 `axeman`（帝國軍 sprite）。生命低、傷害高、優先撲後排；被戰士嘲諷或貼身擋住就打戰士。
  - **鐵砧**：盾兵不當雜兵；營地、檢查點、城內小隊各一名盾兵站在正中（`SITES.*.anvil`、`TOWN.anvil`），不參與升級。
  - 角色直徑約 1 m：城內巷子至少 2 格、哨點內側至少 2 格；轉成戰鬥地圖時再用導航格（半徑 0.55）驗一次可達性，不通就換子種子。
  - 素材不在（CI、沒拉素材）時退回程式畫的方塊。試產工具：`tools/fieldPreview.ts`、`tools/townPreview.ts`。
- **物理／特殊與屬性相剋**（2026-10-21，`SPEC_DAMAGE.md`；只用在沉穩節奏）：
  - 每招有類別（物理／特殊）和一個或多個屬性：切割、劈砍、衝擊、穿刺、火、寒、聖、暗。
  - 打進去：1d100 ＋ 命中 − 防禦 × 相剋／被剋倍率 ≥ 50。
  - 傷害：傷害 × 相剋倍率 × K ÷（K ＋ 護甲 × 被剋倍率）。
  - 資料都在 `src/sim/data/damageTypes.ts`：普攻表、技能表、抗性與弱點、特殊防禦。結算在 `actions.ts` 的 `strike()` 與 `mitigate()`。
  - 盾兵舉盾改成物理防禦 ＋20、護甲 ＋4，抗切割、穿刺，怕衝擊。
- **存檔**（2026-10-21）：`src/game/save.ts`，localStorage 鍵 `fantasyRTwP.run`。
  - `runFlow.setRun` 每次都自動存；遠征結束（phase ended）就刪掉存檔。
  - 標題畫面有存檔時顯示「繼續遠征」和摘要；開新遠征會先確認再覆蓋。
  - 戰鬥中的狀態不存：讀檔後從那場戰鬥開頭重來（關卡依種子重新生成）。
  - localStorage 不能用時當作沒有存檔。
- **手感調整**（2026-10-21，Alan：「很真實世界，但作為遊戲太泥濘」；`DELIBERATE_PACE`，只用在沉穩節奏）：
  - 一般敵人生命 ×0.5（`enemyHpMult`；精英隊長、頭目不變；在 `createBattleFromRun` 套用）。
  - 英雄技能效果 ×1.5（`heroSkillPower` → `SimConfig.heroSkillPowerMult`）：技能傷害、範圍傷害、治療、附魔增益、技能留下的地面效果。冷卻、時間、範圍、暈眩長度不變。
  - 英雄普攻速度 ×1.5（`heroAttackSpeed` → `basicAttackSpeedMult`）；敵人普攻速度也 ×1.5（`enemyAttackSpeed` → `enemyAttackSpeedMult`）。
- **地圖操作**（Alan 2026-10-21）：
  - 輕點地面＝純移動（途中不理敵人）。
  - 原地按住 `GAME_CONFIG.longPressSec`（1 秒）＝攻擊移動：有進度圈；拖曳過就不算，要另外放下手指按住才算。滑鼠右鍵也是攻擊移動。
  - 點敵人＝攻擊移動到那裡。點我方英雄 sprite＝只選那名。
  - 攻擊移動一出手就記 `engaged`：目標被推開、死掉時沉穩節奏的英雄就地駐守，遠程不追出射程（`World.executeAttackMove`）。
  - 指令線只畫被選取的英雄，指令更新後變淡變細（`VISUAL.routeLine`）。
  - 以友軍為目標的技能瞄準中，可以當目標的英雄卡出現「▼ 目標」，點卡片就是選目標。
- **同隊間隔**（Alan 2026-10-21：不要擠成一坨；控制區不做）：沉穩節奏的同隊單位之間保持 0.5 m（`DELIBERATE_PACE.unitSpacing` → `SimConfig.unitSpacing`），軟性推開（`unitSpacingRate`），在 `nav/avoidance.ts` 的 `separateUnits`。
  - 單位可以用 `UnitDef.spacing` 要更大的間隔，`pushWeight` 越大越不容易被推開。
  - 敵對單位之間不套用（近戰要貼身）。
- **頭目**（Alan 2026-10-21）：
  - 頭目關卡走專屬的頭目房（`src/run/bossArena.ts`，`fbbLevel.bossEncounter`）：短走道進到石牆圍起來的房間，往前走一點就是頭目，房外是密林。
  - 頭目第一次被看到：sim 發 `bossSighted`，頭目身邊暫時有視線（`BOSS_INTRO`）。畫面（`src/game/bossShow.ts`）的流程：
    1. 暫停，鏡頭帶到頭目。
    2. 上方的頭目血條槽先拉滿、再填血，頭目喊話（`BOSS_LINES`）。
    3. 鏡頭回到原位，遊戲維持暫停。
  - 頭目擊敗：鏡頭帶過去 → 定格 → 紅黑雙色 → 左右抖動往下沉，演完才跳勝利畫面。
  - 魔王主力從第一層（玩家後方）開始往玩家擴散，和頭目前後包夾（`ROUTE_MAP.force.startFrom`）。
  - 戰爭領主新招「擲人」（`hurl`）：抓身邊的英雄，丟向遠處的英雄（後排優先），落點有預兆圈，落地範圍傷害、被丟的人暈眩。
- **牧師與消耗品**（Alan 2026-10-21：回血要有消耗感）：
  - 牧師主動改成「聖域」（地上 2.5 m，5 秒內友軍受傷 −30%，ward 區域效果）。
  - 戰後整補變成牧師的被動「戰地救護」：牧師活著才有（`ECONOMY.fieldCareClasses`）。
  - 消耗品（`src/sim/data/consumables.ts`：治療藥水、群體藥劑、鳳凰羽毛、煙霧彈）放在隊伍共用的包包 `RunState.bag`（上限 6，開局兩瓶藥水）。
    - 戰鬥中：🎒 鈕直接使用（`useConsumable` 指令、共用冷卻 3 秒、要選目標的點英雄卡），戰後剩下的寫回遠征。
    - 路線圖：背包面板裡使用。
    - 取得：商人買、戰後掉落（`src/run/consumables.ts`）。
- **出口通往哪裡**（Alan 2026-10-21）：
  - 每個出口有字母和顏色（`src/game/exitInfo.ts`）。地上的方塊、出口文字、畫面外的指示三角形都用同一組字母和顏色。
  - 出口文字有兩行：第一行是字母、方向、節點類型；第二行是層數、主力佔領、冠軍、去過。
  - 上方 🗺 鈕開關迷你路線圖（`src/game/ui/routeMini.ts`），出口通往的節點會用同色框加字母標出來。
  - 點地上的出口方塊時（`session.exitPing`），迷你路線圖會自動打開，對應的節點閃一下。
- **昇變（轉職）系統**：規劃在 `SPEC_CLASSES.md`（Alan 已確認），分五個階段做。
  - 第一階段（引擎機制，只用在沉穩節奏）已完成：
    - 爆擊分級（`CRIT_TIERS`，damageTypes.ts）：≥100 ×1.5、≥120 ×2＋打斷、≥150 ×2.5＋暈眩 0.5 秒。
    - 背刺改成加命中 `BACKSTAB_ACCURACY`。
    - 相剋取最有利的屬性（`matchup`）。
    - 命中附帶破甲（被動 onHit `sunder`）。
    - 吸血：被動 `lifesteal`、光環 `aura.drain`、技能效果 `drain`（目標類型 `unit`）。
    - 集中狀態（`src/sim/focus.ts`、技能效果 `focus`）。
    - 測試在 `tests/classEngine.test.ts`。
  - 第二～五階段（2026-10-21 完成）：
    - **分支**：`src/run/data/branches.ts`。專屬升級在 `UPGRADES`，`branch` 欄位指回分支。
    - **昇變**：`grantUpgrade` 選滿 3 個就昇變。
      - `HeroRecord.classId` 換成進階職業，`baseClass` 記住原本的職業。
      - 剛昇變的英雄放在 `RunState.evolutionShow`，畫面播完就清掉（`src/game/ui/evolutionShow.ts`）。
    - **升級三選一**：`levelUpOffer`，兩名英雄各一個專屬＋一個通用。`reward.optionSlots` 記住專屬升級是給誰的。
    - **通用池**：`generalUpgradeIds(style)`。同袍只在舊模式；心防、法抗只在沉穩節奏。
    - **進階職業**：12 個，HEROES／CLASSES／CLASS_PASSIVES 等表都以職業 id 為鍵。狂戰士回收舊的變體；刺客、死亡法師複製盜賊、咒術師的資料。
    - **開局與招募**：沉穩節奏只有四個基本職業（`STARTER_CLASSES`）。
    - **新的通用機制**：
      - 光環：`cover`（分擔傷害）、`enemies.vuln`（易傷）、`allies.damagePct`（加攻擊）。
      - 被動：`critAfterInterrupt`（打斷後必定爆擊）。
      - 附魔帶屬性：`enchant.attrs`。
      - 區域效果：`zone.extra`（同一點再放第二個區域）。
    - **測試**：`tests/branches.test.ts`、`tests/evolvedClasses.test.ts`。
- **戰役骨架**（Alan 2026-10-21，`SPEC_CAMPAIGN.md`）：
  - **章節**：一趟遠征五章（`src/run/data/chapters.ts`），層數 5／6／7／8／9。
  - **頭目與過場**（`src/run/campaign.ts`）：
    - 打倒本章頭目照常拿戰果與升級，回路線圖前進過場（`InterludeScene`）。
    - 過場時全隊回滿，陣亡的英雄不復活；按出發才產生下一章的路線圖、主力與冠軍。
  - **敵人強度**：看全程深度（前面各章的層數加總，`depthOffset`）。
  - **佔位**：第 3～5 章先用冬季野外，敵人用帝國叛軍、頭目用戰爭領主。
- **魔王的冠軍**（Alan 2026-10-22；設定在 `ROUTE_MAP.champion`）：
  - **登場**：被追上時照常進該節點的地圖（不再是專屬的冠軍戰）。
    - 冠軍從他來的方向的出口進場（`championSpawn`），一般 15 秒後、營火引來或非戰鬥節點 2 秒後。
    - 進場前有預告；第一次看到時播頭目登場演出。
  - **逃跑**：可以從出口逃走；冠軍傷勢恢復，繼續在大地圖上追。
  - **打倒後**：本章不再出現（`champion.defeated`）。
  - **招式**：沒有普攻，全是預兆攻擊——扇形揮擊、直線衝鋒（撞牆暈眩）、馬匹震地（`quake`）、橫掃衝鋒（衝鋒＋右側平行帶 `rush.side`）、吐息（火＋暗）。每章多學一招（`moves`）。
  - **免疫**：不吃擊退和一般暈眩，只有盾擊、瞄準射擊打得斷（`interruptibleBy`）。
  - **台詞**：第 3 章起才有（`lines`）。
  - **還沒做**：優先攻擊水晶持有者（等水晶做了再接）。
- **強度曲線**（Alan 2026-10-22：試算發現後期強度通膨）：
  - 深度加成減半（`CHAPTER_RULES.depthCarry` 0.45）。
  - 經驗值乘上敵人強度倍率（`ECONOMY.xp.scaleWithEnemy`）。
  - 隊伍每升一級，全隊最大生命與傷害 +3%（`ECONOMY.xp.perLevelGrowth`，記在 `HeroRecord.level`）。
  - 「每張地圖的升級點數上限」等自動玩家修好、實測後再看。
- **設定**：暫停時取消選取所有英雄（`session.controls.deselectOnPause`，存在瀏覽器）。
- **戰鬥結算**（`src/game/ui/arcadeResult.ts`，Alan 2026-10-22）：遠征中打贏時的獨立畫面，大型電玩風格。
  - 標題「第 N 章　N-L 完成／重訪」。
  - 每名英雄一行，打倒的敵人（`Unit.killList`）由左到右演出被擊敗，然後標出 MVP。
  - 經驗值條：光點飛進條裡、升級閃光，按繼續才選升級。
  - MVP 獎勵是鉤子（`progression.mvpReward`，目前沒有獎勵）。
- **休息節點**（Alan 2026-10-22）：
  - 訓練＝一次升級三選一，不提升隊伍等級。
  - 紮營、訓練、救人都會引來冠軍；繼續趕路不會。
- **敵方陣營**（`src/run/data/factions.ts`）：每章一個陣營，包含據點的雜兵與鐵砧、升級池、小波次、隊長、頭目與頭目房。
  - 第 1 章：帝國叛軍。
  - 第 2 章「荒野」：獸人部落（Alan 2026-10-21 同意提案）。
    - **雜兵**：哥布林、獸人戰士、投石手（拋物線）。
    - **支援**：薩滿（補血＋狂暴）。
    - **鐵砧**：食人魔（巨棒橫掃）。
    - **伏兵**：潛伏者。
    - **營地的戰鬥圖騰**：疊加型光環 `stackDamagePct`。
    - **頭目**：獸人酋長（戰吼叫哥布林、跳斬後排、投擲巨石、巨棒橫掃）。頭目房是林中空地（`BossArenaSpec.arena = 'clearing'`），四根圖騰，打掉圖騰酋長就變弱。
  - 敵人的 `def.passives` 在沉穩節奏會帶上（敵我都適用）。
  - 0x72 的單位可以指定整數放大倍率（`scale`）：酋長是獸人戰士放大；圖騰先用石柱的圖。
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
| `src/run/data/characters.ts`、`src/run/characters.ts` | 具名角色（SPEC_CHARACTERS）：角色資料、可登場的角色、英雄顯示名稱 `heroName`／`heroShortName`、還沒登場的角色 |
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
- 頭像（Alan 2026-10-30）：具名角色的頭像在 `public/assets/portraits/`（原檔與像素化工具在 `docs/art/portraits/`）。
  - 32×32（`mini/`）：底部英雄面板，放大 2 倍、名字蓋在下緣；沒選取時暗、選取時正常亮度（CSS `.m-mini`）。
  - 96×80（`dialog/`）：營火對話框的頭像框裡，原尺寸不放大（`CampfireScene.setPortrait`）。Alan 看過文字冒險式排版（頭像站在框上）後決定放回框內。
  - 沒有具名角色的單位（隨從、舊模式）照舊用 sprite 或色塊。
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
- 舊強化（`UPGRADES`）逐步改寫成道具（SPEC_SLICE5 §17）。
- 新敵人的專屬外觀。
- 真人試玩後的數值調整（要 Alan 指示）。
- **真實投射物**（Alan 2026-10-31 列入待辦）：遠程單體攻擊現在是追蹤彈，飛到才擲命中，只會被擋視線的障礙物擋下。
  改成「直線飛、以路徑上碰到的第一個東西為目標」。建議先做最便宜的版本，做成開關可以和現在的方式切換：
  - 預判瞄準：飛行約 0.5 秒，不預判的話移動目標幾乎全 miss。
  - 只碰敵方、穿過隊友。
  - 碰到後照舊擲命中。
  - 範圍技能不變。
  之後再談打到隊友（AI 要找射擊角度）和數值。

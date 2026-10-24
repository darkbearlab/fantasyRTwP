import { tr } from '../../i18n';
import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import type { Order } from '../../sim/commands';
import { DT } from '../../sim/constants';
import { SKILLS } from '../../sim/data/skills';
import type { SimEvent } from '../../sim/events';
import type { Vec } from '../../sim/math';
import type { Unit } from '../../sim/unit';
import { UnitState } from '../../sim/unit';
import { T_BRUSH, T_HEDGE, T_HIGH, T_SHALLOW } from '../../sim/terrain';
import { bakeGraphics } from '../render/bake';
import { DebugOverlay } from '../render/debugOverlay';
import { Fx } from '../render/fx';
import { BossShow } from '../bossShow';
import { VFX_USE } from '../render/vfxData';
import { ROUTE_MAP } from '../../run/data/routeMap';
import { exitInfos } from '../exitInfo';
import type { ExitInfo } from '../exitInfo';
import { enemyRank } from '../../sim/data/enemies';
import { AOE_STYLE, COLORS, FONT, PROJECTILE_STYLE } from '../render/palette';
import type { SkillDef } from '../../sim/data/types';
import { OBJECT_DEPTH_BASE, UnitView } from '../render/unitView';
import type { UnitVisual } from '../render/unitView';
import { FlareView } from '../render/flareView';
import { DIR_NAMES, FLARE, FLARE_TILES, displayFacing, ensureFlareLoaded, flareDir, getArt, useFlare, wantsFlare } from '../render/art';
import { Hero3DView } from '../render/hero3dView';
import { PixelView } from '../render/pixelView';
import { m72Key, pixelArtFor, pixelFloorReady } from '../render/pixelArt';
import { floorTileFor } from '../render/pixelArtData';
import { InteractablesView, drawBox } from '../render/interactView';
import { p3dKey, props3dLoaded } from '../render/props3d';
import { PROP_META, PROPS3D, obstacleUsesProp, planProps } from '../render/props3dPlan';
import type { InteractableState } from '../../sim/interact';
import type { LootDef } from '../../sim/data/types';
import { SHRINE_RULES, SHRINES } from '../../sim/data/shrines';
import { CONSUMABLES } from '../../sim/data/consumables';
import { ITEMS } from '../../sim/data/items';
import { FOG_VISIBLE } from '../../sim/vision';
import { ensureHeroes3dLoaded, h3dCharFor, heroes3dLoaded } from '../render/heroes3d';
import type { ArtMode } from '../render/art';
import {
  depthOf,
  getProjection,
  groundArc,
  groundCircle,
  groundLine,
  groundPolygon,
  groundRect,
  groundSector,
  hasHeight,
  isIso,
  mapScreenBounds,
  orthoSquash,
  screenToGround,
  setOrthoSquash,
  worldToScreen,
} from '../render/projection';
import { FbbMapView, isFbbMap } from '../render/fbbMapView';
import { pixelGlow } from '../render/pixelGlow';
import type { ProjectionMode } from '../render/projection';
import { VISUAL, obstacleHeight, obstacleKind } from '../render/visual';
import { InputController } from '../input/inputController';
import { nearestTargetTo, targetingDef, validSkillTarget } from '../input/targeting';
import { BattleSession, currentSimConfig } from '../session';
import { installAutoPause } from '../autoPause';
import { battleSeed, createBattleFromRun, currentEncounter } from '../../run/battle';
import { rushEnd } from '../../sim/actions';
import { getRun } from '../runFlow';
import type { RunState } from '../../run/runState';
import { createRun } from '../../run/runState';

/** 互動物件的名稱（沒有名稱時依種類） */
function objectName(o: InteractableState): string {
  if (o.def.name) return o.def.name;
  switch (o.def.kind) {
    case 'door':
      return tr("門");
    case 'chest':
      return tr("寶箱");
    case 'shrine':
      return o.def.shrine ? SHRINES[o.def.shrine].name : tr("祭壇");
    case 'pickup':
      return o.def.loot ? lootName(o.def.loot) : tr("道具");
    case 'merchant':
      return tr("商人");
    default:
      return tr("拉桿");
  }
}

/** 寶箱、地上道具的內容（給人看的名稱） */
function lootName(l: LootDef): string {
  switch (l.kind) {
    case 'heal':
      return tr("回復藥草");
    case 'consumable':
      return CONSUMABLES[l.id]?.name ?? l.id;
    case 'item':
      return ITEMS[l.id]?.name ?? l.id;
    case 'xp':
      return tr("經驗值 +{0}", { 0: l.amount });
    case 'gold':
      return tr("{0} 金幣", { 0: l.amount });
  }
}

/** 滑鼠提示的第二行 */
function objectHint(usable: boolean, o: InteractableState): string {
  switch (o.def.kind) {
    case 'door':
      if (o.def.locked) return o.open ? tr("（已打開）") : tr("（上鎖，要找別的機關）");
      return o.open ? tr("右鍵：關門") : tr("右鍵：開門");
    case 'chest':
      return usable ? tr("右鍵：打開") : tr("（已經打開了）");
    case 'pickup':
      return tr("右鍵：撿起");
    case 'shrine': {
      const d = o.def.shrine ? SHRINES[o.def.shrine] : null;
      if (!usable) return tr("（已經用過了）");
      return d ? tr("{0}（{1} 秒）\n右鍵：祈禱", { 0: d.description, 1: SHRINE_RULES.duration }) : tr("右鍵：祈禱");
    }
    case 'merchant':
      return tr("右鍵：交易（非戰鬥中才做生意）");
    default:
      return usable ? tr("右鍵：拉動") : tr("（已經拉過了）");
  }
}

/** 持續地面區域的顏色：[填色, 邊框] */
const ZONE_COLORS: Record<string, [number, number]> = { swamp: [0x5a6a22, 0xa5b84a], fire: [0xb3471c, 0xff8a3d], holy: [0xb39b3c, 0xffe27a] };

const STATUS_COLOR: Record<string, string> = { 暈眩: '#ffe066', 定身: '#a6e3ff', 燃燒: '#ff9a4a', 詛咒: '#d59af0' };

/** 戰鬥場景：固定節拍推進 sim、插值渲染、把 SimEvent 轉成飄字與戰鬥紀錄 */
export class BattleScene extends Phaser.Scene {
  session!: BattleSession;
  input2!: InputController;
  private views = new Map<number, UnitVisual>();
  private statusTexts = new Map<number, Phaser.GameObjects.Text>();
  /** 方向對照的標籤（除錯） */
  private facingTexts = new Map<number, Phaser.GameObjects.Text>();
  private fx!: Fx;
  private debugOverlay!: DebugOverlay;
  private zoneG!: Phaser.GameObjects.Graphics;
  private overG!: Phaser.GameObjects.Graphics;
  private ghostG!: Phaser.GameObjects.Graphics;
  private dim!: Phaser.GameObjects.Rectangle;
  private brushG!: Phaser.GameObjects.Graphics;
  private fireG!: Phaser.GameObjects.Graphics;
  private brushVersion = -1;
  private coverText!: Phaser.GameObjects.Text;
  /** 本幀對我方隱藏的敵人（草叢隱匿） */
  private hiddenIds = new Set<number>();
  private alpha = 0;
  private resultShown = false;
  private quickEncounter: { id: string; layer: number } | null = null;
  /** 上一幀的真實時間（Phaser 的 delta 會被平滑，掉幀時 sim 會變慢動作） */
  private lastFrame = 0;
  /** 依投影建立的畫面物件（地面貼圖、障礙物方塊、地圖名稱）；切換投影時銷毀重建 */
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  /** 等角模式的障礙物方塊（遮擋判定用：深度、高度、畫面範圍） */
  private blocks: { depth: number; h: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  private builtMode: ProjectionMode = getProjection();
  private builtArt: ArtMode = getArt();
  /** 目前畫面是否真的用 Flare 素材建立（素材還沒載入時先用色塊） */
  private builtFlare = false;
  /** 目前畫面是否用 heroes3d 畫英雄（素材還沒載入時先用 Flare／色塊） */
  private builtH3d = false;
  /** 目前畫面是否用 props3d 畫地形物件（heroes3d 模式且素材已載入） */
  private builtProps = false;
  /** 頭目演出（登場、擊敗） */
  private bossShow!: BossShow;
  /** 擊敗演出中藏起來的單位 */
  private vanished = new Set<number>();
  /** finalbossblues 地形的地圖畫面（程序生成的野外、城內；素材不在時是 null，改用程式畫法） */
  private fbbView: FbbMapView | null = null;
  /** 草叢上的灌木（燒掉的格子要隱藏） */
  private brushProps: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  /** 每幀記錄鏡頭中心對應的地面點（切換投影時保持鏡頭位置） */
  private lastCenterGround: Vec = { x: 0, y: 0 };
  /** 被高障礙物擋住的角色輪廓（最上層） */
  private occlusionG!: Phaser.GameObjects.Graphics;
  /** 戰爭迷霧（SPEC_SLICE4 §6）：視野版本或開關改變時才重畫 */
  private fogG!: Phaser.GameObjects.Graphics;
  private fogDrawn = '';
  /** 柔和迷霧（正角俯視）：一格一個像素的畫布貼圖，用平滑取樣放大；alpha 每幀往目標值靠近（淡入淡出） */
  private fogSoft: { tex: Phaser.Textures.CanvasTexture; img: Phaser.GameObjects.Image; alpha: Float32Array; target: Float32Array; data: ImageData } | null = null;
  /** 畫面外敵人指示器（畫面座標，不跟鏡頭捲動） */
  private edgeG!: Phaser.GameObjects.Graphics;
  /** 出口（SPEC_SLICE6 §2）：地面上的範圍＋名稱，畫在迷霧上面 */
  private exitG!: Phaser.GameObjects.Graphics;
  private exitTexts: Phaser.GameObjects.Text[] = [];
  private exitInfo: ExitInfo[] = [];
  /** 已經標示出必須打倒的敵人（隊長、頭目）的方向（Alan 2026-10-22） */
  private targetHint = false;
  /** 互動物件（門、拉桿）的外觀與滑鼠提示 */
  private interactView!: InteractablesView;
  private objectLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  create(data: { seed?: number; run?: boolean; encounterId?: string; layer?: number }): void {
    if (data.encounterId) {
      // 快速戰鬥：用滿血隊伍打指定遭遇（測試地圖與頭目用）
      const seed = data.seed ?? randomSeed();
      const run = quickRun(seed, data.encounterId, data.layer ?? 1);
      this.session = new BattleSession(seed, { world: createBattleFromRun(run, currentSimConfig(), seed), mode: 'quick' });
      this.quickEncounter = { id: data.encounterId, layer: data.layer ?? 1 };
    } else if (data.run) {
      // 遠征模式：由 RunState 建立戰鬥（生命、強化、性格帶入）
      const run = getRun(this);
      const seed = battleSeed(run);
      this.session = new BattleSession(seed, {
        world: createBattleFromRun(run, currentSimConfig(), seed),
        mode: 'run',
        partySlots: run.party.map((h) => (h ? { classId: h.classId, dead: h.dead } : null)),
      });
    } else this.session = new BattleSession(data.seed ?? randomSeed());
    if (!data.encounterId) this.quickEncounter = null;
    const seed = this.session.seed;
    installAutoPause(this.session);
    // 被困的英雄（SPEC_SLICE7 §4）：進地圖時提示
    if (this.session.world.units.some((u) => u.captive)) {
      this.session.addLog(tr("遠處傳來打鬥聲……有人被困住了。"), 'warn');
      this.session.showToast(tr("遠處傳來打鬥聲……"), this.time.now, 2600);
    }
    this.registry.set('session', this.session);
    this.views.clear();
    this.statusTexts.clear();
    this.facingTexts.clear();
    this.worldObjects = [];
    this.blocks = [];
    this.resultShown = false;
    this.alpha = 0;
    this.lastFrame = 0;

    // 圖層：地面（地板、地形、地面標示）< 物件層（角色、障礙物方塊，依 depthOf 排序）< 覆蓋層（生命條、幽靈線、飄字）
    // finalbossblues 地形的地圖不做縱向壓縮（Alan 2026-10-21）；離開戰鬥時還原
    setOrthoSquash(isFbbMap(this.session.world.map) ? 1 : undefined);
    this.events.once('shutdown', () => setOrthoSquash());
    this.brushG = this.add.graphics().setDepth(1);
    this.fireG = this.add.graphics().setDepth(2);
    this.zoneG = this.add.graphics().setDepth(3);
    this.buildWorld();
    this.occlusionG = this.add.graphics().setDepth(950);
    this.fogG = this.add.graphics().setDepth(900);
    this.fogDrawn = '';
    this.fogSoft = null;
    this.overG = this.add.graphics().setDepth(1000);
    this.ghostG = this.add.graphics().setDepth(1100);
    this.coverText = this.add
      .text(0, 0, tr("掩體"), { fontFamily: FONT, fontSize: '12px', color: '#d9b77a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setStroke('#000000', 3)
      .setDepth(1200)
      .setVisible(false);
    this.objectLabel = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: '#ffe9a8', align: 'center' })
      .setOrigin(0.5, 1)
      .setStroke('#000000', 3)
      .setDepth(1200)
      .setVisible(false);
    this.fx = new Fx(this);
    this.vanished.clear();
    this.bossShow = new BossShow({
      scene: this,
      session: () => this.session,
      bossSprite: (id) => {
        const v = this.views.get(id);
        return v instanceof PixelView ? v.bodySprite : undefined;
      },
      hideUnit: (id) => this.vanished.add(id),
    });
    this.edgeG = this.add.graphics().setScrollFactor(0).setDepth(2900);
    this.exitG = this.add.graphics().setDepth(905);
    // 出口通往哪裡（Alan 2026-10-21）：字母＋方向＋節點類型，第二行是層數與危險；每個出口一個顏色
    this.targetHint = false;
    this.exitInfo = exitInfos(this.session.world, this.session.mode === 'run' ? getRun(this) : null);
    this.exitTexts = this.exitInfo.map((info) =>
      this.add
        .text(0, 0, info.detail ? `${info.title}
${info.detail}` : info.title, { fontFamily: FONT, fontSize: '14px', color: info.css, align: 'center', fontStyle: 'bold' })
        .setOrigin(0.5, 1)
        .setStroke('#000000', 4)
        .setDepth(1150),
    );
    // 暫停時的變暗層：scrollFactor 0 仍會跟著鏡頭縮放（以畫面中心縮放），做成三倍大，縮小到最小倍率也能蓋滿畫面
    this.dim = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width * 3, this.scale.height * 3, 0x000000, 0.22)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3000)
      .setVisible(false);
    // 視窗大小改變（手機轉向、調整瀏覽器）：變暗層跟著畫面大小
    const onResize = (size: Phaser.Structs.Size) => this.dim.setPosition(size.width / 2, size.height / 2).setSize(size.width * 3, size.height * 3);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.setupCamera();
    this.input2 = new InputController({
      scene: this,
      session: () => this.session,
      unitAtScreen: (x, y) => this.unitAtScreen(x, y),
      footScreen: (u) => this.footScreen(u),
      centerOn: (id) => this.centerOnUnit(id),
      objectAtScreen: (x, y) => this.interactView.objectAtScreen(x, y),
    });

    if (this.session.autoPause.battleStart) this.session.setPaused(true, tr("戰鬥開始"));
    if (this.session.mode === 'run') {
      const enc = currentEncounter(getRun(this));
      this.session.addLog(enc.mapDef ? enc.name : tr("{0}（{1}）", { 0: enc.name, 1: this.session.world.map.name }), 'sys');
    } else this.session.addLog(tr("戰鬥開始（種子 {0}）", { 0: seed }), 'sys');

    if (!this.scene.isActive('UI')) this.scene.launch('UI');
    this.scene.bringToTop('UI');
  }

  // ───────────── 地圖、障礙物與鏡頭（依投影建立；切換投影時重建） ─────────────

  /** 依目前投影建立地面、障礙物、單位外觀與除錯圖層 */
  private buildWorld(): void {
    this.builtMode = getProjection();
    this.builtArt = getArt();
    this.builtFlare = useFlare(this);
    this.builtH3d = this.useH3d();
    this.builtProps = this.useProps();
    this.drawMap();
    if (hasHeight() && !this.fbbView) this.buildObstacleBlocks();
    if (this.builtProps) this.buildProps();
    this.interactView = new InteractablesView(this, this.session.world);
    for (const u of this.session.world.units) this.views.set(u.id, this.makeView(u));
    this.debugOverlay = new DebugOverlay(this, this.session.world);
    this.brushVersion = -1;
  }

  private destroyWorld(): void {
    for (const o of this.worldObjects) o.destroy();
    this.worldObjects = [];
    this.blocks = [];
    this.brushProps = [];
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.fbbView = null;
    this.debugOverlay.destroy();
    this.interactView.destroy();
  }

  private makeView(u: Unit): UnitVisual {
    if (this.builtArt === 'pixel') {
      const art = pixelArtFor(this, u.def.id);
      return art ? new PixelView(this, u, art) : new UnitView(this, u);
    }
    if (this.builtH3d && u.team === 'hero' && h3dCharFor(u.def.id)) return new Hero3DView(this, u);
    return this.builtFlare ? new FlareView(this, u) : new UnitView(this, u);
  }

  /** props3d：heroes3d 模式（等角）且物件素材已載入 */
  private useProps(): boolean {
    return this.useH3d() && isIso() && props3dLoaded(this);
  }

  /** heroes3d：需要 Flare（敵人、地板）與 heroes3d 素材都已載入 */
  private useH3d(): boolean {
    return getArt() === 'heroes3d' && useFlare(this) && heroes3dLoaded(this);
  }

  /** 除錯面板切換投影或美術：重建畫面物件，鏡頭對準同一個地面點 */
  private checkProjection(): void {
    const wantFlare = wantsFlare();
    if (getArt() === 'heroes3d' && hasHeight() && !heroes3dLoaded(this)) ensureHeroes3dLoaded(this);
    if (wantFlare && !useFlare(this)) {
      // Flare 素材第一次使用時才載入；載入完成前先維持目前的畫面
      ensureFlareLoaded(this, () => undefined);
      if (getProjection() === this.builtMode) return;
    }
    if (getProjection() === this.builtMode && getArt() === this.builtArt && this.builtFlare === useFlare(this) && this.builtH3d === this.useH3d() && this.builtProps === this.useProps()) return;
    const center = this.lastCenterGround;
    this.destroyWorld();
    this.buildWorld();
    this.setupCameraBounds();
    const p = worldToScreen(center.x, center.y);
    this.cameras.main.centerOn(p.x, p.y);
  }

  private drawMap(): void {
    const map = this.session.world.map;
    const W = map.width;
    const H = map.height;
    // finalbossblues 地形（程序生成的野外、城內）：圖塊拼的地面與物件
    this.fbbView = getProjection() === 'ortho' && FbbMapView.usable(this, map) ? new FbbMapView(this, map) : null;
    if (this.fbbView) {
      this.worldObjects.push(...this.fbbView.objects);
      return;
    }
    const b = mapScreenBounds(W, H);
    const pad = 4;
    const flare = useFlare(this);
    // Flare 地板磚是等角菱形，只用在等角投影；正角俯視的地面用程式畫
    const tiles = flare && isIso();
    if (tiles) this.drawFloorTiles(b, pad);
    // 2D 像素：0x72 地城地板（Alan：戶外關卡暫時也用地城的）
    const pixelFloor = this.builtArt === 'pixel' && getProjection() === 'ortho' && pixelFloorReady(this);
    if (pixelFloor) this.drawPixelFloor(b);
    const g = this.add.graphics();
    g.translateCanvas(-b.x + pad, -b.y + pad);
    if (!tiles && !pixelFloor) groundRect(g, 0, 0, W, H, { fill: COLORS.floor });
    const gridAlpha = tiles ? 0.18 : pixelFloor ? 0 : 1;
    if (gridAlpha > 0) {
      for (let x = 0; x <= W; x++) groundLine(g, { x, y: 0 }, { x, y: H }, 1, COLORS.floorGrid, gridAlpha);
      for (let y = 0; y <= H; y++) groundLine(g, { x: 0, y }, { x: W, y }, 1, COLORS.floorGrid, gridAlpha);
    }
    const zone = (pts: Vec[], color: number) => {
      if (pts.length === 0) return;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x0 = Math.min(...xs) - 1.5;
      const y0 = Math.min(...ys) - 1.5;
      groundRect(g, x0, y0, Math.max(...xs) + 1.5 - x0, Math.max(...ys) + 1.5 - y0, { fill: color, fillAlpha: tiles ? 0.18 : 0.35 });
    };
    zone(map.heroSpawns, COLORS.heroZone);
    zone(map.enemySpawns, COLORS.enemyZone);
    this.drawStaticTerrain(g);
    for (const r of map.obstacles) {
      const kind = obstacleKind(map, r);
      if (kind === 'water') {
        groundRect(g, r.x, r.y, r.w, r.h, { fill: 0x1d3f5c });
        continue;
      }
      // 有高度的投影：障礙物是立體方塊（物件層）；地面只畫陰影（props3d 物件自帶影子）
      if (hasHeight()) {
        if (this.builtProps && obstacleUsesProp(map, r)) continue;
        groundRect(g, r.x, r.y, r.w, r.h, { fill: 0x15171b, fillAlpha: 0.6 });
        continue;
      }
      groundRect(g, r.x, r.y, r.w, r.h, { fill: kind === 'cliff' ? COLORS.cliff : COLORS.obstacle, stroke: COLORS.obstacleEdge, width: 2 });
    }
    groundRect(g, 0, 0, W, H, { stroke: 0x15171b, width: 3 });
    // 靜態圖層烘成貼圖，避免每幀重新三角化
    this.worldObjects.push(bakeGraphics(this, g, 'map-floor', b.w + pad * 2, b.h + pad * 2, tiles || pixelFloor ? 0.5 : 0, b.x - pad, b.y - pad));
    const corner = worldToScreen(W, 0);
    this.worldObjects.push(
      this.add
        .text(corner.x - 8, corner.y + 6, map.name, { fontFamily: FONT, fontSize: '14px', color: '#8a93a3' })
        .setOrigin(1, 0)
        .setDepth(1),
    );
  }

  /**
   * 0x72 地城地板（16 px 一格＝1 m）：先在原始像素大小的畫布上拼好，再整張放大成畫面比例
   * （正角俯視時橫 3 倍、縱 2 倍，每個原始像素都是整數大小，不會糊）。
   */
  private drawPixelFloor(b: { x: number; y: number; w: number; h: number }): void {
    const map = this.session.world.map;
    const kx = GAME_CONFIG.ortho.pxPerM / 16;
    const ky = (GAME_CONFIG.ortho.pxPerM * orthoSquash()) / 16;
    const rt = this.add.renderTexture(b.x, b.y, Math.ceil(b.w / kx), Math.ceil(b.h / ky)).setOrigin(0).setScale(kx, ky).setDepth(0);
    rt.beginDraw();
    for (let cy = 0; cy < map.height; cy++) {
      for (let cx = 0; cx < map.width; cx++) {
        const p = worldToScreen(cx, cy);
        const q = worldToScreen(cx + 1, cy + 1);
        const x = Math.round((Math.min(p.x, q.x) - b.x) / kx);
        const y = Math.round((Math.min(p.y, q.y) - b.y) / ky);
        rt.batchDraw(m72Key(floorTileFor(cx, cy, map.id.length)), x, y);
      }
    }
    rt.endDraw();
    this.worldObjects.push(rt);
  }

  /** Flare 地板磚：乾淨地板隨機混搭；英雄出生區用花磚 */
  private drawFloorTiles(b: { x: number; y: number; w: number; h: number }, pad: number): void {
    const map = this.session.world.map;
    const rt = this.add.renderTexture(b.x - pad, b.y - pad, Math.ceil(b.w + pad * 2), Math.ceil(b.h + pad * 2)).setOrigin(0).setDepth(0);
    const xs = map.heroSpawns.map((p) => p.x);
    const ys = map.heroSpawns.map((p) => p.y);
    const inSpawn = (x: number, y: number) =>
      xs.length > 0 && x >= Math.min(...xs) - 1.5 && x <= Math.max(...xs) + 1.5 && y >= Math.min(...ys) - 1.5 && y <= Math.max(...ys) + 1.5;
    const T = FLARE.tiles;
    // 依深度（畫面由後往前）排序；批次繪製，避免每張磚都清空一次繪圖管線
    const cells: { cx: number; cy: number }[] = [];
    for (let cy = 0; cy < map.height; cy++) for (let cx = 0; cx < map.width; cx++) cells.push({ cx, cy });
    cells.sort((a, c) => depthOf(a.cx + 0.5, a.cy + 0.5) - depthOf(c.cx + 0.5, c.cy + 0.5));
    rt.beginDraw();
    for (const { cx, cy } of cells) {
      // 決定論的雜湊，同一張地圖每次都一樣
      const h = ((cx * 73856093) ^ (cy * 19349663) ^ map.id.length * 83492791) >>> 0;
      const list = inSpawn(cx + 0.5, cy + 0.5) ? T.fancy : T.floor;
      const name = `tile/${list[h % list.length]}`;
      const fr = this.textures.getFrame(FLARE_TILES, name);
      if (!fr) continue;
      const p = worldToScreen(cx + 0.5, cy + 0.5);
      rt.batchDrawFrame(FLARE_TILES, name, p.x - fr.pivotX * fr.width - (b.x - pad), p.y - fr.pivotY * fr.height - (b.y - pad));
    }
    rt.endDraw();
    this.worldObjects.push(rt);
  }

  /** 等角模式：障礙物畫成立體方塊，大型障礙物切成每格一塊各自排序 */
  private buildObstacleBlocks(): void {
    const map = this.session.world.map;
    for (const r of map.obstacles) {
      if (this.builtProps && obstacleUsesProp(map, r)) continue;
      const kind = obstacleKind(map, r);
      const h = obstacleHeight(kind);
      if (h <= 0) continue;
      const base = kind === 'cliff' ? COLORS.cliff : COLORS.obstacle;
      for (let x = r.x; x < r.x + r.w - 1e-6; x += 1) {
        for (let y = r.y; y < r.y + r.h - 1e-6; y += 1) {
          const w = Math.min(1, r.x + r.w - x);
          const d = Math.min(1, r.y + r.h - y);
          this.addBlock(x, y, w, d, h, base);
        }
      }
    }
  }

  /**
   * props3d 地形物件（只是外觀）：小型障礙物換成石頭、樹樁、木箱、木桶；矮籬畫成倒木；草叢畫成灌木。
   * 地面原點對齊物件位置，依原點的深度排序；高的物件加入遮擋判定（被擋住的角色畫輪廓）。
   */
  private buildProps(): void {
    const map = this.session.world.map;
    const o = worldToScreen(0, 0);
    for (const p of planProps(map)) {
      const m = PROP_META[p.prop];
      const s = worldToScreen(p.x, p.y);
      const img = this.add.image(s.x, s.y, p3dKey(p.prop)).setOrigin(m.origin[0] / m.w, m.origin[1] / m.h).setScale(PROPS3D.groundScale * p.scale);
      if (p.axis) {
        // 倒木素材沿畫面「左上 → 右下」；矮籬方向相反時左右翻轉
        const a = worldToScreen(p.axis === 'x' ? 1 : 0, p.axis === 'y' ? 1 : 0);
        img.setFlipX((a.x - o.x) * (a.y - o.y) < 0);
      }
      const depth = depthOf(p.x, p.y);
      img.setDepth(OBJECT_DEPTH_BASE + depth);
      this.worldObjects.push(img);
      if (p.kind === 'brush') this.brushProps.push({ img, x: p.x, y: p.y });
      if (p.kind === 'obstacle' && p.height >= 0.8) {
        // 遮擋範圍依物件實際尺寸（圖片含透明邊與影子，用外框會誤判）：底面菱形的上半＋高度
        const fp = ((m.size_m[0] + m.size_m[1]) / 2) * p.scale;
        const halfW = (fp * GAME_CONFIG.iso.tileW) / 2 / 2;
        const top = s.y - (fp * GAME_CONFIG.iso.tileH) / 2 / 2 - p.height * GAME_CONFIG.iso.heightPxPerM;
        this.blocks.push({ depth, h: p.height, x0: s.x - halfW, x1: s.x + halfW, y0: top, y1: s.y });
      }
    }
  }

  private addBlock(x: number, y: number, w: number, d: number, h: number, color: number): void {
    const g = this.add.graphics();
    const b = drawBox(g, x, y, w, d, h, color);
    const depth = depthOf(x + w / 2, y + d / 2);
    g.setDepth(OBJECT_DEPTH_BASE + depth);
    this.blocks.push({ depth, h, ...b });
    this.worldObjects.push(g);
  }

  /** 不會變動的地形：高地、淺水、矮籬（草叢會燒掉，另外畫） */
  private drawStaticTerrain(g: Phaser.GameObjects.Graphics): void {
    const t = this.session.world.terrain;
    if (!t.any) return;
    const c = t.cell;
    const runs = (flag: number, fill: (x: number, y: number, w: number) => void) => {
      for (let cy = 0; cy < t.rows; cy++) {
        let start = -1;
        for (let cx = 0; cx <= t.cols; cx++) {
          const on = cx < t.cols && (t.flags[cy * t.cols + cx] & flag) !== 0;
          if (on && start < 0) start = cx;
          if (!on && start >= 0) {
            fill(start * c, cy * c, (cx - start) * c);
            start = -1;
          }
        }
      }
    };
    runs(T_HIGH, (x, y, w) => groundRect(g, x, y, w, c, { fill: COLORS.terrainHigh, fillAlpha: 0.22 }));
    runs(T_SHALLOW, (x, y, w) => groundRect(g, x, y, w, c, { fill: COLORS.terrainShallow, fillAlpha: 0.45 }));
    // 高地邊框：高地格與非高地格的交界
    const isHigh = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < t.cols && cy < t.rows && (t.flags[cy * t.cols + cx] & T_HIGH) !== 0;
    const edge = (a: Vec, b: Vec) => groundLine(g, a, b, 2, COLORS.terrainHigh, 0.55);
    for (let cy = 0; cy < t.rows; cy++) {
      for (let cx = 0; cx < t.cols; cx++) {
        if (!isHigh(cx, cy)) continue;
        if (!isHigh(cx - 1, cy)) edge({ x: cx * c, y: cy * c }, { x: cx * c, y: (cy + 1) * c });
        if (!isHigh(cx + 1, cy)) edge({ x: (cx + 1) * c, y: cy * c }, { x: (cx + 1) * c, y: (cy + 1) * c });
        if (!isHigh(cx, cy - 1)) edge({ x: cx * c, y: cy * c }, { x: (cx + 1) * c, y: cy * c });
        if (!isHigh(cx, cy + 1)) edge({ x: cx * c, y: (cy + 1) * c }, { x: (cx + 1) * c, y: (cy + 1) * c });
      }
    }
    // 矮籬：棕色底＋橫紋
    runs(T_HEDGE, (x, y, w) => groundRect(g, x, y, w, c, { fill: COLORS.terrainHedge, fillAlpha: 0.55 }));
    runs(T_HEDGE, (x, y, w) => groundLine(g, { x, y: y + c / 2 }, { x: x + w, y: y + c / 2 }, 2, COLORS.terrainHedgeLine, 0.9));
  }

  /** 草叢（燒掉時重畫）與火焰（每幀） */
  private drawDynamicTerrain(): void {
    const w = this.session.world;
    const t = w.terrain;
    if (!t.any) return;
    const c = t.cell;
    if (t.version !== this.brushVersion) {
      this.brushVersion = t.version;
      for (const b of this.brushProps) b.img.setVisible(t.has(b, T_BRUSH));
      const g = this.brushG;
      g.clear();
      for (let i = 0; i < t.flags.length; i++) {
        if (!(t.flags[i] & T_BRUSH)) continue;
        const cx = i % t.cols;
        const cy = (i - cx) / t.cols;
        groundRect(g, cx * c, cy * c, c, c, { fill: COLORS.terrainBrush, fillAlpha: 0.75 });
      }
      g.fillStyle(COLORS.terrainBrushDot, 0.8);
      for (let i = 0; i < t.flags.length; i++) {
        if (!(t.flags[i] & T_BRUSH)) continue;
        const cx = i % t.cols;
        const cy = (i - cx) / t.cols;
        const p = worldToScreen(cx * c + (c * (((cx * 7 + cy * 3) % 5) + 1)) / 6, cy * c + (c * (((cx * 3 + cy * 5) % 5) + 1)) / 6);
        g.fillCircle(p.x, p.y, 2);
      }
    }
    const fg = this.fireG;
    fg.clear();
    if (w.fire.size === 0) return;
    for (const [i] of w.fire) {
      const cx = i % t.cols;
      const cy = (i - cx) / t.cols;
      const flick = 0.5 + 0.5 * Math.sin(this.time.now / 60 + i * 1.7);
      groundRect(fg, cx * c, cy * c, c, c, { fill: flick > 0.5 ? COLORS.fire : COLORS.fireHot, fillAlpha: 0.55 + 0.35 * flick });
    }
  }

  private setupCameraBounds(): void {
    const map = this.session.world.map;
    const cam = this.cameras.main;
    const b = mapScreenBounds(map.width, map.height);
    const pad = 96;
    cam.setBounds(b.x - pad, b.y - pad - (hasHeight() ? 120 : 0), b.w + pad * 2, b.h + pad * 2 + (hasHeight() ? 120 : 0) + this.hudBottom());
  }

  private setupCamera(): void {
    const map = this.session.world.map;
    // Alan：鏡頭遠近固定，玩家不能縮放（只留 GAME_CONFIG.battleZoom 旋鈕）
    this.cameras.main.setZoom(GAME_CONFIG.battleZoom);
    this.setupCameraBounds();
    let start: Vec;
    if (hasHeight()) {
      // 開場鏡頭對準英雄群的中心
      const heroes = this.session.world.units.filter((u) => u.team === 'hero' && !u.dead);
      start = heroes.length
        ? { x: heroes.reduce((a, u) => a + u.pos.x, 0) / heroes.length, y: heroes.reduce((a, u) => a + u.pos.y, 0) / heroes.length }
        : { x: map.width / 2, y: map.height / 2 };
    } else start = map.landmarks?.cameraStart ?? { x: map.width / 2, y: map.height / 2 };
    const p = worldToScreen(start.x, start.y);
    this.cameras.main.centerOn(p.x, p.y + this.hudBottom() / 2);
  }

  /** 畫面下方被 HUD 蓋住的高度：行動版直拿時是四張卡片＋沙漏 */
  private hudBottom(): number {
    if (this.session?.world.config.battleStyle === 'deliberate' && this.scale.width < this.scale.height) return GAME_CONFIG.hudBottomHeightPortrait;
    return GAME_CONFIG.hudBottomHeight;
  }

    centerOnUnit(id: number): void {
    const u = this.session.world.getUnit(id);
    if (!u) return;
    const p = worldToScreen(u.pos.x, u.pos.y);
    this.cameras.main.pan(p.x, p.y + this.hudBottom() / 2 / this.cameras.main.zoom, 250, 'Sine.easeInOut');
  }

  restartBattle(seed: number): void {
    this.scene.stop('Result');
    this.scene.restart(this.quickEncounter ? { seed, encounterId: this.quickEncounter.id, layer: this.quickEncounter.layer } : { seed });
  }

  /** 畫面空間的點選：身體長方形＋腳下橢圓，重疊時取最前面（depth 最大）的 */
  unitAtScreen(sx: number, sy: number): Unit | undefined {
    let best: Unit | undefined;
    let bestD = -Infinity;
    for (const v of this.views.values()) {
      const u = v.unit;
      if (u.dead || this.hiddenIds.has(u.id) || !v.hitTest(sx, sy)) continue;
      const d = depthOf(v.wx, v.wy);
      if (d > bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  /** 單位腳下的畫面座標（插值後） */
  footScreen(u: Unit): Vec {
    const v = this.views.get(u.id);
    return v ? { x: v.x, y: v.y } : worldToScreen(u.pos.x, u.pos.y);
  }

  /** 單位腳下的世界座標（插值後） */
  private wpos(u: Unit): Vec {
    const v = this.views.get(u.id);
    return v ? { x: v.wx, y: v.wy } : u.pos;
  }

  /** 單位頭頂的畫面座標 */
  private headScreen(u: Unit): Vec {
    const v = this.views.get(u.id);
    return v ? v.head() : worldToScreen(u.pos.x, u.pos.y, 2);
  }

  /** 飄字高度（公尺）：頭頂 */
  private headZ(u: Unit): number {
    const v = this.views.get(u.id);
    return (v ? v.height : 1.8) + 0.2;
  }

  // ───────────── 主迴圈 ─────────────

  update(): void {
    const s = this.session;
    const nowMs = performance.now();
    const delta = this.lastFrame ? Math.min(nowMs - this.lastFrame, 250) : 0;
    this.lastFrame = nowMs;
    this.input2.update(delta / 1000);
    if (!s.paused && !s.world.result) {
      s.acc += (delta / 1000) * s.timeScale;
      let steps = 0;
      while (s.acc >= DT && steps < GAME_CONFIG.maxStepsPerFrame) {
        const events = s.world.step();
        s.acc -= DT;
        steps++;
        this.handleEvents(events);
        if (s.paused || s.world.result) break;
      }
      if (steps >= GAME_CONFIG.maxStepsPerFrame) s.acc = Math.min(s.acc, DT);
    }
    this.alpha = s.world.result ? 1 : Phaser.Math.Clamp(s.acc / DT, 0, 1);
    this.checkProjection();
    this.render();
    const cam = this.cameras.main;
    this.lastCenterGround = screenToGround(cam.midPoint.x, cam.midPoint.y - this.hudBottom() / 2 / cam.zoom);
  }

  // ───────────── 事件 → 飄字／紀錄／自動暫停 ─────────────

  private handleEvents(events: SimEvent[]): void {
    const s = this.session;
    const w = s.world;
    const L = (id: number) => s.label(id);
    const skillName = (id?: string) => (id ? SKILLS[id]?.name ?? id : '');
    for (const ev of events) {
      switch (ev.type) {
        case 'hit': {
          const t = w.getUnit(ev.targetId)!;
          const src = w.getUnit(ev.sourceId)!;
          this.views.get(t.id)?.onHit?.(w.time, src.pos);
          this.fx.text(t.pos, ev.crit ? `${ev.damage}!` : `${ev.damage}`, ev.crit ? '#ffd23f' : '#ffffff', ev.crit ? 24 : 16, 34, 900, this.headZ(t));
          s.addLog(
            tr("{0} → {1}：{2}{3}{4}{5}", { 0: L(src.id), 1: L(t.id), 2: ev.damage, 3: ev.crit ? tr("（爆擊）") : '', 4: ev.skillId ? tr("〔{0}〕", { 0: skillName(ev.skillId) }) : '', 5: ev.freeAttack ? tr("〔脫離攻擊〕") : '' }),
            src.team,
          );
          if (ev.freeAttack) this.fx.text(t.pos, tr("脫離攻擊"), '#ff9f43', 13, 50, 900, this.headZ(t));
          // 異教徒吸血：目標身上紅色漩渦，一條紅線拉回施法者
          if (ev.skillId === 'drainLife') {
            this.fx.vfx(t.pos, VFX_USE.drain, 0.8);
            this.fx.line(t.pos, src.pos, 0xd0203a, 500);
          }
          break;
        }
        case 'miss': {
          const t = w.getUnit(ev.targetId)!;
          if (ev.blocked && ev.point) {
            this.fx.text(ev.point, tr("擋下"), '#c8ccd2', 13, 34, 900, 1.2);
            s.addLog(tr("{0} → {1}：被障礙物擋下{2}", { 0: L(ev.sourceId), 1: L(t.id), 2: ev.skillId ? tr("〔{0}〕", { 0: skillName(ev.skillId) }) : '' }), 'miss');
            break;
          }
          this.fx.text(t.pos, 'Miss', '#9aa0a6', 14, 34, 900, this.headZ(t));
          s.addLog(tr("{0} → {1}：未命中{2}", { 0: L(ev.sourceId), 1: L(t.id), 2: ev.skillId ? tr("〔{0}〕", { 0: skillName(ev.skillId) }) : '' }), 'miss');
          break;
        }
        case 'heal': {
          const t = w.getUnit(ev.targetId)!;
          this.fx.text(t.pos, `+${ev.amount}`, '#5dff7a', 18, 34, 900, this.headZ(t));
          s.addLog(tr("{0} 治療 {1} +{2}", { 0: L(ev.sourceId), 1: L(t.id), 2: ev.amount }), 'heal');
          break;
        }
        case 'interrupt': {
          const t = w.getUnit(ev.targetId)!;
          this.fx.interrupt(t.pos, this.headZ(t));
          const def = ev.skillId ? SKILLS[ev.skillId] : undefined;
          if (def?.telegraph && ev.point && def.effect.kind === 'aoe') this.fx.shatter(ev.point, def.effect.radius);
          s.addLog(tr("{0} 打斷了 {1}{2}！", { 0: L(ev.sourceId), 1: L(t.id), 2: def ? tr("的「{0}」", { 0: def.name }) : '' }), 'interrupt');
          break;
        }
        case 'bossSighted': {
          const u = w.getUnit(ev.unitId);
          // 魔王的冠軍：台詞依章節（前兩章不說話）
          if (u) this.bossShow.intro(u, u.def.id === ROUTE_MAP.champion.enemy ? w.championLine : undefined);
          break;
        }
        case 'championIncoming': {
          // Alan 2026-10-22：冠軍以獵人身分加入地圖，先預告從哪個方向來
          const h = w.units.find((x) => x.team === 'hero' && !x.dead);
          const side = h ? directionWord(h.pos, ev.point) : '';
          const msg = ev.seconds <= 3 ? tr("⚠ 魔王的冠軍追上來了！{0}", { 0: side }) : tr("⚠ 魔王的冠軍逼近中：約 {0} 秒後{1}出現", { 0: Math.round(ev.seconds), 1: side });
          s.showToast(msg, this.time.now, 3600);
          s.addLog(msg, 'warn');
          break;
        }
        case 'championArrived':
          s.addLog(tr("魔王的冠軍進入了戰場！"), 'warn');
          break;
        case 'death': {
          const u = w.getUnit(ev.unitId)!;
          if (enemyRank(u.def) === 'boss') this.bossShow.defeat(u);
          this.fx.text(u.pos, tr("陣亡"), '#c0c4cc', 16, 20, 1400, this.headZ(u));
          s.addLog(tr("{0} 被 {1} 擊倒", { 0: L(u.id), 1: ev.killerId !== undefined ? L(ev.killerId) : '?' }), 'death');
          s.selection = s.selection.filter((id) => id !== u.id);
          break;
        }
        case 'pinned': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, tr("被牽制"), '#ff9f43', 15, 34, 900, this.headZ(u));
          s.addLog(tr("{0} 被 {1} 牽制", { 0: L(u.id), 1: ev.byId >= 0 ? L(ev.byId) : '?' }), 'pin');
          break;
        }
        case 'guardRedirect': {
          const g = w.getUnit(ev.guardId)!;
          this.fx.text(g.pos, tr("守護"), '#7fb8ff', 14, 34, 900, this.headZ(g));
          s.addLog(tr("{0} 替 {1} 擋下攻擊", { 0: L(g.id), 1: L(ev.protectedId) }), 'hero');
          break;
        }
        case 'status': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, ev.text, '#e0e6f0', 13, 26, 900, this.headZ(u));
          // 逐格特效：撞牆、元素附魔
          if (ev.text === tr('撞牆')) this.fx.vfx(u.pos, VFX_USE.impact);
          else if (ev.text === SKILLS.elementalEnchant.name) this.fx.vfx(u.pos, VFX_USE.elementalEnchant, 0.8);
          break;
        }
        case 'notice': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, ev.text, '#9aa0a6', 12, 20, 900, this.headZ(u));
          break;
        }
        case 'aoe': {
          const src = w.getUnit(ev.sourceId)!;
          const st = ev.skillId ? AOE_STYLE[ev.skillId] : undefined;
          const color = st?.color ?? (src.team === 'hero' ? 0xff8c1a : 0xff2a2a);
          this.fx.burst(ev.point, ev.radius, color, 550);
          this.fx.ring(ev.point, ev.radius, st?.ring ?? 0xffd27a, 500, 0.4, 5);
          if (st?.shake ?? true) this.cameras.main.shake(120, 0.004);
          // 逐格特效（素材 session 建議的編號）
          if (ev.skillId === 'sentinelStomp') this.fx.vfx(ev.point, VFX_USE.stomp, 0.2);
          else if (ev.skillId === 'boulder') this.fx.vfx(ev.point, VFX_USE.impact, 0.2);
          else if (ev.skillId === 'holyGround') this.fx.vfx(ev.point, VFX_USE.holyGround, 0.3, 120);
          else if (ev.skillId === 'sentinelBreath') {
            // 吐息：沿冠軍面向的扇形排三團
            const [a, b, c] = VFX_USE.breath;
            [a, b, c].forEach((use, i) => {
              const d = 2 + i * 2;
              this.time.delayedCall(i * 90, () => this.fx.vfx({ x: src.pos.x + Math.cos(src.facing) * d, y: src.pos.y + Math.sin(src.facing) * d }, [use], 0.6));
            });
          }
          const kind = ev.skillId ? SKILLS[ev.skillId]?.effect.kind : undefined;
          if (kind === 'aoe' || kind === 'cone') s.addLog(tr("{0} 的「{1}」爆炸", { 0: L(src.id), 1: skillName(ev.skillId) }), src.team);
          break;
        }
        case 'knockback':
          this.fx.ring(ev.to, 0.7, 0xffffff, 350);
          break;
        case 'actionStart': {
          if (!ev.skillId) break;
          const u = w.getUnit(ev.unitId)!;
          const def = SKILLS[ev.skillId];
          if (u.team === 'enemy' && def.telegraph) {
            s.addLog(tr("⚠ {0} 開始準備「{1}」！", { 0: L(u.id), 1: def.name }), 'warn');
          } else if (u.team === 'hero') {
            s.addLog(tr("{0} 施放「{1}」", { 0: L(u.id), 1: def.name }), 'skill');
          }
          break;
        }
        case 'spawn': {
          const u = w.getUnit(ev.unitId)!;
          this.views.set(u.id, this.makeView(u));
          s.registerUnit(u, ev.waveId ? '' : tr("援軍"));
          if (!ev.waveId) this.fx.ring(u.pos, 1.2, 0xff6b6b, 500);
          break;
        }
        case 'exitWaiting':
          // Alan：全員到齊才能離開
          if (ev.locked) {
            s.showToast(w.map.exitLock === 'boss' ? tr("出口封住了：先打倒頭目") : tr("出口封住了：先打倒精英隊長"), this.time.now, 1800);
            // 走到非回程的出口才發現封住：標示出要打倒的敵人
            if (!this.exitInfo.find((x) => x.id === ev.exitId)?.back) this.revealTargets();
          }
          else s.showToast(tr("You must gather your party before venturing forth.（{0}／{1}）", { 0: ev.inside, 1: ev.total }), this.time.now, 2400);
          break;
        case 'squadSighted':
          if (w.time > 0.5) s.addLog(tr("發現敵人：{0}", { 0: ev.unitIds.map((id) => L(id)).join(tr("、")) }), 'warn');
          break;
        case 'waveStart':
          s.addLog(tr("敵人湧上來了！（{0}）", { 0: ev.waveId }), 'enemy');
          break;
        case 'interact': {
          const obj = w.interactables.get(ev.objectId);
          if (obj?.def.kind === 'lever') s.addLog(tr("{0} 拉動了{1}", { 0: L(ev.unitId), 1: objectName(obj) }), 'sys');
          // 地圖上的商人（SPEC_SLICE7 §2）：非戰鬥中才打開商店
          if (obj?.def.kind === 'merchant') {
            if (w.inCombat) s.showToast(tr("戰鬥中，商人躲起來了"), this.time.now);
            else s.merchantOpen = true;
          }
          break;
        }
        case 'loot': {
          // 寶箱、地上的道具（Alan 2026-10-22）
          const obj = w.interactables.get(ev.objectId);
          if (!obj) break;
          const d = obj.def;
          const at = { x: d.x + d.w / 2, y: d.y + d.h / 2 };
          const what = ev.toGold && ev.loot.kind === 'consumable' ? tr("{0}（包包滿了，換成 {1} 金幣）", { 0: lootName(ev.loot), 1: ev.loot.gold }) : lootName(ev.loot);
          const icon = ev.loot.kind === 'item' ? '🎁 ' : ev.loot.kind === 'consumable' ? '🧪 ' : ev.loot.kind === 'gold' ? '💰 ' : '';
          if (ev.loot.kind !== 'heal') this.fx.text(at, icon + lootName(ev.loot), ev.loot.kind === 'item' ? '#7fd0ff' : '#ffe27a', 16, 50, 1800, 1.2);
          s.addLog(d.kind === 'chest' ? tr("{0} 打開寶箱：{1}", { 0: L(ev.unitId), 1: what }) : tr("{0} 撿起了{1}", { 0: L(ev.unitId), 1: what }), 'sys');
          if (d.kind === 'chest') this.fx.ring(at, 1.2, 0xffd23f, 600, 0.1, 3);
          break;
        }
        case 'shrine': {
          const obj = w.interactables.get(ev.objectId);
          const sd = SHRINES[ev.shrine];
          const at = obj ? { x: obj.def.x + obj.def.w / 2, y: obj.def.y + obj.def.h / 2 } : w.getUnit(ev.unitId)!.pos;
          this.fx.ring(at, 3, sd.color, 900, 0.1, 6);
          this.fx.text(at, sd.name, `#${sd.color.toString(16).padStart(6, '0')}`, 16, 50, 1800, 1.6);
          const msg = tr("{0}：{1}（{2} 秒）", { 0: sd.name, 1: sd.description, 2: SHRINE_RULES.duration });
          s.addLog(msg, 'sys');
          s.showToast(msg, this.time.now, 2200);
          break;
        }
        case 'door': {
          const obj = w.interactables.get(ev.objectId);
          if (!obj) break;
          if (ev.blocked) {
            s.showToast(tr("{0}：門口有人，關不上", { 0: objectName(obj) }), this.time.now, 1400);
            break;
          }
          s.addLog(tr("{0}{1}", { 0: objectName(obj), 1: ev.open ? tr("打開了") : tr("關上了") }), 'sys');
          break;
        }
        case 'warcry': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.ring(u.pos, 6, 0xff2a2a, 900, 0.1, 8);
          this.fx.text(u.pos, tr("戰吼！"), '#ff6b6b', 26, 50, 1400, this.headZ(u));
          this.cameras.main.shake(300, 0.006);
          s.addLog(tr("⚠ {0} 發出戰吼！援軍進場，敵人傷害提高", { 0: L(u.id) }), 'warn');
          break;
        }
        case 'captiveFreed':
          s.addLog(tr("找到被困的{0}了！護送他離開這張地圖。", { 0: w.getUnit(ev.unitId)?.def.name ?? '' }), 'warn');
          s.showToast(tr("護送他離開這張地圖！"), this.time.now, 2200);
          break;
        case 'aggro':
          s.addLog(tr("敵人開始進攻！"), 'warn');
          s.showToast(tr("敵人開始進攻！"), this.time.now, 1800);
          break;
        case 'battleEnd':
          s.addLog(ev.winner === 'hero' ? tr("勝利！") : tr("全軍覆沒……"), 'sys');
          s.targeting = null;
          if (!this.resultShown) {
            this.resultShown = true;
            // 頭目擊敗演出要先演完才跳勝利畫面
            this.time.delayedCall(Math.max(1100, this.bossShow.doneAt - this.time.now + 300), () => this.scene.launch('Result'));
          }
          break;
      }
      // 鉤子：自動暫停等在畫面效果之後處理
      s.hooks.emit('simEvent', ev);
    }
  }

  // ───────────── 繪製 ─────────────

  private render(): void {
    const s = this.session;
    const w = s.world;
    const selected = new Set(s.selection);
    this.updateConcealment();
    const simTime = w.time + this.alpha * DT;
    for (const v of this.views.values()) v.update(this.alpha, selected.has(v.unit.id), s.hoverUnitId === v.unit.id, simTime);
    // 迷霧裡的火、煙、火光不畫（看根部那一格現在看不看得到）
    const vis = w.vision && w.fogActive ? w.vision : null;
    this.fbbView?.update(this.time.now / 1000, vis ? (p) => vis.isVisible(p) : undefined);
    this.bossShow.update();
    this.drawDynamicTerrain();
    this.drawInteractables();
    this.drawFog();

    this.drawZones(selected);
    this.drawLandingZones();
    if (w.config.battleStyle === 'deliberate') this.drawTargetLines(selected);
    this.drawSelfTelegraphs();
    this.drawOcclusion();
    this.drawBars();
    this.drawProjectiles();
    this.ghostG.clear();
    if (!w.result) this.drawGhostLines(selected);
    this.drawTargeting();
    this.drawCoverHint();
    this.drawBoxSelect();
    this.drawFacingDebug();
    this.drawOffscreenEnemies();
    if (!this.targetHint && w.map.exitLock && !w.result && w.time >= GAME_CONFIG.targetHintDelay && !w.exitsOpen()) this.revealTargets();
    this.drawTargetHint();
    this.drawExits();
    this.debugOverlay.update(s, (id) => this.wpos(w.getUnit(id)!));
    this.dim.setVisible(s.paused && !w.result);
    this.input.setDefaultCursor(s.targeting ? 'crosshair' : 'default');
  }

  /**
   * 目標線（SPEC_SLICE5 §4）：所有攻擊都是攻擊移動、目標自動選，畫出每個單位目前在打誰，讓玩家預測戰況。
   * 英雄：藍線（選取中的較亮）；敵人：紅線（打向英雄的才畫）。
   */
  private drawTargetLines(selected: Set<number>): void {
    const w = this.session.world;
    const g = this.zoneG;
    for (const u of w.units) {
      if (u.dead || this.hiddenIds.has(u.id)) continue;
      const o = u.order;
      const tid = u.action?.targetId ?? (o && (o.type === 'attack' || o.type === 'attackMove') ? o.targetId : undefined);
      if (tid === undefined) continue;
      const t = w.getUnit(tid);
      if (!t || t.dead || t.team === u.team) continue;
      const a = this.wpos(u);
      const b = this.wpos(t);
      // 英雄的目標線只畫被選取的（Alan 2026-10-21）
      if (u.team === 'hero') {
        if (selected.has(u.id)) groundLine(g, a, b, 2.5, COLORS.ghostMove, 0.85);
      }
      else groundLine(g, a, b, 1.5, COLORS.ghostAttack, 0.4);
    }
  }

  /** 互動物件：狀態改變或滑鼠移上時重畫；滑鼠移上顯示名稱與右鍵提示 */
  private drawInteractables(): void {
    const s = this.session;
    const obj = s.hoverObjectId ? s.world.interactables.get(s.hoverObjectId) : undefined;
    this.interactView.update(obj ? obj.def.id : null);
    if (!obj) {
      this.objectLabel.setVisible(false);
      return;
    }
    const p = this.interactView.labelPoint(obj);
    this.objectLabel.setText(`${objectName(obj)}\n${objectHint(s.world.interactables.usable(obj), obj)}`).setPosition(p.x, p.y).setVisible(true);
  }

  /**
   * 戰爭迷霧：未探索全黑、已探索但不在視野內半暗（看得到地形、看不到敵人）、視野內正常。
   * 每一列把相同狀態的格子合併成一段再畫，減少多邊形數量。
   */
  private drawFog(): void {
    const w = this.session.world;
    const v = w.vision;
    if (getProjection() === 'ortho' && GAME_CONFIG.ortho.rotation === 90 && v && w.fogActive) {
      this.fogG.clear();
      this.fogDrawn = '';
      this.drawSoftFog();
      return;
    }
    this.fogSoft?.img.setVisible(false);
    const key = v && w.fogActive ? `${v.version}:${this.builtMode}` : 'off';
    if (key === this.fogDrawn) return;
    this.fogDrawn = key;
    const g = this.fogG;
    g.clear();
    if (!v || !w.fogActive) return;
    const alpha = [VISUAL.fogUnexploredAlpha, VISUAL.fogExploredAlpha];
    for (let cy = 0; cy < v.rows; cy++) {
      let start = 0;
      for (let cx = 1; cx <= v.cols; cx++) {
        const prev = v.state[cy * v.cols + start];
        const cur = cx < v.cols ? v.state[cy * v.cols + cx] : -1;
        if (cur === prev) continue;
        if (prev !== FOG_VISIBLE) groundRect(g, start * v.cell, cy * v.cell, (cx - start) * v.cell, v.cell, { fill: 0x05060a, fillAlpha: alpha[prev] });
        start = cx;
      }
    }
  }

  /**
   * 柔和迷霧（Alan：視野不要整格硬亮）。做法和許多 RTS 一樣：迷霧存成「一格一個像素」的小貼圖，
   * 放大時用雙線性取樣（平滑）而不是像素取樣，格與格之間自然變成漸層；每格的透明度每幀往目標值靠近，
   * 看得到／看不到時是淡入淡出而不是瞬間切換。
   */
  private drawSoftFog(): void {
    const w = this.session.world;
    const v = w.vision!;
    // 畫面方向（世界 +x 朝上）：貼圖寬＝y 方向的格數、高＝x 方向的格數
    const tw = v.rows;
    const th = v.cols;
    if (!this.fogSoft || this.fogSoft.alpha.length !== v.cols * v.rows) {
      this.fogSoft?.img.destroy();
      const key = `fog-soft-${this.session.seed}-${Date.now()}`;
      const tex = this.textures.createCanvas(key, tw, th)!;
      tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      const o = worldToScreen(v.cols * v.cell, 0);
      const img = this.add
        .image(o.x, o.y, key)
        .setOrigin(0)
        .setScale(v.cell * GAME_CONFIG.ortho.pxPerM, v.cell * GAME_CONFIG.ortho.pxPerM * orthoSquash())
        .setDepth(900);
      this.events.once('shutdown', () => this.textures.exists(key) && this.textures.remove(key));
      const alpha = new Float32Array(v.cols * v.rows).fill(VISUAL.fogUnexploredAlpha);
      this.fogSoft = { tex, img, alpha, target: new Float32Array(v.cols * v.rows), data: tex.getContext().createImageData(tw, th) };
    }
    const f = this.fogSoft;
    f.img.setVisible(true);
    const levels = [VISUAL.fogUnexploredAlpha, VISUAL.fogExploredAlpha, 0];
    for (let i = 0; i < f.target.length; i++) f.target[i] = levels[v.state[i]];
    const step = Math.min(1, this.game.loop.delta / 1000 / VISUAL.fogFadeSec);
    let changed = false;
    const d = f.data.data;
    for (let cy = 0; cy < v.rows; cy++) {
      for (let cx = 0; cx < v.cols; cx++) {
        const i = cy * v.cols + cx;
        const a0 = f.alpha[i];
        const a1 = a0 + (f.target[i] - a0) * step;
        const a = Math.abs(f.target[i] - a1) < 0.01 ? f.target[i] : a1;
        if (a !== a0) changed = true;
        f.alpha[i] = a;
        // 貼圖像素：(x, y) = (cy, cols − 1 − cx)
        const p = ((v.cols - 1 - cx) * tw + cy) * 4;
        d[p] = 5;
        d[p + 1] = 6;
        d[p + 2] = 10;
        d[p + 3] = Math.round(a * 255);
      }
    }
    if (changed || !this.fogDrawn) {
      f.tex.getContext().putImageData(f.data, 0, 0);
      f.tex.refresh();
      // 遊戲是像素模式（預設最近鄰取樣）：更新後要重新設定成平滑取樣
      f.tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.fogDrawn = 'soft';
    }
  }

  /** 草叢隱匿：敵方被隱藏時不顯示；我方在草叢內半透明 */
  private updateConcealment(): void {
    const w = this.session.world;
    this.hiddenIds.clear();
    for (const v of this.views.values()) {
      const u = v.unit;
      if (u.dead) {
        // 頭目擊敗演出：原本的倒地外觀藏起來，改由紅黑消失的演出接手
        v.setConcealment(this.vanished.has(u.id) ? 'hidden' : 'normal');
        continue;
      }
      if (u.team === 'enemy') {
        const hidden = !w.visibleToTeam(u, 'hero');
        if (hidden) this.hiddenIds.add(u.id);
        v.setConcealment(hidden ? 'hidden' : 'normal');
      } else {
        const hideable = u.stealthTime > 0 || w.terrain.has(u.pos, T_BRUSH);
        v.setConcealment(hideable ? (w.visibleToTeam(u, 'enemy') ? 'brush' : 'concealed') : 'normal');
      }
    }
    const s = this.session;
    if (s.hoverUnitId !== null && this.hiddenIds.has(s.hoverUnitId)) s.hoverUnitId = null;
  }

  /** 被高障礙物擋住的角色：最上層畫半透明輪廓，永遠看得到人在哪 */
  private drawOcclusion(): void {
    const g = this.occlusionG;
    g.clear();
    if (!hasHeight() || this.blocks.length === 0) return;
    for (const v of this.views.values()) {
      const u = v.unit;
      if (u.dead || !v.visible) continue;
      const b = v.bodyBounds();
      const d = depthOf(v.wx, v.wy);
      const covered = this.blocks.some((k) => k.depth > d && k.x1 > b.x && k.x0 < b.x + b.w && k.y1 > b.y && k.y0 < b.y + b.h);
      if (covered) v.drawOutline(g);
    }
  }

  private drawZones(selected: Set<number>): void {
    const s = this.session;
    const w = s.world;
    const g = this.zoneG;
    g.clear();
    const zoc = (u: Unit) => {
      const p = this.wpos(u);
      const c = u.team === 'hero' ? COLORS.zocHero : COLORS.zocEnemy;
      groundCircle(g, p.x, p.y, u.radius + w.config.zocRange, { fill: c, fillAlpha: 0.1, stroke: c, strokeAlpha: 0.45, width: 1.5 });
    };
    if (w.config.zocMode !== 'off') {
      for (const u of w.units) {
        if (u.dead || !u.def.projectsZoc) continue;
        if ((u.team === 'hero' && selected.has(u.id)) || (u.team === 'enemy' && s.hoverUnitId === u.id)) zoc(u);
      }
    }
    // 持續地面區域（沼澤、地面火…）：顏色依 style
    for (const z of w.zones) {
      const fade = Math.min(1, z.time / 1.5);
      const [fill, stroke] = ZONE_COLORS[z.style ?? 'swamp'];
      if (z.style === 'fire') {
        this.drawFireZone(g, z.point, z.radius, fade, z.time);
        continue;
      }
      groundCircle(g, z.point.x, z.point.y, z.radius, { fill, fillAlpha: 0.28 * fade, stroke, strokeAlpha: 0.6 * fade, width: 2 });
    }
    // 駐守點：小菱形；選取中的英雄另外畫出駐守範圍
    for (const u of w.units) {
      const gp = u.guardPoint;
      if (u.dead || u.team !== 'hero' || !gp) continue;
      const d = 0.18;
      groundRectDiamond(g, gp, d, u.def.color);
      if (selected.has(u.id)) groundCircle(g, gp.x, gp.y, w.config.heroLeashRange, { stroke: u.def.color, strokeAlpha: 0.35, width: 1 });
    }
    // 準備中的地面範圍法術：敵方紅色預警圈、我方紫色
    for (const u of w.units) {
      const a = u.action;
      if (u.dead || !a || a.phase !== 'windup' || !a.point || !a.skillId || this.hiddenIds.has(u.id)) continue;
      const def = SKILLS[a.skillId];
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 90);
      if (def.effect.kind === 'cone') {
        // 扇形預警（橫掃）
        const p = this.wpos(u);
        const dir = Math.atan2(a.point.y - u.pos.y, a.point.x - u.pos.x);
        const half = (def.effect.angle / 2) * (Math.PI / 180);
        const R = def.effect.radius;
        groundSector(g, p.x, p.y, R, dir - half, dir + half, { fill: COLORS.telegraph, fillAlpha: 0.14 + 0.1 * pulse });
        groundSector(g, p.x, p.y, R * u.actionProgress, dir - half, dir + half, { fill: COLORS.telegraph, fillAlpha: 0.28 });
        groundSector(g, p.x, p.y, R, dir - half, dir + half, { stroke: COLORS.telegraph, strokeAlpha: 0.9, width: 3 });
        continue;
      }
      if (def.effect.kind === 'rush') {
        // 直線衝鋒的預兆帶：從自己往目標方向 distance 公尺
        const p = this.wpos(u);
        const end = rushEnd(p, a.point, def.effect.distance);
        const half = def.effect.width / 2;
        const len = Math.hypot(end.x - p.x, end.y - p.y) || 1;
        const nx = (-(end.y - p.y) / len) * half;
        const ny = ((end.x - p.x) / len) * half;
        const band = (t: number) => [
          { x: p.x + nx, y: p.y + ny },
          { x: p.x + (end.x - p.x) * t + nx, y: p.y + (end.y - p.y) * t + ny },
          { x: p.x + (end.x - p.x) * t - nx, y: p.y + (end.y - p.y) * t - ny },
          { x: p.x - nx, y: p.y - ny },
        ];
        groundPolygon(g, band(1), { fill: COLORS.telegraph, fillAlpha: 0.12 + 0.1 * pulse, stroke: COLORS.telegraph, strokeAlpha: 0.9, width: 3 });
        groundPolygon(g, band(u.actionProgress), { fill: COLORS.telegraph, fillAlpha: 0.25 });
        // 橫掃衝鋒：右側平行的帶狀區域（和 sim 一樣：衝鋒方向的右側 offset 公尺）
        const side = def.effect.side;
        if (side) {
          const ux = (end.x - p.x) / len;
          const uy = (end.y - p.y) / len;
          const ox = uy * side.offset;
          const oy = -ux * side.offset;
          const sx = -uy * (side.width / 2);
          const sy = ux * (side.width / 2);
          const sband = (t: number) => [
            { x: p.x + ox + sx, y: p.y + oy + sy },
            { x: p.x + ox + (end.x - p.x) * t + sx, y: p.y + oy + (end.y - p.y) * t + sy },
            { x: p.x + ox + (end.x - p.x) * t - sx, y: p.y + oy + (end.y - p.y) * t - sy },
            { x: p.x + ox - sx, y: p.y + oy - sy },
          ];
          groundPolygon(g, sband(1), { fill: COLORS.telegraph, fillAlpha: 0.12 + 0.1 * pulse, stroke: COLORS.telegraph, strokeAlpha: 0.9, width: 3 });
          groundPolygon(g, sband(u.actionProgress), { fill: COLORS.telegraph, fillAlpha: 0.25 });
        }
        continue;
      }
      const r = def.effect.kind === 'aoe' || def.effect.kind === 'leap' || def.effect.kind === 'hurl' ? def.effect.radius : 0;
      // 擲人：被抓的英雄身上畫一圈，連一條線到落點
      if (def.effect.kind === 'hurl' && a.targetId !== undefined) {
        const held = w.getUnit(a.targetId);
        if (held && !held.dead) {
          const hp = this.wpos(held);
          groundCircle(g, hp.x, hp.y, held.radius + 0.25, { stroke: COLORS.telegraph, strokeAlpha: 0.6 + 0.4 * pulse, width: 3 });
          groundLine(g, hp, a.point, 2, COLORS.telegraph, 0.5);
        }
      }
      if (r <= 0) continue;
      const enemy = u.team === 'enemy';
      const c = enemy ? COLORS.telegraph : COLORS.ghostSkill;
      groundCircle(g, a.point.x, a.point.y, r, { fill: c, fillAlpha: enemy ? 0.12 + 0.1 * pulse : 0.12 });
      groundCircle(g, a.point.x, a.point.y, r * u.actionProgress, { fill: c, fillAlpha: 0.25 });
      groundCircle(g, a.point.x, a.point.y, r, { stroke: c, strokeAlpha: 0.9, width: enemy ? 3 : 2 });
    }
  }

  /**
   * 燃燒中的地面（火焰瓶等，Alan：落點地面要看得出來在燒）：閃爍的焦土＋一圈跳動的火舌；剩最後 1.5 秒逐漸熄滅。
   */
  private drawFireZone(g: Phaser.GameObjects.Graphics, p: Vec, r: number, fade: number, left: number): void {
    const now = this.time.now;
    const flick = 0.5 + 0.5 * Math.sin(now / 70 + p.x * 3.1);
    groundCircle(g, p.x, p.y, r, { fill: 0x5a1e08, fillAlpha: 0.45 * fade, stroke: 0xff8a3d, strokeAlpha: (0.55 + 0.3 * flick) * fade, width: 2.5 });
    groundCircle(g, p.x, p.y, r * 0.75, { fill: 0xd2541a, fillAlpha: (0.25 + 0.15 * flick) * fade });
    // 火舌：固定位置（依落點雜湊），高度隨時間跳動
    const n = Math.max(6, Math.round(r * r * 3));
    for (let i = 0; i < n; i++) {
      const a = i * 2.399963 + p.x * 1.7 + p.y * 0.9;
      const d = r * 0.85 * Math.sqrt((i + 0.5) / n);
      const fx = p.x + Math.cos(a) * d;
      const fy = p.y + Math.sin(a) * d;
      const h = (0.35 + 0.3 * (0.5 + 0.5 * Math.sin(now / 90 + i * 1.9))) * fade * Math.min(1, left);
      const base = worldToScreen(fx, fy);
      const tip = worldToScreen(fx, fy, h);
      const w = 4 + (i % 3);
      g.fillStyle(i % 2 ? 0xff8a3d : 0xffc24a, 0.85 * fade);
      g.fillTriangle(base.x - w, base.y, base.x + w, base.y, tip.x, tip.y);
    }
  }

  /**
   * 飛行中的範圍投射物（Alan：火球直接丟出、有飛行時間）：落點畫出爆炸範圍。
   * 我方紫色、敵方紅色；越接近落點填色越濃。
   */
  private drawLandingZones(): void {
    const w = this.session.world;
    const g = this.zoneG;
    for (const pr of w.projectiles) {
      if (pr.payload.type !== 'aoe' || !pr.point) continue;
      const def = SKILLS[pr.payload.skillId];
      if (!def || def.effect.kind !== 'aoe') continue;
      const src = w.getUnit(pr.sourceId);
      const enemy = src?.team === 'enemy';
      if (enemy && src && this.hiddenIds.has(src.id)) continue;
      const c = enemy ? COLORS.telegraph : COLORS.ghostSkill;
      const total = Math.hypot(pr.point.x - pr.origin.x, pr.point.y - pr.origin.y) || 1;
      const left = Math.hypot(pr.point.x - pr.pos.x, pr.point.y - pr.pos.y);
      const t = Phaser.Math.Clamp(1 - left / total, 0, 1);
      const r = def.effect.radius;
      groundCircle(g, pr.point.x, pr.point.y, r, { fill: c, fillAlpha: 0.1 + 0.2 * t, stroke: c, strokeAlpha: 0.9, width: 2.5 });
    }
  }

  /** 自身類的預警技能（戰吼）：單位周圍的紅色脈衝環 */
  private drawSelfTelegraphs(): void {
    const g = this.zoneG;
    for (const u of this.session.world.units) {
      const a = u.action;
      // 指向單位的預兆（鉤鎖、祭司的治療）：施放者到目標的線
      if (!u.dead && a && a.phase === 'windup' && a.skillId && a.targetId !== undefined && u.team === 'enemy' && SKILLS[a.skillId].telegraph && !this.hiddenIds.has(u.id)) {
        const t = this.session.world.getUnit(a.targetId);
        if (t && !t.dead) {
          const heal = SKILLS[a.skillId].effect.kind === 'heal';
          const c = heal ? 0x5dff7a : COLORS.telegraph;
          const p = this.wpos(u);
          const q = this.wpos(t);
          groundLine(g, p, q, 4, c, 0.35 + 0.3 * Math.sin(this.time.now / 80));
          groundLine(g, p, { x: p.x + (q.x - p.x) * u.actionProgress, y: p.y + (q.y - p.y) * u.actionProgress }, 6, c, 0.9);
          groundCircle(g, q.x, q.y, t.radius + 0.3, { stroke: c, strokeAlpha: 0.9, width: 3 });
        }
        continue;
      }
      if (u.dead || !a || a.phase !== 'windup' || !a.skillId || a.point || a.targetId !== undefined || this.hiddenIds.has(u.id)) continue;
      const def = SKILLS[a.skillId];
      if (!def.telegraph) continue;
      const p = this.wpos(u);
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 70);
      // 自爆、召喚：畫出實際範圍
      if (def.effect.kind === 'explode' || def.effect.kind === 'summon' || def.effect.kind === 'quake') {
        const R = def.effect.radius;
        groundCircle(g, p.x, p.y, R, { fill: COLORS.telegraph, fillAlpha: 0.12 + 0.1 * pulse, stroke: COLORS.telegraph, strokeAlpha: 0.9, width: 3 });
        groundCircle(g, p.x, p.y, R * u.actionProgress, { fill: COLORS.telegraph, fillAlpha: 0.25 });
        continue;
      }
      const r = u.radius + 1.2 + pulse * 0.3;
      groundCircle(g, p.x, p.y, r, { stroke: COLORS.telegraph, strokeAlpha: 0.6 + 0.4 * pulse, width: 4 });
      groundArc(g, p.x, p.y, r + 0.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u.actionProgress, { stroke: 0xffd166, strokeAlpha: 0.9, width: 6 });
    }
  }

  private drawBars(): void {
    const g = this.overG;
    g.clear();
    // 長按攻擊移動的進度圈（Alan 2026-10-21：輕點＝移動、按住＝攻擊移動）
    // 圈畫在按住位置的上方（Alan：不然被手指擋住看不到）；按住的地方留一個小點，中間連一條細線
    const pr = this.input2.pressProgress();
    if (pr) {
      const z = this.cameras.main.zoom;
      const r = 22 / z;
      const cx = pr.sx;
      const cy = pr.sy - 80 / z;
      g.fillStyle(COLORS.ghostAttack, 0.9);
      g.fillCircle(pr.sx, pr.sy, 4 / z);
      g.lineStyle(1.5 / z, COLORS.ghostAttack, 0.6);
      g.lineBetween(pr.sx, pr.sy, cx, cy + r);
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(cx, cy, r);
      g.lineStyle(3 / z, 0x000000, 0.5);
      g.strokeCircle(cx, cy, r);
      g.lineStyle(4 / z, COLORS.ghostAttack, 0.95);
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pr.k * Math.PI * 2, false);
      g.strokePath();
    }
    const iso = hasHeight();
    const selected = new Set(this.session.selection);
    for (const u of this.session.world.units) {
      const st = this.statusTexts.get(u.id);
      if (u.dead || this.hiddenIds.has(u.id)) {
        st?.setVisible(false);
        continue;
      }
      const head = this.headScreen(u);
      const foot = this.wpos(u);
      const w = 30;
      const x = head.x - w / 2;
      // 被選取的英雄頭上：往下的箭頭（Alan 2026-10-24 試作），上下輕輕跳
      if (selected.has(u.id)) {
        const A = VISUAL.selectArrow;
        const bob = Math.sin((this.time.now / 1000) * Math.PI * 2 * A.bobHz) * A.bob;
        const tip = head.y - (iso ? 4 : 11) - A.gap + bob;
        g.fillStyle(0x000000, 0.9);
        g.fillTriangle(head.x - A.half - 2, tip - A.height - 2, head.x + A.half + 2, tip - A.height - 2, head.x, tip + 2);
        g.fillStyle(COLORS.selection, 1);
        g.fillTriangle(head.x - A.half, tip - A.height, head.x + A.half, tip - A.height, head.x, tip);
      }
      const y = head.y - (iso ? 4 : 11);
      const frac = Math.max(0, u.hp / u.maxHp);
      if (u.follower && !u.rescue) {
        // 隨從（Alan 2026-10-23）：生命只用一個點表示——綠＝健康、黃＝受傷、紅＝瀕死（要護送的英雄照常顯示生命條）
        const c = frac > 0.6 ? 0x5dd16a : frac > 0.3 ? 0xf2d24b : 0xe8473a;
        g.fillStyle(0x000000, 0.9);
        g.fillRect(head.x - 4, y - 1, 8, 8);
        g.fillStyle(c, 1);
        g.fillRect(head.x - 3, y, 6, 6);
      } else {
        g.fillStyle(COLORS.hpBack, 0.85);
        g.fillRect(x - 1, y - 1, w + 2, 6);
        g.fillStyle(u.team === 'hero' ? (frac < 0.3 ? 0xff5e3a : COLORS.hpHero) : COLORS.hpEnemy, 1);
        g.fillRect(x, y, w * frac, 4);
      }
      const a = u.action;
      if (a && (!u.follower || u.rescue) && (a.phase === 'windup' || a.phase === 'recovery')) {
        g.fillStyle(COLORS.hpBack, 0.85);
        g.fillRect(x - 1, y + 5, w + 2, 5);
        g.fillStyle(a.phase === 'windup' ? COLORS.windup : COLORS.recovery, 1);
        g.fillRect(x, y + 6, w * u.actionProgress, 3);
      }
      if (u.blessTime > 0) groundCircle(this.zoneG, foot.x, foot.y, u.radius + 0.22, { stroke: 0xffe08a, strokeAlpha: 0.7, width: 1.5 });
      if (u.guardTime > 0) groundCircle(this.zoneG, foot.x, foot.y, u.radius + 0.3, { stroke: 0x7fb8ff, strokeAlpha: 0.8, width: 2 });
      // 寒氣（法師的光環）：淡藍色的圈
      if (u.chillTime > 0) groundCircle(this.zoneG, foot.x, foot.y, u.radius + 0.18, { fill: 0x9fd8ff, fillAlpha: 0.15, stroke: 0x9fd8ff, strokeAlpha: 0.7, width: 1.5 });
      // 狀態文字：暈眩／定身／燃燒／詛咒
      const label = u.state === UnitState.Stunned ? tr("暈眩") : u.rooted ? tr("定身") : u.burnTime > 0 ? tr("燃燒") : u.curseTime > 0 ? tr("詛咒") : '';
      if (label) {
        let t = st;
        if (!t) {
          t = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffe066', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1001);
          t.setStroke('#000000', 3);
          this.statusTexts.set(u.id, t);
        }
        // 等角：頭頂生命條上方；正俯視：單位下方
        const ty = iso ? y - 10 : this.footScreen(u).y + u.radius * GAME_CONFIG.pxPerMeter + 9;
        t.setText(label).setColor(STATUS_COLOR[label] ?? '#ffe066').setPosition(head.x, ty).setVisible(true);
      } else st?.setVisible(false);
    }
  }

  private drawProjectiles(): void {
    const g = this.overG;
    const iso = hasHeight();
    for (const pr of this.session.world.projectiles) {
      const st = PROJECTILE_STYLE[pr.kind] ?? PROJECTILE_STYLE.arrow;
      const wx = pr.prevPos.x + (pr.pos.x - pr.prevPos.x) * this.alpha;
      const wy = pr.prevPos.y + (pr.pos.y - pr.prevPos.y) * this.alpha;
      // 等角：投射物在空中（直射約胸口高度；拋物線依飛行進度畫弧）
      let z = 0;
      if (iso) {
        z = 1.2;
        if (pr.kind === 'flask') {
          const tu = pr.targetId !== undefined ? this.session.world.getUnit(pr.targetId) : undefined;
          const dest = tu ? tu.pos : pr.point ?? pr.pos;
          const done = Math.hypot(wx - pr.origin.x, wy - pr.origin.y);
          const left = Math.hypot(dest.x - wx, dest.y - wy);
          const t = done + left > 0 ? done / (done + left) : 1;
          z = 1.2 * (1 - t) + 0.3 + Math.min(3, (done + left) * 0.3) * 4 * t * (1 - t);
          const sh = worldToScreen(wx, wy);
          g.fillStyle(0x000000, 0.35);
          g.fillEllipse(sh.x, sh.y, st.size * 2.4, st.size * 1.2);
        }
      }
      const p = worldToScreen(wx, wy, z);
      const back = worldToScreen(wx - (pr.pos.x - pr.prevPos.x), wy - (pr.pos.y - pr.prevPos.y), z);
      const dx = p.x - back.x;
      const dy = p.y - back.y;
      const l = Math.hypot(dx, dy) || 1;
      g.lineStyle(st.size * 0.8, st.color, 0.45);
      g.lineBetween(p.x, p.y, p.x - (dx / l) * st.size * 3, p.y - (dy / l) * st.size * 3);
      g.fillStyle(st.color, 1);
      g.fillCircle(p.x, p.y, st.size);
    }
  }

  /** 暫停時的幽靈線：每名英雄「下一步要做的事」（畫在地面上） */
  /** 每名英雄目前指令的內容與下達時間（指令線變淡用） */
  private routeSince = new Map<number, { key: string; t: number }>();

  /**
   * 英雄的指令線（Alan 2026-10-21：常駐）：暫停中下的（還沒送進 sim）與正在執行的指令。
   * 指令一換就是全亮，之後依 VISUAL.routeLine 變淡變細。
   */
  private drawGhostLines(selected: Set<number>): void {
    const w = this.session.world;
    const ghost = new Map<number, Order | null>();
    for (const c of w.pendingCommands) {
      switch (c.type) {
        case 'move': {
          const us = c.unitIds.map((id) => w.getUnit(id)!).filter((u) => u && !u.dead);
          const pts = w.formationPoints(us, c.point);
          us.forEach((u, i) => ghost.set(u.id, { type: 'move', point: pts[i] }));
          break;
        }
        case 'attack':
          for (const id of c.unitIds) ghost.set(id, { type: 'attack', targetId: c.targetId });
          break;
        case 'follow':
          for (const id of c.unitIds) ghost.set(id, { type: 'follow', targetId: c.targetId });
          break;
        case 'skill':
          ghost.set(c.unitId, { type: 'skill', skillId: c.skillId, targetId: c.targetId, point: c.point });
          break;
        case 'stop':
          for (const id of c.unitIds) ghost.set(id, null);
          break;
        case 'attackMove': {
          const us = c.unitIds.map((id) => w.getUnit(id)!).filter((u) => u && !u.dead);
          const pts = w.formationPoints(us, c.point);
          us.forEach((u, i) => ghost.set(u.id, { type: 'attackMove', point: pts[i] }));
          break;
        }
        case 'interact':
          ghost.set(c.unitId, { type: 'interact', objectId: c.objectId });
          break;
        default:
          break;
      }
    }
    const g = this.ghostG;
    for (const u of w.units) {
      if (u.team !== 'hero' || u.dead) continue;
      // Alan 2026-10-21：只顯示被選取英雄的指令線（新舊照樣記，選回來時淡化程度正確）
      const shown = selected.has(u.id);
      let o: Order | null;
      if (ghost.has(u.id)) o = ghost.get(u.id)!;
      else if (u.nextOrder !== undefined) o = u.nextOrder;
      else if (u.action?.kind === 'skill' && u.action.phase === 'windup')
        o = { type: 'skill', skillId: u.action.skillId!, targetId: u.action.targetId, point: u.action.point };
      else o = u.order;
      if (!o) {
        this.routeSince.delete(u.id);
        continue;
      }
      // 指令內容（同一個指令的終點、目標不變就算同一個；攻擊移動途中換接戰對象不算新指令）
      const key = `${o.type}:${'point' in o && o.point ? `${o.point.x.toFixed(1)},${o.point.y.toFixed(1)}` : ''}:${'targetId' in o && o.type !== 'attackMove' ? o.targetId : ''}:${'skillId' in o ? o.skillId : ''}`;
      const rec = this.routeSince.get(u.id);
      if (!rec || rec.key !== key) this.routeSince.set(u.id, { key, t: w.time });
      const R = VISUAL.routeLine;
      const age = ghost.has(u.id) ? 0 : w.time - this.routeSince.get(u.id)!.t;
      const k = Math.min(1, Math.max(0, (age - R.hold) / R.fade));
      /** 透明度與線寬依指令的新舊 */
      const fa = (a: number) => a * (1 - k) + R.minAlpha * k;
      const fw = (wd: number) => wd * (1 - k * (1 - R.minWidth));
      if (!shown) continue;
      const from = this.wpos(u);
      const targetPos = (id: number): Vec | null => {
        const t = w.getUnit(id);
        return t && !t.dead ? this.wpos(t) : null;
      };
      switch (o.type) {
        case 'move':
          groundLine(g, from, o.point, fw(2), COLORS.ghostMove, fa(0.85));
          groundCircle(g, o.point.x, o.point.y, 0.2, { stroke: COLORS.ghostMove, strokeAlpha: fa(0.85), width: fw(2) });
          break;
        case 'attack': {
          const tp = targetPos(o.targetId);
          if (tp) groundLine(g, from, tp, fw(2), COLORS.ghostAttack, fa(0.85));
          break;
        }
        case 'follow': {
          const tp = targetPos(o.targetId);
          if (tp) groundLine(g, from, tp, fw(2), COLORS.ghostFollow, fa(0.7));
          break;
        }
        case 'interact': {
          // 互動：移動線接到物件中心
          const d = w.interactables.get(o.objectId)?.def;
          if (d) groundLine(g, from, { x: d.x + d.w / 2, y: d.y + d.h / 2 }, fw(2), COLORS.ghostMove, fa(0.85));
          break;
        }
        case 'attackMove':
          // 攻擊移動：紅色的移動線
          groundLine(g, from, o.point, fw(2), COLORS.ghostAttack, fa(0.85));
          groundCircle(g, o.point.x, o.point.y, 0.25, { stroke: COLORS.ghostAttack, strokeAlpha: fa(0.85), width: fw(2) });
          break;
        case 'skill': {
          const def = SKILLS[o.skillId];
          let tp: Vec | null = null;
          if (o.point) tp = o.point;
          else if (o.targetId !== undefined) tp = targetPos(o.targetId);
          const style = { stroke: COLORS.ghostSkill, strokeAlpha: fa(0.9), width: fw(2.5) };
          if (tp) {
            groundLine(g, from, tp, fw(2.5), COLORS.ghostSkill, fa(0.9));
            groundCircle(g, tp.x, tp.y, effectRadius(def) ?? 0.3, style);
          } else groundCircle(g, from.x, from.y, effectRadius(def) ?? 0.45, style);
          break;
        }
      }
    }
  }

  private drawTargeting(): void {
    const s = this.session;
    const td = targetingDef(s);
    if (!td) return;
    const { caster, def } = td;
    const g = this.ghostG;
    const from = this.wpos(caster);
    // 預覽位置：按住瞄準中用按住的位置（觸控沒有 hover）；否則只有滑鼠才跟著游標預覽
    const aim = this.input2.aim;
    let gp: Vec | null = aim ? aim.point : null;
    if (!gp && this.input2.lastPointerMouse) {
      const ptr = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      gp = screenToGround(ptr.x, ptr.y);
    }
    if (def.range > 0) {
      // 射程圈用實際射程（含交戰距離倍率、高地加成）
      const range = s.world.skillRange(caster, def);
      groundCircle(g, from.x, from.y, def.target === 'ground' ? range : range + caster.radius, { stroke: COLORS.targeting, strokeAlpha: 0.55, width: 1.5 });
    }
    if (!gp) return;
    groundLine(g, from, gp, 1.5, COLORS.targeting, 0.6);
    if (def.target === 'ground') {
      groundCircle(g, gp.x, gp.y, effectRadius(def) ?? 0.4, { fill: COLORS.targeting, fillAlpha: aim ? 0.28 : 0.18, stroke: COLORS.targeting, strokeAlpha: 0.9, width: aim ? 3 : 2 });
    } else {
      // 按住瞄準（沉穩節奏）：標出會打到的目標（離按住位置最近的）
      let hu = s.hoverUnitId !== null ? s.world.getUnit(s.hoverUnitId) : undefined;
      if (aim && s.world.config.battleStyle === 'deliberate' && !validSkillTarget(def, caster, hu)) hu = nearestTargetTo(s, def, caster, gp);
      if (hu && validSkillTarget(def, caster, hu)) {
        const p = this.wpos(hu);
        groundCircle(g, p.x, p.y, hu.radius + 0.25, { stroke: COLORS.targeting, strokeAlpha: 1, width: 3 });
      }
    }
  }

  /** 瞄準或滑過敵人時，若主要選取的遠程英雄打過去會有矮籬掩體，顯示「掩體」 */
  private drawCoverHint(): void {
    const s = this.session;
    const w = s.world;
    this.coverText.setVisible(false);
    if (!w.terrain.any || s.hoverUnitId === null) return;
    const target = w.getUnit(s.hoverUnitId);
    if (!target || target.dead || target.team !== 'enemy') return;
    const td = targetingDef(s);
    const caster = td ? td.caster : s.primary();
    if (!caster || caster.dead) return;
    const ranged = td ? !(td.def.effect.kind === 'strike' && td.def.effect.melee) && td.def.target === 'enemy' : !caster.isMelee;
    if (!ranged || !w.hasCover(caster.pos, target)) return;
    const p = this.headScreen(target);
    this.coverText.setPosition(p.x, p.y - 22).setVisible(true);
  }

  /** 方向對照（除錯）：地上畫實際面向（世界角度）的箭頭，旁邊標出換算後的 Flare 方向編號 */
  private drawFacingDebug(): void {
    const on = this.session.debug.facing;
    for (const u of this.session.world.units) {
      let t = this.facingTexts.get(u.id);
      if (!on || u.dead || this.hiddenIds.has(u.id)) {
        t?.setVisible(false);
        continue;
      }
      const p = this.wpos(u);
      const f = displayFacing(u.facing);
      const tip = { x: p.x + Math.cos(f) * 1.3, y: p.y + Math.sin(f) * 1.3 };
      const g = this.ghostG;
      groundLine(g, p, tip, 3, 0xffe066, 0.95);
      for (const side of [-1, 1]) {
        const a = f + Math.PI + side * 0.45;
        groundLine(g, tip, { x: tip.x + Math.cos(a) * 0.35, y: tip.y + Math.sin(a) * 0.35 }, 3, 0xffe066, 0.95);
      }
      if (!t) {
        t = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#ffe066', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(1201);
        t.setStroke('#000000', 3);
        this.facingTexts.set(u.id, t);
      }
      const d = flareDir(f);
      const sp = worldToScreen(p.x, p.y);
      t.setText(tr("dir {0}（{1}）", { 0: d, 1: DIR_NAMES[d] })).setPosition(sp.x, sp.y + 10).setVisible(true);
    }
  }

  /**
   * 出口（SPEC_SLICE6 §2）：地面上閃爍的範圍框（打開＝金色、封住＝灰紅），上方標出下一個節點；
   * 畫在迷霧上面，探索前也知道往哪走。畫面外的出口在畫面邊緣顯示金色箭頭。
   */
  private drawExits(): void {
    const w = this.session.world;
    const exits = w.map.exits ?? [];
    const g = this.exitG;
    g.clear();
    if (exits.length === 0) return;
    const open = w.exitsOpen();
    const pulse = 0.55 + 0.45 * Math.sin(this.time.now / 260);
    const color = open ? 0xffd23f : 0x9a5a5a;
    exits.forEach((e, i) => {
      // 每個出口自己的顏色（和迷你路線圖上的字母一致）；還沒開的出口暗紅
      const c = open ? (this.exitInfo[i]?.color ?? color) : color;
      groundRect(g, e.x, e.y, e.w, e.h, { fill: c, fillAlpha: 0.12 + 0.12 * pulse, stroke: c, strokeAlpha: 0.6 + 0.4 * pulse, width: 3 });
      const top = worldToScreen(e.x + e.w / 2, e.y + e.h / 2, 0.6);
      this.exitTexts[i]?.setPosition(top.x, top.y).setColor(open ? (this.exitInfo[i]?.css ?? '#ffe9a8') : '#c9a0a0');
    });
    // 畫面外的出口：邊緣的金色三角形
    const cam = this.cameras.main;
    const eg = this.edgeG;
    const x1 = this.scale.width;
    const y1 = this.scale.height - this.hudBottom();
    const cx = x1 / 2;
    const cy = y1 / 2;
    for (const [i, e] of exits.entries()) {
      const p = worldToScreen(e.x + e.w / 2, e.y + e.h / 2);
      const sx = (p.x - cam.worldView.x) * cam.zoom;
      const sy = (p.y - cam.worldView.y) * cam.zoom;
      if (sx >= 0 && sx <= x1 && sy >= 0 && sy <= y1) continue;
      const dx = sx - cx;
      const dy = sy - cy;
      const t = Math.min(dx !== 0 ? (x1 / 2 - 14) / Math.abs(dx) : Infinity, dy !== 0 ? (y1 / 2 - 14) / Math.abs(dy) : Infinity);
      const ex = cx + dx * t;
      const ey = cy + dy * t;
      const a = Math.atan2(dy, dx);
      const r = 12;
      eg.fillStyle(open ? (this.exitInfo[i]?.color ?? color) : color, 0.95);
      eg.fillTriangle(ex + Math.cos(a) * r, ey + Math.sin(a) * r, ex + Math.cos(a + 2.4) * r, ey + Math.sin(a + 2.4) * r, ex + Math.cos(a - 2.4) * r, ey + Math.sin(a - 2.4) * r);
    }
  }

  /** 出口要打倒的敵人（精英隊長或頭目），還活著的 */
  private lockTargets(): Unit[] {
    const w = this.session.world;
    const rank = w.map.exitLock === 'boss' ? 'boss' : w.map.exitLock === 'captain' ? 'elite' : null;
    if (!rank) return [];
    return w.units.filter((u) => u.team === 'enemy' && !u.dead && enemyRank(u.def) === rank);
  }

  /** 開始標示要打倒的敵人（只做一次） */
  private revealTargets(): void {
    if (this.targetHint || this.lockTargets().length === 0) return;
    this.targetHint = true;
    const s = this.session;
    const msg = s.world.map.exitLock === 'boss' ? tr("頭目正等待你的挑戰") : tr("精英隊長正等待你的挑戰");
    s.addLog(msg, 'warn');
    s.showToast(msg, this.time.now, 2200);
  }

  /**
   * 要打倒的敵人的標示（Alan 2026-10-22）：在畫面外時，畫面邊緣出現朝它的金色箭頭；
   * 在畫面內時，頭上有上下跳動的金色箭頭。迷霧裡也會標示（只給方向，看不到敵人本身）。
   */
  private drawTargetHint(): void {
    if (!this.targetHint || this.session.world.result) return;
    const g = this.edgeG;
    const cam = this.cameras.main;
    const x1 = this.scale.width;
    const y1 = this.scale.height - this.hudBottom();
    const cx = x1 / 2;
    const cy = y1 / 2;
    const bob = Math.sin(this.time.now / 180);
    const color = 0xffd23f;
    const tri = (x: number, y: number, a: number, r: number) => {
      const pts = [0, 2.5, -2.5].map((d) => ({ x: x + Math.cos(a + d) * r, y: y + Math.sin(a + d) * r }));
      g.fillStyle(color, 0.95);
      g.fillTriangle(pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
      g.lineStyle(2, 0x140e0a, 1);
      g.strokeTriangle(pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
    };
    for (const u of this.lockTargets()) {
      const wp = this.wpos(u);
      const p = worldToScreen(wp.x, wp.y, this.headZ(u) + 0.6);
      const sx = (p.x - cam.worldView.x) * cam.zoom;
      const sy = (p.y - cam.worldView.y) * cam.zoom;
      if (sx >= 0 && sx <= x1 && sy >= 0 && sy <= y1) {
        // 畫面內：頭上朝下的箭頭
        tri(sx, sy - 10 + bob * 4, Math.PI / 2, 12);
        continue;
      }
      const dx = sx - cx;
      const dy = sy - cy;
      const t = Math.min(dx !== 0 ? (x1 / 2 - 26) / Math.abs(dx) : Infinity, dy !== 0 ? (y1 / 2 - 26) / Math.abs(dy) : Infinity);
      const a = Math.atan2(dy, dx);
      const ex = cx + dx * t + Math.cos(a) * bob * 3;
      const ey = cy + dy * t + Math.sin(a) * bob * 3;
      pixelGlow(g, ex, ey, 24, color, 0.35, { cell: 4, bands: 3 });
      tri(ex, ey, a, 16);
    }
  }

  /**
   * 畫面外敵人指示器（Alan）：鏡頭遠近固定後，看不到的敵人在畫面邊緣（下緣是卡片上方）朝它的方向顯示紅色光暈。
   * 光暈大小依敵人強弱（最大生命）；被迷霧或草叢遮住的敵人不顯示。
   */
  private drawOffscreenEnemies(): void {
    const g = this.edgeG;
    g.clear();
    const w = this.session.world;
    if (w.result) return;
    const cam = this.cameras.main;
    const V = VISUAL.offscreen;
    // 可見區域（畫面座標）：下方扣掉 HUD
    const x0 = 0;
    const y0 = 0;
    const x1 = this.scale.width;
    const y1 = this.scale.height - this.hudBottom();
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const pulse = 0.85 + 0.15 * Math.sin(this.time.now / 260);
    for (const u of w.units) {
      if (u.team !== 'enemy' || u.dead || this.hiddenIds.has(u.id)) continue;
      const wp = this.wpos(u);
      const p = worldToScreen(wp.x, wp.y, 1);
      const sx = (p.x - cam.worldView.x) * cam.zoom;
      const sy = (p.y - cam.worldView.y) * cam.zoom;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) continue;
      // 從可見區域中心往敵人的射線與邊框的交點
      const dx = sx - cx;
      const dy = sy - cy;
      const t = Math.min(dx !== 0 ? (x1 - cx) / Math.abs(dx) : Infinity, dy !== 0 ? (y1 - cy) / Math.abs(dy) : Infinity);
      const ex = cx + dx * t;
      const ey = cy + dy * t;
      const r = Phaser.Math.Clamp(V.base + V.perSqrtHp * Math.sqrt(u.maxHp), V.min, V.max) * pulse;
      // 像素光暈：外圈淡、內圈濃（Alan 2026-10-22：要有像素感）
      pixelGlow(g, ex, ey, r, V.color, V.alpha, { cell: 6, bands: V.layers });
    }
  }

  private drawBoxSelect(): void {
    const a = this.input2.dragStart;
    const b = this.input2.dragNow;
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) <= 6) return;
    const g = this.ghostG;
    g.fillStyle(0xffffff, 0.08);
    g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    g.lineStyle(1, 0xffffff, 0.7);
    g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }
}

/** 駐守點：地面上的小菱形 */
function groundRectDiamond(g: Phaser.GameObjects.Graphics, p: Vec, d: number, color: number): void {
  const pts = [
    worldToScreen(p.x - d, p.y - d),
    worldToScreen(p.x + d, p.y - d),
    worldToScreen(p.x + d, p.y + d),
    worldToScreen(p.x - d, p.y + d),
  ];
  g.lineStyle(1.5, color, 0.9);
  g.strokePoints(pts.map((q) => new Phaser.Math.Vector2(q.x, q.y)), true);
}

/** 快速戰鬥用的暫時遠征狀態：滿血隊伍、指定遭遇與層數 */
function quickRun(seed: number, encounterId: string, layer: number): RunState {
  const r = createRun(seed);
  const node = r.map.nodes.find((n) => n.layer === Math.min(layer, r.map.layerCount)) ?? r.map.nodes[0];
  r.currentNodeId = node.id;
  r.phase = { kind: 'battle', nodeId: node.id, encounterId, fromEvent: false };
  return r;
}

/** 技能的效果半徑（預覽圈用） */
function effectRadius(def: SkillDef): number | undefined {
  const e = def.effect;
  switch (e.kind) {
    case 'aoe':
    case 'zone':
    case 'aoeHeal':
    case 'bless':
    case 'whirlwind':
      return e.radius;
    default:
      return undefined;
  }
}

function randomSeed(): number {
  const q = new URLSearchParams(window.location.search).get('seed');
  if (q && /^\d+$/.test(q)) return Number(q);
  return 1 + Math.floor(Math.random() * 999999);
}

/** 從 from 看 to 在哪個方向（世界座標 +x＝畫面上、+y＝畫面右） */
function directionWord(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? tr("從上方") : tr("從下方");
  return dy > 0 ? tr("從右方") : tr("從左方");
}

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
import { AOE_STYLE, COLORS, FONT, PROJECTILE_STYLE, darken, lighten } from '../render/palette';
import type { SkillDef } from '../../sim/data/types';
import { OBJECT_DEPTH_BASE, UnitView } from '../render/unitView';
import {
  depthOf,
  getProjection,
  groundArc,
  groundCircle,
  groundLine,
  groundRect,
  groundSector,
  isIso,
  mapScreenBounds,
  screenToGround,
  worldToScreen,
} from '../render/projection';
import type { ProjectionMode } from '../render/projection';
import { obstacleHeight, obstacleKind } from '../render/visual';
import { InputController } from '../input/inputController';
import { targetingDef, validSkillTarget } from '../input/targeting';
import { BattleSession, currentSimConfig } from '../session';
import { battleSeed, createBattleFromRun, currentEncounter } from '../../run/battle';
import { getRun } from '../runFlow';
import type { RunState } from '../../run/runState';
import { createRun } from '../../run/runState';

const STATUS_COLOR: Record<string, string> = { 暈眩: '#ffe066', 定身: '#a6e3ff', 燃燒: '#ff9a4a', 詛咒: '#d59af0' };

/** 戰鬥場景：固定節拍推進 sim、插值渲染、把 SimEvent 轉成飄字與戰鬥紀錄 */
export class BattleScene extends Phaser.Scene {
  session!: BattleSession;
  input2!: InputController;
  private views = new Map<number, UnitView>();
  private statusTexts = new Map<number, Phaser.GameObjects.Text>();
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
  /** 每幀記錄鏡頭中心對應的地面點（切換投影時保持鏡頭位置） */
  private lastCenterGround: Vec = { x: 0, y: 0 };
  /** 被高障礙物擋住的角色輪廓（最上層） */
  private occlusionG!: Phaser.GameObjects.Graphics;

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
    this.registry.set('session', this.session);
    this.views.clear();
    this.statusTexts.clear();
    this.worldObjects = [];
    this.blocks = [];
    this.resultShown = false;
    this.alpha = 0;
    this.lastFrame = 0;

    // 圖層：地面（地板、地形、地面標示）< 物件層（角色、障礙物方塊，依 depthOf 排序）< 覆蓋層（生命條、幽靈線、飄字）
    this.brushG = this.add.graphics().setDepth(1);
    this.fireG = this.add.graphics().setDepth(2);
    this.zoneG = this.add.graphics().setDepth(3);
    this.buildWorld();
    this.occlusionG = this.add.graphics().setDepth(950);
    this.overG = this.add.graphics().setDepth(1000);
    this.ghostG = this.add.graphics().setDepth(1100);
    this.coverText = this.add
      .text(0, 0, '掩體', { fontFamily: FONT, fontSize: '12px', color: '#d9b77a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setStroke('#000000', 3)
      .setDepth(1200)
      .setVisible(false);
    this.fx = new Fx(this);
    this.dim = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.22)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(3000)
      .setVisible(false);

    this.setupCamera();
    this.input2 = new InputController({
      scene: this,
      session: () => this.session,
      unitAtScreen: (x, y) => this.unitAtScreen(x, y),
      footScreen: (u) => this.footScreen(u),
      centerOn: (id) => this.centerOnUnit(id),
    });

    if (this.session.autoPause.battleStart) this.session.setPaused(true, '戰鬥開始');
    if (this.session.mode === 'run') {
      const enc = currentEncounter(getRun(this));
      this.session.addLog(`${enc.name}（${this.session.world.map.name}）`, 'sys');
    } else this.session.addLog(`戰鬥開始（種子 ${seed}）`, 'sys');

    if (!this.scene.isActive('UI')) this.scene.launch('UI');
    this.scene.bringToTop('UI');
  }

  // ───────────── 地圖、障礙物與鏡頭（依投影建立；切換投影時重建） ─────────────

  /** 依目前投影建立地面、障礙物、單位外觀與除錯圖層 */
  private buildWorld(): void {
    this.builtMode = getProjection();
    this.drawMap();
    if (isIso()) this.buildObstacleBlocks();
    for (const u of this.session.world.units) this.views.set(u.id, new UnitView(this, u));
    this.debugOverlay = new DebugOverlay(this, this.session.world);
    this.brushVersion = -1;
  }

  private destroyWorld(): void {
    for (const o of this.worldObjects) o.destroy();
    this.worldObjects = [];
    this.blocks = [];
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.debugOverlay.destroy();
  }

  /** 除錯面板切換投影：重建畫面物件，鏡頭對準同一個地面點 */
  private checkProjection(): void {
    if (getProjection() === this.builtMode) return;
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
    const b = mapScreenBounds(W, H);
    const pad = 4;
    const g = this.add.graphics();
    g.translateCanvas(-b.x + pad, -b.y + pad);
    groundRect(g, 0, 0, W, H, { fill: COLORS.floor });
    for (let x = 0; x <= W; x++) groundLine(g, { x, y: 0 }, { x, y: H }, 1, COLORS.floorGrid);
    for (let y = 0; y <= H; y++) groundLine(g, { x: 0, y }, { x: W, y }, 1, COLORS.floorGrid);
    const zone = (pts: Vec[], color: number) => {
      if (pts.length === 0) return;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x0 = Math.min(...xs) - 1.5;
      const y0 = Math.min(...ys) - 1.5;
      groundRect(g, x0, y0, Math.max(...xs) + 1.5 - x0, Math.max(...ys) + 1.5 - y0, { fill: color, fillAlpha: 0.35 });
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
      // 等角模式的障礙物是立體方塊（物件層）；地面只畫陰影
      if (isIso()) {
        groundRect(g, r.x, r.y, r.w, r.h, { fill: 0x15171b, fillAlpha: 0.6 });
        continue;
      }
      groundRect(g, r.x, r.y, r.w, r.h, { fill: kind === 'cliff' ? COLORS.cliff : COLORS.obstacle, stroke: COLORS.obstacleEdge, width: 2 });
    }
    groundRect(g, 0, 0, W, H, { stroke: 0x15171b, width: 3 });
    // 靜態圖層烘成貼圖，避免每幀重新三角化
    this.worldObjects.push(bakeGraphics(this, g, 'map-floor', b.w + pad * 2, b.h + pad * 2, 0, b.x - pad, b.y - pad));
    const corner = worldToScreen(W, 0);
    this.worldObjects.push(
      this.add
        .text(corner.x - 8, corner.y + 6, map.name, { fontFamily: FONT, fontSize: '14px', color: '#8a93a3' })
        .setOrigin(1, 0)
        .setDepth(1),
    );
  }

  /** 等角模式：障礙物畫成立體方塊，大型障礙物切成每格一塊各自排序 */
  private buildObstacleBlocks(): void {
    const map = this.session.world.map;
    for (const r of map.obstacles) {
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

  private addBlock(x: number, y: number, w: number, d: number, h: number, color: number): void {
    const g = this.add.graphics();
    const P = (px: number, py: number, pz: number) => worldToScreen(px, py, pz);
    const poly = (pts: { x: number; y: number }[], fill: number) => {
      g.fillStyle(fill, 1);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.fillPath();
      g.lineStyle(1, darken(color, 0.45), 0.9);
      g.strokePath();
    };
    // 看得到的兩個側面：+x 面與 +y 面；最後畫頂面
    poly([P(x + w, y, 0), P(x + w, y + d, 0), P(x + w, y + d, h), P(x + w, y, h)], darken(color, 0.8));
    poly([P(x, y + d, 0), P(x + w, y + d, 0), P(x + w, y + d, h), P(x, y + d, h)], darken(color, 0.62));
    poly([P(x, y, h), P(x + w, y, h), P(x + w, y + d, h), P(x, y + d, h)], lighten(color, 1.2));
    const depth = depthOf(x + w / 2, y + d / 2);
    g.setDepth(OBJECT_DEPTH_BASE + depth);
    const pts = [P(x, y, 0), P(x + w, y, 0), P(x + w, y + d, 0), P(x, y + d, 0), P(x, y, h), P(x + w, y, h), P(x + w, y + d, h), P(x, y + d, h)];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    this.blocks.push({ depth, h, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
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
    cam.setBounds(b.x - pad, b.y - pad - (isIso() ? 120 : 0), b.w + pad * 2, b.h + pad * 2 + (isIso() ? 120 : 0) + GAME_CONFIG.hudBottomHeight);
  }

  private setupCamera(): void {
    const map = this.session.world.map;
    this.setupCameraBounds();
    let start: Vec;
    if (isIso()) {
      // 開場鏡頭對準英雄群的中心
      const heroes = this.session.world.units.filter((u) => u.team === 'hero' && !u.dead);
      start = heroes.length
        ? { x: heroes.reduce((a, u) => a + u.pos.x, 0) / heroes.length, y: heroes.reduce((a, u) => a + u.pos.y, 0) / heroes.length }
        : { x: map.width / 2, y: map.height / 2 };
    } else start = map.landmarks?.cameraStart ?? { x: map.width / 2, y: map.height / 2 };
    const p = worldToScreen(start.x, start.y);
    this.cameras.main.centerOn(p.x, p.y + GAME_CONFIG.hudBottomHeight / 2);
  }

  centerOnUnit(id: number): void {
    const u = this.session.world.getUnit(id);
    if (!u) return;
    const p = worldToScreen(u.pos.x, u.pos.y);
    this.cameras.main.pan(p.x, p.y + GAME_CONFIG.hudBottomHeight / 2 / this.cameras.main.zoom, 250, 'Sine.easeInOut');
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
    this.lastCenterGround = screenToGround(cam.midPoint.x, cam.midPoint.y - GAME_CONFIG.hudBottomHeight / 2 / cam.zoom);
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
          this.fx.text(t.pos, ev.crit ? `${ev.damage}!` : `${ev.damage}`, ev.crit ? '#ffd23f' : '#ffffff', ev.crit ? 24 : 16, 34, 900, this.headZ(t));
          s.addLog(
            `${L(src.id)} → ${L(t.id)}：${ev.damage}${ev.crit ? '（爆擊）' : ''}${ev.skillId ? `〔${skillName(ev.skillId)}〕` : ''}${ev.freeAttack ? '〔脫離攻擊〕' : ''}`,
            src.team,
          );
          if (ev.freeAttack) this.fx.text(t.pos, '脫離攻擊', '#ff9f43', 13, 50, 900, this.headZ(t));
          if (t.team === 'hero' && !t.dead && s.autoPause.heroLowHp && t.hp / t.maxHp < s.autoPause.heroLowHpThreshold && !s.lowHpWarned.has(t.id)) {
            s.lowHpWarned.add(t.id);
            s.setPaused(true, `${L(t.id)}生命低於 ${Math.round(s.autoPause.heroLowHpThreshold * 100)}%`);
          }
          break;
        }
        case 'miss': {
          const t = w.getUnit(ev.targetId)!;
          if (ev.blocked && ev.point) {
            this.fx.text(ev.point, '擋下', '#c8ccd2', 13, 34, 900, 1.2);
            s.addLog(`${L(ev.sourceId)} → ${L(t.id)}：被障礙物擋下${ev.skillId ? `〔${skillName(ev.skillId)}〕` : ''}`, 'miss');
            break;
          }
          this.fx.text(t.pos, 'Miss', '#9aa0a6', 14, 34, 900, this.headZ(t));
          s.addLog(`${L(ev.sourceId)} → ${L(t.id)}：未命中${ev.skillId ? `〔${skillName(ev.skillId)}〕` : ''}`, 'miss');
          break;
        }
        case 'heal': {
          const t = w.getUnit(ev.targetId)!;
          this.fx.text(t.pos, `+${ev.amount}`, '#5dff7a', 18, 34, 900, this.headZ(t));
          s.addLog(`${L(ev.sourceId)} 治療 ${L(t.id)} +${ev.amount}`, 'heal');
          if (t.hp / t.maxHp >= s.autoPause.heroLowHpThreshold) s.lowHpWarned.delete(t.id);
          break;
        }
        case 'interrupt': {
          const t = w.getUnit(ev.targetId)!;
          this.fx.interrupt(t.pos, this.headZ(t));
          const def = ev.skillId ? SKILLS[ev.skillId] : undefined;
          if (def?.telegraph && ev.point && def.effect.kind === 'aoe') this.fx.shatter(ev.point, def.effect.radius);
          s.addLog(`${L(ev.sourceId)} 打斷了 ${L(t.id)}${def ? `的「${def.name}」` : ''}！`, 'interrupt');
          break;
        }
        case 'death': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, '陣亡', '#c0c4cc', 16, 20, 1400, this.headZ(u));
          s.addLog(`${L(u.id)} 被 ${ev.killerId !== undefined ? L(ev.killerId) : '?'} 擊倒`, 'death');
          s.selection = s.selection.filter((id) => id !== u.id);
          if (u.team === 'hero' && s.autoPause.heroDeath && !w.result) s.setPaused(true, `${L(u.id)}陣亡`);
          break;
        }
        case 'pinned': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, '被牽制', '#ff9f43', 15, 34, 900, this.headZ(u));
          s.addLog(`${L(u.id)} 被 ${ev.byId >= 0 ? L(ev.byId) : '?'} 牽制`, 'pin');
          break;
        }
        case 'guardRedirect': {
          const g = w.getUnit(ev.guardId)!;
          this.fx.text(g.pos, '守護', '#7fb8ff', 14, 34, 900, this.headZ(g));
          s.addLog(`${L(g.id)} 替 ${L(ev.protectedId)} 擋下攻擊`, 'hero');
          break;
        }
        case 'status': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, ev.text, '#e0e6f0', 13, 26, 900, this.headZ(u));
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
          const kind = ev.skillId ? SKILLS[ev.skillId]?.effect.kind : undefined;
          if (kind === 'aoe' || kind === 'cone') s.addLog(`${L(src.id)} 的「${skillName(ev.skillId)}」爆炸`, src.team);
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
            s.addLog(`⚠ ${L(u.id)} 開始準備「${def.name}」！`, 'warn');
            if (s.autoPause.enemyAoeWindup) s.setPaused(true, `${L(u.id)}準備「${def.name}」`);
          } else if (u.team === 'hero') {
            s.addLog(`${L(u.id)} 施放「${def.name}」`, 'skill');
          }
          break;
        }
        case 'spawn': {
          const u = w.getUnit(ev.unitId)!;
          this.views.set(u.id, new UnitView(this, u));
          s.registerUnit(u, '援軍');
          this.fx.ring(u.pos, 1.2, 0xff6b6b, 500);
          break;
        }
        case 'warcry': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.ring(u.pos, 6, 0xff2a2a, 900, 0.1, 8);
          this.fx.text(u.pos, '戰吼！', '#ff6b6b', 26, 50, 1400, this.headZ(u));
          this.cameras.main.shake(300, 0.006);
          s.addLog(`⚠ ${L(u.id)} 發出戰吼！援軍進場，敵人傷害提高`, 'warn');
          break;
        }
        case 'aggro':
          s.addLog('敵人開始進攻！', 'warn');
          s.showToast('敵人開始進攻！', this.time.now, 1800);
          break;
        case 'battleEnd':
          s.addLog(ev.winner === 'hero' ? '勝利！' : '全軍覆沒……', 'sys');
          s.targeting = null;
          if (!this.resultShown) {
            this.resultShown = true;
            this.time.delayedCall(1100, () => this.scene.launch('Result'));
          }
          break;
      }
    }
  }

  // ───────────── 繪製 ─────────────

  private render(): void {
    const s = this.session;
    const w = s.world;
    const selected = new Set(s.selection);
    this.updateConcealment();
    for (const v of this.views.values()) v.update(this.alpha, selected.has(v.unit.id), s.hoverUnitId === v.unit.id);
    this.drawDynamicTerrain();

    this.drawZones(selected);
    this.drawSelfTelegraphs();
    this.drawOcclusion();
    this.drawBars();
    this.drawProjectiles();
    this.ghostG.clear();
    if (s.paused && !w.result) this.drawGhostLines();
    this.drawTargeting();
    this.drawCoverHint();
    this.drawBoxSelect();
    this.debugOverlay.update(s, (id) => this.wpos(w.getUnit(id)!));
    this.dim.setVisible(s.paused && !w.result);
    this.input.setDefaultCursor(s.targeting ? 'crosshair' : 'default');
  }

  /** 草叢隱匿：敵方被隱藏時不顯示；我方在草叢內半透明 */
  private updateConcealment(): void {
    const w = this.session.world;
    this.hiddenIds.clear();
    for (const v of this.views.values()) {
      const u = v.unit;
      if (u.dead) {
        v.setConcealment('normal');
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
    if (!isIso() || this.blocks.length === 0) return;
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
    // 地面區域（沼澤）
    for (const z of w.zones) {
      const fade = Math.min(1, z.time / 1.5);
      groundCircle(g, z.point.x, z.point.y, z.radius, { fill: 0x5a6a22, fillAlpha: 0.28 * fade, stroke: 0xa5b84a, strokeAlpha: 0.6 * fade, width: 2 });
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
      if (def.effect.kind !== 'aoe') continue;
      const r = def.effect.radius;
      const enemy = u.team === 'enemy';
      const c = enemy ? COLORS.telegraph : COLORS.ghostSkill;
      groundCircle(g, a.point.x, a.point.y, r, { fill: c, fillAlpha: enemy ? 0.12 + 0.1 * pulse : 0.12 });
      groundCircle(g, a.point.x, a.point.y, r * u.actionProgress, { fill: c, fillAlpha: 0.25 });
      groundCircle(g, a.point.x, a.point.y, r, { stroke: c, strokeAlpha: 0.9, width: enemy ? 3 : 2 });
    }
  }

  /** 自身類的預警技能（戰吼）：單位周圍的紅色脈衝環 */
  private drawSelfTelegraphs(): void {
    const g = this.zoneG;
    for (const u of this.session.world.units) {
      const a = u.action;
      if (u.dead || !a || a.phase !== 'windup' || !a.skillId || a.point || a.targetId !== undefined || this.hiddenIds.has(u.id)) continue;
      if (!SKILLS[a.skillId].telegraph) continue;
      const p = this.wpos(u);
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 70);
      const r = u.radius + 1.2 + pulse * 0.3;
      groundCircle(g, p.x, p.y, r, { stroke: COLORS.telegraph, strokeAlpha: 0.6 + 0.4 * pulse, width: 4 });
      groundArc(g, p.x, p.y, r + 0.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u.actionProgress, { stroke: 0xffd166, strokeAlpha: 0.9, width: 6 });
    }
  }

  private drawBars(): void {
    const g = this.overG;
    g.clear();
    const iso = isIso();
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
      const y = head.y - (iso ? 4 : 11);
      g.fillStyle(COLORS.hpBack, 0.85);
      g.fillRect(x - 1, y - 1, w + 2, 6);
      const frac = Math.max(0, u.hp / u.maxHp);
      g.fillStyle(u.team === 'hero' ? (frac < 0.3 ? 0xff5e3a : COLORS.hpHero) : COLORS.hpEnemy, 1);
      g.fillRect(x, y, w * frac, 4);
      const a = u.action;
      if (a && (a.phase === 'windup' || a.phase === 'recovery')) {
        g.fillStyle(COLORS.hpBack, 0.85);
        g.fillRect(x - 1, y + 5, w + 2, 5);
        g.fillStyle(a.phase === 'windup' ? COLORS.windup : COLORS.recovery, 1);
        g.fillRect(x, y + 6, w * u.actionProgress, 3);
      }
      if (u.blessTime > 0) groundCircle(this.zoneG, foot.x, foot.y, u.radius + 0.22, { stroke: 0xffe08a, strokeAlpha: 0.7, width: 1.5 });
      if (u.guardTime > 0) groundCircle(this.zoneG, foot.x, foot.y, u.radius + 0.3, { stroke: 0x7fb8ff, strokeAlpha: 0.8, width: 2 });
      // 狀態文字：暈眩／定身／燃燒／詛咒
      const label = u.state === UnitState.Stunned ? '暈眩' : u.rooted ? '定身' : u.burnTime > 0 ? '燃燒' : u.curseTime > 0 ? '詛咒' : '';
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
    const iso = isIso();
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
  private drawGhostLines(): void {
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
        default:
          break;
      }
    }
    const g = this.ghostG;
    for (const u of w.units) {
      if (u.team !== 'hero' || u.dead) continue;
      let o: Order | null;
      if (ghost.has(u.id)) o = ghost.get(u.id)!;
      else if (u.nextOrder !== undefined) o = u.nextOrder;
      else if (u.action?.kind === 'skill' && u.action.phase === 'windup')
        o = { type: 'skill', skillId: u.action.skillId!, targetId: u.action.targetId, point: u.action.point };
      else o = u.order;
      if (!o) continue;
      const from = this.wpos(u);
      const targetPos = (id: number): Vec | null => {
        const t = w.getUnit(id);
        return t && !t.dead ? this.wpos(t) : null;
      };
      switch (o.type) {
        case 'move':
          groundLine(g, from, o.point, 2, COLORS.ghostMove, 0.85);
          groundCircle(g, o.point.x, o.point.y, 0.2, { stroke: COLORS.ghostMove, strokeAlpha: 0.85, width: 2 });
          break;
        case 'attack': {
          const tp = targetPos(o.targetId);
          if (tp) groundLine(g, from, tp, 2, COLORS.ghostAttack, 0.85);
          break;
        }
        case 'follow': {
          const tp = targetPos(o.targetId);
          if (tp) groundLine(g, from, tp, 2, COLORS.ghostFollow, 0.7);
          break;
        }
        case 'skill': {
          const def = SKILLS[o.skillId];
          let tp: Vec | null = null;
          if (o.point) tp = o.point;
          else if (o.targetId !== undefined) tp = targetPos(o.targetId);
          const style = { stroke: COLORS.ghostSkill, strokeAlpha: 0.9, width: 2.5 };
          if (tp) {
            groundLine(g, from, tp, 2.5, COLORS.ghostSkill, 0.9);
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
    const ptr = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const gp = screenToGround(ptr.x, ptr.y);
    if (def.range > 0) {
      groundCircle(g, from.x, from.y, def.target === 'ground' ? def.range : def.range + caster.radius, { stroke: COLORS.targeting, strokeAlpha: 0.55, width: 1.5 });
    }
    groundLine(g, from, gp, 1.5, COLORS.targeting, 0.6);
    if (def.target === 'ground') {
      groundCircle(g, gp.x, gp.y, effectRadius(def) ?? 0.4, { fill: COLORS.targeting, fillAlpha: 0.18, stroke: COLORS.targeting, strokeAlpha: 0.9, width: 2 });
    } else {
      const hu = s.hoverUnitId !== null ? s.world.getUnit(s.hoverUnitId) : undefined;
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

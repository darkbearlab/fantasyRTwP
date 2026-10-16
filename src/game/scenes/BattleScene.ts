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
import { AOE_STYLE, COLORS, FONT, PROJECTILE_STYLE } from '../render/palette';
import type { SkillDef } from '../../sim/data/types';
import { UnitView } from '../render/unitView';
import { InputController } from '../input/inputController';
import { targetingDef, validSkillTarget } from '../input/targeting';
import { BattleSession, currentSimConfig } from '../session';
import { battleSeed, createBattleFromRun, currentEncounter } from '../../run/battle';
import { getRun } from '../runFlow';
import type { RunState } from '../../run/runState';
import { createRun } from '../../run/runState';

const PX = GAME_CONFIG.pxPerMeter;
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
    this.resultShown = false;
    this.alpha = 0;
    this.lastFrame = 0;

    this.drawMap();
    this.brushG = this.add.graphics().setDepth(1);
    this.fireG = this.add.graphics().setDepth(2);
    this.brushVersion = -1;
    this.coverText = this.add
      .text(0, 0, '掩體', { fontFamily: FONT, fontSize: '12px', color: '#d9b77a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setStroke('#000000', 3)
      .setDepth(26)
      .setVisible(false);
    this.zoneG = this.add.graphics().setDepth(3);
    for (const u of this.session.world.units) this.views.set(u.id, new UnitView(this, u));
    this.overG = this.add.graphics().setDepth(20);
    this.ghostG = this.add.graphics().setDepth(25);
    this.debugOverlay = new DebugOverlay(this, this.session.world);
    this.fx = new Fx(this);
    this.dim = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.22)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(40)
      .setVisible(false);

    this.setupCamera();
    this.input2 = new InputController({
      scene: this,
      session: () => this.session,
      unitAt: (p) => this.unitAt(p),
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

  // ───────────── 地圖與鏡頭 ─────────────

  private drawMap(): void {
    const map = this.session.world.map;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(COLORS.floor, 1);
    g.fillRect(0, 0, map.width * PX, map.height * PX);
    g.lineStyle(1, COLORS.floorGrid, 1);
    for (let x = 0; x <= map.width; x++) g.lineBetween(x * PX, 0, x * PX, map.height * PX);
    for (let y = 0; y <= map.height; y++) g.lineBetween(0, y * PX, map.width * PX, y * PX);
    const zone = (pts: Vec[], color: number) => {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x0 = Math.min(...xs) - 1.5;
      const y0 = Math.min(...ys) - 1.5;
      g.fillStyle(color, 0.35);
      g.fillRoundedRect(x0 * PX, y0 * PX, (Math.max(...xs) + 1.5 - x0) * PX, (Math.max(...ys) + 1.5 - y0) * PX, 10);
    };
    zone(map.heroSpawns, COLORS.heroZone);
    zone(map.enemySpawns, COLORS.enemyZone);
    this.drawStaticTerrain(g);
    for (const r of map.obstacles) {
      // 不擋視線的障礙（河水）用水色
      const cliff = r.style === 'cliff';
      const water = r.blocksSight === false && !cliff;
      g.fillStyle(cliff ? COLORS.cliff : water ? 0x1d3f5c : COLORS.obstacle, 1);
      g.fillRect(r.x * PX, r.y * PX, r.w * PX, r.h * PX);
      if (!water) {
        g.lineStyle(2, COLORS.obstacleEdge, 1);
        g.strokeRect(r.x * PX, r.y * PX, r.w * PX, r.h * PX);
      }
    }
    g.lineStyle(3, 0x15171b, 1);
    g.strokeRect(0, 0, map.width * PX, map.height * PX);
    // 靜態圖層烘成貼圖，避免每幀重新三角化
    bakeGraphics(this, g, 'map-floor', map.width * PX, map.height * PX, 0);
    this.add
      .text(map.width * PX - 8, 6, map.name, { fontFamily: FONT, fontSize: '14px', color: '#8a93a3' })
      .setOrigin(1, 0)
      .setDepth(1);
  }

  /** 不會變動的地形：高地、淺水、矮籬（草叢會燒掉，另外畫） */
  private drawStaticTerrain(g: Phaser.GameObjects.Graphics): void {
    const t = this.session.world.terrain;
    if (!t.any) return;
    const c = t.cell * PX;
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
    g.fillStyle(COLORS.terrainHigh, 0.22);
    runs(T_HIGH, (x, y, w) => g.fillRect(x, y, w, c));
    g.fillStyle(COLORS.terrainShallow, 0.45);
    runs(T_SHALLOW, (x, y, w) => g.fillRect(x, y, w, c));
    // 高地邊框：高地格與非高地格的交界
    g.lineStyle(2, COLORS.terrainHigh, 0.55);
    const isHigh = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < t.cols && cy < t.rows && (t.flags[cy * t.cols + cx] & T_HIGH) !== 0;
    for (let cy = 0; cy < t.rows; cy++) {
      for (let cx = 0; cx < t.cols; cx++) {
        if (!isHigh(cx, cy)) continue;
        if (!isHigh(cx - 1, cy)) g.lineBetween(cx * c, cy * c, cx * c, (cy + 1) * c);
        if (!isHigh(cx + 1, cy)) g.lineBetween((cx + 1) * c, cy * c, (cx + 1) * c, (cy + 1) * c);
        if (!isHigh(cx, cy - 1)) g.lineBetween(cx * c, cy * c, (cx + 1) * c, cy * c);
        if (!isHigh(cx, cy + 1)) g.lineBetween(cx * c, (cy + 1) * c, (cx + 1) * c, (cy + 1) * c);
      }
    }
    // 矮籬：棕色底＋橫紋
    g.fillStyle(COLORS.terrainHedge, 0.55);
    runs(T_HEDGE, (x, y, w) => g.fillRect(x, y, w, c));
    g.lineStyle(2, COLORS.terrainHedgeLine, 0.9);
    runs(T_HEDGE, (x, y, w) => g.lineBetween(x, y + c / 2, x + w, y + c / 2));
  }

  /** 草叢（燒掉時重畫）與火焰（每幀） */
  private drawDynamicTerrain(): void {
    const w = this.session.world;
    const t = w.terrain;
    if (!t.any) return;
    const c = t.cell * PX;
    if (t.version !== this.brushVersion) {
      this.brushVersion = t.version;
      const g = this.brushG;
      g.clear();
      g.fillStyle(COLORS.terrainBrush, 0.75);
      for (let i = 0; i < t.flags.length; i++) {
        if (!(t.flags[i] & T_BRUSH)) continue;
        const cx = i % t.cols;
        const cy = (i - cx) / t.cols;
        g.fillRect(cx * c, cy * c, c, c);
      }
      g.fillStyle(COLORS.terrainBrushDot, 0.8);
      for (let i = 0; i < t.flags.length; i++) {
        if (!(t.flags[i] & T_BRUSH)) continue;
        const cx = i % t.cols;
        const cy = (i - cx) / t.cols;
        g.fillCircle(cx * c + c * ((cx * 7 + cy * 3) % 5 + 1) / 6, cy * c + c * ((cx * 3 + cy * 5) % 5 + 1) / 6, 2);
      }
    }
    const fg = this.fireG;
    fg.clear();
    if (w.fire.size === 0) return;
    for (const [i] of w.fire) {
      const cx = i % t.cols;
      const cy = (i - cx) / t.cols;
      const flick = 0.5 + 0.5 * Math.sin(this.time.now / 60 + i * 1.7);
      fg.fillStyle(flick > 0.5 ? COLORS.fire : COLORS.fireHot, 0.55 + 0.35 * flick);
      fg.fillRect(cx * c, cy * c, c, c);
    }
  }

  private setupCamera(): void {
    const map = this.session.world.map;
    const cam = this.cameras.main;
    const pad = 3 * PX;
    cam.setBounds(-pad, -pad, map.width * PX + pad * 2, map.height * PX + pad * 2 + GAME_CONFIG.hudBottomHeight);
    const start = map.landmarks?.cameraStart ?? { x: map.width / 2, y: map.height / 2 };
    cam.centerOn(start.x * PX, start.y * PX + GAME_CONFIG.hudBottomHeight / 2);
  }

  centerOnUnit(id: number): void {
    const u = this.session.world.getUnit(id);
    if (!u) return;
    this.cameras.main.pan(u.pos.x * PX, u.pos.y * PX + GAME_CONFIG.hudBottomHeight / 2 / this.cameras.main.zoom, 250, 'Sine.easeInOut');
  }

  restartBattle(seed: number): void {
    this.scene.stop('Result');
    this.scene.restart(this.quickEncounter ? { seed, encounterId: this.quickEncounter.id, layer: this.quickEncounter.layer } : { seed });
  }

  unitAt(p: Vec): Unit | undefined {
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const u of this.session.world.units) {
      if (u.dead || this.hiddenIds.has(u.id)) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.y - p.y);
      if (d <= u.radius + 0.25 && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private screenPos(u: Unit): Vec {
    const v = this.views.get(u.id);
    return v ? { x: v.x, y: v.y } : { x: u.pos.x * PX, y: u.pos.y * PX };
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
    this.render();
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
          this.fx.text(t.pos, ev.crit ? `${ev.damage}!` : `${ev.damage}`, ev.crit ? '#ffd23f' : '#ffffff', ev.crit ? 24 : 16);
          s.addLog(
            `${L(src.id)} → ${L(t.id)}：${ev.damage}${ev.crit ? '（爆擊）' : ''}${ev.skillId ? `〔${skillName(ev.skillId)}〕` : ''}${ev.freeAttack ? '〔脫離攻擊〕' : ''}`,
            src.team,
          );
          if (ev.freeAttack) this.fx.text(t.pos, '脫離攻擊', '#ff9f43', 13, 50);
          if (t.team === 'hero' && !t.dead && s.autoPause.heroLowHp && t.hp / t.maxHp < s.autoPause.heroLowHpThreshold && !s.lowHpWarned.has(t.id)) {
            s.lowHpWarned.add(t.id);
            s.setPaused(true, `${L(t.id)}生命低於 ${Math.round(s.autoPause.heroLowHpThreshold * 100)}%`);
          }
          break;
        }
        case 'miss': {
          const t = w.getUnit(ev.targetId)!;
          this.fx.text(t.pos, 'Miss', '#9aa0a6', 14);
          s.addLog(`${L(ev.sourceId)} → ${L(t.id)}：未命中${ev.skillId ? `〔${skillName(ev.skillId)}〕` : ''}`, 'miss');
          break;
        }
        case 'heal': {
          const t = w.getUnit(ev.targetId)!;
          this.fx.text(t.pos, `+${ev.amount}`, '#5dff7a', 18);
          s.addLog(`${L(ev.sourceId)} 治療 ${L(t.id)} +${ev.amount}`, 'heal');
          if (t.hp / t.maxHp >= s.autoPause.heroLowHpThreshold) s.lowHpWarned.delete(t.id);
          break;
        }
        case 'interrupt': {
          const t = w.getUnit(ev.targetId)!;
          this.fx.interrupt(t.pos);
          const def = ev.skillId ? SKILLS[ev.skillId] : undefined;
          if (def?.telegraph && ev.point && def.effect.kind === 'aoe') this.fx.shatter(ev.point, def.effect.radius);
          s.addLog(`${L(ev.sourceId)} 打斷了 ${L(t.id)}${def ? `的「${def.name}」` : ''}！`, 'interrupt');
          break;
        }
        case 'death': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, '陣亡', '#c0c4cc', 16, 20, 1400);
          s.addLog(`${L(u.id)} 被 ${ev.killerId !== undefined ? L(ev.killerId) : '?'} 擊倒`, 'death');
          s.selection = s.selection.filter((id) => id !== u.id);
          if (u.team === 'hero' && s.autoPause.heroDeath && !w.result) s.setPaused(true, `${L(u.id)}陣亡`);
          break;
        }
        case 'pinned': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, '被牽制', '#ff9f43', 15);
          s.addLog(`${L(u.id)} 被 ${ev.byId >= 0 ? L(ev.byId) : '?'} 牽制`, 'pin');
          break;
        }
        case 'guardRedirect': {
          const g = w.getUnit(ev.guardId)!;
          this.fx.text(g.pos, '守護', '#7fb8ff', 14);
          s.addLog(`${L(g.id)} 替 ${L(ev.protectedId)} 擋下攻擊`, 'hero');
          break;
        }
        case 'status': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, ev.text, '#e0e6f0', 13, 26);
          break;
        }
        case 'notice': {
          const u = w.getUnit(ev.unitId)!;
          this.fx.text(u.pos, ev.text, '#9aa0a6', 12, 20);
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
          this.fx.text(u.pos, '戰吼！', '#ff6b6b', 26, 50, 1400);
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
    this.drawBars();
    this.drawProjectiles();
    this.ghostG.clear();
    if (s.paused && !w.result) this.drawGhostLines();
    this.drawTargeting();
    this.drawCoverHint();
    this.drawBoxSelect();
    this.debugOverlay.update(s, (id) => this.screenPos(w.getUnit(id)!));
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

  private drawZones(selected: Set<number>): void {
    const s = this.session;
    const w = s.world;
    const g = this.zoneG;
    g.clear();
    const zoc = (u: Unit) => {
      const p = this.screenPos(u);
      const r = (u.radius + w.config.zocRange) * PX;
      const c = u.team === 'hero' ? COLORS.zocHero : COLORS.zocEnemy;
      g.fillStyle(c, 0.1);
      g.fillCircle(p.x, p.y, r);
      g.lineStyle(1.5, c, 0.45);
      g.strokeCircle(p.x, p.y, r);
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
      g.fillStyle(0x5a6a22, 0.28 * fade);
      g.fillCircle(z.point.x * PX, z.point.y * PX, z.radius * PX);
      g.lineStyle(2, 0xa5b84a, 0.6 * fade);
      g.strokeCircle(z.point.x * PX, z.point.y * PX, z.radius * PX);
    }
    // 駐守點：小菱形；選取中的英雄另外畫出駐守範圍
    for (const u of w.units) {
      const gp = u.guardPoint;
      if (u.dead || u.team !== 'hero' || !gp) continue;
      const x = gp.x * PX;
      const y = gp.y * PX;
      g.lineStyle(1.5, u.def.color, 0.9);
      g.strokePoints([new Phaser.Math.Vector2(x, y - 5), new Phaser.Math.Vector2(x + 5, y), new Phaser.Math.Vector2(x, y + 5), new Phaser.Math.Vector2(x - 5, y)], true);
      if (selected.has(u.id)) {
        g.lineStyle(1, u.def.color, 0.35);
        g.strokeCircle(x, y, w.config.heroLeashRange * PX);
      }
    }
    // 準備中的地面範圍法術：敵方紅色預警圈、我方紫色
    for (const u of w.units) {
      const a = u.action;
      if (u.dead || !a || a.phase !== 'windup' || !a.point || !a.skillId || this.hiddenIds.has(u.id)) continue;
      const def = SKILLS[a.skillId];
      const pulse0 = 0.5 + 0.5 * Math.sin(this.time.now / 90);
      if (def.effect.kind === 'cone') {
        // 扇形預警（橫掃）
        const p = this.screenPos(u);
        const dir = Math.atan2(a.point.y - u.pos.y, a.point.x - u.pos.x);
        const half = (def.effect.angle / 2) * (Math.PI / 180);
        const R = def.effect.radius * PX;
        g.fillStyle(COLORS.telegraph, 0.14 + 0.1 * pulse0);
        g.slice(p.x, p.y, R, dir - half, dir + half, false);
        g.fillPath();
        g.fillStyle(COLORS.telegraph, 0.28);
        g.slice(p.x, p.y, R * u.actionProgress, dir - half, dir + half, false);
        g.fillPath();
        g.lineStyle(3, COLORS.telegraph, 0.9);
        g.slice(p.x, p.y, R, dir - half, dir + half, false);
        g.strokePath();
        continue;
      }
      if (def.effect.kind !== 'aoe') continue;
      const r = def.effect.radius * PX;
      const enemy = u.team === 'enemy';
      const c = enemy ? COLORS.telegraph : COLORS.ghostSkill;
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 90);
      g.fillStyle(c, enemy ? 0.12 + 0.1 * pulse : 0.12);
      g.fillCircle(a.point.x * PX, a.point.y * PX, r);
      g.fillStyle(c, 0.25);
      g.fillCircle(a.point.x * PX, a.point.y * PX, r * u.actionProgress);
      g.lineStyle(enemy ? 3 : 2, c, 0.9);
      g.strokeCircle(a.point.x * PX, a.point.y * PX, r);
    }
  }

  /** 自身類的預警技能（戰吼）：單位周圍的紅色脈衝環 */
  private drawSelfTelegraphs(): void {
    const g = this.zoneG;
    for (const u of this.session.world.units) {
      const a = u.action;
      if (u.dead || !a || a.phase !== 'windup' || !a.skillId || a.point || a.targetId !== undefined || this.hiddenIds.has(u.id)) continue;
      if (!SKILLS[a.skillId].telegraph) continue;
      const p = this.screenPos(u);
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 70);
      const r = (u.radius + 1.2 + pulse * 0.3) * PX;
      g.lineStyle(4, COLORS.telegraph, 0.6 + 0.4 * pulse);
      g.strokeCircle(p.x, p.y, r);
      g.lineStyle(6, 0xffd166, 0.9);
      g.beginPath();
      g.arc(p.x, p.y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u.actionProgress);
      g.strokePath();
    }
  }

  private drawBars(): void {
    const g = this.overG;
    g.clear();
    for (const u of this.session.world.units) {
      const st = this.statusTexts.get(u.id);
      if (u.dead || this.hiddenIds.has(u.id)) {
        st?.setVisible(false);
        continue;
      }
      const p = this.screenPos(u);
      const r = u.radius * PX;
      const w = 30;
      const x = p.x - w / 2;
      const y = p.y - r - 11;
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
      if (u.blessTime > 0) {
        g.lineStyle(1.5, 0xffe08a, 0.7);
        g.strokeCircle(p.x, p.y, r + 7);
      }
      if (u.guardTime > 0) {
        g.lineStyle(2, 0x7fb8ff, 0.8);
        g.strokeCircle(p.x, p.y, r + 9);
      }
      // 狀態文字：暈眩／定身
      const label = u.state === UnitState.Stunned ? '暈眩' : u.rooted ? '定身' : u.burnTime > 0 ? '燃燒' : u.curseTime > 0 ? '詛咒' : '';
      if (label) {
        let t = st;
        if (!t) {
          t = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffe066', fontStyle: 'bold' }).setOrigin(0.5).setDepth(21);
          t.setStroke('#000000', 3);
          this.statusTexts.set(u.id, t);
        }
        t.setText(label).setColor(STATUS_COLOR[label] ?? '#ffe066').setPosition(p.x, p.y + r + 9).setVisible(true);
      } else st?.setVisible(false);
    }
  }

  private drawProjectiles(): void {
    const g = this.overG;
    for (const pr of this.session.world.projectiles) {
      const st = PROJECTILE_STYLE[pr.kind] ?? PROJECTILE_STYLE.arrow;
      const x = (pr.prevPos.x + (pr.pos.x - pr.prevPos.x) * this.alpha) * PX;
      const y = (pr.prevPos.y + (pr.pos.y - pr.prevPos.y) * this.alpha) * PX;
      const dx = pr.pos.x - pr.prevPos.x;
      const dy = pr.pos.y - pr.prevPos.y;
      const l = Math.hypot(dx, dy) || 1;
      g.lineStyle(st.size * 0.8, st.color, 0.45);
      g.lineBetween(x, y, x - (dx / l) * st.size * 3, y - (dy / l) * st.size * 3);
      g.fillStyle(st.color, 1);
      g.fillCircle(x, y, st.size);
    }
  }

  /** 暫停時的幽靈線：每名英雄「下一步要做的事」 */
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
      const from = this.screenPos(u);
      const targetPos = (id: number): Vec | null => {
        const t = w.getUnit(id);
        return t && !t.dead ? this.screenPos(t) : null;
      };
      switch (o.type) {
        case 'move':
          g.lineStyle(2, COLORS.ghostMove, 0.85);
          g.lineBetween(from.x, from.y, o.point.x * PX, o.point.y * PX);
          g.strokeCircle(o.point.x * PX, o.point.y * PX, 6);
          break;
        case 'attack': {
          const tp = targetPos(o.targetId);
          if (!tp) break;
          g.lineStyle(2, COLORS.ghostAttack, 0.85);
          g.lineBetween(from.x, from.y, tp.x, tp.y);
          break;
        }
        case 'follow': {
          const tp = targetPos(o.targetId);
          if (!tp) break;
          g.lineStyle(2, COLORS.ghostFollow, 0.7);
          g.lineBetween(from.x, from.y, tp.x, tp.y);
          break;
        }
        case 'skill': {
          const def = SKILLS[o.skillId];
          let tp: Vec | null = null;
          if (o.point) tp = { x: o.point.x * PX, y: o.point.y * PX };
          else if (o.targetId !== undefined) tp = targetPos(o.targetId);
          g.lineStyle(2.5, COLORS.ghostSkill, 0.9);
          if (tp) {
            g.lineBetween(from.x, from.y, tp.x, tp.y);
            const r = (effectRadius(def) ?? 10 / PX) * PX;
            g.strokeCircle(tp.x, tp.y, r);
          } else {
            const r = (effectRadius(def) ?? 14 / PX) * PX;
            g.strokeCircle(from.x, from.y, r);
          }
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
    const from = this.screenPos(caster);
    const ptr = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const rangeR = (def.target === 'ground' ? def.range : def.range + caster.radius) * PX;
    if (def.range > 0) {
      g.lineStyle(1.5, COLORS.targeting, 0.55);
      g.strokeCircle(from.x, from.y, rangeR);
    }
    g.lineStyle(1.5, COLORS.targeting, 0.6);
    g.lineBetween(from.x, from.y, ptr.x, ptr.y);
    if (def.target === 'ground') {
      const r = (effectRadius(def) ?? 0.4) * PX;
      g.fillStyle(COLORS.targeting, 0.18);
      g.fillCircle(ptr.x, ptr.y, r);
      g.lineStyle(2, COLORS.targeting, 0.9);
      g.strokeCircle(ptr.x, ptr.y, r);
    } else {
      const hu = s.hoverUnitId !== null ? s.world.getUnit(s.hoverUnitId) : undefined;
      if (hu && validSkillTarget(def, caster, hu)) {
        const p = this.screenPos(hu);
        g.lineStyle(3, COLORS.targeting, 1);
        g.strokeCircle(p.x, p.y, hu.radius * PX + 7);
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
    const p = this.screenPos(target);
    this.coverText.setPosition(p.x, p.y - target.radius * PX - 22).setVisible(true);
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

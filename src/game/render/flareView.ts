import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import { SKILLS } from '../../sim/data/skills';
import type { Unit } from '../../sim/unit';
import type { FlareAnimMeta } from './art';
import { FLARE, flareDir, flareKey } from './art';
import { COLORS } from './palette';
import { depthOf, groundCirclePoints, worldToScreen } from './projection';
import type { Concealment, UnitVisual } from './unitView';
import { DEAD_DEPTH, OBJECT_DEPTH_BASE } from './unitView';
import { VISUAL, unitHeight } from './visual';

const ISO = GAME_CONFIG.iso;

interface Layer {
  sprite: Phaser.GameObjects.Sprite;
  /** 影格名稱前綴（圖層名或敵人圖集名） */
  prefix: string;
  anims: Record<string, FlareAnimMeta>;
}

/** 出手影格＝倒數第幾格（之後可以逐動作調整） */
const RELEASE_FROM_END = 2;

/** 動作缺少時的替代 */
const FALLBACK: Record<string, string[]> = {
  critdie: ['die'],
  die: ['hit', 'stance'],
  shoot: ['cast', 'swing', 'stance'],
  cast: ['swing', 'stance'],
  swing: ['stance'],
  block: ['stance'],
  hit: ['stance'],
  run: ['stance'],
};

/**
 * Flare 等角素材的角色外觀（美術試裝）。
 * - 主角是紙娃娃：一個 Container 疊多個 Sprite（腳 → 腿 → 身 → 手 → 頭 → 頭盔 → 武器 → 盾），每幀同步影格
 * - 錨點（pivot）對齊角色腳下
 * - 準備（windup）期間依進度播放出手動作，出手影格（倒數第二格）落在 sim 生效那一刻
 */
export class FlareView implements UnitVisual {
  readonly container: Phaser.GameObjects.Container;
  private ring: Phaser.GameObjects.Graphics;
  private layers: Layer[] = [];
  private concealment: Concealment = 'normal';
  readonly height: number;
  private readonly bodyW: number;
  private readonly bodyH: number;
  private dir = 2;
  private deathAt = -1;
  private hitStart = -1;
  private hitUntil = -1;
  x = 0;
  y = 0;
  wx = 0;
  wy = 0;

  constructor(scene: Phaser.Scene, readonly unit: Unit) {
    const def = unit.def;
    this.height = unitHeight(def);
    this.ring = scene.add.graphics();
    const children: Phaser.GameObjects.GameObject[] = [this.ring];
    const hero = FLARE.heroes[def.id];
    let baseHeight = this.height;
    if (hero) {
      baseHeight = FLARE.heroSets[hero.set].heightM;
      for (const l of hero.layers) this.addLayer(scene, `${hero.set}_${l}`, l, children);
    } else {
      const sheet = FLARE.enemies[def.id] ?? 'skeleton';
      baseHeight = FLARE.enemySheets[sheet].heightM;
      this.addLayer(scene, `enemy_${sheet}`, sheet, children);
    }
    // 精英隊長等：依身高放大
    const s = this.height / baseHeight;
    for (const l of this.layers) l.sprite.setScale(s);
    this.bodyW = unit.radius * ISO.tileW * 1.1;
    this.bodyH = this.height * ISO.heightPxPerM;
    this.container = scene.add.container(0, 0, children);
    this.container.setDepth(OBJECT_DEPTH_BASE);
    this.dir = flareDir(unit.facing);
  }

  private addLayer(scene: Phaser.Scene, sheet: string, prefix: string, children: Phaser.GameObjects.GameObject[]): void {
    const key = flareKey(sheet);
    const tex = scene.textures.get(key);
    const anims = ((tex.customData as { anims?: Record<string, FlareAnimMeta> }).anims ?? {}) as Record<string, FlareAnimMeta>;
    const sprite = scene.add.sprite(0, 0, key, `${prefix}/stance/0/2`);
    this.layers.push({ sprite, prefix, anims });
    children.push(sprite);
  }

  /** 被打中：播放受擊動作（沒有在做其他動作時） */
  onHit(simTime: number): void {
    const l = this.layers[0];
    const d = l?.anims.hit?.duration ?? 133;
    this.hitStart = simTime;
    this.hitUntil = simTime + d / 1000;
  }

  private animFor(simTime: number): { anim: string; frame: (n: number, meta: FlareAnimMeta) => number } {
    const u = this.unit;
    const loop = (n: number, meta: FlareAnimMeta) => {
      const dur = Math.max(1, meta.duration) / 1000;
      const t = (simTime % dur) / dur;
      if (meta.type === 'back_forth' && n > 2) {
        const seq = 2 * n - 2;
        const k = Math.floor(t * seq) % seq;
        return k < n ? k : seq - k;
      }
      return Math.floor(t * n) % n;
    };
    const once = (start: number) => (n: number, meta: FlareAnimMeta) => Math.min(n - 1, Math.floor(((simTime - start) / Math.max(0.001, meta.duration / 1000)) * n));
    if (u.dead) {
      if (this.deathAt < 0) this.deathAt = simTime;
      return { anim: 'die', frame: once(this.deathAt) };
    }
    this.deathAt = -1;
    const a = u.action;
    if (a) {
      if (a.phase === 'dash') return { anim: 'run', frame: loop };
      const anim = this.actionAnim();
      // 出手影格（倒數第二格，RELEASE_FROM_END）剛好在效果生效的那一刻出現：
      // 準備期間依進度播放出手前的影格，生效時（進入恢復）切到出手影格，之後停在最後一格，再回到待機
      const rel = (n: number) => Math.max(0, n - RELEASE_FROM_END);
      if (a.phase === 'windup') {
        const p = u.actionProgress;
        return { anim, frame: (n) => (rel(n) === 0 ? 0 : Math.min(rel(n) - 1, Math.floor(p * rel(n)))) };
      }
      const rp = u.actionProgress;
      if (rp < 0.25) return { anim, frame: rel };
      if (rp < 0.6) return { anim, frame: (n) => n - 1 };
      return { anim: 'stance', frame: loop };
    }
    // 暈眩：停在受擊最後一格；剛被打中：播一次受擊
    if (u.stunTime > 0) return { anim: 'hit', frame: (n) => n - 1 };
    if (simTime < this.hitUntil) return { anim: 'hit', frame: once(this.hitStart) };
    if (u.movedThisTick) return { anim: 'run', frame: loop };
    return { anim: 'stance', frame: loop };
  }

  /** 動作對應：近戰 → swing、遠程 → shoot、法術 → cast、守護 → block */
  private actionAnim(): string {
    const a = this.unit.action!;
    if (a.kind === 'attack') {
      if (this.unit.isMelee) return 'swing';
      return this.unit.def.attackDamageType === 'spell' ? 'cast' : 'shoot';
    }
    const def = a.skillId ? SKILLS[a.skillId] : undefined;
    const e = def?.effect;
    if (!e) return 'swing';
    switch (e.kind) {
      case 'strike':
        return e.melee ? 'swing' : e.damageType === 'spell' ? 'cast' : 'shoot';
      case 'whirlwind':
      case 'cone':
      case 'charge':
        return 'swing';
      case 'guard':
        return 'block';
      case 'tumble':
        return 'run';
      default:
        return 'cast';
    }
  }

  private resolveAnim(layer: Layer, anim: string): string {
    if (layer.anims[anim]) return anim;
    for (const f of FALLBACK[anim] ?? []) if (layer.anims[f]) return f;
    return 'stance';
  }

  update(alpha: number, selected: boolean, hovered: boolean, simTime = 0): void {
    const u = this.unit;
    this.wx = u.prevPos.x + (u.pos.x - u.prevPos.x) * alpha;
    this.wy = u.prevPos.y + (u.pos.y - u.prevPos.y) * alpha;
    const p = worldToScreen(this.wx, this.wy);
    this.x = p.x;
    this.y = p.y;
    this.container.setPosition(this.x, this.y);
    this.container.setDepth(u.dead ? DEAD_DEPTH : OBJECT_DEPTH_BASE + depthOf(this.wx, this.wy));
    if (!u.dead) this.dir = flareDir(u.facing);
    const { anim, frame } = this.animFor(simTime);
    for (const l of this.layers) {
      const a = this.resolveAnim(l, anim);
      const meta = l.anims[a];
      const n = Math.max(1, meta?.frames ?? 1);
      const i = Math.max(0, Math.min(n - 1, meta ? frame(n, meta) : 0));
      const tex = l.sprite.texture;
      let name = `${l.prefix}/${a}/${i}/${this.dir}`;
      if (!tex.has(name)) name = `${l.prefix}/${a}/0/${this.dir}`;
      if (!tex.has(name)) name = `${l.prefix}/stance/0/${this.dir}`;
      if (tex.has(name) && l.sprite.frame.name !== name) l.sprite.setFrame(name);
    }
    // 腳下：選取／滑過時的橢圓；平時一個淡淡的影子
    this.ring.clear();
    const o = worldToScreen(0, 0);
    const pts = groundCirclePoints(0, 0, u.radius + (selected || hovered ? 0.15 : 0), 0, Math.PI * 2, 28).map((q) => new Phaser.Math.Vector2(q.x - o.x, q.y - o.y));
    if (!u.dead) {
      this.ring.fillStyle(0x000000, 0.28);
      this.ring.fillPoints(pts, true);
      if (selected || hovered) {
        this.ring.lineStyle(selected ? 2.5 : 1.5, selected ? COLORS.selection : u.def.color, selected ? 1 : 0.7);
        this.ring.strokePoints(pts, true);
      } else {
        this.ring.lineStyle(1.5, u.def.color, 0.55);
        this.ring.strokePoints(pts, true);
      }
    }
  }

  head(): { x: number; y: number } {
    const p = worldToScreen(this.wx, this.wy, this.height + VISUAL.headClearance);
    return { x: p.x, y: p.y };
  }

  bodyBounds(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - this.bodyW / 2, y: this.y - this.bodyH, w: this.bodyW, h: this.bodyH };
  }

  hitTest(px: number, py: number): boolean {
    if (!this.container.visible) return false;
    const b = this.bodyBounds();
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return true;
    const rr = this.unit.radius + 0.2;
    const ax = (rr * ISO.tileW) / Math.SQRT2;
    const ay = (rr * ISO.tileH) / Math.SQRT2;
    const dx = (px - this.x) / ax;
    const dy = (py - this.y) / ay;
    return dx * dx + dy * dy <= 1;
  }

  drawOutline(g: Phaser.GameObjects.Graphics): void {
    const b = this.bodyBounds();
    g.fillStyle(this.unit.def.color, VISUAL.occludedAlpha);
    g.fillRoundedRect(b.x, b.y, b.w, b.h, 6);
    g.lineStyle(2, 0xffffff, VISUAL.occludedAlpha + 0.25);
    g.strokeRoundedRect(b.x, b.y, b.w, b.h, 6);
  }

  setConcealment(c: Concealment): void {
    if (c === this.concealment) return;
    this.concealment = c;
    this.container.setVisible(c !== 'hidden');
    this.container.setAlpha(c === 'concealed' ? 0.5 : 1);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  destroy(): void {
    this.container.destroy();
  }
}

import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config';
import { slotPositions } from '../../sim/nav/slots';
import type { World } from '../../sim/world';
import type { BattleSession } from '../session';
import { bakeGraphics } from './bake';

const PX = GAME_CONFIG.pxPerMeter;

/** 除錯面板的繪圖（SPEC §12.1）：導航格子、路徑、控制區、視線、攻擊站位 */
export class DebugOverlay {
  private gridG: Phaser.GameObjects.Image;
  private dyn: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private world: World) {
    this.gridG = this.drawNavGrid(scene).setVisible(false);
    this.dyn = scene.add.graphics().setDepth(30);
  }

  private drawNavGrid(scene: Phaser.Scene): Phaser.GameObjects.Image {
    const g = scene.add.graphics();
    const grid = this.world.navGrid(0.4);
    const c = grid.cell * PX;
    g.lineStyle(1, 0xffffff, 0.06);
    for (let x = 0; x <= grid.cols; x++) g.lineBetween(x * c, 0, x * c, grid.rows * c);
    for (let y = 0; y <= grid.rows; y++) g.lineBetween(0, y * c, grid.cols * c, y * c);
    g.fillStyle(0xff3355, 0.22);
    for (let cy = 0; cy < grid.rows; cy++) {
      for (let cx = 0; cx < grid.cols; cx++) if (grid.isBlockedCell(cx, cy)) g.fillRect(cx * c, cy * c, c, c);
    }
    return bakeGraphics(scene, g, 'debug-navgrid', grid.cols * c, grid.rows * c, 2);
  }

  update(session: BattleSession, posOf: (id: number) => { x: number; y: number }): void {
    const d = session.debug;
    const w = this.world;
    this.gridG.setVisible(d.navGrid);
    const g = this.dyn;
    g.clear();

    if (d.paths) {
      for (const u of w.units) {
        if (u.dead || !u.path || u.pathIndex >= u.path.length) continue;
        const p0 = posOf(u.id);
        g.lineStyle(2, 0x00e5ff, 0.8);
        g.beginPath();
        g.moveTo(p0.x, p0.y);
        for (let i = u.pathIndex; i < u.path.length; i++) g.lineTo(u.path[i].x * PX, u.path[i].y * PX);
        g.strokePath();
        for (let i = u.pathIndex; i < u.path.length; i++) {
          g.fillStyle(0x00e5ff, 0.9);
          g.fillCircle(u.path[i].x * PX, u.path[i].y * PX, 3);
        }
      }
    }

    if (d.allZoc) {
      for (const u of w.units) {
        if (u.dead || !u.def.projectsZoc) continue;
        const p = posOf(u.id);
        const r = (u.radius + w.config.zocRange) * PX;
        g.lineStyle(1.5, u.team === 'hero' ? 0x5fa8ff : 0xff6b6b, 0.8);
        g.strokeCircle(p.x, p.y, r);
      }
    }

    if (d.los) {
      const pairs: [number, number][] = [];
      for (const u of w.units) {
        if (u.dead || !u.order) continue;
        const t = (u.order as { targetId?: number }).targetId;
        if (t !== undefined) pairs.push([u.id, t]);
      }
      if (session.hoverUnitId !== null) for (const s of session.selection) pairs.push([s, session.hoverUnitId]);
      for (const [a, b] of pairs) {
        const ua = w.getUnit(a);
        const ub = w.getUnit(b);
        if (!ua || !ub || ua.dead || ub.dead || ua === ub) continue;
        const ok = w.canSee(ua, ub);
        const pa = posOf(a);
        const pb = posOf(b);
        g.lineStyle(1.5, ok ? 0x6dff8a : 0xff4040, 0.85);
        g.lineBetween(pa.x, pa.y, pb.x, pb.y);
      }
    }

    if (d.slots) {
      for (const { targetId, slots } of w.slots.entries()) {
        const t = w.getUnit(targetId);
        if (!t || t.dead) continue;
        const pos = slotPositions(t.pos, t.radius, 0.4);
        pos.forEach((p, i) => {
          const claimed = slots[i] !== -1;
          g.lineStyle(1, 0xffd166, 0.9);
          if (claimed) g.fillStyle(0xffd166, 0.7).fillCircle(p.x * PX, p.y * PX, 4);
          else g.strokeCircle(p.x * PX, p.y * PX, 4);
        });
      }
    }
  }
}

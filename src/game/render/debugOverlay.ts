import Phaser from 'phaser';
import { slotPositions } from '../../sim/nav/slots';
import type { World } from '../../sim/world';
import type { BattleSession } from '../session';
import { bakeGraphics } from './bake';
import { groundCircle, groundLine, groundRect, mapScreenBounds, worldToScreen } from './projection';

/** 除錯面板的繪圖（SPEC §12.1）：導航格子、路徑、控制區、視線、攻擊站位（全部畫在地面平面上） */
export class DebugOverlay {
  private gridG: Phaser.GameObjects.Image;
  private dyn: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private world: World) {
    this.gridG = this.drawNavGrid(scene).setVisible(false);
    this.dyn = scene.add.graphics().setDepth(1500);
  }

  private drawNavGrid(scene: Phaser.Scene): Phaser.GameObjects.Image {
    const g = scene.add.graphics();
    const grid = this.world.navGrid(0.4);
    const c = grid.cell;
    const b = mapScreenBounds(grid.cols * c, grid.rows * c);
    g.translateCanvas(-b.x, -b.y);
    for (let x = 0; x <= grid.cols; x++) groundLine(g, { x: x * c, y: 0 }, { x: x * c, y: grid.rows * c }, 1, 0xffffff, 0.06);
    for (let y = 0; y <= grid.rows; y++) groundLine(g, { x: 0, y: y * c }, { x: grid.cols * c, y: y * c }, 1, 0xffffff, 0.06);
    for (let cy = 0; cy < grid.rows; cy++) {
      for (let cx = 0; cx < grid.cols; cx++) if (grid.isBlockedCell(cx, cy)) groundRect(g, cx * c, cy * c, c, c, { fill: 0xff3355, fillAlpha: 0.22 });
    }
    return bakeGraphics(scene, g, 'debug-navgrid', b.w + 2, b.h + 2, 4, b.x, b.y);
  }

  destroy(): void {
    this.gridG.destroy();
    this.dyn.destroy();
  }

  /** posOf：單位腳下的世界座標（插值後） */
  update(session: BattleSession, posOf: (id: number) => { x: number; y: number }): void {
    const d = session.debug;
    const w = this.world;
    this.gridG.setVisible(d.navGrid);
    const g = this.dyn;
    g.clear();

    if (d.paths) {
      for (const u of w.units) {
        if (u.dead || !u.path || u.pathIndex >= u.path.length) continue;
        let prev = posOf(u.id);
        for (let i = u.pathIndex; i < u.path.length; i++) {
          groundLine(g, prev, u.path[i], 2, 0x00e5ff, 0.8);
          prev = u.path[i];
        }
        for (let i = u.pathIndex; i < u.path.length; i++) {
          const p = worldToScreen(u.path[i].x, u.path[i].y);
          g.fillStyle(0x00e5ff, 0.9);
          g.fillCircle(p.x, p.y, 3);
        }
      }
    }

    if (d.allZoc) {
      for (const u of w.units) {
        if (u.dead || !u.def.projectsZoc) continue;
        const p = posOf(u.id);
        groundCircle(g, p.x, p.y, u.radius + w.config.zocRange, { stroke: u.team === 'hero' ? 0x5fa8ff : 0xff6b6b, strokeAlpha: 0.8, width: 1.5 });
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
        groundLine(g, posOf(a), posOf(b), 1.5, w.canSee(ua, ub) ? 0x6dff8a : 0xff4040, 0.85);
      }
    }

    if (d.slots) {
      for (const { targetId, slots } of w.slots.entries()) {
        const t = w.getUnit(targetId);
        if (!t || t.dead) continue;
        const pos = slotPositions(t.pos, t.radius, 0.4);
        pos.forEach((p, i) => {
          const claimed = slots[i] !== -1;
          groundCircle(g, p.x, p.y, 0.12, claimed ? { fill: 0xffd166, fillAlpha: 0.7 } : { stroke: 0xffd166, strokeAlpha: 0.9, width: 1 });
        });
      }
    }
  }
}

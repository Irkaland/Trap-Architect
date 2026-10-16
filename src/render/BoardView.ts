import Phaser from 'phaser';
import { derive } from '../core/sim';
import { DELTA, GRID, type Beam, type Board, type Dir, type GameState, type Group, type Level, type Tile, xOf, yOf } from '../core/types';
import { C } from './palette';

/*
 * Phaser renders only the board. All menus, HUD and controls are HTML so
 * they stay accessible. The view never decides rules: it draws whatever
 * GameState / Board the simulation hands it.
 */

const T = 120; // tile size in canvas pixels
const M = 8; // outer margin
const SIZE = GRID * T + M * 2;
const MOVE_MS = 110;

const cx = (i: number) => M + xOf(i) * T + T / 2;
const cy = (i: number) => M + yOf(i) * T + T / 2;

export interface BoardInput {
  onTap?(cell: number): void;
  onDrag?(cell: number): void;
  onSwipe?(dir: Dir): void;
}

type Pending =
  | { kind: 'play'; level: Level; state: GameState }
  | { kind: 'edit'; board: Board; cursor: number; showCursor: boolean };

class BoardScene extends Phaser.Scene {
  view!: BoardView;
  gBase!: Phaser.GameObjects.Graphics;
  gLaser!: Phaser.GameObjects.Graphics;
  gTop!: Phaser.GameObjects.Graphics;
  player!: Phaser.GameObjects.Container;
  playerBody!: Phaser.GameObjects.Graphics;
  crates: Phaser.GameObjects.Container[] = [];
  pulse?: Phaser.Tweens.Tween;
  private down: { x: number; y: number; cell: number } | null = null;
  private lastDragCell = -1;

  constructor() {
    super('board');
  }

  create(): void {
    this.gBase = this.add.graphics();
    this.gLaser = this.add.graphics();
    this.playerBody = this.add.graphics();
    this.player = this.add.container(0, 0, [this.playerBody]);
    this.player.setDepth(5);
    this.gTop = this.add.graphics().setDepth(10);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.pointerDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.pointerMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.pointerUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.pointerUp(p));
    this.view.sceneReady(this);
  }

  private cellAt(x: number, y: number): number {
    const gx = Math.floor((x - M) / T);
    const gy = Math.floor((y - M) / T);
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return -1;
    return gy * GRID + gx;
  }

  private pointerDown(p: Phaser.Input.Pointer): void {
    const cell = this.cellAt(p.x, p.y);
    this.down = { x: p.x, y: p.y, cell };
    this.lastDragCell = cell;
    if (cell >= 0) this.view.input.onTap?.(cell);
  }

  private pointerMove(p: Phaser.Input.Pointer): void {
    if (!this.down || !p.isDown) return;
    const cell = this.cellAt(p.x, p.y);
    if (cell < 0 || cell === this.lastDragCell) return;
    // Walk cell by cell from the previous cell so fast drags don't skip gaps.
    const from = this.lastDragCell;
    if (from < 0) {
      this.lastDragCell = cell;
      this.view.input.onDrag?.(cell);
      return;
    }
    let x = xOf(from);
    let y = yOf(from);
    const tx = xOf(cell);
    const ty = yOf(cell);
    while (x !== tx || y !== ty) {
      const dx = tx - x;
      const dy = ty - y;
      if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx);
      else y += Math.sign(dy);
      this.lastDragCell = y * GRID + x;
      this.view.input.onDrag?.(this.lastDragCell);
    }
  }

  private pointerUp(p: Phaser.Input.Pointer): void {
    if (!this.down) return;
    const dx = p.x - this.down.x;
    const dy = p.y - this.down.y;
    this.down = null;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist < T * 0.35) return;
    const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U';
    this.view.input.onSwipe?.(dir);
  }

  /* ---------------- drawing primitives ---------------- */

  drawBoardFrame(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x000000, 0.1);
    g.fillRoundedRect(2, 8, SIZE - 4, SIZE - 6, 22);
    g.fillStyle(C.ink, 1);
    g.fillRoundedRect(0, 0, SIZE, SIZE - 4, 22);
  }

  drawFloor(g: Phaser.GameObjects.Graphics, i: number): void {
    const x = M + xOf(i) * T;
    const y = M + yOf(i) * T;
    g.fillStyle(C.floorShade, 1);
    g.fillRoundedRect(x + 3, y + 3, T - 6, T - 6, 10);
    g.fillStyle(C.floor, 1);
    g.fillRoundedRect(x + 3, y + 3, T - 6, T - 10, 10);
  }

  drawWall(g: Phaser.GameObjects.Graphics, i: number): void {
    const x = M + xOf(i) * T;
    const y = M + yOf(i) * T;
    g.fillStyle(C.wallSide, 1);
    g.fillRoundedRect(x + 3, y + 3, T - 6, T - 6, 10);
    g.fillStyle(C.wallTop, 1);
    g.fillRoundedRect(x + 3, y + 3, T - 6, T - 20, 10);
    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(x + 10, y + 9, T - 20, 10, 5);
  }

  drawSymbol(g: Phaser.GameObjects.Graphics, group: Group, x: number, y: number, r: number, color: number, hollow = false): void {
    if (hollow) g.lineStyle(Math.max(4, r * 0.28), color, 1);
    else g.fillStyle(color, 1);
    if (group === 0) {
      if (hollow) g.strokeCircle(x, y, r);
      else g.fillCircle(x, y, r);
    } else if (group === 1) {
      const h = r * 1.15;
      const pts = [x, y - h, x + h, y + h * 0.75, x - h, y + h * 0.75] as const;
      if (hollow) g.strokeTriangle(...pts);
      else g.fillTriangle(...pts);
    } else {
      const s = r * 0.9;
      if (hollow) g.strokeRect(x - s, y - s, s * 2, s * 2);
      else g.fillRect(x - s, y - s, s * 2, s * 2);
    }
  }

  drawPlate(g: Phaser.GameObjects.Graphics, i: number, group: Group, pressed: boolean): void {
    this.drawFloor(g, i);
    const x = cx(i);
    const y = cy(i) - 2;
    const s = T * 0.62;
    if (!pressed) {
      g.fillStyle(C.groupDark[group], 0.55);
      g.fillRoundedRect(x - s / 2, y - s / 2 + 7, s, s, 12);
      g.fillStyle(C.groupLight[group], 1);
      g.fillRoundedRect(x - s / 2, y - s / 2, s, s, 12);
      g.lineStyle(4, C.group[group], 1);
      g.strokeRoundedRect(x - s / 2, y - s / 2, s, s, 12);
      this.drawSymbol(g, group, x, y, T * 0.12, C.group[group]);
    } else {
      const p = s * 0.94;
      g.fillStyle(C.group[group], 1);
      g.fillRoundedRect(x - p / 2, y - p / 2 + 5, p, p, 12);
      g.lineStyle(4, C.groupDark[group], 1);
      g.strokeRoundedRect(x - p / 2, y - p / 2 + 5, p, p, 12);
      this.drawSymbol(g, group, x, y + 5, T * 0.12, C.white);
    }
  }

  drawDoor(g: Phaser.GameObjects.Graphics, i: number, group: Group, open: boolean): void {
    const x = M + xOf(i) * T;
    const y = M + yOf(i) * T;
    if (open) {
      this.drawFloor(g, i);
      // Open: hollow dashed frame + hollow symbol.
      g.lineStyle(5, C.group[group], 1);
      const inset = 14;
      const len = T - inset * 2;
      for (let k = 0; k < 4; k++) {
        const a = inset + (len / 4) * k + 4;
        const b = a + len / 4 - 10;
        g.lineBetween(x + a, y + inset, x + b, y + inset);
        g.lineBetween(x + a, y + T - inset - 4, x + b, y + T - inset - 4);
        g.lineBetween(x + inset, y + a, x + inset, y + b);
        g.lineBetween(x + T - inset, y + a, x + T - inset, y + b);
      }
      this.drawSymbol(g, group, cx(i), cy(i) - 2, T * 0.1, C.group[group], true);
    } else {
      g.fillStyle(C.groupDark[group], 1);
      g.fillRoundedRect(x + 3, y + 3, T - 6, T - 6, 10);
      g.fillStyle(C.group[group], 1);
      g.fillRoundedRect(x + 3, y + 3, T - 6, T - 18, 10);
      // Bars read as "closed" without relying on colour.
      g.lineStyle(5, C.groupDark[group], 0.8);
      for (const f of [0.25, 0.75]) g.lineBetween(x + T * f, y + 14, x + T * f, y + T - 26);
      g.fillStyle(C.white, 1);
      g.fillCircle(cx(i), cy(i) - 6, T * 0.2);
      this.drawSymbol(g, group, cx(i), cy(i) - 6, T * 0.1, C.group[group]);
    }
  }

  drawExit(g: Phaser.GameObjects.Graphics, i: number): void {
    this.drawFloor(g, i);
    const x = cx(i);
    const y = cy(i) - 2;
    const s = T * 0.7;
    g.fillStyle(C.exit, 1);
    g.fillRoundedRect(x - s / 2, y - s / 2, s, s, 14);
    g.fillStyle(C.exitStep, 1);
    // Stairs going down.
    for (let k = 0; k < 3; k++) {
      const w = s * (0.7 - k * 0.18);
      g.fillRoundedRect(x - w / 2, y - s * 0.3 + k * s * 0.22, w, s * 0.11, 4);
    }
  }

  drawEmitter(g: Phaser.GameObjects.Graphics, i: number, dir: Dir): void {
    const x = M + xOf(i) * T;
    const y = M + yOf(i) * T;
    g.fillStyle(0x24201d, 1);
    g.fillRoundedRect(x + 3, y + 3, T - 6, T - 6, 12);
    g.fillStyle(C.emitter, 1);
    g.fillRoundedRect(x + 3, y + 3, T - 6, T - 16, 12);
    const [dx, dy] = DELTA[dir];
    const ox = cx(i);
    const oy = cy(i) - 4;
    // Nozzle triangle pointing the firing direction.
    const tip = T * 0.44;
    const base = T * 0.12;
    const wide = T * 0.2;
    const px = -dy;
    const py = dx;
    g.fillStyle(C.laser, 1);
    g.fillTriangle(
      ox + dx * tip, oy + dy * tip,
      ox + dx * base + px * wide, oy + dy * base + py * wide,
      ox + dx * base - px * wide, oy + dy * base - py * wide,
    );
    g.fillStyle(C.laserCore, 1);
    g.fillCircle(ox, oy, T * 0.12);
    g.lineStyle(5, C.laser, 1);
    g.strokeCircle(ox, oy, T * 0.12);
  }

  drawTile(g: Phaser.GameObjects.Graphics, i: number, tile: Tile, pressed: boolean, open: boolean): void {
    switch (tile.kind) {
      case 'floor': this.drawFloor(g, i); break;
      case 'wall': this.drawWall(g, i); break;
      case 'exit': this.drawExit(g, i); break;
      case 'plate': this.drawPlate(g, i, tile.group, pressed); break;
      case 'door': this.drawDoor(g, i, tile.group, open); break;
      case 'emitter': this.drawEmitter(g, i, tile.dir); break;
    }
  }

  drawBeams(g: Phaser.GameObjects.Graphics, beams: Beam[]): void {
    g.clear();
    for (const b of beams) {
      if (!b.cells.length) continue;
      const [dx, dy] = DELTA[b.dir];
      const sx = cx(b.emitter) + dx * T * 0.44;
      const sy = cy(b.emitter) - 4 + dy * T * 0.44;
      const last = b.cells[b.cells.length - 1];
      const ex = cx(last) + dx * T * 0.5;
      const ey = cy(last) - 4 + dy * T * 0.5;
      g.lineStyle(T * 0.3, C.laserGlow, 0.28);
      g.lineBetween(sx, sy, ex, ey);
      g.lineStyle(T * 0.12, C.laser, 1);
      g.lineBetween(sx, sy, ex, ey);
      g.lineStyle(T * 0.04, C.laserCore, 1);
      g.lineBetween(sx, sy, ex, ey);
      // Chevrons along the ray: a shape cue, not just colour.
      const px = -dy;
      const py = dx;
      for (const c of b.cells) {
        const mx = cx(c);
        const my = cy(c) - 4;
        for (const off of [-0.2, 0.2]) {
          const ax = mx + dx * T * off;
          const ay = my + dy * T * off;
          g.lineStyle(6, C.laserMark, 0.9);
          g.beginPath();
          g.moveTo(ax - dx * 12 + px * 16, ay - dy * 12 + py * 16);
          g.lineTo(ax + dx * 4, ay + dy * 4);
          g.lineTo(ax - dx * 12 - px * 16, ay - dy * 12 - py * 16);
          g.strokePath();
        }
      }
      if (b.stop >= 0) {
        g.fillStyle(C.laserCore, 1);
        g.fillCircle(ex, ey, T * 0.07);
        g.lineStyle(4, C.laser, 1);
        g.strokeCircle(ex, ey, T * 0.1);
      }
    }
  }

  drawCrateShape(g: Phaser.GameObjects.Graphics, ox: number, oy: number): void {
    const s = T * 0.76;
    g.fillStyle(0x000000, 0.14);
    g.fillRoundedRect(ox - s / 2 + 2, oy - s / 2 + 10, s, s, 10);
    g.fillStyle(C.crateEdge, 1);
    g.fillRoundedRect(ox - s / 2, oy - s / 2 + 4, s, s, 10);
    g.fillStyle(C.crate, 1);
    g.fillRoundedRect(ox - s / 2, oy - s / 2, s, s - 4, 10);
    g.lineStyle(5, C.crateLine, 1);
    const k = s * 0.32;
    g.strokeRect(ox - k, oy - k - 2, k * 2, k * 2);
    g.lineBetween(ox - k, oy - k - 2, ox + k, oy + k - 2);
    g.lineStyle(4, C.crateEdge, 1);
    g.strokeRoundedRect(ox - s / 2, oy - s / 2, s, s, 10);
  }

  drawPlayerShape(g: Phaser.GameObjects.Graphics, ox: number, oy: number, facing: Dir, dead: boolean, won: boolean): void {
    const r = T * 0.32;
    g.fillStyle(0x000000, 0.16);
    g.fillEllipse(ox, oy + r * 0.95, r * 1.8, r * 0.55);
    if (dead) {
      g.fillStyle(C.laser, 0.35);
      g.fillCircle(ox, oy - 4, r * 1.3);
    }
    g.fillStyle(C.ink, 1);
    g.fillCircle(ox, oy - 4, r);
    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(ox - r * 0.3, oy - 4 - r * 0.35, r * 0.4);
    const [dx, dy] = DELTA[facing];
    const ex = ox + dx * r * 0.32;
    const ey = oy - 4 + dy * r * 0.25 - r * 0.08;
    const sep = r * 0.42;
    for (const s of [-1, 1]) {
      const exx = ex + s * sep;
      if (dead) {
        g.lineStyle(6, C.white, 1);
        g.lineBetween(exx - 8, ey - 8, exx + 8, ey + 8);
        g.lineBetween(exx - 8, ey + 8, exx + 8, ey - 8);
      } else if (won) {
        g.lineStyle(6, C.white, 1);
        g.beginPath();
        g.arc(exx, ey + 4, 9, Math.PI * 1.1, Math.PI * 1.9);
        g.strokePath();
      } else {
        g.fillStyle(C.white, 1);
        g.fillCircle(exx, ey, r * 0.2);
        g.fillStyle(C.ink, 1);
        g.fillCircle(exx + dx * 4, ey + dy * 4, r * 0.09);
      }
    }
  }

  drawCursor(g: Phaser.GameObjects.Graphics, i: number): void {
    const x = M + xOf(i) * T;
    const y = M + yOf(i) * T;
    g.lineStyle(8, C.cursor, 1);
    g.strokeRoundedRect(x + 4, y + 4, T - 8, T - 8, 12);
    g.lineStyle(3, C.ink, 1);
    g.strokeRoundedRect(x + 10, y + 10, T - 20, T - 20, 8);
  }

  /* ---------------- scene content ---------------- */

  private ensureCrates(n: number): void {
    while (this.crates.length < n) {
      const g = this.add.graphics();
      this.drawCrateShape(g, 0, -2);
      const c = this.add.container(0, 0, [g]).setDepth(4);
      this.crates.push(c);
    }
    this.crates.forEach((c, k) => c.setVisible(k < n));
  }

  private setPulse(on: boolean): void {
    if (on && !this.pulse && !this.view.reducedMotion) {
      this.pulse = this.tweens.add({ targets: this.gLaser, alpha: { from: 1, to: 0.78 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if ((!on || this.view.reducedMotion) && this.pulse) {
      this.pulse.stop();
      this.pulse = undefined;
      this.gLaser.setAlpha(1);
    }
  }

  renderPlay(level: Level, state: GameState, animate: boolean, pushed: number): void {
    const g = this.gBase;
    g.clear();
    this.gTop.clear();
    this.drawBoardFrame(g);
    level.tiles.forEach((t, i) => this.drawTile(g, i, t, state.plates[i], state.doors[i]));
    this.drawBeams(this.gLaser, state.beams);
    this.setPulse(state.beams.some((b) => b.cells.length > 0));

    this.ensureCrates(state.crates.length);
    const dur = animate && !this.view.reducedMotion ? MOVE_MS : 0;
    state.crates.forEach((cell, k) => {
      const c = this.crates[k];
      this.tweens.killTweensOf(c);
      if (dur && (k === pushed || pushed === -2)) this.tweens.add({ targets: c, x: cx(cell), y: cy(cell), duration: dur, ease: 'Quad.easeOut' });
      else c.setPosition(cx(cell), cy(cell));
    });

    this.player.setVisible(true);
    this.playerBody.clear();
    this.drawPlayerShape(this.playerBody, 0, 0, state.facing, state.status === 'lost', state.status === 'won');
    this.tweens.killTweensOf(this.player);
    this.player.setScale(1);
    if (dur) this.tweens.add({ targets: this.player, x: cx(state.player), y: cy(state.player), duration: dur, ease: 'Quad.easeOut' });
    else this.player.setPosition(cx(state.player), cy(state.player));

    if (state.status === 'lost' && !this.view.reducedMotion) {
      this.tweens.add({ targets: this.player, angle: { from: -6, to: 6 }, duration: 60, yoyo: true, repeat: 2, delay: dur, onComplete: () => this.player.setAngle(0) });
    }
    if (state.status === 'won' && !this.view.reducedMotion) {
      const ring = this.add.graphics().setDepth(9);
      ring.lineStyle(8, C.exit, 1);
      ring.strokeCircle(0, 0, T * 0.4);
      ring.setPosition(cx(state.player), cy(state.player) - 4);
      this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 520, delay: dur, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    }
  }

  bump(dir: Dir): void {
    if (this.view.reducedMotion) return;
    const [dx, dy] = DELTA[dir];
    const bx = this.player.x;
    const by = this.player.y;
    if (this.tweens.isTweening(this.player)) return;
    this.tweens.add({ targets: this.player, x: bx + dx * 10, y: by + dy * 10, duration: 60, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.player.setPosition(bx, by) });
  }

  renderEdit(board: Board, cursor: number, showCursor: boolean): void {
    const g = this.gBase;
    g.clear();
    this.drawBoardFrame(g);
    const tiles = board.map((c) => c.tile);
    const player = board.findIndex((c) => c.occ === 'player');
    const crates = board.flatMap((c, i) => (c.occ === 'crate' ? [i] : []));
    const d = derive(tiles, player, crates);
    tiles.forEach((t, i) => this.drawTile(g, i, t, d.plates[i], d.doors[i]));
    this.drawBeams(this.gLaser, d.beams);
    this.setPulse(false);
    this.ensureCrates(0);
    this.player.setVisible(false);
    const top = this.gTop;
    top.clear();
    for (const c of crates) this.drawCrateShape(top, cx(c), cy(c) - 2);
    if (player >= 0) this.drawPlayerShape(top, cx(player), cy(player), 'D', d.laser[player], false);
    if (showCursor && cursor >= 0) this.drawCursor(top, cursor);
  }
}

export class BoardView {
  readonly host: HTMLDivElement;
  readonly game: Phaser.Game;
  input: BoardInput = {};
  reducedMotion = false;
  private scene: BoardScene | null = null;
  private pending: Pending | null = null;
  private resizeObs: ResizeObserver | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.className = 'board-host';
    const scene = new BoardScene();
    scene.view = this;
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.host,
      width: SIZE,
      height: SIZE,
      transparent: true,
      banner: false,
      disableContextMenu: true,
      input: { keyboard: false, gamepad: false },
      render: { antialias: true, roundPixels: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      audio: { noAudio: true },
      scene,
    });
    if ('ResizeObserver' in window) {
      this.resizeObs = new ResizeObserver(() => this.game.scale.refresh());
      this.resizeObs.observe(this.host);
    }
  }

  sceneReady(scene: BoardScene): void {
    this.scene = scene;
    this.flush();
  }

  mount(slot: HTMLElement): void {
    slot.appendChild(this.host);
    requestAnimationFrame(() => this.game.scale.refresh());
  }

  private flush(): void {
    const p = this.pending;
    if (!this.scene || !p) return;
    if (p.kind === 'play') this.scene.renderPlay(p.level, p.state, false, -1);
    else this.scene.renderEdit(p.board, p.cursor, p.showCursor);
  }

  /** Draw a play state. `pushed` = crate index to animate, -2 = animate all (undo). */
  showPlay(level: Level, state: GameState, animate = false, pushed = -1): void {
    this.pending = { kind: 'play', level, state };
    if (this.scene) this.scene.renderPlay(level, state, animate, pushed);
  }

  showEdit(board: Board, cursor: number, showCursor: boolean): void {
    this.pending = { kind: 'edit', board, cursor, showCursor };
    if (this.scene) this.scene.renderEdit(board, cursor, showCursor);
  }

  bump(dir: Dir): void {
    this.scene?.bump(dir);
  }
}

// Core data types for the Trap Architect puzzle simulation.
// Nothing in src/core may touch the DOM, Phaser, or browser storage:
// the same rules power gameplay, the editor's validation, tests and
// replay verification of shared challenges.

export const GRID = 8;
export const CELLS = GRID * GRID;

export type Dir = 'U' | 'R' | 'D' | 'L';
/** Clockwise order. Index is used by the share codec, so never reorder. */
export const DIRS: readonly Dir[] = ['U', 'R', 'D', 'L'];

export const DELTA: Record<Dir, readonly [number, number]> = {
  U: [0, -1],
  R: [1, 0],
  D: [0, 1],
  L: [-1, 0],
};

/** Plate/door groups. Each has a colour AND a distinct symbol. */
export type Group = 0 | 1 | 2;
export const GROUPS: readonly Group[] = [0, 1, 2];

export type Tile =
  | { kind: 'floor' }
  | { kind: 'wall' }
  | { kind: 'exit' }
  | { kind: 'plate'; group: Group }
  | { kind: 'door'; group: Group }
  | { kind: 'emitter'; dir: Dir };

/** Movable thing that starts on a cell. */
export type Occupant = 'none' | 'player' | 'crate';

/** One editable cell: a static tile plus an optional movable occupant. */
export interface Cell {
  tile: Tile;
  occ: Occupant;
}

/** A raw 8×8 board as authored in the editor or decoded from a link. */
export type Board = Cell[];

/** A validated, playable level. */
export interface Level {
  tiles: Tile[];
  player: number;
  crates: number[];
}

export interface Beam {
  emitter: number;
  dir: Dir;
  /** Cells the ray passes through (deadly). */
  cells: number[];
  /** Cell that stopped the ray, or -1 when it left the board. */
  stop: number;
}

export type Status = 'playing' | 'won' | 'lost';

/** Complete game state. Immutable: every move produces a new object. */
export interface GameState {
  player: number;
  /** Crate positions. Indices are stable across moves (crate i stays crate i). */
  crates: number[];
  moves: number;
  /** Successful moves that led to this state; length === moves. */
  path: Dir[];
  status: Status;
  facing: Dir;
  /** Per cell: plate currently pressed. */
  plates: boolean[];
  /** Per cell: door currently open. */
  doors: boolean[];
  /** Per cell: inside a laser ray. */
  laser: boolean[];
  beams: Beam[];
}

export const idx = (x: number, y: number): number => y * GRID + x;
export const xOf = (i: number): number => i % GRID;
export const yOf = (i: number): number => Math.floor(i / GRID);
export const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < GRID && y < GRID;

export const rotateCW = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 1) % 4];

import { initialState } from './sim';
import { CELLS, GRID, type Board, type Cell, type Dir, type Group, type Level, type Tile } from './types';

export type BoardIssue =
  | 'no-player'
  | 'many-players'
  | 'no-exit'
  | 'many-exits'
  | 'bad-occupant'
  | 'start-in-laser'
  | 'bad-size';

export const FLOOR: Tile = { kind: 'floor' };

export function emptyBoard(): Board {
  return Array.from({ length: CELLS }, () => ({ tile: FLOOR, occ: 'none' as const }));
}

export function cloneBoard(b: Board): Board {
  return b.map((c) => ({ tile: { ...c.tile } as Tile, occ: c.occ }));
}

/** Can a movable occupant start on this tile? Only floor and plates. */
export function occupantAllowed(tile: Tile): boolean {
  return tile.kind === 'floor' || tile.kind === 'plate';
}

/** Structural problems that make a board unplayable. Empty list = playable. */
export function boardIssues(board: Board): BoardIssue[] {
  if (board.length !== CELLS) return ['bad-size'];
  const issues: BoardIssue[] = [];
  let players = 0;
  let exits = 0;
  for (const c of board) {
    if (c.occ === 'player') players++;
    if (c.tile.kind === 'exit') exits++;
    if (c.occ !== 'none' && !occupantAllowed(c.tile)) issues.push('bad-occupant');
  }
  if (players === 0) issues.push('no-player');
  if (players > 1) issues.push('many-players');
  if (exits === 0) issues.push('no-exit');
  if (exits > 1) issues.push('many-exits');
  if (issues.length === 0) {
    const s = initialState(toLevelUnchecked(board));
    if (s.status === 'lost') issues.push('start-in-laser');
  }
  return [...new Set(issues)];
}

function toLevelUnchecked(board: Board): Level {
  const crates: number[] = [];
  let player = -1;
  board.forEach((c, i) => {
    if (c.occ === 'player') player = i;
    if (c.occ === 'crate') crates.push(i);
  });
  return { tiles: board.map((c) => c.tile), player, crates };
}

/** Convert a board to a level, or null when it has issues. */
export function boardToLevel(board: Board): Level | null {
  if (boardIssues(board).length) return null;
  return toLevelUnchecked(board);
}

export function levelToBoard(level: Level): Board {
  const b: Board = level.tiles.map((t) => ({ tile: t, occ: 'none' as const }));
  b[level.player] = { ...b[level.player], occ: 'player' };
  for (const c of level.crates) b[c] = { ...b[c], occ: 'crate' };
  return b;
}

export function boardsEqual(a: Board, b: Board): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (cellKey(a[i]) !== cellKey(b[i])) return false;
  return true;
}

export function cellKey(c: Cell): string {
  const t = c.tile;
  const extra = t.kind === 'plate' || t.kind === 'door' ? t.group : t.kind === 'emitter' ? t.dir : '';
  return `${t.kind}${extra}:${c.occ}`;
}

/*
 * Compact ASCII used to author built-in levels:
 *   .  floor        #  wall         E  exit
 *   @  player       o  crate
 *   a b c   plates of group 0 / 1 / 2
 *   A B C   doors  of group 0 / 1 / 2
 *   ^ > v <  laser emitters (direction they fire)
 *   1 2 3   crate already sitting on plate a / b / c
 */
export function parseAscii(rows: readonly string[]): Board {
  if (rows.length !== GRID || rows.some((r) => r.length !== GRID)) {
    throw new Error(`Level must be ${GRID}×${GRID}`);
  }
  const board = emptyBoard();
  const plate = (g: Group): Tile => ({ kind: 'plate', group: g });
  const door = (g: Group): Tile => ({ kind: 'door', group: g });
  const emitter = (d: Dir): Tile => ({ kind: 'emitter', dir: d });
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const i = y * GRID + x;
      let cell: Cell;
      switch (ch) {
        case '.': cell = { tile: FLOOR, occ: 'none' }; break;
        case '#': cell = { tile: { kind: 'wall' }, occ: 'none' }; break;
        case 'E': cell = { tile: { kind: 'exit' }, occ: 'none' }; break;
        case '@': cell = { tile: FLOOR, occ: 'player' }; break;
        case 'o': cell = { tile: FLOOR, occ: 'crate' }; break;
        case 'a': cell = { tile: plate(0), occ: 'none' }; break;
        case 'b': cell = { tile: plate(1), occ: 'none' }; break;
        case 'c': cell = { tile: plate(2), occ: 'none' }; break;
        case '1': cell = { tile: plate(0), occ: 'crate' }; break;
        case '2': cell = { tile: plate(1), occ: 'crate' }; break;
        case '3': cell = { tile: plate(2), occ: 'crate' }; break;
        case 'A': cell = { tile: door(0), occ: 'none' }; break;
        case 'B': cell = { tile: door(1), occ: 'none' }; break;
        case 'C': cell = { tile: door(2), occ: 'none' }; break;
        case '^': cell = { tile: emitter('U'), occ: 'none' }; break;
        case '>': cell = { tile: emitter('R'), occ: 'none' }; break;
        case 'v': cell = { tile: emitter('D'), occ: 'none' }; break;
        case '<': cell = { tile: emitter('L'), occ: 'none' }; break;
        default: throw new Error(`Unknown level character "${ch}" at ${x},${y}`);
      }
      board[i] = cell;
    });
  });
  return board;
}

import { boardsEqual, cloneBoard, emptyBoard, FLOOR, occupantAllowed } from './board';
import { GRID, rotateCW, type Board, type Dir, type Group, type Tile } from './types';

export type Tool = 'wall' | 'crate' | 'plate' | 'door' | 'laser' | 'player' | 'exit' | 'erase';

/** Starter room so the builder never opens on a blank, confusing grid. */
export function starterBoard(): Board {
  const b = emptyBoard();
  b[6 * GRID + 1] = { tile: FLOOR, occ: 'player' };
  b[1 * GRID + 6] = { tile: { kind: 'exit' }, occ: 'none' };
  return b;
}

/**
 * Apply a tool to one cell. Returns a new board, or null when nothing changes.
 * Rules: one player and one exit (placing moves them); walls, doors, lasers
 * and the exit clear any occupant; crates/players may stand on floor or plates.
 */
export function applyTool(board: Board, i: number, tool: Tool, group: Group, dir: Dir): { board: Board; rotated?: Dir } | null {
  const cell = board[i];
  const next = cloneBoard(board);
  const set = (tile: Tile, occ = next[i].occ) => (next[i] = { tile, occ });
  let rotated: Dir | undefined;
  switch (tool) {
    case 'wall':
      set({ kind: 'wall' }, 'none');
      break;
    case 'erase':
      set(FLOOR, 'none');
      break;
    case 'crate':
      set(occupantAllowed(cell.tile) ? cell.tile : FLOOR, 'crate');
      break;
    case 'plate':
      set({ kind: 'plate', group });
      break;
    case 'door':
      set({ kind: 'door', group }, 'none');
      break;
    case 'laser':
      if (cell.tile.kind === 'emitter') {
        rotated = rotateCW(cell.tile.dir);
        set({ kind: 'emitter', dir: rotated }, 'none');
      } else set({ kind: 'emitter', dir }, 'none');
      break;
    case 'player':
      next.forEach((c, k) => {
        if (c.occ === 'player') next[k] = { ...c, occ: 'none' };
      });
      set(occupantAllowed(cell.tile) ? cell.tile : FLOOR, 'player');
      break;
    case 'exit':
      next.forEach((c, k) => {
        if (c.tile.kind === 'exit') next[k] = { tile: FLOOR, occ: c.occ };
      });
      set({ kind: 'exit' }, 'none');
      break;
  }
  return boardsEqual(next, board) ? null : { board: next, rotated };
}


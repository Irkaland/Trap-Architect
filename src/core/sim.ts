import {
  CELLS,
  DELTA,
  type Beam,
  type Dir,
  type GameState,
  type Group,
  type Level,
  type Tile,
  idx,
  inBounds,
  xOf,
  yOf,
} from './types';

/*
 * Exact rules (kept in one place so play, editor tests, solver and replay
 * verification can never disagree):
 *
 *  - One move = the player steps into an adjacent cell, optionally pushing
 *    exactly one crate one cell further in the same direction.
 *  - Walls, emitters, crates and closed doors block. The board edge blocks.
 *  - A crate can only be pushed into an empty floor, plate, exit or open door.
 *    Two crates in a row cannot be pushed.
 *  - Blocking is judged on the state *before* the move.
 *  - After every successful move: plates update (pressed while a player or
 *    crate stands on them), then doors (open while any plate of the same
 *    group is pressed, OR while anything stands in the doorway — a door
 *    never closes on an occupant), then lasers are traced.
 *  - Rays start next to the emitter and stop at walls, closed doors, crates,
 *    other emitters or the board edge. The player does not block rays.
 *  - Player inside a ray after that update -> lost. Otherwise, player on the
 *    exit -> won. Lost/won states accept no further moves.
 *  - Blocked moves change nothing and are not counted.
 */

export type MoveOutcome = 'moved' | 'pushed' | 'blocked' | 'over';

export interface MoveResult {
  state: GameState;
  outcome: MoveOutcome;
  /** Index into state.crates of the pushed crate, or -1. */
  pushed: number;
}

/** Cells blocked for a crate or player by static tiles (given current doors). */
function solidTile(tile: Tile, doorOpen: boolean): boolean {
  switch (tile.kind) {
    case 'wall':
    case 'emitter':
      return true;
    case 'door':
      return !doorOpen;
    default:
      return false;
  }
}

interface Derived {
  plates: boolean[];
  doors: boolean[];
  laser: boolean[];
  beams: Beam[];
}

/** Recompute plates -> doors -> lasers from positions. Pure. */
export function derive(tiles: Tile[], player: number, crates: number[]): Derived {
  const occupied = new Array<boolean>(CELLS).fill(false);
  const crateAt = new Array<boolean>(CELLS).fill(false);
  if (player >= 0) occupied[player] = true; // -1 = no player (editor preview)
  for (const c of crates) {
    occupied[c] = true;
    crateAt[c] = true;
  }

  // 1. Plates.
  const plates = new Array<boolean>(CELLS).fill(false);
  const groupActive: boolean[] = [false, false, false];
  for (let i = 0; i < CELLS; i++) {
    const t = tiles[i];
    if (t.kind === 'plate' && occupied[i]) {
      plates[i] = true;
      groupActive[t.group] = true;
    }
  }

  // 2. Doors: open while the group is active or while something is inside.
  const doors = new Array<boolean>(CELLS).fill(false);
  for (let i = 0; i < CELLS; i++) {
    const t = tiles[i];
    if (t.kind === 'door') doors[i] = groupActive[t.group] || occupied[i];
  }

  // 3. Lasers.
  const laser = new Array<boolean>(CELLS).fill(false);
  const beams: Beam[] = [];
  for (let i = 0; i < CELLS; i++) {
    const t = tiles[i];
    if (t.kind !== 'emitter') continue;
    const [dx, dy] = DELTA[t.dir];
    let x = xOf(i) + dx;
    let y = yOf(i) + dy;
    const cells: number[] = [];
    let stop = -1;
    while (inBounds(x, y)) {
      const c = idx(x, y);
      const ct = tiles[c];
      if (ct.kind === 'wall' || ct.kind === 'emitter' || (ct.kind === 'door' && !doors[c]) || crateAt[c]) {
        stop = c;
        break;
      }
      cells.push(c);
      laser[c] = true;
      x += dx;
      y += dy;
    }
    beams.push({ emitter: i, dir: t.dir, cells, stop });
  }

  return { plates, doors, laser, beams };
}

function finish(tiles: Tile[], s: Omit<GameState, 'plates' | 'doors' | 'laser' | 'beams' | 'status'>): GameState {
  const d = derive(tiles, s.player, s.crates);
  let status: GameState['status'] = 'playing';
  if (d.laser[s.player]) status = 'lost';
  else if (tiles[s.player].kind === 'exit') status = 'won';
  return { ...s, ...d, status };
}

export function initialState(level: Level): GameState {
  return finish(level.tiles, {
    player: level.player,
    crates: level.crates.slice(),
    moves: 0,
    path: [],
    facing: 'D',
  });
}

/** Attempt one move. Never mutates `state`. */
export function step(level: Level, state: GameState, dir: Dir): MoveResult {
  if (state.status !== 'playing') return { state, outcome: 'over', pushed: -1 };
  const { tiles } = level;
  const [dx, dy] = DELTA[dir];
  const px = xOf(state.player);
  const py = yOf(state.player);
  const tx = px + dx;
  const ty = py + dy;
  const blocked: MoveResult = { state, outcome: 'blocked', pushed: -1 };
  if (!inBounds(tx, ty)) return blocked;
  const target = idx(tx, ty);
  if (solidTile(tiles[target], state.doors[target])) return blocked;

  let crates = state.crates;
  let pushed = crates.indexOf(target);
  if (pushed >= 0) {
    const bx = tx + dx;
    const by = ty + dy;
    if (!inBounds(bx, by)) return blocked;
    const beyond = idx(bx, by);
    if (solidTile(tiles[beyond], state.doors[beyond])) return blocked;
    if (crates.includes(beyond)) return blocked; // no pushing two crates
    crates = crates.slice();
    crates[pushed] = beyond;
  }

  const next = finish(tiles, {
    player: target,
    crates,
    moves: state.moves + 1,
    path: [...state.path, dir],
    facing: dir,
  });
  return { state: next, outcome: pushed >= 0 ? 'pushed' : 'moved', pushed };
}

export interface ReplayResult {
  ok: boolean;
  state: GameState;
  /** Index of the first move that failed (blocked / after end / death), or -1. */
  failedAt: number;
  reason?: 'blocked' | 'lost' | 'ended-early' | 'not-won';
}

/**
 * Run a move sequence from the start. A replay is valid only when every move
 * succeeds, the player never dies, and the room is won exactly on the last move.
 */
export function replay(level: Level, moves: readonly Dir[]): ReplayResult {
  let state = initialState(level);
  if (state.status !== 'playing') return { ok: false, state, failedAt: 0, reason: 'lost' };
  for (let i = 0; i < moves.length; i++) {
    if (state.status === 'won') return { ok: false, state, failedAt: i, reason: 'ended-early' };
    const r = step(level, state, moves[i]);
    if (r.outcome === 'blocked' || r.outcome === 'over') return { ok: false, state, failedAt: i, reason: 'blocked' };
    state = r.state;
    if (state.status === 'lost') return { ok: false, state, failedAt: i, reason: 'lost' };
  }
  if (state.status !== 'won') return { ok: false, state, failedAt: moves.length, reason: 'not-won' };
  return { ok: true, state, failedAt: -1 };
}

/** Groups that have at least one door but no plate (doors that can never open). */
export function orphanDoorGroups(tiles: Tile[]): Group[] {
  const hasPlate = [false, false, false];
  const hasDoor = [false, false, false];
  for (const t of tiles) {
    if (t.kind === 'plate') hasPlate[t.group] = true;
    if (t.kind === 'door') hasDoor[t.group] = true;
  }
  return ([0, 1, 2] as Group[]).filter((g) => hasDoor[g] && !hasPlate[g]);
}

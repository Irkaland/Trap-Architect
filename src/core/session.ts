import { initialState, step, type MoveResult } from './sim';
import type { Dir, GameState, Level } from './types';

/** Hard cap so a runaway session can't grow memory without bound. */
export const MAX_HISTORY = 2000;

/**
 * A play session: current state plus full-state undo history.
 * Undo restores the complete previous GameState (positions, doors, lasers,
 * move count and path). Undo usage is counted separately and is NOT undone.
 */
export class Session {
  readonly level: Level;
  state: GameState;
  private history: GameState[] = [];
  undoCount = 0;

  constructor(level: Level) {
    this.level = level;
    this.state = initialState(level);
  }

  move(dir: Dir): MoveResult {
    const r = step(this.level, this.state, dir);
    if (r.outcome === 'moved' || r.outcome === 'pushed') {
      this.history.push(this.state);
      if (this.history.length > MAX_HISTORY) this.history.shift();
      this.state = r.state;
    }
    return r;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  /** Returns the state that was undone (for animation), or null. */
  undo(): GameState | null {
    const prev = this.history.pop();
    if (!prev) return null;
    const undone = this.state;
    this.state = prev;
    this.undoCount++;
    return undone;
  }

  restart(): void {
    this.history = [];
    this.undoCount = 0;
    this.state = initialState(this.level);
  }
}

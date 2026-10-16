import { initialState, step } from './sim';
import { DIRS, type Dir, type GameState, type Level } from './types';

/**
 * Breadth-first search over the real simulation. Used by tests and the
 * level-authoring script (never shipped to players as a hint system).
 * Because it is exhaustive BFS, a returned solution is a shortest one.
 */
export interface SolveResult {
  solution: Dir[] | null;
  explored: number;
  exhausted: boolean;
}

const keyOf = (s: GameState): string => {
  const c = s.crates.slice().sort((a, b) => a - b);
  return s.player + ':' + c.join(',');
};

export function solve(level: Level, maxStates = 2_000_000): SolveResult {
  const start = initialState(level);
  if (start.status !== 'playing') return { solution: null, explored: 0, exhausted: true };
  const seen = new Map<string, { parent: string | null; dir: Dir | null }>();
  const startKey = keyOf(start);
  seen.set(startKey, { parent: null, dir: null });
  let frontier: GameState[] = [start];
  let explored = 0;
  while (frontier.length) {
    const next: GameState[] = [];
    for (const s of frontier) {
      explored++;
      if (explored > maxStates) return { solution: null, explored, exhausted: false };
      const sKey = keyOf(s);
      for (const d of DIRS) {
        const r = step(level, { ...s, path: [] }, d);
        if (r.outcome !== 'moved' && r.outcome !== 'pushed') continue;
        const ns = r.state;
        if (ns.status === 'lost') continue;
        const k = keyOf(ns);
        if (seen.has(k)) continue;
        seen.set(k, { parent: sKey, dir: d });
        if (ns.status === 'won') {
          const path: Dir[] = [];
          let cur: string | null = k;
          while (cur) {
            const n: { parent: string | null; dir: Dir | null } = seen.get(cur)!;
            if (n.dir) path.push(n.dir);
            cur = n.parent;
          }
          return { solution: path.reverse(), explored, exhausted: true };
        }
        next.push(ns);
      }
    }
    frontier = next;
  }
  return { solution: null, explored, exhausted: true };
}

import { describe, expect, it } from 'vitest';
import { boardIssues, parseAscii } from '../src/core/board';
import { replay } from '../src/core/sim';
import { solve } from '../src/core/solver';
import { LEVEL_DEFS, levelOf, parseMoves } from '../src/levels/levels';

describe('built-in levels', () => {
  it('has at least 12 rooms with unique ids', () => {
    expect(LEVEL_DEFS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(LEVEL_DEFS.map((d) => d.id)).size).toBe(LEVEL_DEFS.length);
  });

  for (const def of LEVEL_DEFS) {
    describe(`${def.id} ${def.name}`, () => {
      it('is a valid board', () => {
        expect(boardIssues(parseAscii(def.rows))).toEqual([]);
      });

      it('supplied solution wins in the real simulation', () => {
        const r = replay(levelOf(def), parseMoves(def.solution));
        expect(r.ok, `failed at move ${r.failedAt}: ${r.reason}`).toBe(true);
        expect(r.state.moves).toBe(def.solution.length);
      });

      it('target equals the shortest solution found by exhaustive search', () => {
        const res = solve(levelOf(def));
        expect(res.exhausted).toBe(true);
        expect(res.solution).not.toBeNull();
        expect(res.solution!.length).toBe(def.target);
        expect(def.solution.length).toBe(def.target);
      });
    });
  }

  it('difficulty broadly rises: the last third needs more moves than the first third', () => {
    const avg = (a: readonly { target: number }[]) => a.reduce((s, d) => s + d.target, 0) / a.length;
    const n = Math.floor(LEVEL_DEFS.length / 3);
    expect(avg(LEVEL_DEFS.slice(-n))).toBeGreaterThan(avg(LEVEL_DEFS.slice(0, n)));
  });
});

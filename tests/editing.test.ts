import { describe, expect, it } from 'vitest';
import { boardIssues } from '../src/core/board';
import { applyTool, starterBoard } from '../src/core/editing';
import { idx } from '../src/core/types';

describe('editor tools', () => {
  it('starter board is playable', () => {
    expect(boardIssues(starterBoard())).toEqual([]);
  });

  it('keeps exactly one player and one exit', () => {
    let b = starterBoard();
    b = applyTool(b, idx(3, 3), 'player', 0, 'R')!.board;
    b = applyTool(b, idx(5, 5), 'exit', 0, 'R')!.board;
    expect(b.filter((c) => c.occ === 'player').length).toBe(1);
    expect(b.filter((c) => c.tile.kind === 'exit').length).toBe(1);
    expect(b[idx(3, 3)].occ).toBe('player');
    expect(b[idx(5, 5)].tile.kind).toBe('exit');
  });

  it('rotates an existing emitter clockwise', () => {
    const b = applyTool(starterBoard(), idx(2, 2), 'laser', 0, 'U')!.board;
    const r = applyTool(b, idx(2, 2), 'laser', 0, 'U')!;
    expect(r.rotated).toBe('R');
    expect(r.board[idx(2, 2)].tile).toEqual({ kind: 'emitter', dir: 'R' });
  });

  it('crates can sit on plates; walls clear occupants; repeat placement is a no-op', () => {
    let b = applyTool(starterBoard(), idx(2, 2), 'plate', 1, 'R')!.board;
    b = applyTool(b, idx(2, 2), 'crate', 0, 'R')!.board;
    expect(b[idx(2, 2)]).toEqual({ tile: { kind: 'plate', group: 1 }, occ: 'crate' });
    expect(applyTool(b, idx(2, 2), 'crate', 0, 'R')).toBeNull();
    b = applyTool(b, idx(2, 2), 'wall', 0, 'R')!.board;
    expect(b[idx(2, 2)]).toEqual({ tile: { kind: 'wall' }, occ: 'none' });
  });

  it('reassigns a plate group', () => {
    let b = applyTool(starterBoard(), idx(2, 2), 'plate', 0, 'R')!.board;
    b = applyTool(b, idx(2, 2), 'plate', 2, 'R')!.board;
    expect(b[idx(2, 2)].tile).toEqual({ kind: 'plate', group: 2 });
  });
});

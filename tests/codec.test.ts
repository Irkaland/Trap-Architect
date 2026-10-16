import { describe, expect, it } from 'vitest';
import { parseAscii } from '../src/core/board';
import {
  MAX_HASH_LENGTH,
  MAX_REPLAY_MOVES,
  cleanName,
  decodeBoard,
  decodeChallenge,
  decodeName,
  encodeBoard,
  encodeChallenge,
  encodeName,
  packMoves,
  unpackMoves,
} from '../src/core/codec';
import { DIRS, type Dir } from '../src/core/types';
import { LEVEL_DEFS, parseMoves } from '../src/levels/levels';

const def = LEVEL_DEFS[3]; // Hold the Door: crate + plate + door
const board = parseAscii(def.rows);
const solution = parseMoves(def.solution);

describe('board encoding', () => {
  it('round-trips every built-in board', () => {
    for (const d of LEVEL_DEFS) {
      const b = parseAscii(d.rows);
      const s = encodeBoard(b);
      expect(s).toMatch(/^[A-Za-z0-9_-]{64}$/);
      expect(decodeBoard(s)).toEqual(b);
    }
  });

  it('round-trips crates and players on plates and every emitter direction', () => {
    const b = parseAscii(['@123^>v<', 'abcABCE.', 'o.......', '........', '........', '........', '........', '........']);
    expect(decodeBoard(encodeBoard(b))).toEqual(b);
  });

  it('rejects wrong lengths and unknown symbols', () => {
    expect(decodeBoard('A'.repeat(63))).toBeNull();
    expect(decodeBoard('A'.repeat(65))).toBeNull();
    expect(decodeBoard('_'.repeat(64))).toBeNull(); // valid alphabet, unused code
    expect(decodeBoard('<'.repeat(64))).toBeNull();
  });
});

describe('move packing', () => {
  it('round-trips all lengths', () => {
    for (let n = 0; n < 20; n++) {
      const m: Dir[] = Array.from({ length: n }, (_, i) => DIRS[(i * 7 + 3) % 4]);
      expect(unpackMoves(packMoves(m), n)).toEqual(m);
    }
  });

  it('rejects bad lengths, counts and non-zero padding', () => {
    expect(unpackMoves('AA', 1)).toBeNull();
    expect(unpackMoves('A', 4)).toBeNull();
    expect(unpackMoves('B', 1)).toBeNull(); // padding bits set
    expect(unpackMoves('A', -1)).toBeNull();
    expect(unpackMoves('A'.repeat(400), MAX_REPLAY_MOVES + 1)).toBeNull();
  });
});

describe('room names', () => {
  it('round-trips unicode and strips control characters', () => {
    expect(decodeName(encodeName('ოთახი №1 🔥'))).toBe('ოთახი №1 🔥');
    expect(cleanName('  a\u0000b\n\tc  ')).toBe('ab c');
    expect([...cleanName('x'.repeat(100))].length).toBe(24);
  });

  it('keeps HTML as inert text (rendered via textContent)', () => {
    const n = '<img src=x onerror=alert(1)>';
    expect(decodeName(encodeName(n))).toBe(n.slice(0, 24));
  });
});

describe('challenge links', () => {
  const hash = '#' + encodeChallenge({ board, moves: solution, name: 'Door Trick' });
  const parts = hash.slice(4).split('.');
  const bad = (h: string) => {
    const r = decodeChallenge(h);
    return r.ok ? 'ok' : r.error;
  };

  it('encodes compactly and decodes + verifies', () => {
    expect(hash.length).toBeLessThan(120);
    const r = decodeChallenge(hash);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.challenge.board).toEqual(board);
    expect(r.challenge.moves).toEqual(solution);
    expect(r.challenge.moves.length).toBe(def.target);
    expect(r.challenge.name).toBe('Door Trick');
  });

  it('works without a name', () => {
    expect(decodeChallenge(encodeChallenge({ board, moves: solution, name: '' })).ok).toBe(true);
  });

  it('rejects non-challenges, wrong versions and malformed structure', () => {
    expect(bad('#hello')).toBe('not-challenge');
    expect(bad('#ch=2.' + parts.slice(1).join('.'))).toBe('bad-version');
    expect(bad('#ch=x.' + parts.slice(1).join('.'))).toBe('bad-format');
    expect(bad('#ch=1')).toBe('bad-format');
    expect(bad('#ch=1.a.b.c.d.e.f')).toBe('bad-format');
  });

  it('enforces the size limit', () => {
    expect(bad('#ch=1.' + 'A'.repeat(MAX_HASH_LENGTH))).toBe('too-long');
  });

  it('rejects damaged boards and invalid player/exit counts', () => {
    expect(bad(`#ch=1.${parts[1].slice(0, 60)}.${parts[2]}.${parts[3]}`)).toBe('bad-board');
    const noExit = encodeBoard(parseAscii(def.rows.map((r) => r.replace('E', '.'))));
    expect(bad(`#ch=1.${noExit}.${parts[2]}.${parts[3]}`)).toBe('bad-counts');
    const twoPlayers = encodeBoard(parseAscii(def.rows.map((r, i) => (i === 3 ? r.replace('.', '@') : r))));
    expect(bad(`#ch=1.${twoPlayers}.${parts[2]}.${parts[3]}`)).toBe('bad-counts');
  });

  it('rejects damaged or mismatched replays', () => {
    expect(bad(`#ch=1.${parts[1]}.0.`)).toBe('bad-replay');
    expect(bad(`#ch=1.${parts[1]}.abc.${parts[3]}`)).toBe('bad-replay');
    expect(bad(`#ch=1.${parts[1]}.${solution.length + 3}.${parts[3]}`)).toBe('bad-replay');
    expect(bad(`#ch=1.${parts[1]}.99999.${parts[3]}`)).toBe('bad-replay');
  });

  it('rejects a replay that does not solve the room', () => {
    expect(bad('#' + encodeChallenge({ board, moves: solution.slice(0, -1), name: '' }))).toBe('replay-failed');
    expect(bad('#' + encodeChallenge({ board, moves: ['U', ...solution], name: '' }))).toBe('replay-failed');
    // Walks straight into the laser in Red Line.
    const red = parseAscii(LEVEL_DEFS[4].rows);
    expect(bad('#' + encodeChallenge({ board: red, moves: parseMoves('DDDDDRRRRR'), name: '' }))).toBe('replay-failed');
  });

  it('rejects a bad name segment', () => {
    const head = hash.split('.').slice(0, 4).join('.');
    expect(bad(`${head}.@@@`)).toBe('bad-format');
    expect(bad(`${head}.${'A'.repeat(200)}`)).toBe('bad-format');
  });

  it('never throws on garbage', () => {
    for (const g of ['', '#', '#ch=', '#ch=1....', '#ch=1.%%%.1.A', '#ch=1.' + '\u0000'.repeat(64) + '.1.A', 'null']) {
      expect(() => decodeChallenge(g)).not.toThrow();
      expect(decodeChallenge(g).ok).toBe(false);
    }
  });
});

import { boardToLevel, parseAscii } from '../core/board';
import type { Dir, Level } from '../core/types';

/*
 * Built-in rooms. Legend (see parseAscii):
 *   . floor  # wall  E exit  @ player  o crate
 *   a/b/c plates, A/B/C doors (same letter = same group)
 *   ^ > v < laser emitters, 2 = crate on plate b
 *
 * `solution` is a known valid move sequence; tests replay it through the
 * real simulation. `target` equals the length of a shortest solution found
 * by exhaustive breadth-first search (also re-checked in tests). We still
 * label it "Target", not "optimal", in the UI.
 */
export interface LevelDef {
  id: string;
  name: string;
  /** One short line shown in the HUD. Teaches by pointing, not lecturing. */
  hint: string | null;
  rows: readonly string[];
  solution: string;
  target: number;
}

export const LEVEL_DEFS: readonly LevelDef[] = [
  {
    id: 'l01',
    name: 'First Steps',
    hint: 'Reach the exit.',
    rows: ['########', '#@.....#', '#####..#', '#......#', '#..#####', '#......#', '#####.E#', '########'],
    solution: 'RRRRDDLLLDDRRRRD',
    target: 16,
  },
  {
    id: 'l02',
    name: 'Heavy Lifting',
    hint: 'Walk into a crate to push it.',
    rows: ['########', '########', '#@.....#', '####o###', '#E.....#', '####.###', '########', '########'],
    solution: 'RRRDDLLL',
    target: 8,
  },
  {
    id: 'l03',
    name: 'Matching Keys',
    hint: 'A plate opens doors with the same symbol.',
    rows: ['########', '#@...b.#', '#B##a###', '#.##A###', '#E.....#', '########', '########', '########'],
    solution: 'RRRDDDLLL',
    target: 9,
  },
  {
    id: 'l04',
    name: 'Hold the Door',
    hint: 'A crate can keep a plate pressed.',
    rows: ['########', '#@.....#', '#..o...#', '#......#', '#####.a#', '#E..A..#', '########', '########'],
    solution: 'RDRRRURDDLDDLLLL',
    target: 16,
  },
  {
    id: 'l05',
    name: 'Red Line',
    hint: 'Laser beams are deadly. Walls stop them.',
    rows: ['########', '#@.....#', '#...v..#', '#......#', '#......#', '#......#', '#.....E#', '########'],
    solution: 'RRRRRDDDDD',
    target: 10,
  },
  {
    id: 'l06',
    name: 'Shield',
    hint: 'Crates block lasers.',
    rows: ['########', '#@.....#', '#...o..#', '>......#', '#......#', '#.....E#', '########', '########'],
    solution: 'RRRDRRDDD',
    target: 9,
  },
  {
    id: 'l07',
    name: 'Off Switch',
    hint: 'Closed doors block lasers too.',
    rows: ['########', '#@.....#', '#.####.#', '#..2..a#', '###.####', '>B..A..E', '########', '########'],
    solution: 'DDRRRRLLDDRRRR',
    target: 14,
  },
  {
    id: 'l08',
    name: 'Hot Plate',
    hint: 'Any plate with the symbol works.',
    rows: ['######v#', '#@...#.#', '#..o.#.#', '#....#.#', '#...a..#', '#.....a#', '#####.A#', '######E#'],
    solution: 'RRDDDLDRRRDRD',
    target: 13,
  },
  {
    id: 'l09',
    name: 'Doorstop',
    hint: 'A door stays open while something is in it.',
    rows: ['########', '#...#..E', '#.@.#..<', '#.aoA..#', '#...#..#', '########', '########', '########'],
    solution: 'DRRRDRULUURR',
    target: 12,
  },
  {
    id: 'l10',
    name: 'Crossfire',
    hint: null,
    rows: ['########', '#@.....#', '#..o.o.#', '#.#..#.#', '>......<', '###.####', '#......#', '#E.....#'],
    solution: 'RRDRRURDDULLLDRDLDDDLL',
    target: 22,
  },
  {
    id: 'l11',
    name: 'Cover Fire',
    hint: null,
    rows: ['########', '>A.....E', '###..###', '#..A#..#', '#.o.o..#', '#@...a.#', '########', '########'],
    solution: 'RURRDRRUULDLLLLURDRUURURRR',
    target: 26,
  },
  {
    id: 'l12',
    name: 'The Architect',
    hint: null,
    rows: ['######E#', '###.cC.#', '>.C....<', '#.#.##.#', '#.#....#', '#..o.#.#', '#@.....#', '########'],
    solution: 'URRDRULURRLDDRRUUUDLLLUUURRRU',
    target: 29,
  },
];

const DIR_CHARS = new Set(['U', 'D', 'L', 'R']);

export function parseMoves(s: string): Dir[] {
  return [...s].map((c) => {
    if (!DIR_CHARS.has(c)) throw new Error(`Bad move "${c}"`);
    return c as Dir;
  });
}

export function levelOf(def: LevelDef): Level {
  const level = boardToLevel(parseAscii(def.rows));
  if (!level) throw new Error(`Built-in level ${def.id} is invalid`);
  return level;
}

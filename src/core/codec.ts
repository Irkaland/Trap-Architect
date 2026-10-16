import { boardIssues, boardToLevel } from './board';
import { replay } from './sim';
import { CELLS, DIRS, type Board, type Cell, type Dir, type Group, type Level, type Occupant, type Tile } from './types';

/*
 * Challenge link format (URL hash, version 1):
 *
 *   #ch=1.<board>.<moves>.<replay>[.<name>]
 *
 *   board   64 chars, one per cell, from CELL_TABLE (base64url alphabet)
 *   moves   decimal move count of the creator's final successful path
 *   replay  path packed 3 moves per char (2 bits each, base64url)
 *   name    optional room name, base64url(UTF-8), ≤ MAX_NAME_CHARS
 *
 * Everything is parsed defensively and nothing in a payload is ever
 * executed or inserted as HTML. A decoded link is only accepted when the
 * supplied replay actually solves the board in our own simulation.
 */

export const CHALLENGE_VERSION = 1;
export const MAX_HASH_LENGTH = 1024;
export const MAX_REPLAY_MOVES = 999;
export const MAX_NAME_CHARS = 24;
const MAX_NAME_ENCODED = 96;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const plate = (group: Group): Tile => ({ kind: 'plate', group });
const door = (group: Group): Tile => ({ kind: 'door', group });

/** Every legal (tile, occupant) combination. Order is part of format v1. */
const CELL_TABLE: readonly Cell[] = [
  { tile: { kind: 'floor' }, occ: 'none' },
  { tile: { kind: 'floor' }, occ: 'player' },
  { tile: { kind: 'floor' }, occ: 'crate' },
  { tile: { kind: 'wall' }, occ: 'none' },
  { tile: { kind: 'exit' }, occ: 'none' },
  ...([0, 1, 2] as Group[]).flatMap((g) =>
    (['none', 'player', 'crate'] as Occupant[]).map((occ) => ({ tile: plate(g), occ })),
  ),
  ...([0, 1, 2] as Group[]).map((g) => ({ tile: door(g), occ: 'none' as const })),
  ...DIRS.map((dir) => ({ tile: { kind: 'emitter', dir } as Tile, occ: 'none' as const })),
];

function cellCode(c: Cell): number {
  const t = c.tile;
  return CELL_TABLE.findIndex((e) => {
    const et = e.tile;
    if (et.kind !== t.kind || e.occ !== c.occ) return false;
    if ((et.kind === 'plate' || et.kind === 'door') && (t.kind === 'plate' || t.kind === 'door')) return et.group === t.group;
    if (et.kind === 'emitter' && t.kind === 'emitter') return et.dir === t.dir;
    return true;
  });
}

export function encodeBoard(board: Board): string {
  if (board.length !== CELLS) throw new Error('Board must have 64 cells');
  return board
    .map((c) => {
      const code = cellCode(c);
      if (code < 0) throw new Error('Cell cannot be encoded');
      return ALPHABET[code];
    })
    .join('');
}

export function decodeBoard(s: string): Board | null {
  if (s.length !== CELLS) return null;
  const out: Board = [];
  for (const ch of s) {
    const code = ALPHABET.indexOf(ch);
    if (code < 0 || code >= CELL_TABLE.length) return null;
    const e = CELL_TABLE[code];
    out.push({ tile: { ...e.tile } as Tile, occ: e.occ });
  }
  return out;
}

export function packMoves(moves: readonly Dir[]): string {
  let out = '';
  for (let i = 0; i < moves.length; i += 3) {
    let v = 0;
    for (let j = 0; j < 3; j++) {
      const d = moves[i + j];
      v = v * 4 + (d ? DIRS.indexOf(d) : 0);
    }
    out += ALPHABET[v];
  }
  return out;
}

export function unpackMoves(s: string, count: number): Dir[] | null {
  if (!Number.isInteger(count) || count < 0 || count > MAX_REPLAY_MOVES) return null;
  if (s.length !== Math.ceil(count / 3)) return null;
  const out: Dir[] = [];
  for (let i = 0; i < s.length; i++) {
    const v = ALPHABET.indexOf(s[i]);
    if (v < 0) return null;
    const digits = [(v >> 4) & 3, (v >> 2) & 3, v & 3];
    for (let j = 0; j < 3; j++) {
      if (out.length < count) out.push(DIRS[digits[j]]);
      else if (digits[j] !== 0) return null; // padding must be zero
    }
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Trim, drop control characters, collapse spaces, cap length. */
export function cleanName(raw: string): string {
  const noControl = [...raw.replace(/[\t\n\r\f\v]/g, ' ')].filter((ch) => {
    const c = ch.codePointAt(0)!;
    return c >= 0x20 && !(c >= 0x7f && c <= 0x9f) && c !== 0x2028 && c !== 0x2029;
  });
  const collapsed = noControl.join('').replace(/\s+/g, ' ').trim();
  return [...collapsed].slice(0, MAX_NAME_CHARS).join('').trim();
}

export function encodeName(name: string): string {
  return toBase64Url(new TextEncoder().encode(cleanName(name)));
}

export function decodeName(s: string): string | null {
  if (s.length > MAX_NAME_ENCODED) return null;
  const bytes = fromBase64Url(s);
  if (!bytes) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if ([...text].length > MAX_NAME_CHARS) return null;
    return cleanName(text);
  } catch {
    return null;
  }
}

export interface Challenge {
  board: Board;
  moves: Dir[];
  name: string;
}

export function encodeChallenge(c: Challenge): string {
  const parts = [String(CHALLENGE_VERSION), encodeBoard(c.board), String(c.moves.length), packMoves(c.moves)];
  const name = cleanName(c.name);
  if (name) parts.push(encodeName(name));
  return 'ch=' + parts.join('.');
}

export type ChallengeError =
  | 'too-long'
  | 'not-challenge'
  | 'bad-format'
  | 'bad-version'
  | 'bad-board'
  | 'bad-counts'
  | 'bad-replay'
  | 'replay-failed';

export type DecodeResult =
  | { ok: true; challenge: Challenge; level: Level }
  | { ok: false; error: ChallengeError };

/** Is this hash meant to be a challenge at all? (Cheap check, no validation.) */
export function looksLikeChallenge(hash: string): boolean {
  return hash.replace(/^#/, '').startsWith('ch=');
}

/** Decode, validate and replay-verify a challenge hash. Never throws. */
export function decodeChallenge(rawHash: string): DecodeResult {
  try {
    if (typeof rawHash !== 'string') return { ok: false, error: 'bad-format' };
    if (rawHash.length > MAX_HASH_LENGTH) return { ok: false, error: 'too-long' };
    const hash = rawHash.replace(/^#/, '');
    if (!hash.startsWith('ch=')) return { ok: false, error: 'not-challenge' };
    const parts = hash.slice(3).split('.');
    if (parts.length < 4 || parts.length > 5) return { ok: false, error: 'bad-format' };
    const [ver, boardStr, countStr, replayStr, nameStr] = parts;
    if (!/^\d{1,3}$/.test(ver)) return { ok: false, error: 'bad-format' };
    if (Number(ver) !== CHALLENGE_VERSION) return { ok: false, error: 'bad-version' };

    const board = decodeBoard(boardStr);
    if (!board) return { ok: false, error: 'bad-board' };
    if (boardIssues(board).length) return { ok: false, error: 'bad-counts' };
    const level = boardToLevel(board)!;

    if (!/^\d{1,4}$/.test(countStr)) return { ok: false, error: 'bad-replay' };
    const count = Number(countStr);
    if (count < 1 || count > MAX_REPLAY_MOVES) return { ok: false, error: 'bad-replay' };
    const moves = unpackMoves(replayStr, count);
    if (!moves) return { ok: false, error: 'bad-replay' };

    let name = '';
    if (nameStr !== undefined) {
      const n = decodeName(nameStr);
      if (n === null) return { ok: false, error: 'bad-format' };
      name = n;
    }

    if (!replay(level, moves).ok) return { ok: false, error: 'replay-failed' };
    return { ok: true, challenge: { board, moves, name }, level };
  } catch {
    return { ok: false, error: 'bad-format' };
  }
}

import { decodeBoard, encodeBoard, packMoves, unpackMoves, cleanName, MAX_REPLAY_MOVES } from './core/codec';
import type { Board, Dir } from './core/types';

/*
 * Versioned local persistence. Each document lives under its own key so a
 * corrupted save can't take the others down. If localStorage is missing or
 * throws (private mode, disabled cookies, quota), everything keeps working
 * in memory for the session and the UI shows a short notice.
 */

const PREFIX = 'trap-architect.';
const SCHEMA = 1;

const memory = new Map<string, string>();
let available = (() => {
  try {
    const k = PREFIX + '__probe';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
})();

export const storageAvailable = (): boolean => available;

function readRaw(key: string): string | null {
  if (available) {
    try {
      return window.localStorage.getItem(PREFIX + key);
    } catch {
      available = false;
    }
  }
  return memory.get(key) ?? null;
}

function writeRaw(key: string, value: string): void {
  memory.set(key, value);
  if (!available) return;
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    available = false;
  }
}

function removeRaw(key: string): void {
  memory.delete(key);
  if (!available) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    available = false;
  }
}

function load<T>(key: string, validate: (data: unknown) => T | null, fallback: () => T): T {
  const raw = readRaw(key);
  if (raw === null || raw.length > 200_000) return fallback();
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; data?: unknown };
    if (!parsed || typeof parsed !== 'object' || parsed.v !== SCHEMA) return fallback();
    return validate(parsed.data) ?? fallback();
  } catch {
    return fallback();
  }
}

function save(key: string, data: unknown): void {
  writeRaw(key, JSON.stringify({ v: SCHEMA, data }));
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 1e7;
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e9;

/* ---------------- Settings ---------------- */

export type MotionPref = 'system' | 'reduced' | 'full';
export interface Settings {
  sound: boolean;
  motion: MotionPref;
  /** First-play guidance has been dismissed. */
  seenGuide: boolean;
}

const defaultSettings = (): Settings => ({ sound: false, motion: 'system', seenGuide: false });

export function loadSettings(): Settings {
  return load(
    'settings',
    (d) => {
      if (!isObj(d)) return null;
      const s = defaultSettings();
      if (typeof d.sound === 'boolean') s.sound = d.sound;
      if (d.motion === 'system' || d.motion === 'reduced' || d.motion === 'full') s.motion = d.motion;
      if (typeof d.seenGuide === 'boolean') s.seenGuide = d.seenGuide;
      return s;
    },
    defaultSettings,
  );
}

export const saveSettings = (s: Settings): void => save('settings', s);

/* ---------------- Progress ---------------- */

export interface Record_ {
  bestMoves: number;
  /** Active milliseconds of the best-moves run (personal info only). */
  bestTime: number;
}

export interface Progress {
  /** Highest unlocked level index (0-based). */
  unlocked: number;
  levels: Record<string, Record_>;
}

const defaultProgress = (): Progress => ({ unlocked: 0, levels: {} });

function validRecord(r: unknown): Record_ | null {
  if (!isObj(r) || !isCount(r.bestMoves) || r.bestMoves < 1 || !isTime(r.bestTime)) return null;
  return { bestMoves: r.bestMoves, bestTime: r.bestTime };
}

export function loadProgress(levelCount: number): Progress {
  return load(
    'progress',
    (d) => {
      if (!isObj(d)) return null;
      const p = defaultProgress();
      if (isCount(d.unlocked)) p.unlocked = Math.min(d.unlocked, levelCount - 1);
      if (isObj(d.levels)) {
        for (const [id, r] of Object.entries(d.levels)) {
          if (!/^l\d{2}$/.test(id)) continue;
          const v = validRecord(r);
          if (v) p.levels[id] = v;
        }
      }
      return p;
    },
    defaultProgress,
  );
}

export const saveProgress = (p: Progress): void => save('progress', p);

/** Update a record. Fewer moves wins; equal moves keep the faster time. */
export function better(prev: Record_ | undefined, moves: number, time: number): Record_ {
  if (!prev || moves < prev.bestMoves) return { bestMoves: moves, bestTime: time };
  if (moves === prev.bestMoves && time < prev.bestTime) return { bestMoves: moves, bestTime: time };
  return prev;
}

/* ---------------- Editor draft ---------------- */

export interface Draft {
  board: Board;
  name: string;
  /** Creator's verified solution; null until they solve the current layout. */
  solution: Dir[] | null;
}

export function loadDraft(): Draft | null {
  return load<Draft | null>(
    'draft',
    (d) => {
      if (!isObj(d) || typeof d.board !== 'string') return null;
      const board = decodeBoard(d.board);
      if (!board) return null;
      const name = typeof d.name === 'string' ? cleanName(d.name) : '';
      let solution: Dir[] | null = null;
      if (typeof d.solution === 'string' && isCount(d.count) && d.count <= MAX_REPLAY_MOVES) {
        solution = unpackMoves(d.solution, d.count);
      }
      return { board, name, solution };
    },
    () => null,
  );
}

export function saveDraft(d: Draft): void {
  save('draft', {
    board: encodeBoard(d.board),
    name: d.name,
    solution: d.solution ? packMoves(d.solution) : null,
    count: d.solution ? d.solution.length : 0,
  });
}

/* ---------------- Challenge personal bests ---------------- */

const MAX_CHALLENGE_RECORDS = 40;

type ChallengeBook = Record<string, Record_ & { at: number }>;

function loadBook(): ChallengeBook {
  return load(
    'challenges',
    (d) => {
      if (!isObj(d)) return null;
      const out: ChallengeBook = {};
      for (const [k, r] of Object.entries(d)) {
        if (!/^[A-Za-z0-9_-]{64}$/.test(k) || !isObj(r)) continue;
        const v = validRecord(r);
        const at = r.at;
        if (v && typeof at === 'number' && Number.isFinite(at) && at >= 0) out[k] = { ...v, at };
      }
      return out;
    },
    () => ({}),
  );
}

export function challengeBest(boardKey: string): Record_ | undefined {
  return loadBook()[boardKey];
}

export function recordChallenge(boardKey: string, moves: number, time: number): Record_ {
  const book = loadBook();
  const next = better(book[boardKey], moves, time);
  book[boardKey] = { ...next, at: Date.now() };
  const keys = Object.keys(book).sort((a, b) => book[b].at - book[a].at);
  for (const k of keys.slice(MAX_CHALLENGE_RECORDS)) delete book[k];
  save('challenges', book);
  return next;
}

export function resetAll(): void {
  for (const k of ['settings', 'progress', 'draft', 'challenges']) removeRaw(k);
}

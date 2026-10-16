import { describe, expect, it } from 'vitest';
import { boardIssues, boardToLevel, parseAscii } from '../src/core/board';
import { Session } from '../src/core/session';
import { initialState, replay, step } from '../src/core/sim';
import { idx, type Dir, type Level } from '../src/core/types';

/** Build a level from 8 rows; pads short rows/missing rows with walls. */
function lv(...rows: string[]): Level {
  const full = [...rows, ...Array(8 - rows.length).fill('########')].map((r) => r.padEnd(8, '#'));
  const level = boardToLevel(parseAscii(full));
  if (!level) throw new Error('invalid test level: ' + boardIssues(parseAscii(full)).join(','));
  return level;
}

const moves = (s: string) => [...s] as Dir[];

function run(level: Level, path: string) {
  let s = initialState(level);
  const outcomes: string[] = [];
  for (const d of moves(path)) {
    const r = step(level, s, d);
    outcomes.push(r.outcome);
    s = r.state;
  }
  return { s, outcomes };
}

describe('movement', () => {
  it('moves into empty cells and counts each move', () => {
    const level = lv('@...E...');
    const { s, outcomes } = run(level, 'RR');
    expect(outcomes).toEqual(['moved', 'moved']);
    expect(s.player).toBe(idx(2, 0));
    expect(s.moves).toBe(2);
    expect(s.path).toEqual(['R', 'R']);
  });

  it('blocks walls, the board edge, emitters and closed doors without counting', () => {
    const level = lv('@#....E.', '.A......', '>......a');
    // Edge (up/left), wall (right), closed door (down from (0,1) is emitter... check separately)
    const { s, outcomes } = run(level, 'ULR');
    expect(outcomes).toEqual(['blocked', 'blocked', 'blocked']);
    expect(s.moves).toBe(0);
    expect(s.path).toEqual([]);
    // Step down to (0,1); door at (1,1) is closed; emitter at (0,2) is solid.
    const r = run(level, 'DRD');
    expect(r.outcomes).toEqual(['moved', 'blocked', 'blocked']);
    expect(r.s.moves).toBe(1);
  });

  it('rejects moves after the room is won', () => {
    const level = lv('@E......');
    const { s, outcomes } = run(level, 'RL');
    expect(outcomes).toEqual(['moved', 'over']);
    expect(s.status).toBe('won');
    expect(s.moves).toBe(1);
  });
});

describe('crate pushing', () => {
  it('pushes one crate one cell and counts one move', () => {
    const level = lv('@o....E.');
    const { s, outcomes } = run(level, 'R');
    expect(outcomes).toEqual(['pushed']);
    expect(s.crates).toEqual([idx(2, 0)]);
    expect(s.player).toBe(idx(1, 0));
    expect(s.moves).toBe(1);
  });

  it('cannot push two crates, or a crate into a wall, edge or closed door', () => {
    expect(run(lv('@oo...E.'), 'R').outcomes).toEqual(['blocked']);
    expect(run(lv('@o#...E.'), 'R').outcomes).toEqual(['blocked']);
    expect(run(lv('E.....@o'), 'R').outcomes).toEqual(['blocked']); // board edge
    expect(run(lv('@oA...Ea'), 'R').outcomes).toEqual(['blocked']);
    expect(run(lv('@o>...E.'), 'R').outcomes).toEqual(['blocked']);
  });

  it('keeps crate identities stable', () => {
    const level = lv('@o.o..E.', '........');
    const { s } = run(level, 'R');
    expect(s.crates).toEqual([idx(2, 0), idx(3, 0)]);
  });
});

describe('plates and doors', () => {
  it('opens a matching door while the plate is held, closes when released', () => {
    //         player on (0,0); plate a at (1,0); door A at (2,1)
    const level = lv('@a......', '..A....E');
    let s = initialState(level);
    expect(s.doors[idx(2, 1)]).toBe(false);
    s = step(level, s, 'R').state; // onto plate
    expect(s.plates[idx(1, 0)]).toBe(true);
    expect(s.doors[idx(2, 1)]).toBe(true);
    s = step(level, s, 'R').state; // off the plate
    expect(s.plates[idx(1, 0)]).toBe(false);
    expect(s.doors[idx(2, 1)]).toBe(false);
  });

  it('only opens doors of the same group', () => {
    const level = lv('@a......', '..B...bE');
    const s = step(level, initialState(level), 'R').state;
    expect(s.doors[idx(2, 1)]).toBe(false);
  });

  it('any plate of the group opens the door', () => {
    const level = lv('@.a....a', '...A...E');
    let s = initialState(level);
    s = step(level, s, 'R').state;
    s = step(level, s, 'R').state;
    expect(s.doors[idx(3, 1)]).toBe(true);
  });

  it('a crate holds a plate down', () => {
    const level = lv('@oa.....', '....A..E');
    const s = step(level, initialState(level), 'R').state;
    expect(s.plates[idx(2, 0)]).toBe(true);
    expect(s.doors[idx(4, 1)]).toBe(true);
  });

  it('a door stays open while occupied and closes after the occupant leaves', () => {
    // Plate a at (1,0) directly above door A at (1,1).
    const level = lv('@a......', '#A######', '#......E');
    let s = initialState(level);
    s = step(level, s, 'R').state; // on plate, door opens
    expect(s.doors[idx(1, 1)]).toBe(true);
    s = step(level, s, 'D').state; // into the doorway; plate released
    expect(s.player).toBe(idx(1, 1));
    expect(s.plates[idx(1, 0)]).toBe(false);
    expect(s.doors[idx(1, 1)]).toBe(true); // held open by the occupant
    s = step(level, s, 'D').state; // leave
    expect(s.doors[idx(1, 1)]).toBe(false);
  });

  it('a crate jammed in a doorway keeps it open', () => {
    // Player on plate pushes the crate into the door.
    const level = lv('.ao A..E'.replace(' ', ''), '@.......');
    // Layout: (1,0)=plate a, (2,0)=crate, (3,0)=door A
    let s = initialState(level);
    s = step(level, s, 'U').state; // (0,0)
    s = step(level, s, 'R').state; // onto plate, door opens
    const r = step(level, s, 'R'); // push crate into open door
    expect(r.outcome).toBe('pushed');
    s = r.state;
    expect(s.crates).toEqual([idx(3, 0)]);
    expect(s.plates[idx(1, 0)]).toBe(false);
    expect(s.doors[idx(3, 0)]).toBe(true);
  });
});

describe('lasers', () => {
  it('rays stop at walls, closed doors, crates and other emitters', () => {
    const wall = initialState(lv('>..#....', '@......E'));
    expect(wall.beams[0].cells).toEqual([idx(1, 0), idx(2, 0)]);
    expect(wall.beams[0].stop).toBe(idx(3, 0));

    const door = initialState(lv('>.A....a', '@......E'));
    expect(door.beams[0].cells).toEqual([idx(1, 0)]);

    const crate = initialState(lv('>.o.....', '@......E'));
    expect(crate.beams[0].cells).toEqual([idx(1, 0)]);
    expect(crate.crates).toEqual([idx(2, 0)]); // crate not destroyed

    const emitters = initialState(lv('>...<...', '@......E'));
    expect(emitters.beams[0].cells).toEqual([idx(1, 0), idx(2, 0), idx(3, 0)]);
    expect(emitters.beams[1].cells).toEqual([idx(3, 0), idx(2, 0), idx(1, 0)]);
    expect(emitters.beams[1].stop).toBe(idx(0, 0));

    const edge = initialState(lv('>.......', '@......E'));
    expect(edge.beams[0].cells.length).toBe(7);
    expect(edge.beams[0].stop).toBe(-1);
  });

  it('passes through open doors and plates', () => {
    const level = lv('>.A.b...', '@a.....E');
    let s = initialState(level);
    expect(s.beams[0].cells).toEqual([idx(1, 0)]); // door closed
    s = step(level, s, 'R').state; // press plate a: door opens
    expect(s.doors[idx(2, 0)]).toBe(true);
    expect(s.beams[0].cells.length).toBe(7); // through the open door and over plate b
    expect(s.beams[0].stop).toBe(-1);
  });

  it('kills the player who steps into a beam; lost state blocks further moves', () => {
    const level = lv('@......E', '.......<');
    const r = step(level, initialState(level), 'D');
    expect(r.outcome).toBe('moved');
    expect(r.state.status).toBe('lost');
    expect(r.state.moves).toBe(1);
    expect(step(level, r.state, 'R').outcome).toBe('over');
  });

  it('opening a door can release a beam onto the player', () => {
    // Door A at (1,0) shields the emitter until plate a at (2,1) is pressed.
    const level = lv('>A...E..', '@oa.....');
    let s = initialState(level);
    expect(s.laser[idx(3, 0)]).toBe(false);
    s = step(level, s, 'R').state; // crate onto plate: door opens, beam fills row 0
    expect(s.status).toBe('playing');
    expect(s.laser[idx(3, 0)]).toBe(true);
    s = step(level, s, 'U').state; // into the open doorway, which is in the beam
    expect(s.status).toBe('lost');
  });

  it('stepping off a plate closes its door and cuts the beam again', () => {
    const level = lv('>A...E..', '..a.....', '@.......');
    let s = initialState(level);
    for (const d of moves('URR')) s = step(level, s, d).state; // onto plate a at (2,1)
    expect(s.laser[idx(2, 0)]).toBe(true);
    s = step(level, s, 'U').state; // leaving the plate closes the door before lasers update
    expect(s.status).toBe('playing');
    expect(s.laser[idx(2, 0)]).toBe(false);
  });

  it('a crate pushed into the beam shields cells behind it', () => {
    const level = lv('.@......', '.o......', '>......E');
    let s = initialState(level);
    s = step(level, s, 'D').state; // push crate into beam row
    expect(s.crates).toEqual([idx(1, 2)]);
    expect(s.laser[idx(2, 2)]).toBe(false);
    expect(s.laser[idx(0, 2)]).toBe(false); // emitter cell itself
  });

  it('reaching the exit inside a beam is a loss, not a win', () => {
    const level = lv('@E......', '.^......');
    const s = step(level, initialState(level), 'R').state;
    expect(s.status).toBe('lost');
  });

  it('flags a board where the player starts in a beam', () => {
    expect(boardIssues(parseAscii(['>@....E.', ...Array(7).fill('........')]))).toContain('start-in-laser');
  });
});

describe('undo', () => {
  it('restores the complete previous state and counts undos separately', () => {
    const level = lv('@oa.....', '....A..E');
    const session = new Session(level);
    const before = session.state;
    session.move('R');
    expect(session.state.doors[idx(4, 1)]).toBe(true);
    session.undo();
    expect(session.state).toEqual(before);
    expect(session.state.moves).toBe(0);
    expect(session.state.doors[idx(4, 1)]).toBe(false);
    expect(session.undoCount).toBe(1);
  });

  it('undoes out of a lost state', () => {
    const level = lv('@......E', '.......<');
    const session = new Session(level);
    session.move('D');
    expect(session.state.status).toBe('lost');
    session.undo();
    expect(session.state.status).toBe('playing');
    expect(session.state.moves).toBe(0);
  });

  it('blocked moves add no history; undo with no history does nothing', () => {
    const session = new Session(lv('@#....E.'));
    session.move('R');
    expect(session.canUndo()).toBe(false);
    expect(session.undo()).toBeNull();
    expect(session.undoCount).toBe(0);
  });

  it('final path after undos matches the move count and replays', () => {
    const level = lv('@......E');
    const session = new Session(level);
    for (const d of moves('RRDURRLRRR')) session.move(d);
    // D is blocked (row 1 walls); U blocked (edge). Undo the stray L/R pair.
    expect(session.state.status).toBe('playing');
    while (session.state.path.length && session.state.path[session.state.path.length - 1] !== 'L') session.undo();
    session.undo(); // remove the L
    for (const d of moves('RRRR')) session.move(d);
    expect(session.state.status).toBe('won');
    expect(session.state.path.length).toBe(session.state.moves);
    expect(replay(level, session.state.path).ok).toBe(true);
  });

  it('restart resets state, history and undo count', () => {
    const session = new Session(lv('@......E'));
    session.move('R');
    session.undo();
    session.move('R');
    session.restart();
    expect(session.state.moves).toBe(0);
    expect(session.undoCount).toBe(0);
    expect(session.canUndo()).toBe(false);
  });
});

describe('replay', () => {
  const level = lv('@..E....');
  it('accepts a winning sequence', () => {
    expect(replay(level, moves('RRR')).ok).toBe(true);
  });
  it('rejects blocked moves, extra moves after a win, unfinished paths and deaths', () => {
    expect(replay(level, moves('URRR')).reason).toBe('blocked');
    expect(replay(level, moves('RRRR')).reason).toBe('ended-early');
    expect(replay(level, moves('RR')).reason).toBe('not-won');
    const deadly = lv('@......E', '.......<');
    expect(replay(deadly, moves('D')).reason).toBe('lost');
  });
});

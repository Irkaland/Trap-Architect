# Trap Architect

A turn-based 2D puzzle game for the browser. Solve 12 handcrafted rooms, build your own trap room, prove it can be solved, and send friends a link that challenges them to beat your move count.

No install, no account, no backend. Everything runs in the browser and saves to `localStorage`.

Built with TypeScript, Phaser 3 and Vite.

## Run it

Requires Node.js 18+ (tested with Node 24).

```bash
git clone https://github.com/Irkaland/Trap-Architect.git
cd Trap-Architect
npm ci
```

`npm ci` installs the exact versions from `package-lock.json`. Use `npm install` if you want to change dependencies.

```bash
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and build a static site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Run the test suite (Vitest) |
| `npm run solve` | Print the shortest solution of every built-in room (authoring helper) |

### Production build

```bash
npm test
```

```bash
npm run build
```

The build type-checks the code and writes a static site to `dist/`. Check it locally with `npm run preview` (default http://localhost:4173). `dist/` and `node_modules/` are not committed.

## Hosting and sharing

`npm run build` produces a fully static site in `dist/`. It uses relative paths, so you can host it at a domain root or in a sub-folder. Any static host works:

- **GitHub Pages:** push `dist/` to a `gh-pages` branch, or use a Pages workflow that runs `npm ci && npm run build` and uploads `dist/`.
- **Netlify / Cloudflare Pages / Vercel:** build command `npm run build`, output directory `dist`.
- **itch.io:** zip the *contents* of `dist/` and upload it as an HTML game.

Challenge links look like `https://your-site/#ch=1.<board>.<moves>.<replay>.<name>`. They only work for friends once the game is on a public URL. A link made on `localhost` points to your own computer; the share dialog says so when that happens.

Nothing is sent to a server. The whole challenge lives in the part of the URL after `#`, which browsers don't send to the host.

## How to play

Reach the exit in as few moves as you can.

| Piece | Behaviour |
| --- | --- |
| **You** | Move one cell per turn. |
| **Crate** | Walk into it to push it. You can't push two in a row. |
| **Wall** | Blocks you, crates and lasers. |
| **Plate** (●▲■) | Pressed while you or a crate stand on it. |
| **Door** (●▲■) | Open while any plate with the same symbol is pressed. A door never closes on something standing in it; it closes once the doorway is empty. |
| **Laser** | Fires one way. The beam stops at walls, closed doors, crates, other lasers and the board edge. |
| **Exit** | Reach it without being in a beam. |

After every successful move, plates update first, then doors, then lasers. If you're in a beam after that, you're zapped. Undo is free. Blocked moves never count.

### Controls

- **Keyboard:** Arrow keys or WASD to move, `Z` to undo, `R` to restart (press twice if you've made progress), `Esc` to pause or open help.
- **Touch:** swipe the board or use the large arrow buttons. Undo and Restart have their own large buttons.
- **Builder:** pick a tool and tap or drag on the board. Keyboard users can focus the board, move the cursor with the arrows, place with Space or Enter, and pick tools with `1`–`8`. `Z` undoes an edit.

## Game modes

- **Play:** 12 rooms that teach one idea at a time: movement, crates, plates and doors, crates holding plates, lasers, crates as shields, then combinations. Each room has a *target*: the length of a shortest solution found by exhaustive breadth-first search over the real simulation. Rooms unlock in order. Personal bests are saved locally.
- **Build:** an 8×8 editor with walls, crates, plates/doors in three matching symbol groups, rotatable lasers, one player and one exit. **Test** plays a snapshot of your room. **Back to editor** returns to the unchanged layout. Solving the room verifies it and unlocks sharing. Any later edit clears the verification.
- **Challenge a friend:** the link carries your board and your final move sequence (undone moves removed, so its length equals your move count). When a friend opens it, their browser decodes it, validates it, and replays your solution in the same simulation before showing the intro. After they win they see one of: "You beat the benchmark.", "You matched the benchmark." or "Room solved — try fewer moves.", and they can share a text result.

## Project layout

```
src/
  core/        Deterministic rules. No DOM, no Phaser.
    types.ts     Grid, tiles, game state
    sim.ts       Movement, pushing, plates → doors → lasers, win/lose, replay
    session.ts   Full-state undo history and restart
    board.ts     Board validation and the ASCII level format
    editing.ts   Editor tool rules (one player, one exit, rotate lasers…)
    codec.ts     Versioned challenge-link encoding with defensive parsing
    solver.ts    BFS solver (tests and authoring only, not shipped as hints)
  levels/      The 12 built-in rooms, each with a verified solution and target
  render/      Phaser board renderer (procedural graphics, no image assets)
  ui/          HTML screens, HUD, editor, dialogs, sharing, sound, timer
  strings.ts   All visible UI copy in one place, ready for translation
  storage.ts   Versioned localStorage with in-memory fallback
tests/         Vitest suites
scripts/       Level-authoring helper
```

The renderer only draws what the simulation returns. Gameplay, editor validation, solution tests and link verification all call the same `step()` function.

## Reliability notes

- **Challenge links:** limited to 1024 characters and 999 replay moves. The parser checks the schema version, the board length and every cell code, requires exactly one player and one exit, rejects a player who starts in a beam, checks the replay padding and name encoding, and requires the replay to win exactly on its last move. Bad links show a recovery screen. Room names are only ever shown with `textContent`.
- **Saves:** each document (settings, progress, builder draft, challenge bests) is stored under its own key with a schema version. Corrupt or outdated data falls back to defaults field by field. If `localStorage` is unavailable, the game runs from memory and says so.
- **Accessibility:** controls are real buttons with accessible names and visible focus rings. Modals use native `<dialog>`. Moves and editor cursor changes are announced through a polite live region. Plates and doors use symbols as well as colour. Laser beams carry chevrons, not just a colour. Reduced motion follows the system setting and can be overridden in Settings. Sound is off by default. Keyboard shortcuts are ignored while you type in a text field or a dialog is open.

## Limitations

- **Not anti-cheat.** Replay verification proves that the creator's sequence solves the room in that many moves. It doesn't prove a human played it, and anyone can craft a valid link by hand. There is no global leaderboard.
- **Time is personal info only.** It counts active play (paused and hidden-tab time are excluded), and it is never verified or shared as a score.
- **One builder draft** is kept per browser. Sharing a room and then editing it doesn't break links you already sent, because each link contains its own copy of the board.
- **Targets are BFS minimums** for the move rules above. The game still labels them "Target", not "optimal".
- **The Phaser bundle is about 340 kB gzipped,** most of the download.

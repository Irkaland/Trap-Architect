import { boardToLevel, boardsEqual, cloneBoard } from '../core/board';
import { decodeChallenge, encodeBoard, looksLikeChallenge, type Challenge } from '../core/codec';
import type { Board, Level } from '../core/types';
import { LEVEL_DEFS, levelOf } from '../levels/levels';
import { BoardView } from '../render/BoardView';
import {
  better,
  challengeBest,
  loadDraft,
  loadProgress,
  loadSettings,
  recordChallenge,
  resetAll,
  saveDraft,
  saveProgress,
  saveSettings,
  storageAvailable,
  type Draft,
  type Progress,
  type Settings,
} from '../storage';
import { S } from '../strings';
import { confirmDialog, dialogOpen } from './dialog';
import { btn, formatTime, h, icon, isTextInput } from './dom';
import { starterBoard } from '../core/editing';
import { EditorScreen } from './editor';
import { GameScreen, type WinContext } from './game';
import { I } from './icons';
import { openHelp, openSettings, openShareDialog } from './panels';
import { canNativeShare, copyText, linkFor, nativeShare } from './share';
import { setSoundEnabled } from './sound';

export interface Screen {
  el: HTMLElement;
  mount?(): void;
  destroy?(): void;
  onKey?(e: KeyboardEvent): boolean;
}

const MAX_EDIT_HISTORY = 100;

export class App {
  readonly view: BoardView;
  settings: Settings;
  progress: Progress;
  draft: Draft;
  private current: Screen | null = null;
  private editHistory: Board[] = [];
  private readonly levels: Level[];

  constructor(private readonly root: HTMLElement) {
    this.settings = loadSettings();
    this.progress = loadProgress(LEVEL_DEFS.length);
    this.draft = loadDraft() ?? { board: starterBoard(), name: '', solution: null };
    this.levels = LEVEL_DEFS.map(levelOf);
    this.view = new BoardView();
    this.applySettings();
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => this.applySettings());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('hashchange', () => {
      if (looksLikeChallenge(location.hash)) this.openChallengeFromHash();
    });
  }

  start(): void {
    if (looksLikeChallenge(location.hash)) this.openChallengeFromHash();
    else this.goTitle();
  }

  /* ---------------- plumbing ---------------- */

  get reducedMotion(): boolean {
    const m = this.settings.motion;
    if (m === 'reduced') return true;
    if (m === 'full') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private applySettings(): void {
    const html = document.documentElement;
    html.classList.toggle('motion-reduced', this.settings.motion === 'reduced');
    html.classList.toggle('motion-full', this.settings.motion === 'full');
    this.view.reducedMotion = this.reducedMotion;
    setSoundEnabled(this.settings.sound);
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.applySettings();
  }

  openSettings(): void {
    openSettings(this.settings, (p) => this.updateSettings(p), () => {
      resetAll();
      this.settings = loadSettings();
      this.progress = loadProgress(LEVEL_DEFS.length);
      this.draft = { board: starterBoard(), name: '', solution: null };
      this.editHistory = [];
      this.applySettings();
      this.goTitle();
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (dialogOpen() || isTextInput(e.target)) return;
    if (this.current?.onKey?.(e)) e.preventDefault();
  }

  private show(screen: Screen): void {
    this.current?.destroy?.();
    this.current = screen;
    this.root.replaceChildren(screen.el);
    screen.mount?.();
    window.scrollTo(0, 0);
    // Move focus to the screen heading so screen readers announce the change.
    screen.el.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  private clearHash(): void {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  /* ---------------- draft / editor state ---------------- */

  setDraftBoard(board: Board): void {
    const changed = !boardsEqual(board, this.draft.board);
    this.draft = { ...this.draft, board, solution: changed ? null : this.draft.solution };
    saveDraft(this.draft);
  }

  setDraftName(name: string): void {
    this.draft = { ...this.draft, name };
    saveDraft(this.draft);
  }

  pushEditHistory(): void {
    this.editHistory.push(cloneBoard(this.draft.board));
    if (this.editHistory.length > MAX_EDIT_HISTORY) this.editHistory.shift();
  }

  popEditHistory(): boolean {
    const b = this.editHistory.pop();
    if (!b) return false;
    this.setDraftBoard(b);
    return true;
  }

  canUndoEdit(): boolean {
    return this.editHistory.length > 0;
  }

  /* ---------------- screens ---------------- */

  goTitle(): void {
    this.clearHash();
    const unlocked = Math.min(this.progress.unlocked, LEVEL_DEFS.length - 1);
    const firstOpen = LEVEL_DEFS.findIndex((d, i) => i <= unlocked && !this.progress.levels[d.id]);
    const next = firstOpen >= 0 ? firstOpen : unlocked;
    const anyProgress = Object.keys(this.progress.levels).length > 0;
    const el = h(
      'section',
      { class: 'screen title-screen', 'aria-label': S.appName },
      h('div', { class: 'logo' }, icon(LOGO), h('h1', { tabindex: '-1' }, S.appName), h('p', {}, S.tagline)),
      h(
        'div',
        { class: 'menu' },
        btn(anyProgress ? S.continueAt(next + 1) : S.play, () => this.playLevel(next), { cls: 'primary big', icon: I.play }),
        btn(S.levels, () => this.goLevels(), { cls: 'big' }),
        btn(S.build, () => this.goEditor(), { cls: 'big', icon: I.build }),
        h('div', { class: 'row' }, btn(S.help, () => openHelp(), { icon: I.help }), btn(S.settings, () => this.openSettings(), { icon: I.gear })),
      ),
      storageAvailable() ? null : h('p', { class: 'notice' }, S.storageOff),
      h('p', { class: 'footnote' }, 'No account, no ads. Progress stays in this browser.'),
    );
    this.show({ el });
  }

  goLevels(): void {
    this.clearHash();
    const solved = LEVEL_DEFS.filter((d) => this.progress.levels[d.id]).length;
    const grid = h('div', { class: 'level-grid' });
    LEVEL_DEFS.forEach((d, i) => {
      const rec = this.progress.levels[d.id];
      const locked = i > this.progress.unlocked;
      const starred = !!rec && rec.bestMoves <= d.target;
      const state = locked ? S.locked : rec ? `${S.solvedIn(rec.bestMoves, d.target)}${starred ? `. ${S.targetMet}` : ''}` : S.notSolved;
      const meta = h('span', { class: 'meta' });
      if (locked) meta.append(icon(I.lock), S.locked);
      else if (rec) {
        if (starred) meta.append(icon(I.star));
        meta.append(`${rec.bestMoves} / ${d.target}`);
      } else meta.append(`${S.target} ${d.target}`);
      const card = h(
        'button',
        {
          type: 'button',
          class: `level-card${rec ? ' solved' : ''}${starred ? ' starred' : ''}`,
          'aria-label': S.levelLabel(i + 1, d.name, state),
          disabled: locked,
        },
        h('span', { class: 'num' }, S.roomN(i + 1)),
        h('span', { class: 'name' }, d.name),
        meta,
      );
      card.addEventListener('click', () => this.playLevel(i));
      grid.append(card);
    });
    const el = h(
      'section',
      { class: 'screen', 'aria-label': S.levelsTitle },
      h(
        'header',
        { class: 'topbar' },
        btn(S.menu, () => this.goTitle(), { icon: I.back, iconOnly: true }),
        h('div', { class: 'title' }, h('h1', { tabindex: '-1' }, S.levelsTitle), h('div', { class: 'sub' }, `${solved} / ${LEVEL_DEFS.length}`)),
        h('span', { style: 'width:46px' }),
      ),
      grid,
    );
    this.show({ el });
  }

  playLevel(index: number): void {
    this.clearHash();
    const i = Math.max(0, Math.min(index, LEVEL_DEFS.length - 1, this.progress.unlocked));
    const def = LEVEL_DEFS[i];
    const screen = new GameScreen(this, {
      level: this.levels[i],
      title: def.name,
      subtitle: `${S.roomN(i + 1)} / ${LEVEL_DEFS.length}`,
      hint: def.hint,
      goalLabel: S.target,
      goal: () => def.target,
      best: () => this.progress.levels[def.id]?.bestMoves,
      showGuide: i === 0 && !this.settings.seenGuide,
      backLabel: S.levels,
      onBack: () => this.goLevels(),
      onWin: (ctx) => this.levelWon(i, ctx),
    });
    this.show(screen);
  }

  private levelWon(i: number, ctx: WinContext): HTMLElement {
    const def = LEVEL_DEFS[i];
    const prev = this.progress.levels[def.id];
    const rec = better(prev, ctx.moves, ctx.time);
    const newBest = !prev || rec.bestMoves < prev.bestMoves;
    this.progress = {
      unlocked: Math.max(this.progress.unlocked, Math.min(i + 1, LEVEL_DEFS.length - 1)),
      levels: { ...this.progress.levels, [def.id]: rec },
    };
    saveProgress(this.progress);
    const last = i === LEVEL_DEFS.length - 1;
    const hit = ctx.moves <= def.target;
    const actions = h('div', { class: 'actions' });
    if (last) actions.append(btn(S.toBuilder, () => this.goEditor(), { cls: 'primary', icon: I.build }));
    else actions.append(btn(S.nextRoom, () => this.playLevel(i + 1), { cls: 'primary', icon: I.play }));
    actions.append(btn(S.retry, () => ctx.screen.restart(), { icon: I.restart }), btn(S.levels, () => this.goLevels()));
    return h(
      'div',
      { class: 'card', role: 'dialog', 'aria-label': S.winTitle },
      h('h2', {}, S.winTitle),
      GameScreen.resultRow([
        [S.moves, String(ctx.moves)],
        [S.target, String(def.target)],
        [S.best, String(rec.bestMoves)],
      ]),
      h('p', { class: `verdict${hit ? ' good' : ''}` }, hit ? S.winTarget : S.winTryFewer(def.target)),
      newBest && prev ? h('p', { class: 'lead' }, S.winNewBest) : null,
      h('p', { class: 'footnote' }, `${S.time} ${formatTime(ctx.time)} · ${S.undos} ${ctx.undos}`),
      last ? h('p', { class: 'lead' }, S.allDone) : null,
      actions,
    );
  }

  goEditor(): void {
    this.clearHash();
    this.show(new EditorScreen(this));
  }

  testDraft(): void {
    const level = boardToLevel(this.draft.board);
    if (!level) return;
    // Test a snapshot: the editor's draft is never touched by play.
    const snapshot = cloneBoard(this.draft.board);
    const screen = new GameScreen(this, {
      level,
      title: S.testing,
      subtitle: this.draft.name || S.untitledRoom,
      hint: null,
      goalLabel: S.benchmark,
      goal: () => this.draft.solution?.length ?? null,
      best: () => this.draft.solution?.length,
      backLabel: S.backToEditor,
      onBack: () => this.goEditor(),
      onWin: (ctx) => this.testWon(snapshot, ctx),
    });
    this.show(screen);
  }

  private testWon(snapshot: Board, ctx: WinContext): HTMLElement {
    // Only verify if the draft is still exactly the board that was tested.
    let kept = false;
    if (boardsEqual(snapshot, this.draft.board)) {
      const prev = this.draft.solution;
      if (!prev || ctx.path.length <= prev.length) this.draft = { ...this.draft, solution: ctx.path };
      else kept = true;
      saveDraft(this.draft);
    }
    const bench = this.draft.solution?.length ?? ctx.moves;
    return h(
      'div',
      { class: 'card', role: 'dialog', 'aria-label': S.verifiedTitle },
      h('h2', {}, S.verifiedTitle),
      h('p', { class: 'lead' }, kept ? S.verifiedKept(bench) : S.verifiedBody(bench)),
      h('p', { class: 'footnote' }, `${S.moves} ${ctx.moves} · ${S.time} ${formatTime(ctx.time)} · ${S.undos} ${ctx.undos}`),
      h(
        'div',
        { class: 'actions' },
        btn(S.shareChallenge, () => this.shareDraft(), { cls: 'primary', icon: I.share }),
        btn(S.backToEditor, () => this.goEditor(), { icon: I.back }),
        btn(S.retry, () => ctx.screen.restart(), { icon: I.restart }),
      ),
    );
  }

  private shareDraft(): void {
    const d = this.draft;
    if (!d.solution) return;
    openShareDialog(d.board, d.solution, d.name, (n) => this.setDraftName(n));
  }

  /* ---------------- challenges ---------------- */

  openChallengeFromHash(): void {
    const result = decodeChallenge(location.hash);
    if (!result.ok) {
      this.showBadLink(result.error);
      return;
    }
    this.showChallengeIntro(result.challenge, result.level);
  }

  private showBadLink(error: string): void {
    const el = h(
      'section',
      { class: 'screen intro', 'aria-label': S.badLinkTitle },
      h(
        'div',
        { class: 'card', role: 'alert' },
        h('h1', { tabindex: '-1', class: 'room-name' }, S.badLinkTitle),
        h('p', { class: 'lead' }, S.badLinkBody),
        h('p', { class: 'footnote' }, S.badLinkReasons[error] ?? S.badLinkReasons['bad-format']),
        h('div', { class: 'actions' }, btn(S.menu, () => this.goTitle(), { cls: 'primary' }), btn(S.build, () => this.goEditor(), { icon: I.build })),
      ),
    );
    this.show({ el });
  }

  private showChallengeIntro(ch: Challenge, level: Level): void {
    const key = encodeBoard(ch.board);
    const best = challengeBest(key);
    const name = ch.name || S.untitledRoom;
    const link = linkFor(location.hash.replace(/^#/, ''));
    const status = h('p', { class: 'footnote', role: 'status', 'aria-live': 'polite' });
    const el = h(
      'section',
      { class: 'screen intro', 'aria-label': S.challengeTitle },
      h(
        'div',
        { class: 'card' },
        h('p', { class: 'lead' }, S.challengeTitle),
        h('h1', { class: 'room-name', tabindex: '-1' }, name),
        h('div', { class: 'bench' }, h('span', { class: 'n' }, String(ch.moves.length)), h('span', { class: 'u' }, S.moves.toLowerCase())),
        h('p', {}, S.creatorBench(ch.moves.length)),
        h('div', { class: 'check' }, icon(I.check), h('span', {}, S.replayVerified)),
        h('p', { class: 'footnote' }, S.replayHonesty),
        best ? h('p', { class: 'verdict' }, S.yourBest(best.bestMoves)) : null,
        h(
          'div',
          { class: 'actions' },
          btn(S.accept, () => this.playChallenge(ch, level, key, link), { cls: 'primary big', icon: I.play }),
        ),
        h(
          'div',
          { class: 'actions' },
          btn(S.copyLink, async () => {
            status.textContent = (await copyText(link)) ? S.copied : S.copyFailed;
          }, { icon: I.copy }),
          btn(S.editCopy, () => this.remix(ch.board, ch.name), { icon: I.build }),
          btn(S.menu, () => this.goTitle()),
        ),
        status,
      ),
    );
    this.show({ el });
  }

  private async remix(board: Board, name: string): Promise<void> {
    if (!(await confirmDialog(S.remixTitle, S.remixBody, S.editCopy, false))) return;
    this.pushEditHistory();
    this.draft = { board: cloneBoard(board), name, solution: null };
    saveDraft(this.draft);
    this.goEditor();
  }

  private playChallenge(ch: Challenge, level: Level, key: string, link: string): void {
    const bench = ch.moves.length;
    const screen = new GameScreen(this, {
      level,
      title: ch.name || S.untitledRoom,
      subtitle: S.challengeTitle,
      hint: null,
      goalLabel: S.benchmark,
      goal: () => bench,
      best: () => challengeBest(key)?.bestMoves,
      backLabel: S.back,
      onBack: () => this.openChallengeFromHash(),
      onWin: (ctx) => {
        recordChallenge(key, ctx.moves, ctx.time);
        const best = challengeBest(key)?.bestMoves ?? ctx.moves;
        const verdict = ctx.moves < bench ? S.beatBench : ctx.moves === bench ? S.matchBench : S.missBench;
        const text = `${S.resultText(ch.name || S.untitledRoom, ctx.moves, bench, verdict)}\n${link}`;
        const status = h('p', { class: 'footnote', role: 'status', 'aria-live': 'polite' });
        const shareBtn = btn(canNativeShare() ? S.shareResult : S.copyResult, async () => {
          if (canNativeShare()) {
            const r = await nativeShare({ title: S.appName, text });
            if (r !== 'failed') return;
          }
          status.textContent = (await copyText(text)) ? S.copied : S.copyFailed;
        }, { cls: 'primary', icon: canNativeShare() ? I.share : I.copy });
        return h(
          'div',
          { class: 'card', role: 'dialog', 'aria-label': S.winTitle },
          h('h2', {}, S.winTitle),
          GameScreen.resultRow([
            [S.moves, String(ctx.moves)],
            [S.benchmark, String(bench)],
            [S.best, String(best)],
          ]),
          h('p', { class: `verdict${ctx.moves <= bench ? ' good' : ''}` }, verdict),
          h('p', { class: 'footnote' }, `${S.time} ${formatTime(ctx.time)} · ${S.undos} ${ctx.undos}`),
          h(
            'div',
            { class: 'actions' },
            shareBtn,
            canNativeShare()
              ? btn(S.copyResult, async () => {
                  status.textContent = (await copyText(text)) ? S.copied : S.copyFailed;
                }, { icon: I.copy })
              : null,
            btn(S.watchCreator, () => ctx.screen.startReplay(ch.moves), { icon: I.eye }),
            btn(S.retry, () => ctx.screen.restart(), { icon: I.restart }),
          ),
          status,
        );
      },
    });
    this.show(screen);
  }
}

// Little 3×3 room as the title emblem: player, crate, laser, exit.
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<rect x="2" y="2" width="116" height="116" rx="20" fill="#2f2b28"/>
<g>
<rect x="8" y="8" width="32" height="32" rx="6" fill="#fbf7f0"/><rect x="44" y="8" width="32" height="32" rx="6" fill="#fbf7f0"/><rect x="80" y="8" width="32" height="32" rx="6" fill="#3b3632"/>
<rect x="8" y="44" width="32" height="32" rx="6" fill="#fbf7f0"/><rect x="44" y="44" width="32" height="32" rx="6" fill="#fbf7f0"/><rect x="80" y="44" width="32" height="32" rx="6" fill="#fbf7f0"/>
<rect x="8" y="80" width="32" height="32" rx="6" fill="#fbf7f0"/><rect x="44" y="80" width="32" height="32" rx="6" fill="#fbf7f0"/><rect x="80" y="80" width="32" height="32" rx="6" fill="#fbf7f0"/>
</g>
<path d="M96 41V80" stroke="#f08a73" stroke-width="10" opacity=".3"/><path d="M96 41V80" stroke="#e2634f" stroke-width="4"/>
<path d="M90 30l6 9 6-9z" fill="#e2634f"/><circle cx="96" cy="22" r="5" fill="#ffe6da" stroke="#e2634f" stroke-width="2.5"/>
<rect x="84" y="83" width="24" height="24" rx="5" fill="#d1a466" stroke="#7a5426" stroke-width="2"/><path d="M89 88h14v14H89zM89 88l14 14" fill="none" stroke="#a97b3f" stroke-width="2"/>
<rect x="12" y="12" width="24" height="24" rx="5" fill="#2c6a63"/><rect x="16" y="17" width="16" height="3" rx="1" fill="#f3ede2"/><rect x="18" y="23" width="12" height="3" rx="1" fill="#f3ede2"/><rect x="20.5" y="29" width="7" height="3" rx="1" fill="#f3ede2"/>
<circle cx="60" cy="96" r="11" fill="#2f2b28"/><circle cx="56" cy="94" r="2.6" fill="#fffdf8"/><circle cx="64" cy="94" r="2.6" fill="#fffdf8"/>
</svg>`;

